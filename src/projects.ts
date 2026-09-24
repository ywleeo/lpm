import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { identify } from './detect.js'
import type { Project } from './types.js'

/** 下钻时直接跳过的目录：依赖、产物、虚拟环境 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.venv', 'venv', 'env', 'dist', 'out', 'build',
  'target', '.next', '.nuxt', '.output', '__pycache__', 'Pods', 'vendor',
  '.cache', 'Library', '.Trash', 'DerivedData'
])

/** 没指定 --root 时，按存在与否挑这些常见代码目录 */
const ROOT_CANDIDATES = ['Code', 'Projects', 'Developer', 'Work', 'src', 'repos', 'workspace']

export interface ScanOptions {
  roots: string[]
  maxDepth: number
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

export async function defaultRoots(): Promise<string[]> {
  const home = os.homedir()
  const found: string[] = []
  for (const name of ROOT_CANDIDATES) {
    const dir = path.join(home, name)
    if (await isDir(dir)) found.push(dir)
  }
  return found.length > 0 ? found : [home]
}

/**
 * 递归找项目。命中项目根后不再往里下钻 —— 否则 monorepo 和示例目录
 * 会把列表刷爆，而人想看的是"我有哪些项目"，不是"有哪些 package.json"。
 */
export async function scanProjects(options: ScanOptions): Promise<Project[]> {
  const found: Project[] = []
  const seen = new Set<string>()

  async function walk(dir: string, depth: number): Promise<void> {
    // 深度 0 是用户给的根目录本身，不参与识别，直接下钻
    if (depth > 0) {
      const project = await identify(dir)
      if (project) {
        if (!seen.has(dir)) {
          seen.add(dir)
          found.push(project)
        }
        return
      }
    }
    if (depth >= options.maxDepth) return

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
        .map((e) => walk(path.join(dir, e.name), depth + 1))
    )
  }

  for (const root of options.roots) {
    await walk(path.resolve(root), 0)
  }

  const order: Record<string, number> = {
    electron: 0, tauri: 1, web: 2, node: 3, python: 4, rust: 5, go: 6, unknown: 7
  }
  found.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
  return found
}
