import type { PyramidProgress, PyramidWorkerState, PyramidWorld } from '../types'
import { PALETTE, WORKER_NAMES, WORKER_SHIRT, toHexColor, wonderAt } from './sprites'

export type Segment = { text: string; color?: string }

export function progressLine(progress: PyramidProgress): string {
  const wonder = wonderAt(progress.wonderIndex)
  return `🧱 ${progress.bricks}/${wonder.slots.length} ${wonder.name}`
}

export function formatGallery(progress: PyramidProgress): string {
  const lines = [progressLine(progress)]
  if (progress.completed.length === 0) lines.push('No wonders completed yet.')
  else lines.push('Completed wonders:', ...progress.completed.map(done => `- ${done.wonder} — ${done.date}`))
  return lines.join('\n')
}

const STATE_TEXT: Readonly<Record<PyramidWorkerState, Segment>> = {
  idle: { text: ' 쉼' },
  working: { text: ' 일함' },
  blocked: { text: ' ?막힘', color: toHexColor(PALETTE.X!) },
  waiting: { text: ' 대기' },
}

// One row that fits the 72-cell pane: crown, the workers with a short state each, and the brick count.
export function statusSegments(world: PyramidWorld): Segment[] {
  const segments: Segment[] = [{ text: '👑' }]
  for (const name of WORKER_NAMES) {
    segments.push({ text: ' ' }, { text: name, color: toHexColor(WORKER_SHIRT[name].C!) }, STATE_TEXT[world.workers[name]])
  }
  const wonder = wonderAt(world.progress.wonderIndex)
  segments.push({ text: `  🧱${world.progress.bricks}/${wonder.slots.length}` })
  return segments
}
