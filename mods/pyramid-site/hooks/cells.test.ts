import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, SPACE, UPPER_HALF, decodeBase64, decodeCells, encodeBase64, fitView, toCells, toWords } from './cells'
import { H, W } from './sprites'

const bytesOf = (text: string): Uint8Array => new Uint8Array([...text].map(c => c.charCodeAt(0)))

const ramp = (): Uint32Array => {
  const pixels = new Uint32Array(W * H)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) pixels[y * W + x] = (y << 8) | x
  return pixels
}

describe('base64', () => {
  test('matches the standard padded alphabet', () => {
    expect(encodeBase64(bytesOf(''))).toBe('')
    expect(encodeBase64(bytesOf('f'))).toBe('Zg==')
    expect(encodeBase64(bytesOf('fo'))).toBe('Zm8=')
    expect(encodeBase64(bytesOf('foo'))).toBe('Zm9v')
    expect(encodeBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
  })
  test('decodes what it encodes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253])
    expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes])
  })
  test('packs one orange cell as the engine example does', () => {
    expect(decodeCells(toCells(new Uint32Array(W * H).fill(0xff8800), 'half', { x0: 0, y0: 0, columns: 1, rows: 1 }))).toEqual(
      Uint32Array.of(UPPER_HALF, 0xff8800, 0xff8800),
    )
  })
})

describe('fitView', () => {
  test('shows the whole 72×18 scene when there is room', () => {
    expect(fitView(100, 30)).toEqual({ x0: 0, y0: 0, columns: 72, rows: 18 })
  })
  test('crops the left sky first on a narrow pane', () => {
    expect(fitView(40, 30)).toEqual({ x0: 32, y0: 0, columns: 40, rows: 18 })
  })
  test('keeps one row for the status line and crops sky rows from the top', () => {
    expect(fitView(72, 10)).toEqual({ x0: 0, y0: 9, columns: 72, rows: 9 })
  })
  test('never goes below one cell', () => {
    expect(fitView(0, 0)).toEqual({ x0: 71, y0: 17, columns: 1, rows: 1 })
  })
})

describe('toWords', () => {
  test('half mode: ▀ with the upper pixel as fg and the lower as bg', () => {
    const words = toWords(ramp(), 'half', { x0: 5, y0: 2, columns: 2, rows: 1 })
    expect([...words]).toEqual([UPPER_HALF, (4 << 8) | 5, (5 << 8) | 5, UPPER_HALF, (4 << 8) | 6, (5 << 8) | 6])
  })
  test('space mode: a space on the lower pixel of each 2-wide pair', () => {
    const words = toWords(ramp(), 'space', { x0: 5, y0: 2, columns: 2, rows: 1 })
    expect([...words]).toEqual([SPACE, DEFAULT_COLOR, (5 << 8) | 4, SPACE, DEFAULT_COLOR, (5 << 8) | 6])
  })
  test('one triplet per cell', () => {
    expect(toWords(ramp(), 'half', fitView(72, 30))).toHaveLength(72 * 18 * 3)
  })
})
