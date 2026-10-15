import { describe, expect, test } from 'claude-code/testing'

import { cellWidth, parseStatus } from './faces'

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
