import { describe, expect, test } from 'claude-code/testing'

import { cellWidth, faceFor, parseStatus } from './faces'

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
