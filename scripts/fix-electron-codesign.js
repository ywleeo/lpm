// macOS 上某些 Electron 版本下载后自带的官方签名会被系统判定为“资源缺失”，
// 进而被 Gatekeeper 当作损坏/恶意软件直接删除。用本地 ad-hoc 签名重签一次即可修复。
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform !== 'darwin') process.exit(0)

const appPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')

if (!fs.existsSync(appPath)) process.exit(0)

try {
  execSync(`codesign --sign - --force --deep "${appPath}"`, { stdio: 'ignore' })
} catch (err) {
  console.warn('[fix-electron-codesign] 重新签名失败，可能需要手动执行:', err.message)
}
