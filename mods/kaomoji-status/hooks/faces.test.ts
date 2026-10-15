import { describe, expect, test } from 'claude-code/testing'

import { buildRow, cellWidth, faceFor, isActive, parseStatus } from './faces'
import type { Segment, Worker } from './faces'

const textOf = (segments: readonly Segment[]): string => segments.map(segment => segment.text).join('')

describe('cellWidth', () => {
  test('counts ASCII as one cell each', () => {
    expect(cellWidth('analyst')).toBe(7)
  })
  test('counts halfwidth forms as one cell', () => {
    expect(cellWidth('(｡-ω-)zzZ')).toBe(9)
    expect(cellWidth('└( ･ω･)┐')).toBe(8)
  })
  test('counts combining accents as zero cells', () => {
    expect(cellWidth('(ง •̀_•́)ง')).toBe(8)
  })
  test('counts Hangul and fullwidth forms as two cells', () => {
    expect(cellWidth('도와줘요!')).toBe(9)
    expect(cellWidth('(・_・)')).toBe(7)
  })
})

describe('parseStatus', () => {
  test('parses name, state and pane per line', () => {
    expect(parseStatus('analyst      working  w5:p2\nreviewer     idle     w5:p3\n')).toEqual([
      { name: 'analyst', state: 'working' },
      { name: 'reviewer', state: 'idle' },
    ])
  })
  test('skips blank lines', () => {
    expect(parseStatus('\n\nanalyst idle w1:p1\n   \n')).toEqual([{ name: 'analyst', state: 'idle' }])
  })
  test('keeps an unknown state as given', () => {
    expect(parseStatus('analyst done w1:p1')).toEqual([{ name: 'analyst', state: 'done' }])
  })
  test('drops workers that are not live (name and "-" only)', () => {
    expect(parseStatus('analyst      working  w5:p2\nimplementer  -\nreviewer     -\n')).toEqual([
      { name: 'analyst', state: 'working' },
    ])
  })
  test('drops garbage lines', () => {
    expect(parseStatus('usage:\nharness: not found\n')).toEqual([])
    expect(parseStatus('')).toEqual([])
  })
})

describe('faceFor', () => {
  test('working cycles four frames, one per tick', () => {
    expect([0, 1, 2, 3, 4].map(frame => faceFor('working', frame).text)).toEqual([
      '(ง •̀_•́)ง',
      'ᕕ( ᐛ )ᕗ',
      '└( ･ω･)┐',
      '┌(･ω･ )┘',
      '(ง •̀_•́)ง',
    ])
    expect(faceFor('working', 0).color).toBe('yellow')
    expect(faceFor('working', 0).bold).toBeUndefined()
  })
  test('blocked alternates every two ticks, pink-red and bold', () => {
    expect([0, 1, 2, 3, 4].map(frame => faceFor('blocked', frame).text)).toEqual([
      '(⊙_⊙)? 도와줘요!',
      '(⊙_⊙)? 도와줘요!',
      '(⊙_⊙)! 도와줘요!',
      '(⊙_⊙)! 도와줘요!',
      '(⊙_⊙)? 도와줘요!',
    ])
    expect(faceFor('blocked', 0)).toEqual({ text: '(⊙_⊙)? 도와줘요!', color: '#ff5f87', bold: true })
  })
  test('idle alternates every four ticks, grey', () => {
    expect([0, 3, 4, 7, 8].map(frame => faceFor('idle', frame).text)).toEqual([
      '(｡-ω-)zzZ',
      '(｡-ω-)zzZ',
      '(｡-ω-)zZ',
      '(｡-ω-)zZ',
      '(｡-ω-)zzZ',
    ])
    expect(faceFor('idle', 0).color).toBe('gray')
  })
  test('done looks exactly like idle on every frame', () => {
    const frames = [0, 1, 3, 4, 5, 7, 8, 13]
    expect(frames.map(frame => faceFor('done', frame))).toEqual(frames.map(frame => faceFor('idle', frame)))
    expect(faceFor('done', 4)).toEqual({ text: '(｡-ω-)zZ', color: 'gray' })
  })
  test('any other state is a static grey face naming the state', () => {
    expect(faceFor('unknown', 0)).toEqual({ text: '(・_・) unknown', color: 'gray' })
    expect(faceFor('unknown', 5)).toEqual({ text: '(・_・) unknown', color: 'gray' })
  })
})

describe('isActive', () => {
  test('is false for no workers', () => {
    expect(isActive([])).toBe(false)
  })
  test('is false when every worker is idle, done or another state', () => {
    expect(isActive([{ name: 'a', state: 'idle' }, { name: 'b', state: 'done' }, { name: 'c', state: 'unknown' }])).toBe(false)
  })
  test('is true when some worker is working', () => {
    expect(isActive([{ name: 'a', state: 'idle' }, { name: 'b', state: 'working' }])).toBe(true)
  })
  test('is true when some worker is blocked', () => {
    expect(isActive([{ name: 'a', state: 'blocked' }])).toBe(true)
  })
})

describe('buildRow', () => {
  const TEAM: Worker[] = [
    { name: 'analyst', state: 'idle' },
    { name: 'implementer', state: 'working' },
    { name: 'reviewer', state: 'blocked' },
  ]
  // Widest frames: idle 9, working 8, blocked 16 cells.
  // full names: 8+9 + 2 + 12+8 + 2 + 9+16 = 66; initials: 2+9 + 2 + 2+8 + 2 + 2+16 = 43; none: 9+2+8+2+16 = 37

  test('draws full names when the row fits', () => {
    expect(textOf(buildRow(TEAM, 0, 80))).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง  reviewer (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 66))).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง  reviewer (⊙_⊙)? 도와줘요!')
  })
  test('shortens names to their first letter when one column too narrow', () => {
    expect(textOf(buildRow(TEAM, 0, 65))).toBe('A (｡-ω-)zzZ  I (ง •̀_•́)ง  R (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 43))).toBe('A (｡-ω-)zzZ  I (ง •̀_•́)ง  R (⊙_⊙)? 도와줘요!')
  })
  test('drops names when initials still do not fit', () => {
    expect(textOf(buildRow(TEAM, 0, 42))).toBe('(｡-ω-)zzZ  (ง •̀_•́)ง  (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 10))).toBe('(｡-ω-)zzZ  (ง •̀_•́)ง  (⊙_⊙)? 도와줘요!')
  })
  test('keeps the same layout on every frame (sized by the widest frame)', () => {
    // "analyst (｡-ω-)zZ" is 16 cells but "analyst (｡-ω-)zzZ" is 17: at 16 columns the name must stay short on every frame.
    const sleeper: Worker[] = [{ name: 'analyst', state: 'idle' }]
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map(frame => textOf(buildRow(sleeper, frame, 16)))
    expect(rows).toEqual([
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
    ])
  })
  test('colours the faces and leaves names and separators plain', () => {
    expect(buildRow([{ name: 'reviewer', state: 'blocked' }, { name: 'analyst', state: 'idle' }], 0, 80)).toEqual([
      { text: 'reviewer ' },
      { text: '(⊙_⊙)? 도와줘요!', color: '#ff5f87', bold: true },
      { text: '  ' },
      { text: 'analyst ' },
      { text: '(｡-ω-)zzZ', color: 'gray' },
    ])
  })
  test('is empty for no workers', () => {
    expect(buildRow([], 0, 80)).toEqual([])
  })
  test('starts the next worker at the same cell on every frame', () => {
    const team: Worker[] = [
      { name: 'implementer', state: 'working' },
      { name: 'analyst', state: 'idle' },
      { name: 'reviewer', state: 'blocked' },
    ]
    const offsetOf = (segments: readonly Segment[], text: string): number => {
      const index = segments.findIndex(segment => segment.text === text)
      return cellWidth(textOf(segments.slice(0, index)))
    }
    const frames = [0, 1, 2, 3, 4, 5, 6, 7]
    const analyst = frames.map(frame => offsetOf(buildRow(team, frame, 80), 'analyst '))
    const reviewer = frames.map(frame => offsetOf(buildRow(team, frame, 80), 'reviewer '))
    expect(new Set(analyst).size).toBe(1)
    expect(new Set(reviewer).size).toBe(1)
  })
  test('pads every face to the widest frame of its state', () => {
    const widest: Record<string, number> = { working: 8, blocked: 16, idle: 9, done: 9, unknown: 15 }
    for (const state of Object.keys(widest)) {
      for (const frame of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const segments = buildRow([{ name: 'x', state }], frame, 80)
        const face = segments[segments.length - 1]
        expect(cellWidth(face?.text ?? '')).toBe(widest[state])
      }
    }
  })
})
