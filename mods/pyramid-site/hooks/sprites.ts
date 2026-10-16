import type { PyramidWorkerName } from '../types'

export const W = 72
export const H = 36
export const GROUND = 30

export type Sprite = readonly string[]
export type Palette = Readonly<Record<string, number>>

export const PALETTE: Palette = {
  K: 0x2b2118, S: 0xe0ac69, s: 0xa87542, Y: 0xf2c14e, y: 0xc99a2e, R: 0xb5523b, r: 0x8e3b29,
  L: 0x3a3a46, W: 0xf4efe1, G: 0xe9b949, B: 0x2f5fa8, N: 0x5a3a1e, X: 0xe04848,
  A: 0xc8955a, a: 0x9c6b3a,
}

export const toHexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

export const WORKER_NAMES: readonly PyramidWorkerName[] = ['analyst', 'implementer', 'reviewer']
export const WORKER_HOME: Readonly<Record<PyramidWorkerName, number>> = { analyst: 11, implementer: 18, reviewer: 25 }
export const WORKER_SHIRT: Readonly<Record<PyramidWorkerName, Palette>> = {
  analyst: { C: 0x3b6ea5, c: 0x2a5080 },
  implementer: { C: 0x4f9a5a, c: 0x3b7445 },
  reviewer: { C: 0x8a5cb8, c: 0x6a4392 },
}
export const WORKER_W = 7
export const WORKER_H = 12

export const UP_CARRY: Sprite = ['..YYY..', '.YYYYY.', 'yyyyyyy', '..SSKS.', '..SSSS.', 'RRCCCC.', 'rrCCCCS', '..CCCC.', '..cccc.']
export const UP_EMPTY: Sprite = ['..YYY..', '.YYYYY.', 'yyyyyyy', '..SSKS.', '..SSSS.', '..CCCC.', '.SCCCCS', '..CCCC.', '..cccc.']
export const LEGS_A: Sprite = ['..L..L.', '.L...L.', 'KK...KK']
export const LEGS_B: Sprite = ['..LLL..', '...LL..', '...KKK.']
export const SIT: Sprite = ['.......', '.......', '.......', '..YYY..', '.YYYYY.', 'yyyyyyy', '..SSsS.', '..SSSS.', '.SCCCCS', '..CCCC.', '..ccLLL', '..LLLKK']
export const QMARK: Sprite = ['XXX', '..X', '.XX', '...', '.X.']
export const ZED: Sprite = ['WWW', '.W.', 'WWW']
export const DROPPED_BRICK: Sprite = ['RRr', 'rrr']
export const BOSS: Sprite = [
  '...GGG...', '..GBGBG..', '.GBSSSKG.', '.BGSSSSB.', '.G.SSN.G.', '..GGGGG..', '..WWWWWS.',
  '..WWWWW..', '..GGGGG..', '..WWWWW..', '..WW.WW..', '..SS.SS..', '..SS.SS..', '.NNN.NNN.',
]
export const BOSS_X = 1
export const BOSS_Y = 16
export const HAND = { x: 8, y: 22 } as const
export const CLOUDS: readonly Sprite[] = [
  ['..WWW...', '.WWWWWW.', 'WWWWWWWW'],
  ['...WW.....', '.WWWWWWW..', 'WWWWWWWWWW'],
]
export const CLOUD_START: ReadonlyArray<{ x: number; y: number; p: number }> = [
  { x: 3, y: 3, p: 0 },
  { x: 38, y: 7, p: 1 },
  { x: 58, y: 2, p: 0 },
]
export type Offset = readonly [number, number]
export const WHIP: Readonly<Record<'rest' | 'raise' | 'crack', readonly Offset[]>> = {
  rest: [[1, 1], [1, 2], [1, 3], [2, 4], [2, 5], [3, 6], [4, 7]],
  raise: [[0, -1], [-1, -2], [-1, -3], [-2, -4], [-3, -4], [-4, -3]],
  crack: [[1, 0], [2, -1], [3, -1], [4, 0], [5, 0], [6, -1], [7, -1], [8, 0], [9, 0]],
}
export const SPARK: ReadonlyArray<readonly [number, number, number]> = [
  [10, -1, 0xfff6c2], [11, -2, 0xf2c14e], [11, 0, 0xf2c14e], [12, -1, 0xffffff],
]
export const CAMEL: Sprite = [
  '.aa.........',
  'aaaa........',
  '.aa.....AA..',
  '.aa....AAAA.',
  '.aaAAAAAAAAA',
  '..AAAAAAAAAA',
  '..AAAAAAAAA.',
  '...A.A..A.A.',
  '...A.A..A.A.',
  '...K.K..K.K.',
]
export const CAMEL_H = 10
export const SCROLL: Sprite = ['NWWWN', '.WWW.']

export type Slot = { x: number; y: number }
export type Wonder = { name: string; slots: readonly Slot[] }
export const BRICK_W = 4
export const BRICK_H = 2

const ordered = (slots: readonly Slot[]): Slot[] => [...slots].sort((a, b) => b.y - a.y || a.x - b.x)

const stepped = (layers: number, left: number): Slot[] => {
  const out: Slot[] = []
  for (let k = 0; k < layers; k += 1) {
    for (let i = 0; i < layers - k; i += 1) out.push({ x: left + k * 2 + i * 4, y: GROUND - 2 * (k + 1) })
  }
  return out
}

const grid = (xs: readonly number[], ys: readonly number[]): Slot[] => ys.flatMap(y => xs.map(x => ({ x, y })))

export const WONDERS: readonly Wonder[] = [
  { name: 'Pyramid', slots: ordered(stepped(7, 42)) },
  {
    name: 'Obelisk',
    slots: ordered([
      ...grid([50, 54, 58], [28]),
      ...grid([52, 56], [26, 24, 22, 20, 18, 16, 14, 12, 10]),
      { x: 54, y: 8 },
    ]),
  },
  {
    name: 'Sphinx',
    slots: ordered([
      ...grid([40, 44, 48, 52, 56, 60, 64], [28, 26]),
      { x: 68, y: 28 },
      ...grid([40, 44, 48], [24]),
      ...grid([60, 64], [24, 22, 20, 18]),
      ...grid([56], [22, 20]),
    ]),
  },
  { name: 'Great Pyramid', slots: ordered(stepped(9, 36)) },
]

export const wonderAt = (index: number): Wonder => WONDERS[index] ?? WONDERS[0]!

export function walkTarget(wonder: Wonder): number {
  const footY = Math.max(...wonder.slots.map(slot => slot.y))
  const foot = Math.min(...wonder.slots.filter(slot => slot.y === footY).map(slot => slot.x))
  return foot - WORKER_W - 1
}
