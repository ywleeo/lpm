import { findProjectRoot, identify } from './detect.js'
import { run } from './proc.js'
import type { Listener, PortScan, Project, RunningProject } from './types.js'

function parsePort(addr: string): number | null {
  const match = addr.match(/:(\d+)$/)
  return match ? Number(match[1]) : null
}

/** 扫全机 TCP 监听端口。同一进程的 IPv4/IPv6 双栈只算一条 */
async function scanListeners(): Promise<Listener[]> {
  const stdout = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'])
  const listeners: Listener[] = []
  const seen = new Set<string>()
  let pid = 0
  let proc = ''

  for (const line of stdout.split('\n')) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      pid = Number(value)
      proc = ''
    } else if (tag === 'c') {
      // lsof 会把空格转义成 \x20，还原一下便于阅读
      proc = value.replace(/\\x20/g, ' ')
    } else if (tag === 'n' && pid) {
      const port = parsePort(value)
      if (!port) continue
      const key = `${pid}:${port}`
      if (seen.has(key)) continue
      seen.add(key)
      listeners.push({ pid, proc, port, addr: value, cmdline: null, cwd: null })
    }
  }
  return listeners
}

/** 批量补上每个进程的工作目录 —— 这是"端口反查项目"的关键一步 */
async function attachCwd(listeners: Listener[], pids: number[]): Promise<void> {
  const stdout = await run('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'])
  const cwdByPid = new Map<number, string>()
  let pid = 0

  for (const line of stdout.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid) cwdByPid.set(pid, line.slice(1))
  }
  for (const listener of listeners) {
    listener.cwd = cwdByPid.get(listener.pid) ?? null
  }
}

/** 批量补上完整命令行，用来显示"这个端口到底在跑什么" */
async function attachCmdline(listeners: Listener[], pids: number[]): Promise<void> {
  const stdout = await run('ps', ['-o', 'pid=,command=', '-p', pids.join(',')])
  const cmdByPid = new Map<number, string>()

  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (match) cmdByPid.set(Number(match[1]), match[2].trim())
  }
  for (const listener of listeners) {
    listener.cmdline = cmdByPid.get(listener.pid) ?? null
  }
}

/** 同一个 cwd 会被多个进程共享（如多进程服务），缓存避免重复磁盘 IO */
async function resolveProject(
  cwd: string,
  cache: Map<string, Project | null>
): Promise<Project | null> {
  if (cache.has(cwd)) return cache.get(cwd) ?? null

  const root = await findProjectRoot(cwd)
  const project = root ? await identify(root) : null
  cache.set(cwd, project)
  return project
}

/** 扫描本机监听端口，并按项目聚合 */
export async function scanPorts(): Promise<PortScan> {
  const listeners = await scanListeners()
  const pids = [...new Set(listeners.map((l) => l.pid))]
  if (pids.length === 0) return { projects: [], others: [] }

  await Promise.all([attachCwd(listeners, pids), attachCmdline(listeners, pids)])

  const byRoot = new Map<string, RunningProject>()
  const others: Listener[] = []
  const cache = new Map<string, Project | null>()

  for (const listener of listeners) {
    const project = listener.cwd ? await resolveProject(listener.cwd, cache) : null
    if (!project) {
      others.push(listener)
      continue
    }
    const entry = byRoot.get(project.root)
    if (entry) entry.listeners.push(listener)
    else byRoot.set(project.root, { project, listeners: [listener] })
  }

  const projects = [...byRoot.values()]
  for (const entry of projects) entry.listeners.sort((a, b) => a.port - b.port)
  projects.sort((a, b) => a.listeners[0].port - b.listeners[0].port)
  others.sort((a, b) => a.port - b.port)

  return { projects, others }
}
