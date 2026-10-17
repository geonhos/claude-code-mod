import { describe, expect, test } from 'claude-code/testing'

import { formatGallery, statusSegments } from './gallery'
import { freshProgress } from './store'
import { initialWorld } from './world'

const textOf = (segments: ReadonlyArray<{ text: string }>): string => segments.map(s => s.text).join('')

describe('formatGallery', () => {
  test('shows progress and says when nothing is finished', () => {
    expect(formatGallery({ ...freshProgress(), bricks: 9 })).toBe('🧱 9/28 Pyramid\nNo wonders completed yet.')
  })
  test('lists completed wonders with dates', () => {
    expect(
      formatGallery({ ...freshProgress(), wonderIndex: 1, bricks: 3, completed: [{ wonder: 'Pyramid', date: '2026-10-16' }] }),
    ).toBe('🧱 3/22 Obelisk\nCompleted wonders:\n- Pyramid — 2026-10-16')
  })
})

const cellWidth = (text: string): number =>
  [...text].reduce((sum, ch) => sum + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uff00-\uff60]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)

describe('statusSegments', () => {
  test('fits 72 cells in the worst case', () => {
    const base = initialWorld({ ...freshProgress(), wonderIndex: 3, bricks: 45 })
    for (const state of ['working', 'blocked', 'waiting', 'idle'] as const) {
      const row = statusSegments({ ...base, workers: { analyst: state, implementer: state, reviewer: state } })
      expect(cellWidth(textOf(row)), state).toBeLessThanOrEqual(72)
    }
    expect(textOf(statusSegments(base))).toContain('🧱45/45')
  })
  test('reads as one status row', () => {
    const world = initialWorld({ ...freshProgress(), bricks: 9, completed: [{ wonder: 'Pyramid', date: 'd' }] })
    const row = statusSegments({ ...world, workers: { analyst: 'working', implementer: 'idle', reviewer: 'blocked' } })
    expect(textOf(row)).toBe('👑 analyst 일함 implementer 쉼 reviewer ?막힘  🧱9/28')
    expect(row.find(s => s.text === 'analyst')?.color).toBe('#3b6ea5')
    expect(row.find(s => s.text === ' ?막힘')?.color).toBe('#e04848')
  })
  test('uses no East Asian ambiguous-width glyphs', () => {
    const row = statusSegments(initialWorld(freshProgress()))
    expect(textOf(row)).not.toMatch(/[■·●○★☆▲△▼▽◆◇]/)
  })
})
