export interface ProjectConfig {
  id: string
  name: string
  /** 为 null 表示全局命令（如已安装的 CLI 工具），不限定工作目录 */
  cwd: string | null
  command: string
  env: Record<string, string>
  port: number | null
  healthCheckPath: string
  createdAt: number
}

export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface ProjectRuntime {
  id: string
  status: ProjectStatus
  pid: number | null
  startedAt: number | null
  cpu: number | null
  memory: number | null
  portReachable: boolean | null
  /** 未配置 port 时，运行期间自动探测到的监听端口（lsof），仅供展示 */
  detectedPort: number | null
  lastError: string | null
  exitCode: number | null
}

export type LogStream = 'stdout' | 'stderr' | 'system'

export interface LogEntry {
  projectId: string
  stream: LogStream
  message: string
  timestamp: number
}

export type NewProjectInput = Omit<ProjectConfig, 'id' | 'createdAt'>
export type UpdateProjectInput = Partial<NewProjectInput> & { id: string }

export interface DirectoryInspection {
  suggestedCommand: string | null
}

export interface ProjectSearchResult {
  name: string
  /** 展示用路径：项目目录，或全局命令的可执行文件路径 */
  path: string
  /** 添加时使用的工作目录；全局命令为 null（不限定目录） */
  cwd: string | null
  suggestedCommand: string | null
}
