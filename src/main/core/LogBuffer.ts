import type { LogEntry, LogStream } from '@shared/types'

const MAX_LINES_PER_PROJECT = 2000

/** 每个项目的环形日志缓冲区，供日志面板打开时拉取历史 */
export class LogBuffer {
  private buffers = new Map<string, LogEntry[]>()

  append(projectId: string, stream: LogStream, message: string): LogEntry {
    const entry: LogEntry = { projectId, stream, message, timestamp: Date.now() }
    const buf = this.buffers.get(projectId) ?? []
    buf.push(entry)
    if (buf.length > MAX_LINES_PER_PROJECT) {
      buf.splice(0, buf.length - MAX_LINES_PER_PROJECT)
    }
    this.buffers.set(projectId, buf)
    return entry
  }

  getRecent(projectId: string): LogEntry[] {
    return this.buffers.get(projectId) ?? []
  }

  clear(projectId: string): void {
    this.buffers.delete(projectId)
  }
}
