/** 项目类型：electron / tauri / web 是重点识别对象，其余为兜底分类 */
export type ProjectKind =
  | 'electron'
  | 'tauri'
  | 'web'
  | 'node'
  | 'python'
  | 'rust'
  | 'go'
  | 'unknown'

export interface Project {
  name: string
  root: string
  kind: ProjectKind
  /** 建议的启动命令，猜不出为 null */
  command: string | null
}

/** 一条监听记录：某个进程在某个地址上监听 */
export interface Listener {
  pid: number
  /** lsof 给的短进程名，如 node / python3.1 */
  proc: string
  port: number
  addr: string
  /** ps 拿到的完整命令行 */
  cmdline: string | null
  /** 进程工作目录，拿不到为 null（权限或进程已退出） */
  cwd: string | null
}

/** 按项目聚合后的运行态 */
export interface RunningProject {
  project: Project
  listeners: Listener[]
}

export interface PortScan {
  /** 能反查到项目的，按项目聚合 */
  projects: RunningProject[]
  /** 反查不到项目的散落监听（系统服务、GUI 应用等） */
  others: Listener[]
}
