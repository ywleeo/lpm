import { type ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import os from 'os'
import pidusage from 'pidusage'
import treeKill from 'tree-kill'
import type { LogStream, ProjectConfig, ProjectRuntime } from '@shared/types'
import type { LogBuffer } from './LogBuffer'
import type { PortChecker } from './PortChecker'
import type { PortDetector } from './PortDetector'

const MONITOR_INTERVAL_MS = 2000
const STOP_TIMEOUT_MS = 3000

interface RunningEntry {
  child: ChildProcess
  monitorTimer: NodeJS.Timeout
}

function initialRuntime(id: string): ProjectRuntime {
  return {
    id,
    status: 'stopped',
    pid: null,
    startedAt: null,
    cpu: null,
    memory: null,
    portReachable: null,
    detectedPort: null,
    lastError: null,
    exitCode: null
  }
}

/** 负责启动/停止项目子进程，并持续采集其运行状态（CPU/内存/端口可达性） */
export class ProcessManager extends EventEmitter {
  private running = new Map<string, RunningEntry>()
  private runtimes = new Map<string, ProjectRuntime>()

  constructor(
    private readonly logBuffer: LogBuffer,
    private readonly portChecker: PortChecker,
    private readonly portDetector: PortDetector
  ) {
    super()
  }

  getRuntime(id: string): ProjectRuntime {
    return this.runtimes.get(id) ?? initialRuntime(id)
  }

  getAllRuntimes(): ProjectRuntime[] {
    return Array.from(this.runtimes.values())
  }

  start(project: ProjectConfig): void {
    if (this.running.has(project.id)) return

    const runtime = initialRuntime(project.id)
    runtime.status = 'starting'
    this.setRuntime(project.id, runtime)

    const child = spawn(project.command, {
      cwd: project.cwd ?? os.homedir(),
      env: { ...process.env, ...project.env },
      shell: true,
      detached: process.platform !== 'win32'
    })

    if (!child.pid) {
      runtime.status = 'crashed'
      runtime.lastError = '进程启动失败：未获得 pid'
      this.setRuntime(project.id, runtime)
      return
    }

    runtime.pid = child.pid
    runtime.status = 'running'
    runtime.startedAt = Date.now()
    this.setRuntime(project.id, runtime)
    this.appendLog(project.id, 'system', `进程已启动 (pid ${child.pid})`)

    child.stdout?.on('data', (chunk: Buffer) => {
      this.appendLog(project.id, 'stdout', chunk.toString())
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      this.appendLog(project.id, 'stderr', chunk.toString())
    })

    child.on('error', (err) => {
      this.clearMonitor(project.id)
      const r = this.getRuntime(project.id)
      r.status = 'crashed'
      r.lastError = err.message
      r.pid = null
      this.setRuntime(project.id, r)
      this.appendLog(project.id, 'system', `进程错误: ${err.message}`)
    })

    child.on('exit', (code) => {
      this.clearMonitor(project.id)
      const r = this.getRuntime(project.id)
      r.status = code === 0 || r.status === 'stopping' ? 'stopped' : 'crashed'
      r.exitCode = code
      r.pid = null
      r.cpu = null
      r.memory = null
      r.portReachable = null
      r.detectedPort = null
      this.setRuntime(project.id, r)
      this.appendLog(project.id, 'system', `进程已退出 (code ${code ?? 'null'})`)
    })

    const monitorTimer = setInterval(() => this.tick(project), MONITOR_INTERVAL_MS)
    this.running.set(project.id, { child, monitorTimer })
  }

  stop(id: string): void {
    const entry = this.running.get(id)
    if (!entry?.child.pid) return
    const r = this.getRuntime(id)
    r.status = 'stopping'
    this.setRuntime(id, r)
    treeKill(entry.child.pid, 'SIGTERM', (err) => {
      if (err) this.appendLog(id, 'system', `停止进程失败: ${err.message}`)
    })
  }

  /** 供应用退出前调用，等待所有子进程真正退出（带超时兜底） */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.running.keys())
    await Promise.all(ids.map((id) => this.stopAndWait(id)))
  }

  /** 停止后等待真正退出（带超时兜底），再重新启动 */
  async restart(project: ProjectConfig): Promise<void> {
    await this.stopAndWait(project.id)
    this.start(project)
  }

  private stopAndWait(id: string): Promise<void> {
    const entry = this.running.get(id)
    if (!entry?.child.pid) return Promise.resolve()

    const r = this.getRuntime(id)
    r.status = 'stopping'
    this.setRuntime(id, r)

    return new Promise((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        resolve()
      }
      entry.child.once('exit', done)
      setTimeout(done, STOP_TIMEOUT_MS)
      treeKill(entry.child.pid as number, 'SIGTERM', () => {})
    })
  }

  private async tick(project: ProjectConfig): Promise<void> {
    const entry = this.running.get(project.id)
    if (!entry?.child.pid) return
    const r = this.getRuntime(project.id)

    try {
      const stats = await pidusage(entry.child.pid)
      r.cpu = stats.cpu
      r.memory = stats.memory
    } catch {
      // 进程可能刚好在采集瞬间退出，忽略本轮
    }

    if (!project.port && r.detectedPort == null) {
      const detected = await this.portDetector.detect(entry.child.pid)
      if (detected) {
        r.detectedPort = detected
        this.appendLog(project.id, 'system', `自动探测到监听端口: ${detected}`)
      }
    }

    const portToCheck = project.port ?? r.detectedPort
    if (portToCheck) {
      r.portReachable = await this.portChecker.checkHttp(portToCheck, project.healthCheckPath || '/')
    }

    this.setRuntime(project.id, r)
  }

  private clearMonitor(id: string): void {
    const entry = this.running.get(id)
    if (!entry) return
    clearInterval(entry.monitorTimer)
    this.running.delete(id)
  }

  private setRuntime(id: string, runtime: ProjectRuntime): void {
    this.runtimes.set(id, runtime)
    this.emit('status', runtime)
  }

  private appendLog(projectId: string, stream: LogStream, message: string): void {
    const entry = this.logBuffer.append(projectId, stream, message)
    this.emit('log', entry)
  }
}
