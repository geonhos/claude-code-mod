import { describe, expect, test } from 'claude-code/testing'

import type { PyramidProgress, PyramidWorld } from '../types'
import { CRACK, SCROLL_AT, drawScene, skyAt } from './scene'
import type { Anim } from './scene'
import { CLOUD_START, H, PALETTE, W, WONDERS } from './sprites'

const progress = (over: Partial<PyramidProgress> = {}): PyramidProgress => ({
  v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: false, ...over,
})
const world = (over: Partial<PyramidProgress> = {}, workers: Partial<PyramidWorld['workers']> = {}): PyramidWorld => ({
  progress: progress(over),
  workers: { analyst: 'idle', implementer: 'idle', reviewer: 'idle', ...workers },
  askedAt: { analyst: 0, implementer: 0, reviewer: 0 },
})
const anim = (over: Partial<Anim> = {}): Anim => ({
  tick: 0, whip: 0, flash: 0, flashSlot: -1, gold: 0, done: undefined,
  workers: {
    analyst: { x: 11, dir: 1, carry: true, step: 0 },
    implementer: { x: 18, dir: 1, carry: true, step: 0 },
    reviewer: { x: 25, dir: 1, carry: true, step: 0 },
  },
  caravan: { phase: 'none', x: W, hold: 0, queued: false },
  clouds: CLOUD_START.map(c => c.x),
  ...over,
})
const at = (pixels: Uint32Array, x: number, y: number): number => pixels[y * W + x]!

describe('drawScene', () => {
  test('fills the whole 72×36 buffer', () => {
    const pixels = drawScene(world(), anim())
    expect(pixels).toHaveLength(W * H)
    expect(at(pixels, 0, 0)).toBe(skyAt(0))
  })
  test('draws the overseer headdress in gold', () => {
    expect(at(drawScene(world(), anim()), 4, 16)).toBe(PALETTE.G!)
  })
  test('draws built bricks in sandstone and unbuilt slots faintly', () => {
    const slot = WONDERS[0]!.slots[1]!
    const built = drawScene(world({ bricks: 1 }), anim())
    expect(at(built, 42, 28)).toBe(0xecd59f)
    expect(at(built, slot.x + 1, slot.y + 1)).not.toBe(0xecd59f)
  })
  test('draws a dark crack on a cracked brick', () => {
    expect(at(drawScene(world({ bricks: 1, cracked: [0] }), anim()), 43, 28)).toBe(CRACK)
  })
  test('turns every built brick gold during a gold flash', () => {
    expect(at(drawScene(world({ bricks: 2 }), anim({ gold: 5 })), 46, 29)).toBe(0xe9b949)
  })
  test('shows the finished wonder with a gold capstone while done', () => {
    const top = WONDERS[0]!.slots[27]!
    expect(at(drawScene(world({ wonderIndex: 1, bricks: 0 }), anim({ done: { wonderIndex: 0, ticks: 10 } })), top.x, top.y)).toBe(0xffe27a)
  })
  test('seats an idle worker at home', () => {
    expect(at(drawScene(world(), anim()), 13, 21)).toBe(PALETTE.Y!)
  })
  test('floats a readable Z over a sleeping worker and nothing over a busy one', () => {
    const lit = (scene: Uint32Array): number => {
      let count = 0
      for (let y = 8; y < 17; y += 1) for (let x = 11; x < 23; x += 1) if (at(scene, x, y) !== skyAt(y)) count += 1
      return count
    }
    expect(lit(drawScene(world(), anim()))).toBeGreaterThanOrEqual(8)
    expect(lit(drawScene(world({}, { analyst: 'working' }), anim()))).toBe(0)
  })
  test('fades the Z toward the sky as it rises', () => {
    const whites = (tick: number): number => drawScene(world(), anim({ tick })).filter(color => color === 0xffffff).length
    // a fresh Z is pure white (clouds sit elsewhere but are white too, so compare counts)
    expect(whites(0)).toBeGreaterThan(whites(40))
  })
  test('draws a blocked worker with a dropped brick', () => {
    const scene = drawScene(world({}, { reviewer: 'blocked' }), anim())
    expect(at(scene, 25 + 7, 28)).toBe(PALETTE.R!)
  })
  test('draws the camel walking in with its scroll', () => {
    const scene = drawScene(world(), anim({ caravan: { phase: 'in', x: 50, hold: 0, queued: false } }))
    expect(at(scene, 51, 20)).toBe(PALETTE.a!)
    expect(at(scene, 56, 20)).toBe(PALETTE.N!)
  })
  test('hands the scroll to the overseer', () => {
    const scene = drawScene(world(), anim({ caravan: { phase: 'hand', x: 11, hold: 5, queued: false } }))
    expect(at(scene, SCROLL_AT.x + 1, SCROLL_AT.y)).toBe(PALETTE.W!)
  })
})
