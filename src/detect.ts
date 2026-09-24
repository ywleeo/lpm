import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Project, ProjectKind } from './types.js'

/** 出现任意一个就认为这是项目根，顺序即优先级 */
const ROOT_MARKERS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.git']

/** 出现这些依赖就判定为前端 web 项目 */
const WEB_DEPS = [
  'vite', 'next', 'nuxt', 'astro', 'webpack', 'parcel', 'react', 'vue',
  'svelte', '@sveltejs/kit', '@angular/core', 'solid-js', 'remix', '@remix-run/react'
]

/** 出现这些依赖就判定为 Electron 项目 */
const ELECTRON_DEPS = ['electron', 'electron-vite', 'electron-builder', '@electron-forge/cli', 'electron-store']

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readJson(p: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 从任意路径向上回溯到项目根。
 * 不越过 home 目录，避免把 ~ 或 / 当成项目。
 */
export async function findProjectRoot(start: string): Promise<string | null> {
  const home = os.homedir()
  let dir = path.resolve(start)

  while (dir.startsWith(home) && dir !== home) {
    for (const marker of ROOT_MARKERS) {
      if (await exists(path.join(dir, marker))) return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** 按 lockfile 判断包管理器，没有 lockfile 默认 npm */
async function detectRunner(root: string): Promise<string> {
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(path.join(root, 'yarn.lock'))) return 'yarn'
  if ((await exists(path.join(root, 'bun.lockb'))) || (await exists(path.join(root, 'bun.lock')))) return 'bun'
  return 'npm'
}

/** 拼一条"跑某个 script"的命令。pnpm/yarn/bun 可以省掉 run，npm 不行 */
function runScript(runner: string, script: string): string {
  return runner === 'npm' ? `npm run ${script}` : `${runner} ${script}`
}

/** 从 package.json 的 scripts 里挑一个最像"启动"的 */
function suggestNpmCommand(scripts: Record<string, string> | undefined, runner: string): string | null {
  if (!scripts) return null
  const preferred = ['dev', 'start', 'serve', 'preview'].find((name) => name in scripts)
  return preferred ? runScript(runner, preferred) : null
}

/**
 * Tauri 项目的 dev 脚本通常只起 vite 前端，不会拉起桌面窗口。
 * 按优先级找真正的启动方式：专门的 tauri:dev 脚本 > "tauri" 转发脚本 > cargo。
 */
function suggestTauriCommand(scripts: Record<string, string> | undefined, runner: string): string {
  const dedicated = ['tauri:dev', 'dev:tauri', 'tauri-dev'].find((name) => name in (scripts ?? {}))
  if (dedicated) return runScript(runner, dedicated)
  if (scripts && 'tauri' in scripts) return `${runScript(runner, 'tauri')} dev`
  return 'cargo tauri dev'
}

/** 从 pyproject.toml 里粗略捞一个 [project.scripts] 入口名 */
function suggestPythonCommand(toml: string): string | null {
  const section = toml.split(/^\[project\.scripts\]\s*$/m)[1]
  if (!section) return null
  const first = section.split(/^\[/m)[0].trim().split('\n')[0]
  const name = first?.split('=')[0]?.trim()
  return name ? name : null
}

/** package.json 之外的技术栈判断，按标志文件定 */
async function identifyNative(root: string, name: string): Promise<Project | null> {
  const pyproject = path.join(root, 'pyproject.toml')
  if (await exists(pyproject)) {
    const toml = await fs.readFile(pyproject, 'utf-8').catch(() => '')
    return { name, root, kind: 'python', command: suggestPythonCommand(toml) }
  }
  if (await exists(path.join(root, 'Cargo.toml'))) {
    return { name, root, kind: 'rust', command: 'cargo run' }
  }
  if (await exists(path.join(root, 'go.mod'))) {
    return { name, root, kind: 'go', command: 'go run .' }
  }
  return null
}

/**
 * 识别一个目录是什么类型的项目。不是项目则返回 null。
 *
 * 名字一律取目录名：package.json 里的 name 往往是发布用的包名
 * （@scope/xxx，或者压根是另一个词），跟人记住的项目名对不上。
 */
export async function identify(root: string): Promise<Project | null> {
  const name = path.basename(root)

  // Tauri 优先：它同时也有 package.json，先判会被误判成 web
  if (
    (await exists(path.join(root, 'src-tauri', 'tauri.conf.json'))) ||
    (await exists(path.join(root, 'tauri.conf.json')))
  ) {
    const pkg = await readJson(path.join(root, 'package.json'))
    return { name, root, kind: 'tauri', command: suggestTauriCommand(pkg?.scripts, await detectRunner(root)) }
  }

  const pkg = await readJson(path.join(root, 'package.json'))
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    const command = suggestNpmCommand(pkg.scripts, await detectRunner(root))

    if (ELECTRON_DEPS.some((d) => d in deps)) return { name, root, kind: 'electron', command }
    if (WEB_DEPS.some((d) => d in deps)) return { name, root, kind: 'web', command }

    // 没有任何 scripts 的 package.json 不是启动入口，多半只是个挂件
    // （如 browser-mcp：真正的技术栈写在 pyproject.toml 里）。继续往下找。
    if (Object.keys(pkg.scripts ?? {}).length === 0) {
      const native = await identifyNative(root, name)
      if (native) return native
    }
    return { name, root, kind: 'node', command }
  }

  const native = await identifyNative(root, name)
  if (native) return native

  // 只有 .git，说明是个仓库但认不出技术栈
  if (await exists(path.join(root, '.git'))) {
    return { name, root, kind: 'unknown', command: null }
  }

  return null
}
