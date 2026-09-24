import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Project, ProjectKind } from './types.js'

/** lpm 后台托管的数据目录，可用 LPM_HOME 覆盖 */
const LPM_HOME = process.env.LPM_HOME ?? path.join(os.homedir(), '.lpm')
const RUN_DIR = path.join(LPM_HOME, 'run')
const LOG_DIR = path.join(LPM_HOME, 'logs')

/** 一个由 lpm 在后台拉起的项目 */
export interface ManagedState {
  name: string
  root: string
  kind: ProjectKind
  command: string
  /** 后台进程组的组长 pid，同时也是 pgid */
  pid: number
  startedAt: number
  log: string
}

/**
 * 文件名 = 目录名 + 路径哈希。
 * 光用目录名会撞（~/Code/Archive/mark2 和别处的 mark2），光用哈希人又认不出。
 */
function keyOf(project: Pick<Project, 'name' | 'root'>): string {
  const hash = createHash('sha1').update(project.root).digest('hex').slice(0, 6)
  return `${project.name}-${hash}`
}

const statePath = (project: Pick<Project, 'name' | 'root'>) => path.join(RUN_DIR, `${keyOf(project)}.json`)

export const logPathOf = (project: Pick<Project, 'name' | 'root'>) => path.join(LOG_DIR, `${keyOf(project)}.log`)

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(RUN_DIR, { recursive: true })
  await fs.mkdir(LOG_DIR, { recursive: true })
}

export async function readState(project: Pick<Project, 'name' | 'root'>): Promise<ManagedState | null> {
  try {
    return JSON.parse(await fs.readFile(statePath(project), 'utf-8'))
  } catch {
    return null
  }
}

export async function writeState(state: ManagedState): Promise<void> {
  await ensureDirs()
  await fs.writeFile(statePath(state), JSON.stringify(state, null, 2))
}

export async function removeState(project: Pick<Project, 'name' | 'root'>): Promise<void> {
  await fs.rm(statePath(project), { force: true })
}

export async function listStates(): Promise<ManagedState[]> {
  let files: string[]
  try {
    files = await fs.readdir(RUN_DIR)
  } catch {
    return []
  }
  const states: ManagedState[] = []
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      states.push(JSON.parse(await fs.readFile(path.join(RUN_DIR, file), 'utf-8')))
    } catch {
      // 损坏的状态文件跳过
    }
  }
  return states
}
