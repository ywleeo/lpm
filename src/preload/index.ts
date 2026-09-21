import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import type {
  DirectoryInspection,
  LogEntry,
  NewProjectInput,
  ProjectConfig,
  ProjectRuntime,
  ProjectSearchResult,
  UpdateProjectInput
} from '@shared/types'

const api = {
  projects: {
    list: (): Promise<ProjectConfig[]> => ipcRenderer.invoke('project:list'),
    add: (input: NewProjectInput): Promise<ProjectConfig> => ipcRenderer.invoke('project:add', input),
    update: (input: UpdateProjectInput): Promise<ProjectConfig> =>
      ipcRenderer.invoke('project:update', input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('project:remove', id),
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('project:pickDirectory'),
    searchLocal: (keyword: string): Promise<ProjectSearchResult[]> =>
      ipcRenderer.invoke('project:searchLocal', keyword),
    inspectDirectory: (dirPath: string): Promise<DirectoryInspection> =>
      ipcRenderer.invoke('project:inspectDirectory', dirPath)
  },
  process: {
    start: (id: string): Promise<void> => ipcRenderer.invoke('process:start', id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke('process:stop', id),
    restart: (id: string): Promise<void> => ipcRenderer.invoke('process:restart', id),
    getAllRuntimes: (): Promise<ProjectRuntime[]> => ipcRenderer.invoke('process:getAllRuntimes'),
    getLogs: (id: string): Promise<LogEntry[]> => ipcRenderer.invoke('process:getLogs', id),
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('process:openUrl', url),
    onStatus: (callback: (runtime: ProjectRuntime) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, runtime: ProjectRuntime): void => callback(runtime)
      ipcRenderer.on('process:status', listener)
      return () => ipcRenderer.removeListener('process:status', listener)
    },
    onLog: (callback: (entry: LogEntry) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, entry: LogEntry): void => callback(entry)
      ipcRenderer.on('process:log', listener)
      return () => ipcRenderer.removeListener('process:log', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
