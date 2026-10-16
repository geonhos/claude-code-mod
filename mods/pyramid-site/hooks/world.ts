import type { PyramidProgress, PyramidWorkerName, PyramidWorkerState, PyramidWorld } from '../types'
import type { DomainEvent } from './events'
import { countFindings, reportId, reportStatus } from './reports'
import { WONDERS, WORKER_NAMES, wonderAt } from './sprites'

export type Cue =
  | { kind: 'whip' }
  | { kind: 'flash'; slot: number }
  | { kind: 'gold' }
  | { kind: 'complete'; wonderIndex: number }
  | { kind: 'caravan' }

export type Applied = { world: PyramidWorld; cues: Cue[] }

export const MAX_CRACKS = 3
export const SEEN_LIMIT = 20
export const ASK_GRACE_MS = 5000

export function initialWorld(progress: PyramidProgress): PyramidWorld {
  return {
    progress,
    workers: { analyst: 'idle', implementer: 'idle', reviewer: 'idle' },
    askedAt: { analyst: 0, implementer: 0, reviewer: 0 },
  }
}

export function localDate(now: number): string {
  const date = new Date(now)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const setWorker = (world: PyramidWorld, worker: PyramidWorkerName, state: PyramidWorkerState): PyramidWorld =>
  world.workers[worker] === state ? world : { ...world, workers: { ...world.workers, [worker]: state } }

function crackRecent(progress: PyramidProgress, count: number): number[] {
  const picked: number[] = []
  for (let i = progress.bricks - 1; i >= 0 && picked.length < count; i -= 1) {
    if (!progress.cracked.includes(i)) picked.push(i)
  }
  return [...progress.cracked, ...picked].sort((a, b) => a - b)
}

function applyReport(world: PyramidWorld, worker: PyramidWorkerName, text: string, now: number): Applied {
  const rested = setWorker(world, worker, 'idle')
  const id = reportId(text)
  if (world.progress.seenReports.includes(id)) return { world: rested, cues: [] }

  const cues: Cue[] = []
  let progress: PyramidProgress = { ...world.progress, seenReports: [...world.progress.seenReports, id].slice(-SEEN_LIMIT) }
  if (worker === 'reviewer' && reportStatus(text) !== 'blocked') {
    const findings = countFindings(text)
    if (findings === 0) cues.push({ kind: 'gold' })
    else progress = { ...progress, cracked: crackRecent(progress, Math.min(MAX_CRACKS, findings)) }
  }
  if (worker === 'implementer' && progress.cracked.length > 0) progress = { ...progress, cracked: [] }

  cues.push({ kind: 'flash', slot: progress.bricks })
  progress = { ...progress, bricks: progress.bricks + 1 }
  const wonder = wonderAt(progress.wonderIndex)
  if (progress.bricks >= wonder.slots.length) {
    cues.push({ kind: 'complete', wonderIndex: progress.wonderIndex })
    progress = {
      ...progress,
      completed: [...progress.completed, { wonder: wonder.name, date: localDate(now) }],
      wonderIndex: (progress.wonderIndex + 1) % WONDERS.length,
      bricks: 0,
      cracked: [],
    }
  }
  return { world: { ...rested, progress }, cues }
}

function applyStatus(world: PyramidWorld, event: Extract<DomainEvent, { kind: 'status' }>, now: number): Applied {
  let next = world
  for (const name of WORKER_NAMES) {
    const polled = event.polled[name]
    const current = world.workers[name]
    if (polled === undefined) continue
    if (polled === 'working') next = setWorker(next, name, current === 'waiting' ? 'waiting' : 'working')
    else if (polled === 'blocked') next = setWorker(next, name, 'blocked')
    else if (!(current === 'working' && now - world.askedAt[name] < ASK_GRACE_MS)) next = setWorker(next, name, 'idle')
  }
  return { world: next, cues: [] }
}

export function apply(world: PyramidWorld, event: DomainEvent, now: number): Applied {
  switch (event.kind) {
    case 'ask':
      return {
        world: { ...setWorker(world, event.worker, 'working'), askedAt: { ...world.askedAt, [event.worker]: now } },
        cues: [{ kind: 'whip' }],
      }
    case 'report':
      return applyReport(world, event.worker, event.text, now)
    case 'blocked':
    case 'waiting':
    case 'idle':
      return { world: setWorker(world, event.worker, event.kind), cues: [] }
    case 'caravan':
      return { world, cues: [{ kind: 'caravan' }] }
    case 'status':
      return applyStatus(world, event, now)
  }
}
