import os from 'node:os'
import type { ProjectKind } from './types.js'

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const color = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)

export const bold = color('1')
export const dim = color('2')
export const red = color('31')
export const green = color('32')
export const yellow = color('33')
export const blue = color('34')
export const magenta = color('35')
export const cyan = color('36')

const KIND_COLOR: Record<ProjectKind, (s: string) => string> = {
  electron: cyan,
  tauri: magenta,
  web: green,
  node: yellow,
  python: blue,
  rust: red,
  go: cyan,
  unknown: dim
}

export function paintKind(kind: ProjectKind): string {
  return KIND_COLOR[kind](kind)
}

const ANSI = /\x1b\[[0-9;]*m/g

/** 终端显示宽度：CJK 字符占两列，否则对不齐 */
export function width(s: string): number {
  let total = 0
  for (const ch of s.replace(ANSI, '')) {
    const cp = ch.codePointAt(0) ?? 0
    const wide =
      cp >= 0x1100 &&
      (cp <= 0x115f ||
        (cp >= 0x2e80 && cp <= 0xa4cf) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe30 && cp <= 0xfe6f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) ||
        (cp >= 0x20000 && cp <= 0x3fffd))
    total += wide ? 2 : 1
  }
  return total
}

export function pad(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - width(s)))
}

/** 截断过长文本，按显示宽度算 */
export function truncate(s: string, max: number): string {
  if (width(s) <= max) return s
  let out = ''
  for (const ch of s) {
    if (width(out) + width(ch) > max - 1) break
    out += ch
  }
  return out + '…'
}

const HOME = os.homedir()

export function tildify(p: string): string {
  return p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p
}
