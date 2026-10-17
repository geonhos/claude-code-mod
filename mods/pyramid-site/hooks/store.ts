import type { PyramidCompleted, PyramidProgress } from '../types'
import { WONDERS } from './sprites'
import { SEEN_LIMIT } from './world'

export const PROGRESS_KEY = 'progress'

export function freshProgress(): PyramidProgress {
  return { v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: false }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isIndex = (value: unknown, below: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < below
const isCompleted = (value: unknown): value is PyramidCompleted =>
  isRecord(value) && typeof value.wonder === 'string' && typeof value.date === 'string'

export function parseProgress(raw: unknown): PyramidProgress {
  if (!isRecord(raw) || raw.v !== 1) return freshProgress()
  const { wonderIndex, bricks, cracked, completed, seenReports, paneWanted } = raw
  if (!isIndex(wonderIndex, WONDERS.length)) return freshProgress()
  const total = WONDERS[wonderIndex]!.slots.length
  if (!isIndex(bricks, total)) return freshProgress()
  if (!Array.isArray(cracked) || !cracked.every(i => isIndex(i, bricks)) || new Set(cracked).size !== cracked.length) return freshProgress()
  if (!Array.isArray(completed) || !completed.every(isCompleted)) return freshProgress()
  if (!Array.isArray(seenReports) || !seenReports.every(id => typeof id === 'string')) return freshProgress()
  if (typeof paneWanted !== 'boolean') return freshProgress()
  return {
    v: 1,
    wonderIndex,
    bricks,
    cracked: [...(cracked as number[])].sort((a, b) => a - b),
    completed: completed.map(c => ({ wonder: c.wonder, date: c.date })),
    seenReports: (seenReports as string[]).slice(-SEEN_LIMIT),
    paneWanted,
  }
}
