import { closeSync, openSync, writeSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { scanPorts } from './ports.js'
import { cwdOf, descendants, groupAlive, processTable, terminate, type ProcInfo } from './proc.js'
import { ensureDirs, logPathOf, readState, removeState, writeState, type ManagedState } from './state.js'
import type { Listener, Project } from './types.js'

/**
 * 往上追启动者时只穿过这些"启动器"进程。
 * 碰到 shell、编辑器、终端或任何不认识的进程就停 —— 宁可少杀，不能把你的终端或 IDE 杀掉。
 */
const LAUNCHERS = /^(node|npm|npx|pnpm|yarn|bun|bunx|deno|tsx|turbo|nodemon|concurrently|python[\d.]*|uv|uvx|poetry|cargo|tauri|go)$/i

const isInside = (p: string, root: string) => p === root || p.startsWith(root + path.sep)

export interface RunningInfo {
  managed: ManagedState | null
  listeners: Listener[]
}

/** 项目当前是否在跑：lpm 托管的看进程组，外部启动的看端口 */
export async function findRunning(project: Project): Promise<RunningInfo | null> {
  const state = await readState(project)
  const managed = state && groupAlive(state.pid) ? state : null
  const scan = await scanPorts()
  const listeners = scan.projects.find((p) => p.project.root === project.root)?.listeners ?? []
  return managed || listeners.length > 0 ? { managed, listeners } : null
}

/**
 * 从监听端口的进程往上追到真正的启动者。
 * 比如 vite ← node(npm run dev) ← zsh：杀 vite 的话 npm 还挂着，要杀的是 npm 这一层。
 * 条件：父进程是启动器，并且工作目录还在项目里。
 */
async function findLauncher(pid: number, root: string, table: Map<number, ProcInfo>): Promise<number> {
  let current = pid
  for (let depth = 0; depth < 10; depth++) {
    const parent = table.get(table.get(current)?.ppid ?? 0)
    if (!parent || parent.pid <= 1 || !LAUNCHERS.test(parent.comm)) break
    const cwd = await cwdOf(parent.pid)
    if (!cwd || !isInside(cwd, root)) break
    current = parent.pid
  }
  return current
}

/** 停掉项目，返回是否真的停了东西 */
export async function stopProject(project: Project): Promise<boolean> {
  let stopped = false

  // lpm 托管的：整个进程组一起停，连孤儿一起清
  const state = await readState(project)
  if (state && groupAlive(state.pid)) {
    await terminate([], [state.pid])
    stopped = true
  }
  await removeState(project)

  // 外部启动的（或托管进程组之外漏掉的）：从端口反查
  const scan = await scanPorts()
  const running = scan.projects.find((p) => p.project.root === project.root)
  if (running) {
    const table = await processTable()
    const pids = new Set<number>()
    for (const listener of running.listeners) {
      const launcher = await findLauncher(listener.pid, project.root, table)
      for (const pid of descendants(launcher, table)) pids.add(pid)
    }
    await terminate([...pids])
    stopped = true
  }

  return stopped
}

/**
 * 后台拉起项目：独立进程组（detached），stdout/stderr 追加写日志，lpm 退出不影响它。
 * 返回时进程刚拉起，是否活下来由调用方观察。
 */
export async function startProject(project: Project, command: string): Promise<ManagedState> {
  await ensureDirs()
  const log = logPathOf(project)
  const fd = openSync(log, 'a')
  writeSync(fd, `\n── ${new Date().toLocaleString()}  $ ${command}\n`)

  const child = spawn(command, {
    cwd: project.root,
    shell: true,
    detached: true,
    stdio: ['ignore', fd, fd]
  })
  closeSync(fd)
  child.on('error', () => {}) // 拉起失败由调用方通过 groupAlive 发现
  child.unref()

  if (!child.pid) throw new Error(`启动失败：${command}`)

  const state: ManagedState = {
    name: project.name,
    root: project.root,
    kind: project.kind,
    command,
    pid: child.pid,
    startedAt: Date.now(),
    log
  }
  await writeState(state)
  return state
}
