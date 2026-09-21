import { useProjectStore } from '../store/useProjectStore'
import { StatusBadge } from './StatusBadge'
import type { ProjectConfig } from '@shared/types'

interface Props {
  project: ProjectConfig
  onEdit: () => void
  onShowLogs: () => void
}

function formatMemory(bytes: number | null | undefined): string {
  if (bytes == null) return '-'
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function formatCpu(cpu: number | null | undefined): string {
  if (cpu == null) return '-'
  return `${cpu.toFixed(1)}%`
}

export function ProjectCard({ project, onEdit, onShowLogs }: Props): React.JSX.Element {
  const runtime = useProjectStore((s) => s.runtimes[project.id])
  const startProject = useProjectStore((s) => s.startProject)
  const stopProject = useProjectStore((s) => s.stopProject)
  const restartProject = useProjectStore((s) => s.restartProject)
  const removeProject = useProjectStore((s) => s.removeProject)

  const status = runtime?.status ?? 'stopped'
  const isBusy = status === 'starting' || status === 'stopping'
  const isRunning = status === 'running'
  const effectivePort = project.port ?? runtime?.detectedPort ?? null
  const showPortRow = effectivePort != null || isRunning

  const handleToggle = (): void => {
    if (isRunning) {
      void stopProject(project.id)
    } else {
      void startProject(project.id)
    }
  }

  const handleRestart = (): void => {
    void restartProject(project.id)
  }

  const handleRemove = (): void => {
    if (isRunning) return
    if (confirm(`确定删除项目「${project.name}」吗？`)) {
      void removeProject(project.id)
    }
  }

  return (
    <div className="project-card">
      <div className="project-card-header">
        <h3>{project.name}</h3>
        <StatusBadge status={status} />
      </div>
      <div className="project-card-meta">
        <div className="meta-row">
          <span className="meta-label">目录</span>
          <span className="meta-value" title={project.cwd ?? undefined}>
            {project.cwd ?? '（全局命令）'}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-label">命令</span>
          <span className="meta-value" title={project.command}>
            {project.command}
          </span>
        </div>
        {showPortRow && (
          <div className="meta-row">
            <span className="meta-label">{runtime?.portReachable === true ? '地址' : '端口'}</span>
            <span className="meta-value">
              {effectivePort == null ? (
                '探测中…'
              ) : runtime?.portReachable === true ? (
                <button
                  type="button"
                  className="port-link"
                  onClick={() => void window.api.process.openUrl(`http://127.0.0.1:${effectivePort}`)}
                >
                  http://127.0.0.1:{effectivePort}
                </button>
              ) : (
                <>
                  {effectivePort}
                  {project.port == null && <span className="port-auto"> 自动</span>}
                  {runtime?.portReachable === false && <span className="port-fail"> 不可访问</span>}
                </>
              )}
            </span>
          </div>
        )}
        {isRunning && (
          <div className="meta-row">
            <span className="meta-label">资源</span>
            <span className="meta-value">
              CPU {formatCpu(runtime?.cpu)} · 内存 {formatMemory(runtime?.memory)}
            </span>
          </div>
        )}
        {runtime?.lastError && (
          <div className="meta-row meta-error">
            <span className="meta-label">错误</span>
            <span className="meta-value">{runtime.lastError}</span>
          </div>
        )}
      </div>
      <div className="project-card-actions">
        <button
          className={isRunning ? 'btn btn-danger' : 'btn btn-primary'}
          disabled={isBusy}
          onClick={handleToggle}
        >
          {isRunning ? '停止' : isBusy ? '处理中…' : '启动'}
        </button>
        {isRunning && (
          <button className="btn" disabled={isBusy} onClick={handleRestart}>
            重启
          </button>
        )}
        <button className="btn" onClick={onShowLogs}>
          日志
        </button>
        <button className="btn" onClick={onEdit} disabled={isRunning}>
          编辑
        </button>
        <button className="btn btn-ghost" onClick={handleRemove} disabled={isRunning}>
          删除
        </button>
      </div>
    </div>
  )
}
