#!/usr/bin/env node
import { defaultRoots, scanProjects } from './projects.js'
import { scanPorts } from './ports.js'
import { bold, dim, green, paintKind, pad, tildify, truncate, width } from './format.js'
import { cmdLogs, cmdRestart, cmdStart, cmdStop } from './manage.js'
import { groupAlive } from './proc.js'
import { listStates, removeState, type ManagedState } from './state.js'
import type { Listener, Project, ProjectKind } from './types.js'

const HELP = `
${bold('lpm')} — 看本机在跑什么，扫本机有什么项目

用法
  lpm                        列出正在监听的端口，并反查是哪个项目在跑
  lpm scan                   扫描本机的 electron / tauri / web 等项目
  lpm start   [项目]         在后台启动项目
  lpm stop    [项目]         停止项目（lpm 启动的和你手动启动的都能停）
  lpm restart [项目]         重启项目
  lpm logs    [项目]         看 lpm 启动的项目的日志
  lpm --help                 显示本帮助

  [项目] 可以是目录名（支持前缀，如 rob）、路径，不写就是当前目录

lpm (ports) 选项
  -a, --all                  连系统服务、GUI 应用的端口一起列出
      --json                 输出 JSON

lpm scan 选项
  -r, --root <dir>           指定扫描目录，可重复；默认 ~/Code ~/Projects 等
  -d, --depth <n>            递归深度，默认 4
  -k, --kind <a,b>           只看指定类型：electron,tauri,web,node,python,rust,go
      --json                 输出 JSON

start / restart 选项
      --cmd "<命令>"         不用推断的启动命令，改用这条；restart 会沿用上次的

logs 选项
  -f, --follow               持续跟踪输出
  -n, --lines <n>            显示最后 n 行，默认 50

示例
  lpm                        # 3080 端口是哪个项目占的？
  lpm restart robin          # 重启 robin，不管它原来是谁启动的
  lpm logs robin -f          # 跟踪 robin 的输出
  lpm -a                     # 连微信、Clash 占的端口一起看
  lpm scan -k electron,tauri # 我本机有哪些桌面端项目
`

interface Options {
  all: boolean
  json: boolean
  roots: string[]
  depth: number
  kinds: Set<string> | null
  /** start / stop / restart / logs 的目标项目 */
  target: string | null
  command: string | null
  follow: boolean
  lines: number
}

function parseArgs(argv: string[]): { cmd: string; opts: Options } {
  const args = argv.slice(2)
  let cmd = 'ports'
  if (args[0] && !args[0].startsWith('-')) cmd = args.shift() as string

  const opts: Options = {
    all: false,
    json: false,
    roots: [],
    depth: 4,
    kinds: null,
    target: null,
    command: null,
    follow: false,
    lines: 50
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-a' || arg === '--all') opts.all = true
    else if (arg === '--json') opts.json = true
    else if (arg === '-h' || arg === '--help') cmd = 'help'
    else if (arg === '-r' || arg === '--root') opts.roots.push(args[++i])
    else if (arg === '-d' || arg === '--depth') opts.depth = Number(args[++i])
    else if (arg === '-k' || arg === '--kind') opts.kinds = new Set(args[++i]?.split(','))
    else if (arg === '--cmd') opts.command = args[++i] ?? null
    else if (arg === '-f' || arg === '--follow') opts.follow = true
    else if (arg === '-n' || arg === '--lines') opts.lines = Number(args[++i]) || 50
    else if (!arg.startsWith('-') && opts.target === null) opts.target = arg
    else {
      console.error(`未知参数: ${arg}\n试试 lpm --help`)
      process.exit(1)
    }
  }
  return { cmd, opts }
}

/** 同一项目的多个进程如果命令行一样，就压成一行，不刷屏 */
function renderListeners(listeners: Listener[]): string[] {
  const commands = new Set(listeners.map((l) => l.cmdline ?? l.proc))
  const lines: string[] = []

  if (commands.size === 1 && listeners.length > 1) {
    const ports = listeners.map((l) => green(`:${l.port}`)).join(' ')
    lines.push(`    ${ports}  ${dim(`${listeners.length} 个进程`)}`)
    lines.push(`    ${dim(truncate(listeners[0].cmdline ?? listeners[0].proc, 96))}`)
  } else {
    for (const l of listeners) {
      lines.push(`    ${green(pad(`:${l.port}`, 8))}${dim(truncate(l.cmdline ?? l.proc, 92))}`)
    }
  }
  return lines
}

/** lpm 托管且还活着的项目；进程已经没了的顺手清掉记录 */
async function liveManaged(): Promise<ManagedState[]> {
  const live: ManagedState[] = []
  for (const state of await listStates()) {
    if (groupAlive(state.pid)) live.push(state)
    else await removeState(state)
  }
  return live
}

async function cmdPorts(opts: Options): Promise<void> {
  const [scan, managed] = await Promise.all([scanPorts(), liveManaged()])
  const managedRoots = new Set(managed.map((s) => s.root))
  // 托管了但还没开端口的（比如 tauri 还在编译），端口扫描看不到，单独列出来
  const pending = managed.filter((s) => !scan.projects.some((p) => p.project.root === s.root))

  if (opts.json) {
    console.log(JSON.stringify({ ...scan, managed }, null, 2))
    return
  }

  const portCount = scan.projects.reduce((n, p) => n + p.listeners.length, 0)
  const projectCount = scan.projects.length + pending.length

  if (projectCount === 0) {
    console.log(dim('\n没有检测到正在运行的项目。'))
  } else {
    console.log(`\n运行中 ${bold(String(projectCount))} 个项目 · ${bold(String(portCount))} 个端口\n`)
    for (const { project, listeners } of scan.projects) {
      const tag = managedRoots.has(project.root) ? dim('  lpm 后台') : ''
      console.log(`  ${green('●')} ${bold(project.name)}  ${paintKind(project.kind)}${tag}`)
      console.log(`    ${dim(tildify(project.root))}`)
      for (const line of renderListeners(listeners)) console.log(line)
      console.log('')
    }
    for (const s of pending) {
      console.log(`  ${green('○')} ${bold(s.name)}  ${paintKind(s.kind)}${dim('  lpm 后台')}`)
      console.log(`    ${dim(tildify(s.root))}`)
      console.log(`    ${dim(`还没有监听端口 · pid ${s.pid} · lpm logs ${s.name} -f`)}`)
      console.log('')
    }
  }

  if (scan.others.length === 0) return

  if (opts.all) {
    console.log(dim(`其他 ${scan.others.length} 个监听端口\n`))
    for (const l of scan.others) {
      console.log(`    ${pad(`:${l.port}`, 8)}${dim(pad(truncate(l.proc, 20), 22))}${dim(String(l.pid))}`)
    }
    console.log('')
  } else {
    const preview = scan.others
      .slice(0, 6)
      .map((l) => `:${l.port} ${l.proc}`)
      .join('  ')
    console.log(dim(`另有 ${scan.others.length} 个非项目端口  ${preview}${scan.others.length > 6 ? ' …' : ''}`))
    console.log(dim('用 lpm -a 查看全部\n'))
  }
}

async function cmdScan(opts: Options): Promise<void> {
  const roots = opts.roots.length > 0 ? opts.roots : await defaultRoots()
  const [projects, running, managed] = await Promise.all([
    scanProjects({ roots, maxDepth: opts.depth }),
    scanPorts(),
    liveManaged()
  ])

  const runningRoots = new Set([
    ...running.projects.map((p) => p.project.root),
    ...managed.map((s) => s.root)
  ])
  const filtered = opts.kinds ? projects.filter((p) => opts.kinds?.has(p.kind)) : projects

  if (opts.json) {
    console.log(
      JSON.stringify(
        filtered.map((p) => ({ ...p, running: runningRoots.has(p.root) })),
        null,
        2
      )
    )
    return
  }

  console.log(`\n${dim(roots.map(tildify).join('  '))}  ·  ${bold(String(filtered.length))} 个项目\n`)

  const byKind = new Map<ProjectKind, Project[]>()
  for (const p of filtered) {
    const list = byKind.get(p.kind) ?? []
    list.push(p)
    byKind.set(p.kind, list)
  }

  const nameWidth = Math.min(
    28,
    Math.max(12, ...filtered.map((p) => width(p.name)))
  )

  for (const [kind, list] of byKind) {
    console.log(`  ${paintKind(kind)} ${dim(`(${list.length})`)}`)
    for (const p of list) {
      const mark = runningRoots.has(p.root) ? green('●') : ' '
      const name = pad(truncate(p.name, nameWidth), nameWidth)
      const where = dim(pad(truncate(tildify(p.root), 42), 44))
      console.log(`  ${mark} ${name}  ${where}${dim(p.command ?? '')}`)
    }
    console.log('')
  }

  if (runningRoots.size > 0) {
    console.log(dim(`${green('●')} = 正在运行，用 lpm 看它占了哪些端口\n`))
  }
}

async function main(): Promise<void> {
  if (process.platform === 'win32') {
    console.error('lpm 依赖 lsof / ps，目前只支持 macOS 和 Linux。')
    process.exit(1)
  }

  const { cmd, opts } = parseArgs(process.argv)

  switch (cmd) {
    case 'help':
      console.log(HELP)
      break
    case 'ports':
      await cmdPorts(opts)
      break
    case 'scan':
      await cmdScan(opts)
      break
    case 'start':
      await cmdStart(opts.target, opts.command)
      break
    case 'stop':
      await cmdStop(opts.target)
      break
    case 'restart':
      await cmdRestart(opts.target, opts.command)
      break
    case 'logs':
      await cmdLogs(opts.target, opts.lines, opts.follow)
      break
    default:
      console.error(`未知命令: ${cmd}\n试试 lpm --help`)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
