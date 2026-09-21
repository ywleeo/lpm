import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import { LogBuffer } from './core/LogBuffer'
import { PortChecker } from './core/PortChecker'
import { PortDetector } from './core/PortDetector'
import { ProcessManager } from './core/ProcessManager'
import { ProjectStore } from './core/ProjectStore'
import { registerProcessIpc } from './ipc/process.ipc'
import { registerProjectIpc } from './ipc/project.ipc'

// 固定 app 名称，使其与产品对外显示名/package.json 的 name 解耦——
// 后者变化会导致 userData 存储路径跟着变，用户数据看起来“凭空消失”
app.setName('local-project-manager')

const projectStore = new ProjectStore()
const logBuffer = new LogBuffer()
const portChecker = new PortChecker()
const portDetector = new PortDetector()
const processManager = new ProcessManager(logBuffer, portChecker, portDetector)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerProjectIpc(projectStore)
  registerProcessIpc(processManager, projectStore, logBuffer)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  processManager.stopAll().finally(() => app.quit())
})
