import { describe, expect, test } from 'claude-code/testing'

import type { PyramidProgress, PyramidWorld } from '../types'
import { CRACK, SCROLL_AT, drawScene, frameFor, skyAt } from './scene'
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
const luma = (color: number): number => 0.2126 * ((color >>> 16) & 0xff) + 0.7152 * ((color >>> 8) & 0xff) + 0.0722 * (color & 0xff)
const at = (pixels: Uint32Array, x: number, y: number): number => pixels[y * W + x]!

describe('drawScene', () => {
  test('fills the whole 72×36 buffer', () => {
    const pixels = drawScene(world(), anim())
    expect(pixels).toHaveLength(W * H)
    expect(at(pixels, 0, 0)).toBe(skyAt(0))
  })
  test('grows to the requested number of rows with sky above and strata below', () => {
    const tall = drawScene(world(), anim(), 30)
    expect(tall).toHaveLength(W * 60)
    expect(at(tall, 0, 0)).toBe(skyAt(0))
    expect(at(tall, 0, 59)).not.toBe(at(tall, 0, 31))
    expect(drawScene(world(), anim(), 18)).toHaveLength(W * H)
    expect(drawScene(world(), anim(), 40)).toHaveLength(W * 80)
  })
  for (const rows of [18, 30, 40]) test(`keeps the actors standing on the ground at ${rows} rows`, () => {
    const scene = drawScene(world({ bricks: 1 }), anim(), rows)
    const h = rows * 2
    const ground = frameFor(rows).ground
    // a worker's boots and the first brick rest on the ground line, which sits at a fixed offset
    expect(at(scene, 25 + 5, ground - 1)).toBe(PALETTE.K!)
    expect(at(scene, 43, ground - 1)).not.toBe(skyAt(ground - 1, ground))
    expect(ground).toBeLessThan(h)
    expect(h - ground).toBeGreaterThanOrEqual(6)
  })
  test('draws the overseer headdress in gold', () => {
    expect(at(drawScene(world(), anim()), 4, 16)).toBe(PALETTE.G!)
  })
  test('draws built bricks well apart from unbuilt slots', () => {
    const slot = WONDERS[0]!.slots[1]!
    const built = drawScene(world({ bricks: 2 }), anim())
    const unbuilt = drawScene(world({ bricks: 1 }), anim())
    expect(luma(at(built, slot.x, slot.y)) - luma(at(unbuilt, slot.x, slot.y))).toBeLessThanOrEqual(-40)
    expect(luma(at(built, slot.x, slot.y)) - luma(at(built, slot.x, slot.y - 6))).toBeLessThanOrEqual(-40)
  })
  test('gives a built brick a darker mortar line at the bottom and right', () => {
    const built = drawScene(world({ bricks: 1 }), anim())
    expect(luma(at(built, 42, 29))).toBeLessThan(luma(at(built, 42, 28)))
    expect(luma(at(built, 45, 28))).toBeLessThan(luma(at(built, 42, 28)))
  })
  test('draws unbuilt slots as a faint dotted outline', () => {
    const slot = WONDERS[0]!.slots[1]!
    const scene = drawScene(world({ bricks: 0 }), anim())
    let tinted = 0
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 4; dx += 1) if (at(scene, slot.x + dx, slot.y + dy) !== skyAt(slot.y + dy)) tinted += 1
    expect(tinted).toBeGreaterThan(0)
    expect(tinted).toBeLessThan(8)
  })
  test('draws a dark zig-zag crack of at least 4 px and a red tint on a cracked brick', () => {
    const plain = drawScene(world({ bricks: 1 }), anim())
    const cracked = drawScene(world({ bricks: 1, cracked: [0] }), anim())
    const cracks = [0, 1].flatMap(dy => [0, 1, 2, 3].map(dx => at(cracked, 42 + dx, 28 + dy))).filter(color => color === CRACK)
    expect(cracks.length).toBeGreaterThanOrEqual(4)
    const face = (scene: Uint32Array): number => at(scene, 42, 28)
    expect(((face(cracked) >>> 16) & 0xff) - (face(cracked) & 0xff)).toBeGreaterThan(((face(plain) >>> 16) & 0xff) - (face(plain) & 0xff))
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
