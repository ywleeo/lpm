import { dialog, ipcMain } from 'electron'
import type { NewProjectInput, UpdateProjectInput } from '@shared/types'
import { inspectDirectory, searchLocalProjects } from '../core/ProjectSearch'
import type { ProjectStore } from '../core/ProjectStore'

export function registerProjectIpc(store: ProjectStore): void {
  ipcMain.handle('project:list', () => store.list())

  ipcMain.handle('project:add', (_e, input: NewProjectInput) => store.add(input))

  ipcMain.handle('project:update', (_e, input: UpdateProjectInput) => store.update(input))

  ipcMain.handle('project:remove', (_e, id: string) => store.remove(id))

  ipcMain.handle('project:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:searchLocal', (_e, keyword: string) => searchLocalProjects(keyword))

  ipcMain.handle('project:inspectDirectory', (_e, dirPath: string) => inspectDirectory(dirPath))
}
