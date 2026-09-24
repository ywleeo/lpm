import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * 跑一个系统命令拿 stdout。
 * lsof 遇到无权限的进程会以非 0 退出，但 stdout 里仍有可用结果，
 * 这里把 stdout 捞出来，不让部分失败毁掉整次扫描。
 */
export async function run(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 16 * 1024 * 1024 })
    return stdout
  } catch (err) {
    return (err as { stdout?: string })?.stdout ?? ''
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface ProcInfo {
  pid: number
  ppid: number
  /** 可执行文件名，去掉路径和登录 shell 的前导 "-"，如 node / python3 / zsh */
  comm: string
}

/** 全机进程表快照 */
export async function processTable(): Promise<Map<number, ProcInfo>> {
  const stdout = await run('ps', ['-axo', 'pid=,ppid=,comm='])
  const table = new Map<number, ProcInfo>()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    if (!match) continue
    const comm = path.basename(match[3].trim()).replace(/^-/, '')
    table.set(Number(match[1]), { pid: Number(match[1]), ppid: Number(match[2]), comm })
  }
  return table
}

/** 某个进程及其全部子孙 */
export function descendants(root: number, table: Map<number, ProcInfo>): number[] {
  const children = new Map<number, number[]>()
  for (const { pid, ppid } of table.values()) {
    const list = children.get(ppid) ?? []
    list.push(pid)
    children.set(ppid, list)
  }
  const result: number[] = []
  const stack = [root]
  while (stack.length > 0) {
    const pid = stack.pop() as number
    result.push(pid)
    stack.push(...(children.get(pid) ?? []))
  }
  return result
}

export async function cwdOf(pid: number): Promise<string | null> {
  const stdout = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  const line = stdout.split('\n').find((l) => l.startsWith('n'))
  return line ? line.slice(1) : null
}

/** 信号 0 只探测不杀。EPERM 说明进程在，只是不归我们管 */
function probe(target: number): boolean {
  try {
    process.kill(target, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export const isAlive = (pid: number) => probe(pid)

/** 进程组里还有没有活着的进程（组长死了、孤儿还在也算活） */
export const groupAlive = (pgid: number) => probe(-pgid)

function signal(target: number, sig: NodeJS.Signals): void {
  try {
    process.kill(target, sig)
  } catch {
    // 已经退出，忽略
  }
}

/**
 * 先 SIGTERM 给机会优雅退出，5 秒后还活着的补 SIGKILL。
 * groups 按进程组整组发信号，能连带清掉已经脱离父进程的孤儿。
 */
export async function terminate(pids: number[], groups: number[] = []): Promise<void> {
  for (const pgid of groups) signal(-pgid, 'SIGTERM')
  for (const pid of pids) signal(pid, 'SIGTERM')

  const alive = () => groups.some(groupAlive) || pids.some(isAlive)
  for (let waited = 0; waited < 5000 && alive(); waited += 200) {
    await sleep(200)
  }

  for (const pgid of groups) if (groupAlive(pgid)) signal(-pgid, 'SIGKILL')
  for (const pid of pids) if (isAlive(pid)) signal(pid, 'SIGKILL')
}
