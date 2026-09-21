import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** 根据进程 pid（含子进程树）反查其正在监听的 TCP 端口。仅支持 macOS/Linux（依赖 ps/lsof） */
export class PortDetector {
  async detect(rootPid: number): Promise<number | null> {
    if (process.platform === 'win32') return null

    try {
      const pids = await this.collectProcessTree(rootPid)
      if (pids.length === 0) return null

      const { stdout } = await execFileAsync('lsof', [
        '-a',
        '-p',
        pids.join(','),
        '-iTCP',
        '-sTCP:LISTEN',
        '-P',
        '-n'
      ])
      const match = stdout.match(/:(\d+)\s+\(LISTEN\)/)
      return match ? Number(match[1]) : null
    } catch {
      return null
    }
  }

  private async collectProcessTree(rootPid: number): Promise<number[]> {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid'])
    const childrenByParent = new Map<number, number[]>()

    for (const line of stdout.trim().split('\n').slice(1)) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number)
      if (Number.isNaN(pid) || Number.isNaN(ppid)) continue
      if (!childrenByParent.has(ppid)) childrenByParent.set(ppid, [])
      childrenByParent.get(ppid)?.push(pid)
    }

    const result: number[] = []
    const stack = [rootPid]
    while (stack.length > 0) {
      const pid = stack.pop() as number
      result.push(pid)
      stack.push(...(childrenByParent.get(pid) ?? []))
    }
    return result
  }
}
