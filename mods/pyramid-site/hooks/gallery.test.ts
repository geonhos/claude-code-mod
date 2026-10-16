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

describe('statusSegments', () => {
  test('reads as one status row', () => {
    const world = initialWorld({ ...freshProgress(), bricks: 9, completed: [{ wonder: 'Pyramid', date: 'd' }] })
    const row = statusSegments({ ...world, workers: { analyst: 'working', implementer: 'idle', reviewer: 'blocked' } })
    expect(textOf(row)).toBe('👑 boss  analyst working  implementer idle  reviewer ? blocked  🧱 9/28 Pyramid | 완공 1')
    expect(row.find(s => s.text === 'analyst')?.color).toBe('#3b6ea5')
    expect(row.find(s => s.text === ' ? blocked')?.color).toBe('#e04848')
  })
  test('uses no East Asian ambiguous-width glyphs', () => {
    const row = statusSegments(initialWorld(freshProgress()))
    expect(textOf(row)).not.toMatch(/[■·●○★☆▲△▼▽◆◇]/)
  })
})
