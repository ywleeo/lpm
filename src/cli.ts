#!/usr/bin/env node
import { defaultRoots, scanProjects } from './projects.js'
import { scanPorts } from './ports.js'
import { bold, dim, green, paintKind, pad, tildify, truncate, width } from './format.js'
import type { Listener, Project, ProjectKind } from './types.js'

const HELP = `
${bold('lpm')} — 看本机在跑什么，扫本机有什么项目

用法
  lpm                        列出正在监听的端口，并反查是哪个项目在跑
  lpm scan                   扫描本机的 electron / tauri / web 等项目
  lpm --help                 显示本帮助

lpm (ports) 选项
  -a, --all                  连系统服务、GUI 应用的端口一起列出
      --json                 输出 JSON

lpm scan 选项
  -r, --root <dir>           指定扫描目录，可重复；默认 ~/Code ~/Projects 等
  -d, --depth <n>            递归深度，默认 4
  -k, --kind <a,b>           只看指定类型：electron,tauri,web,node,python,rust,go
      --json                 输出 JSON

示例
  lpm                        # 3080 端口是哪个项目占的？
  lpm -a                     # 连微信、Clash 占的端口一起看
  lpm scan -k electron,tauri # 我本机有哪些桌面端项目
`

interface Options {
  all: boolean
  json: boolean
  roots: string[]
  depth: number
  kinds: Set<string> | null
}

function parseArgs(argv: string[]): { cmd: string; opts: Options } {
  const args = argv.slice(2)
  let cmd = 'ports'
  if (args[0] && !args[0].startsWith('-')) cmd = args.shift() as string

  const opts: Options = { all: false, json: false, roots: [], depth: 4, kinds: null }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-a' || arg === '--all') opts.all = true
    else if (arg === '--json') opts.json = true
    else if (arg === '-h' || arg === '--help') cmd = 'help'
    else if (arg === '-r' || arg === '--root') opts.roots.push(args[++i])
    else if (arg === '-d' || arg === '--depth') opts.depth = Number(args[++i])
    else if (arg === '-k' || arg === '--kind') opts.kinds = new Set(args[++i]?.split(','))
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

async function cmdPorts(opts: Options): Promise<void> {
  const scan = await scanPorts()

  if (opts.json) {
    console.log(JSON.stringify(scan, null, 2))
    return
  }

  const portCount = scan.projects.reduce((n, p) => n + p.listeners.length, 0)

  if (scan.projects.length === 0) {
    console.log(dim('\n没有检测到正在运行的项目。'))
  } else {
    console.log(
      `\n运行中 ${bold(String(scan.projects.length))} 个项目 · ${bold(String(portCount))} 个端口\n`
    )
    for (const { project, listeners } of scan.projects) {
      console.log(`  ${green('●')} ${bold(project.name)}  ${paintKind(project.kind)}`)
      console.log(`    ${dim(tildify(project.root))}`)
      for (const line of renderListeners(listeners)) console.log(line)
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
  const [projects, running] = await Promise.all([
    scanProjects({ roots, maxDepth: opts.depth }),
    scanPorts()
  ])

  const runningRoots = new Set(running.projects.map((p) => p.project.root))
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
    default:
      console.error(`未知命令: ${cmd}\n试试 lpm --help`)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
