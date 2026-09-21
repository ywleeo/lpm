import { execFile } from 'child_process'
import { constants as fsConstants, promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import type { DirectoryInspection, ProjectSearchResult } from '@shared/types'

const execFileAsync = promisify(execFile)
const MAX_RESULTS = 20
const NOISE_SEGMENTS = ['/node_modules/', '/.git/', '/Library/', '/.Trash/', '/.cache/']

// macOS Spotlight 默认不索引隐藏目录（以 . 开头的路径段），
// 而这些恰恰是常见的全局命令行工具入口目录（uv tool / cargo install / go install 等），
// mdfind 搜不到，这里对它们做一次浅层遍历兜底
const HIDDEN_BIN_DIRS = ['.local/bin', '.cargo/bin', 'go/bin']

/** 读取目录内 package.json，猜一个启动命令建议（优先 dev，其次 start/serve） */
export async function inspectDirectory(dirPath: string): Promise<DirectoryInspection> {
  try {
    const pkgRaw = await fs.readFile(path.join(dirPath, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> }
    const scripts = pkg.scripts ?? {}
    const preferred = ['dev', 'start', 'serve'].find((name) => name in scripts)
    return { suggestedCommand: preferred ? `npm run ${preferred}` : null }
  } catch {
    return { suggestedCommand: null }
  }
}

async function mdfindSearch(keyword: string): Promise<string[]> {
  if (process.platform !== 'darwin') return []
  try {
    const { stdout } = await execFileAsync('mdfind', ['-onlyin', os.homedir(), '-name', keyword])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** 浅层遍历几个常见的全局命令入口目录，按名字匹配关键词 */
async function searchHiddenBinDirs(keyword: string): Promise<string[]> {
  const lowerKeyword = keyword.toLowerCase()
  const results: string[] = []

  for (const rel of HIDDEN_BIN_DIRS) {
    const dir = path.join(os.homedir(), rel)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.toLowerCase().includes(lowerKeyword)) {
        results.push(path.join(dir, name))
      }
    }
  }
  return results
}

async function buildResult(candidatePath: string): Promise<ProjectSearchResult | null> {
  let isDirectory: boolean
  try {
    isDirectory = (await fs.stat(candidatePath)).isDirectory()
  } catch {
    return null
  }

  if (isDirectory) {
    const { suggestedCommand } = await inspectDirectory(candidatePath)
    return { name: path.basename(candidatePath), path: candidatePath, cwd: candidatePath, suggestedCommand }
  }

  // 非目录：视为一个已安装的全局命令（可执行文件或指向它的符号链接）
  try {
    await fs.access(candidatePath, fsConstants.X_OK)
  } catch {
    return null
  }
  const name = path.basename(candidatePath)
  return { name, path: candidatePath, cwd: null, suggestedCommand: name }
}

/**
 * 按关键词搜索本地文件夹/已安装命令：
 * - mdfind 覆盖 Spotlight 索引范围内的项目目录（检测 package.json 猜启动命令）
 * - 隐藏 bin 目录浅层遍历补充全局命令行工具（如 uv tool 装的 nanobot）
 * 未识别出启动命令的候选也会返回，交由前端引导用户手动补一个命令。
 */
export async function searchLocalProjects(keyword: string): Promise<ProjectSearchResult[]> {
  const trimmed = keyword.trim()
  if (!trimmed) return []

  const [fromSpotlight, fromHiddenBin] = await Promise.all([
    mdfindSearch(trimmed),
    searchHiddenBinDirs(trimmed)
  ])
  const candidates = Array.from(new Set([...fromSpotlight, ...fromHiddenBin])).filter(
    (p) => !NOISE_SEGMENTS.some((segment) => p.includes(segment))
  )

  const results: ProjectSearchResult[] = []
  for (const candidate of candidates) {
    const result = await buildResult(candidate)
    if (!result) continue
    results.push(result)
    if (results.length >= MAX_RESULTS) break
  }
  return results
}
