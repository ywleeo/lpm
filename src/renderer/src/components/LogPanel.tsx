import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { LogStream, ProjectConfig } from '@shared/types'

interface Props {
  project: ProjectConfig
  onClose: () => void
}

const FILTERS: { label: string; value: LogStream | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: 'stdout', value: 'stdout' },
  { label: 'stderr', value: 'stderr' },
  { label: '系统', value: 'system' }
]

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

export function LogPanel({ project, onClose }: Props): React.JSX.Element {
  const loadLogs = useProjectStore((s) => s.loadLogs)
  const clearLogs = useProjectStore((s) => s.clearLogs)
  const logs = useProjectStore((s) => s.logs[project.id] ?? [])
  const [filter, setFilter] = useState<LogStream | 'all'>('all')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadLogs(project.id)
  }, [project.id, loadLogs])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs])

  const filtered = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.stream === filter)),
    [logs, filter]
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal log-modal" onClick={(e) => e.stopPropagation()}>
        <div className="log-header">
          <h2>{project.name} 日志</h2>
          <div className="log-filters">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`filter-btn ${filter === f.value ? 'active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
            <button className="btn" onClick={() => clearLogs(project.id)}>
              清空
            </button>
            <button className="btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="log-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="log-empty">暂无日志</div>
          ) : (
            filtered.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} className={`log-line log-${entry.stream}`}>
                <span className="log-time">{formatTime(entry.timestamp)}</span>
                <span className="log-stream">[{entry.stream}]</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
