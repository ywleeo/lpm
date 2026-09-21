import type { ProjectStatus } from '@shared/types'

const STATUS_TEXT: Record<ProjectStatus, string> = {
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  crashed: '异常退出'
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  stopped: 'status-stopped',
  starting: 'status-pending',
  running: 'status-running',
  stopping: 'status-pending',
  crashed: 'status-crashed'
}

export function StatusBadge({ status }: { status: ProjectStatus }): React.JSX.Element {
  return (
    <span className={`status-badge ${STATUS_CLASS[status]}`}>
      <span className="status-dot" />
      {STATUS_TEXT[status]}
    </span>
  )
}
