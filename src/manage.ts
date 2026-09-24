import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { findRunning, startProject, stopProject, type RunningInfo } from './control.js'
import { bold, dim, green, paintKind, red, tildify, yellow } from './format.js'
import { groupAlive, sleep } from './proc.js'
import { resolveProject } from './resolve.js'
import { logPathOf, readState, removeState } from './state.js'
import type { Project } from './types.js'

/** 拉起后观察这么久，挂了就当场报错，而不是让你以为启动成功了 */
const EARLY_EXIT_WINDOW_MS = 1500

function describeRunning(info: RunningInfo): string {
  const ports = info.listeners.map((l) => `:${l.port}`).join(' ')
  const parts = [
    info.managed ? `lpm 后台 pid ${info.managed.pid}` : '外部启动',
    ports ? `端口 ${ports}` : ''
  ]
  return parts.filter(Boolean).join(' · ')
}

function tailFile(file: string, lines: number): string {
  try {
    return readFileSync(file, 'utf-8').trimEnd().split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

async function launch(project: Project, command: string): Promise<void> {
  const state = await startProject(project, command)
  await sleep(EARLY_EXIT_WINDOW_MS)

  if (!groupAlive(state.pid)) {
    await removeState(project)
    console.error(`\n${red('✗')} ${bold(project.name)} 启动后立刻退出了\n`)
    console.error(dim(`  $ ${command}\n`))
    console.error(tailFile(state.log, 20).replace(/^/gm, '  '))
    console.error(dim(`\n  完整日志 ${tildify(state.log)}\n`))
    process.exitCode = 1
    return
  }

  console.log(`\n${green('✓')} ${bold(project.name)} ${paintKind(project.kind)} 已在后台启动  ${dim(`pid ${state.pid}`)}`)
  console.log(dim(`  ${tildify(project.root)}`))
  console.log(dim(`  $ ${command}`))
  console.log(dim(`\n  看日志  lpm logs ${project.name} -f`))
  console.log(dim(`  看端口  lpm        （dev server 起来需要一会儿，tauri 首次编译可能要几分钟）\n`))
}

export async function cmdStart(query: string | null, cmdOverride: string | null): Promise<void> {
  const project = await resolveProject(query)

  const running = await findRunning(project)
  if (running) {
    console.error(`\n${yellow('!')} ${bold(project.name)} 已经在运行（${describeRunning(running)}）`)
    console.error(dim(`  要重启用 lpm restart ${project.name}\n`))
    process.exitCode = 1
    return
  }

  const command = cmdOverride ?? project.command
  if (!command) {
    console.error(`\n猜不出 ${bold(project.name)} 的启动命令，用 --cmd 指定，比如：`)
    console.error(dim(`  lpm start ${project.name} --cmd "npm run dev"\n`))
    process.exitCode = 1
    return
  }

  await launch(project, command)
}

export async function cmdStop(query: string | null): Promise<void> {
  const project = await resolveProject(query)
  const running = await findRunning(project)

  if (!(await stopProject(project))) {
    console.log(dim(`\n${project.name} 没有在运行\n`))
    return
  }
  console.log(`\n${green('✓')} 已停止 ${bold(project.name)}  ${dim(running ? describeRunning(running) : '')}\n`)
}

export async function cmdRestart(query: string | null, cmdOverride: string | null): Promise<void> {
  const project = await resolveProject(query)

  // 沿用上次 lpm 启动时的命令（可能是 --cmd 指定过的），其次才是推断的
  const previous = await readState(project)
  const command = cmdOverride ?? previous?.command ?? project.command
  if (!command) {
    console.error(`\n猜不出 ${bold(project.name)} 的启动命令，用 --cmd 指定\n`)
    process.exitCode = 1
    return
  }

  const running = await findRunning(project)
  if (await stopProject(project)) {
    console.log(`\n${green('✓')} 已停止 ${bold(project.name)}  ${dim(running ? describeRunning(running) : '')}`)
  } else {
    console.log(dim(`\n${project.name} 没有在运行，直接启动`))
  }

  await launch(project, command)
}

export async function cmdLogs(query: string | null, lines: number, follow: boolean): Promise<void> {
  const project = await resolveProject(query)
  const file = logPathOf(project)

  if (!existsSync(file)) {
    console.log(dim(`\n${project.name} 还没有日志 —— 只有用 lpm start / restart 启动的项目才有\n`))
    return
  }

  const args = ['-n', String(lines), ...(follow ? ['-f'] : []), file]
  await new Promise<void>((resolve) => {
    spawn('tail', args, { stdio: 'inherit' }).on('close', () => resolve())
  })
}
