import { BrowserWindow, ipcMain, shell } from 'electron'
import type { LogBuffer } from '../core/LogBuffer'
import type { ProcessManager } from '../core/ProcessManager'
import type { ProjectStore } from '../core/ProjectStore'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerProcessIpc(
  processManager: ProcessManager,
  projectStore: ProjectStore,
  logBuffer: LogBuffer
): void {
  ipcMain.handle('process:start', (_e, id: string) => {
    const project = projectStore.get(id)
    if (!project) throw new Error(`项目不存在: ${id}`)
    processManager.start(project)
  })

  ipcMain.handle('process:stop', (_e, id: string) => {
    processManager.stop(id)
  })

  ipcMain.handle('process:restart', async (_e, id: string) => {
    const project = projectStore.get(id)
    if (!project) throw new Error(`项目不存在: ${id}`)
    await processManager.restart(project)
  })

  ipcMain.handle('process:getAllRuntimes', () => processManager.getAllRuntimes())

  ipcMain.handle('process:getLogs', (_e, id: string) => logBuffer.getRecent(id))

  ipcMain.handle('process:openUrl', (_e, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error(`拒绝打开非 http(s) 链接: ${url}`)
    return shell.openExternal(url)
  })

  processManager.on('status', (runtime) => broadcast('process:status', runtime))
  processManager.on('log', (entry) => broadcast('process:log', entry))
}
