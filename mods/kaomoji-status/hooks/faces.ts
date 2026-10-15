import type { KaomojiWorker } from '../types'

export type Worker = KaomojiWorker

export type Face = { text: string; color: string; bold?: boolean }

export type Segment = { text: string; color?: string; bold?: boolean }

const ZERO_WIDTH: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
]

const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
]

const inRanges = (code: number, ranges: ReadonlyArray<readonly [number, number]>): boolean =>
  ranges.some(([lo, hi]) => code >= lo && code <= hi)

export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (inRanges(code, ZERO_WIDTH)) continue
    width += inRanges(code, WIDE) ? 2 : 1
  }
  return width
}

const NAME = /^[\w.-]+$/
const STATE = /^[\w-]+$/

export function parseStatus(stdout: string): Worker[] {
  const workers: Worker[] = []
  for (const line of stdout.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 3) continue
    const [name = '', state = ''] = fields
    if (!NAME.test(name) || !STATE.test(state)) continue
    workers.push({ name, state })
  }
  return workers
}

const IDLE_FRAMES = ['(｡-ω-)zzZ', '(｡-ω-)zZ'] as const
const WORKING_FRAMES = ['(ง •̀_•́)ง', 'ᕕ( ᐛ )ᕗ', '└( ･ω･)┐', '┌(･ω･ )┘'] as const
const BLOCKED_FRAMES = ['(⊙_⊙)? 도와줘요!', '(⊙_⊙)! 도와줘요!'] as const

const GREY = 'gray'
const YELLOW = 'yellow'
const PINK_RED = '#ff5f87'

const isResting = (state: string): boolean => state === 'idle' || state === 'done'

function framesFor(state: string): readonly string[] {
  if (isResting(state)) return IDLE_FRAMES
  if (state === 'working') return WORKING_FRAMES
  if (state === 'blocked') return BLOCKED_FRAMES
  return [`(・_・) ${state}`]
}

export function faceFor(state: string, frame: number): Face {
  const tick = Math.max(0, Math.floor(frame))
  if (state === 'working') {
    return { text: WORKING_FRAMES[tick % 4] ?? WORKING_FRAMES[0], color: YELLOW }
  }
  if (state === 'blocked') {
    return { text: BLOCKED_FRAMES[Math.floor(tick / 2) % 2] ?? BLOCKED_FRAMES[0], color: PINK_RED, bold: true }
  }
  if (isResting(state)) {
    return { text: IDLE_FRAMES[Math.floor(tick / 4) % 2] ?? IDLE_FRAMES[0], color: GREY }
  }
  return { text: `(・_・) ${state}`, color: GREY }
}

export function isActive(workers: readonly Worker[]): boolean {
  return workers.some(worker => worker.state === 'working' || worker.state === 'blocked')
}
