import { H, W } from './sprites'

export type PixelMode = 'half' | 'space'
export type View = { x0: number; y0: number; columns: number; rows: number }

export const SCENE_ROWS = H / 2
export const UPPER_HALF = 0x2580
export const SPACE = 0x20
export const DEFAULT_COLOR = 0x01000000

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, Math.floor(value)))

export function fitView(bodyColumns: number, bodyRows: number): View {
  const columns = clamp(bodyColumns, 1, W)
  const rows = clamp(bodyRows - 1, 1, SCENE_ROWS)
  return { x0: W - columns, y0: SCENE_ROWS - rows, columns, rows }
}

export function toWords(pixels: Uint32Array, mode: PixelMode, view: View): Uint32Array {
  const words = new Uint32Array(view.columns * view.rows * 3)
  let at = 0
  for (let row = 0; row < view.rows; row += 1) {
    const top = (view.y0 + row) * 2
    for (let column = 0; column < view.columns; column += 1) {
      const x = view.x0 + column
      if (mode === 'half') {
        words[at] = UPPER_HALF
        words[at + 1] = pixels[top * W + x] ?? 0
        words[at + 2] = pixels[(top + 1) * W + x] ?? 0
      } else {
        const sampled = pixels[(top + 1) * W + (x - (x % 2))] ?? 0
        words[at] = SPACE
        words[at + 1] = DEFAULT_COLOR
        words[at + 2] = sampled
      }
      at += 3
    }
  }
  return words
}

export function wordsToBytes(words: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((word, i) => {
    bytes[i * 4] = word & 0xff
    bytes[i * 4 + 1] = (word >>> 8) & 0xff
    bytes[i * 4 + 2] = (word >>> 16) & 0xff
    bytes[i * 4 + 3] = (word >>> 24) & 0xff
  })
  return bytes
}

export function bytesToWords(bytes: Uint8Array): Uint32Array {
  const words = new Uint32Array(Math.floor(bytes.length / 4))
  for (let i = 0; i < words.length; i += 1) {
    words[i] = ((bytes[i * 4] ?? 0) | ((bytes[i * 4 + 1] ?? 0) << 8) | ((bytes[i * 4 + 2] ?? 0) << 16) | ((bytes[i * 4 + 3] ?? 0) << 24)) >>> 0
  }
  return words
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function encodeBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]!
    out += i + 1 < bytes.length ? ALPHABET[(n >>> 6) & 63]! : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '='
  }
  return out
}

export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let at = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, ALPHABET.indexOf(clean[i + k] ?? 'A')), 0)
    if (at < bytes.length) bytes[at++] = (n >>> 16) & 0xff
    if (at < bytes.length) bytes[at++] = (n >>> 8) & 0xff
    if (at < bytes.length) bytes[at++] = n & 0xff
  }
  return bytes
}

export function toCells(pixels: Uint32Array, mode: PixelMode, view: View): string {
  return encodeBase64(wordsToBytes(toWords(pixels, mode, view)))
}

export function decodeCells(cells: string): Uint32Array {
  return bytesToWords(decodeBase64(cells))
}
