import { useState } from 'react'
import { useSuggestions } from '../hooks/useSuggestions'
import { useProjectStore } from '../store/useProjectStore'
import type { ProjectSearchResult } from '@shared/types'

interface Props {
  onClose: () => void
  onManual: () => void
}

export function ProjectSearchPanel({ onClose, onManual }: Props): React.JSX.Element {
  const addProject = useProjectStore((s) => s.addProject)
  const [keyword, setKeyword] = useState('')
  const [pendingManual, setPendingManual] = useState<ProjectSearchResult | null>(null)
  const [manualCommand, setManualCommand] = useState('')

  const results = useSuggestions<ProjectSearchResult>(
    keyword,
    (q) => (q.trim() ? window.api.projects.searchLocal(q) : Promise.resolve([])),
    400
  )

  const commit = async (result: ProjectSearchResult, command: string): Promise<void> => {
    await addProject({
      name: result.name,
      cwd: result.cwd,
      command,
      port: null,
      healthCheckPath: '/',
      env: {}
    })
    onClose()
  }

  const handleAdd = (result: ProjectSearchResult): void => {
    if (result.suggestedCommand) {
      void commit(result, result.suggestedCommand)
    } else {
      setPendingManual(result)
      setManualCommand('')
    }
  }

  const handlePickDirectory = async (): Promise<void> => {
    const dir = await window.api.projects.pickDirectory()
    if (!dir) return
    const name = dir.split('/').filter(Boolean).pop() ?? dir
    const { suggestedCommand } = await window.api.projects.inspectDirectory(dir)
    handleAdd({ name, path: dir, cwd: dir, suggestedCommand })
  }

  const handleConfirmManual = (): void => {
    if (!pendingManual || !manualCommand.trim()) return
    void commit(pendingManual, manualCommand.trim())
  }

  const isListResult = pendingManual && results.some((r) => r.path === pendingManual.path)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <h2>添加项目</h2>
        <input
          className="search-box"
          autoFocus
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入名字关键词，例如 gitapp 或 nanobot"
        />

        <ul className="search-result-list">
          {keyword.trim() && results.length === 0 && (
            <li className="search-empty">没找到匹配的项目或命令</li>
          )}
          {results.map((r) => {
            if (pendingManual?.path === r.path) {
              return (
                <li key={r.path} className="search-result-item search-result-pending">
                  <div className="search-result-info">
                    <div className="search-result-name">{r.name}</div>
                    <div className="search-result-path" title={r.path}>
                      {r.path}
                    </div>
                  </div>
                  <input
                    autoFocus
                    className="inline-command-input"
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                    placeholder="未识别启动命令，手动填一下"
                  />
                  <button type="button" className="btn btn-primary" onClick={handleConfirmManual}>
                    添加
                  </button>
                </li>
              )
            }
            return (
              <li key={r.path} className="search-result-item">
                <div className="search-result-info">
                  <div className="search-result-name">{r.name}</div>
                  <div className="search-result-path" title={r.path}>
                    {r.path}
                  </div>
                  <div className="search-result-command">
                    {r.suggestedCommand ?? '未识别启动方式，添加时需要手动填写'}
                  </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => handleAdd(r)}>
                  添加
                </button>
              </li>
            )
          })}

          {pendingManual && !isListResult && (
            <li className="search-result-item search-result-pending">
              <div className="search-result-info">
                <div className="search-result-name">{pendingManual.name}</div>
                <div className="search-result-path" title={pendingManual.path}>
                  {pendingManual.path}
                </div>
              </div>
              <input
                autoFocus
                className="inline-command-input"
                value={manualCommand}
                onChange={(e) => setManualCommand(e.target.value)}
                placeholder="未识别启动命令，手动填一下"
              />
              <button type="button" className="btn btn-primary" onClick={handleConfirmManual}>
                添加
              </button>
            </li>
          )}
        </ul>

        <div className="search-footer">
          <button type="button" className="btn-link" onClick={() => void handlePickDirectory()}>
            没找到？手动选择文件夹
          </button>
          <button type="button" className="btn-link" onClick={onManual}>
            或手动填写完整信息
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
