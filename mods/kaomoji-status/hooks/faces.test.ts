import { describe, expect, test } from 'claude-code/testing'

import { cellWidth } from './faces'

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
