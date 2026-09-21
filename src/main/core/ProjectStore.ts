import { randomUUID } from 'crypto'
import Store from 'electron-store'
import type { NewProjectInput, ProjectConfig, UpdateProjectInput } from '@shared/types'

interface StoreSchema {
  projects: ProjectConfig[]
}

/** 项目配置的增删改查，落地为本地 JSON（electron-store 管理路径） */
export class ProjectStore {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'projects',
      defaults: { projects: [] }
    })
  }

  list(): ProjectConfig[] {
    return this.store.get('projects')
  }

  get(id: string): ProjectConfig | undefined {
    return this.list().find((p) => p.id === id)
  }

  add(input: NewProjectInput): ProjectConfig {
    const project: ProjectConfig = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now()
    }
    const projects = this.list()
    projects.push(project)
    this.store.set('projects', projects)
    return project
  }

  update(input: UpdateProjectInput): ProjectConfig {
    const projects = this.list()
    const index = projects.findIndex((p) => p.id === input.id)
    if (index === -1) {
      throw new Error(`Project not found: ${input.id}`)
    }
    const updated: ProjectConfig = { ...projects[index], ...input }
    projects[index] = updated
    this.store.set('projects', projects)
    return updated
  }

  remove(id: string): void {
    this.store.set(
      'projects',
      this.list().filter((p) => p.id !== id)
    )
  }
}
