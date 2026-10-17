import { describe, expect, test } from 'claude-code/testing'

import {
  BOSS, BRICK_H, BRICK_W, CAMEL, CLOUDS, DROPPED_BRICK, LEGS_A, LEGS_B, PALETTE, QMARK, SCROLL, SIT,
  UP_CARRY, UP_EMPTY, WONDERS, WORKER_H, WORKER_SHIRT, WORKER_W, ZED_LARGE, ZED_SMALL, toHexColor, walkTarget,
} from './sprites'
import type { Palette, Sprite } from './sprites'

const SPRITES: Record<string, Sprite> = { BOSS, CAMEL, DROPPED_BRICK, LEGS_A, LEGS_B, QMARK, SCROLL, SIT, UP_CARRY, UP_EMPTY, ZED_LARGE, ZED_SMALL }
const WORKER_PALETTE: Palette = { ...PALETTE, ...WORKER_SHIRT.analyst }

describe('sprites', () => {
  test('every row of a sprite has the same width', () => {
    for (const [name, rows] of Object.entries({ ...SPRITES, CLOUD0: CLOUDS[0]!, CLOUD1: CLOUDS[1]! })) {
      const widths = new Set(rows.map(row => row.length))
      expect(widths.size, name).toBe(1)
    }
  })
  test('every glyph is transparent or in the palette', () => {
    for (const [name, rows] of Object.entries({ ...SPRITES, CLOUD0: CLOUDS[0]!, CLOUD1: CLOUDS[1]! })) {
      for (const glyph of rows.join('')) {
        expect(glyph === '.' || WORKER_PALETTE[glyph] !== undefined, `${name} ${glyph}`).toBe(true)
      }
    }
  })
  test('a standing worker and a sitting worker are 7×12', () => {
    expect(UP_CARRY.concat(LEGS_A)).toHaveLength(WORKER_H)
    expect(SIT).toHaveLength(WORKER_H)
    expect(SIT[0]!.length).toBe(WORKER_W)
  })
  test('the camel is 12×10', () => {
    expect(CAMEL).toHaveLength(10)
    expect(CAMEL[0]!.length).toBe(12)
  })
  test('toHexColor pads to six digits', () => {
    expect(toHexColor(0x0a0b0c)).toBe('#0a0b0c')
  })
})

describe('wonders', () => {
  test('have the planned brick totals', () => {
    expect(WONDERS.map(w => [w.name, w.slots.length])).toEqual([
      ['Pyramid', 28], ['Obelisk', 22], ['Sphinx', 28], ['Great Pyramid', 45],
    ])
  })
  test('fit x 36..71 and y 2..29', () => {
    for (const wonder of WONDERS) {
      for (const slot of wonder.slots) {
        expect(slot.x >= 36 && slot.x + BRICK_W - 1 <= 71, `${wonder.name} x ${slot.x}`).toBe(true)
        expect(slot.y >= 2 && slot.y + BRICK_H - 1 <= 29, `${wonder.name} y ${slot.y}`).toBe(true)
      }
    }
  })
  test('bricks never overlap', () => {
    for (const wonder of WONDERS) {
      const seen = new Set<string>()
      for (const slot of wonder.slots) {
        for (let dy = 0; dy < BRICK_H; dy += 1) {
          for (let dx = 0; dx < BRICK_W; dx += 1) {
            const key = `${slot.x + dx},${slot.y + dy}`
            expect(seen.has(key), `${wonder.name} ${key}`).toBe(false)
            seen.add(key)
          }
        }
      }
    }
  })
  test('are built bottom-up, left to right', () => {
    for (const wonder of WONDERS) {
      for (let i = 1; i < wonder.slots.length; i += 1) {
        const a = wonder.slots[i - 1]!
        const b = wonder.slots[i]!
        expect(a.y > b.y || (a.y === b.y && a.x < b.x), wonder.name).toBe(true)
      }
    }
  })
  test('workers stop one pixel left of the left foot', () => {
    expect(WONDERS.map(walkTarget)).toEqual([34, 42, 32, 28])
  })
})
