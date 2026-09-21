import { useEffect, useState } from 'react'
import { PlusIcon } from './components/Icons'
import { LogPanel } from './components/LogPanel'
import { ProjectCard } from './components/ProjectCard'
import { ProjectForm } from './components/ProjectForm'
import { ProjectSearchPanel } from './components/ProjectSearchPanel'
import { useProjectStore } from './store/useProjectStore'
import type { ProjectConfig } from '@shared/types'

function App(): React.JSX.Element {
  const init = useProjectStore((s) => s.init)
  const projects = useProjectStore((s) => s.projects)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectConfig | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [activeLogProjectId, setActiveLogProjectId] = useState<string | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  const openEditForm = (project: ProjectConfig): void => {
    setEditingProject(project)
    setFormOpen(true)
  }

  const openManualForm = (): void => {
    setSearchOpen(false)
    setEditingProject(null)
    setFormOpen(true)
  }

  const activeLogProject = projects.find((p) => p.id === activeLogProjectId) ?? null

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>本地项目管理器</h1>
        <button className="btn btn-icon" title="添加项目" onClick={() => setSearchOpen(true)}>
          <PlusIcon />
        </button>
      </header>

      <main className="app-main">
        {projects.length === 0 ? (
          <div className="empty-state">还没有项目，点击右上角"添加项目"开始</div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={() => openEditForm(project)}
                onShowLogs={() => setActiveLogProjectId(project.id)}
              />
            ))}
          </div>
        )}
      </main>

      {searchOpen && (
        <ProjectSearchPanel onClose={() => setSearchOpen(false)} onManual={openManualForm} />
      )}

      {formOpen && <ProjectForm project={editingProject} onClose={() => setFormOpen(false)} />}

      {activeLogProject && (
        <LogPanel project={activeLogProject} onClose={() => setActiveLogProjectId(null)} />
      )}
    </div>
  )
}

export default App
