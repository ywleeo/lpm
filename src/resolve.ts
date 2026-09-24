import path from 'node:path'
import { findProjectRoot, identify } from './detect.js'
import { tildify } from './format.js'
import { defaultRoots, scanProjects } from './projects.js'
import { listStates } from './state.js'
import type { Project } from './types.js'

/**
 * 把用户输入解析成一个项目：
 * - 不给 / "." / 带斜杠 → 当路径，从那里往上找项目根
 * - 其他 → 按目录名匹配：完全相同 > 前缀 > 包含。命中多个就报歧义，不猜
 */
export async function resolveProject(query: string | null): Promise<Project> {
  if (!query || query === '.' || query.includes('/') || query.startsWith('~')) {
    const dir = path.resolve((query ?? '.').replace(/^~/, process.env.HOME ?? '~'))
    const root = await findProjectRoot(dir)
    const project = root ? await identify(root) : null
    if (!project) throw new Error(`${tildify(dir)} 不在任何项目里`)
    return project
  }

  // 扫描目录之外、但曾经被 lpm 托管过的项目也要能按名字找到
  const [scanned, states] = await Promise.all([
    scanProjects({ roots: await defaultRoots(), maxDepth: 4 }),
    listStates()
  ])
  const byRoot = new Map<string, Project>()
  for (const p of scanned) byRoot.set(p.root, p)
  for (const s of states) {
    if (!byRoot.has(s.root)) byRoot.set(s.root, { name: s.name, root: s.root, kind: s.kind, command: s.command })
  }
  const candidates = [...byRoot.values()]

  const q = query.toLowerCase()
  const tiers = [
    candidates.filter((p) => p.name.toLowerCase() === q),
    candidates.filter((p) => p.name.toLowerCase().startsWith(q)),
    candidates.filter((p) => p.name.toLowerCase().includes(q))
  ]

  for (const matches of tiers) {
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      const list = matches.map((p) => `  ${p.name.padEnd(24)} ${tildify(p.root)}`).join('\n')
      throw new Error(`"${query}" 匹配到多个项目，用更完整的名字或直接给路径：\n${list}`)
    }
  }
  throw new Error(`找不到项目 "${query}"。用 lpm scan 看看有哪些，或者直接给路径`)
}
