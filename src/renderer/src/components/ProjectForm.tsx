import { useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { ProjectConfig } from '@shared/types'

interface Props {
  project: ProjectConfig | null
  onClose: () => void
}

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

export function ProjectForm({ project, onClose }: Props): React.JSX.Element {
  const addProject = useProjectStore((s) => s.addProject)
  const updateProject = useProjectStore((s) => s.updateProject)

  const [name, setName] = useState(project?.name ?? '')
  const [cwd, setCwd] = useState(project?.cwd ?? '')
  const [command, setCommand] = useState(project?.command ?? '')
  const [port, setPort] = useState(project?.port != null ? String(project.port) : '')
  const [healthCheckPath, setHealthCheckPath] = useState(project?.healthCheckPath ?? '/')
  const [envText, setEnvText] = useState(project ? envToText(project.env) : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePickDirectory = async (): Promise<void> => {
    const dir = await window.api.projects.pickDirectory()
    if (!dir) return
    setCwd(dir)
    if (!command.trim()) {
      const { suggestedCommand } = await window.api.projects.inspectDirectory(dir)
      if (suggestedCommand) setCommand(suggestedCommand)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || !command.trim()) {
      setError('名称、启动命令为必填项')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const input = {
        name: name.trim(),
        cwd: cwd.trim() || null,
        command: command.trim(),
        port: port.trim() ? Number(port) : null,
        healthCheckPath: healthCheckPath.trim() || '/',
        env: parseEnvText(envText)
      }
      if (project) {
        await updateProject({ id: project.id, ...input })
      } else {
        await addProject(input)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{project ? '编辑项目' : '添加项目'}</h2>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>项目名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：my-app" />
          </label>

          <label className="field">
            <span>工作目录（留空表示全局命令，不限定目录）</span>
            <div className="field-row">
              <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/path/to/project" />
              <button type="button" className="btn" onClick={() => void handlePickDirectory()}>
                选择…
              </button>
            </div>
          </label>

          <label className="field">
            <span>启动命令</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="例如：npm run dev"
            />
          </label>

          <label className="field">
            <span>端口（可选，用于状态检测；不填会在启动后自动探测）</span>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              placeholder="例如：5173"
            />
          </label>

          <label className="field">
            <span>健康检查路径</span>
            <input
              value={healthCheckPath}
              onChange={(e) => setHealthCheckPath(e.target.value)}
              placeholder="/"
            />
          </label>

          <label className="field">
            <span>环境变量（每行一个 KEY=VALUE，可选）</span>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={4}
              placeholder="PORT=5173"
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
