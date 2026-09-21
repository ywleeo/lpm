import { create } from 'zustand'
import type {
  LogEntry,
  NewProjectInput,
  ProjectConfig,
  ProjectRuntime,
  UpdateProjectInput
} from '@shared/types'

const MAX_LOGS_IN_MEMORY = 2000

interface ProjectStoreState {
  projects: ProjectConfig[]
  runtimes: Record<string, ProjectRuntime>
  logs: Record<string, LogEntry[]>
  initialized: boolean
  init: () => Promise<void>
  addProject: (input: NewProjectInput) => Promise<void>
  updateProject: (input: UpdateProjectInput) => Promise<void>
  removeProject: (id: string) => Promise<void>
  startProject: (id: string) => Promise<void>
  stopProject: (id: string) => Promise<void>
  restartProject: (id: string) => Promise<void>
  loadLogs: (id: string) => Promise<void>
  clearLogs: (id: string) => void
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  runtimes: {},
  logs: {},
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    window.api.process.onStatus((runtime) => {
      set((state) => ({ runtimes: { ...state.runtimes, [runtime.id]: runtime } }))
    })
    window.api.process.onLog((entry) => {
      set((state) => {
        const existing = state.logs[entry.projectId] ?? []
        const next = existing.length >= MAX_LOGS_IN_MEMORY ? existing.slice(1) : existing
        return { logs: { ...state.logs, [entry.projectId]: [...next, entry] } }
      })
    })

    const [projects, runtimes] = await Promise.all([
      window.api.projects.list(),
      window.api.process.getAllRuntimes()
    ])
    const runtimeMap: Record<string, ProjectRuntime> = {}
    for (const r of runtimes) runtimeMap[r.id] = r
    set({ projects, runtimes: runtimeMap })
  },

  addProject: async (input) => {
    const project = await window.api.projects.add(input)
    set((state) => ({ projects: [...state.projects, project] }))
  },

  updateProject: async (input) => {
    const project = await window.api.projects.update(input)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === project.id ? project : p))
    }))
  },

  removeProject: async (id) => {
    await window.api.projects.remove(id)
    set((state) => {
      const { [id]: _removedLogs, ...restLogs } = state.logs
      return {
        projects: state.projects.filter((p) => p.id !== id),
        logs: restLogs
      }
    })
  },

  startProject: async (id) => {
    await window.api.process.start(id)
  },

  stopProject: async (id) => {
    await window.api.process.stop(id)
  },

  restartProject: async (id) => {
    await window.api.process.restart(id)
  },

  loadLogs: async (id) => {
    const logs = await window.api.process.getLogs(id)
    set((state) => ({ logs: { ...state.logs, [id]: logs } }))
  },

  clearLogs: (id) => {
    set((state) => ({ logs: { ...state.logs, [id]: [] } }))
  }
}))
