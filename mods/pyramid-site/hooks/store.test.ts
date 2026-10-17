import { describe, expect, test } from 'claude-code/testing'

import { freshProgress, parseProgress } from './store'

const GOOD = {
  v: 1, wonderIndex: 2, bricks: 9, cracked: [8, 7], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }],
  seenReports: ['a', 'b'], paneWanted: true,
}

describe('parseProgress', () => {
  test('keeps a valid record, sorting cracks', () => {
    expect(parseProgress(GOOD)).toEqual({ ...GOOD, cracked: [7, 8] })
  })
  test('starts fresh on nothing or another version', () => {
    expect(parseProgress(undefined)).toEqual(freshProgress())
    expect(parseProgress({ ...GOOD, v: 2 })).toEqual(freshProgress())
    expect(parseProgress([GOOD])).toEqual(freshProgress())
  })
  test('starts fresh on any field out of range', () => {
    for (const bad of [
      { wonderIndex: 4 }, { wonderIndex: 1.5 }, { bricks: 28, wonderIndex: 0 }, { bricks: -1 },
      { cracked: [9] }, { cracked: [1, 1] }, { completed: [{ wonder: 'x' }] }, { seenReports: [1] }, { paneWanted: 'yes' },
    ]) {
      expect(parseProgress({ ...GOOD, ...bad }), JSON.stringify(bad)).toEqual(freshProgress())
    }
  })
  test('keeps only the last 20 report ids', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `r${i}`)
    expect(parseProgress({ ...GOOD, seenReports: ids }).seenReports).toEqual(ids.slice(-20))
  })
})
