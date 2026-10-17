import type { PyramidWorkerName, PyramidWorld } from '../types'
import {
  BOSS, BOSS_X, BOSS_Y, BRICK_H, BRICK_W, CAMEL, CAMEL_H, CLOUD_START, CLOUDS, DROPPED_BRICK, GROUND, H, HAND, LEGS_A, LEGS_B,
  PALETTE, QMARK, SCROLL, SIT, SPARK, UP_CARRY, UP_EMPTY, W, WHIP, WORKER_H, WORKER_HOME, WORKER_NAMES, WORKER_SHIRT,
  ZED_LARGE, ZED_SMALL, wonderAt,
} from './sprites'
import type { Palette, Sprite } from './sprites'

export type WorkerAnim = { x: number; dir: 1 | -1; carry: boolean; step: number }
export type CaravanPhase = 'none' | 'in' | 'hand' | 'out'
export type Caravan = { phase: CaravanPhase; x: number; hold: number; queued: boolean }
export type Anim = {
  tick: number
  whip: number
  flash: number
  flashSlot: number
  gold: number
  done: { wonderIndex: number; ticks: number } | undefined
  workers: Record<PyramidWorkerName, WorkerAnim>
  caravan: Caravan
  clouds: number[]
}

export const SKY_TOP = 0x5fa8e0
export const SKY_BOTTOM = 0xc4e6f3
export const CRACK = 0x3a1608
const BRICK_FACE = 0xd4923f
const BRICK_MORTAR = 0x8a5524
const CRACKED_FACE = 0xd8482e
const CRACKED_MORTAR = 0x80301f
export const SCROLL_AT = { x: BOSS_X + 2, y: BOSS_Y - 3 } as const

export function mix(a: number, b: number, t: number): number {
  let out = 0
  for (const shift of [16, 8, 0]) {
    const from = (a >>> shift) & 0xff
    const to = (b >>> shift) & 0xff
    out |= Math.round(from + (to - from) * t) << shift
  }
  return out >>> 0
}

export const skyAt = (y: number): number => mix(SKY_TOP, SKY_BOTTOM, Math.min(1, y / (GROUND - 1)))

const hash = (x: number, y: number): number => (Math.imul(x + 1, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0

function put(pixels: Uint32Array, x: number, y: number, color: number): void {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px >= 0 && px < W && py >= 0 && py < H) pixels[py * W + px] = color
}

function sprite(pixels: Uint32Array, rows: Sprite, x: number, y: number, palette: Palette, flip = false): void {
  const width = rows[0]?.length ?? 0
  rows.forEach((row, r) => {
    for (let i = 0; i < width; i += 1) {
      const glyph = row[flip ? width - 1 - i : i] ?? '.'
      if (glyph === '.') continue
      const color = palette[glyph]
      if (color !== undefined) put(pixels, x + i, y + r, color)
    }
  })
}

function drawBackdrop(pixels: Uint32Array, anim: Anim): void {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (y < GROUND) {
        pixels[y * W + x] = skyAt(y)
        continue
      }
      const h = hash(x, y)
      pixels[y * W + x] = y === GROUND ? 0xe3c486 : h % 7 === 0 ? 0xc4a161 : h % 11 === 0 ? 0xe6cc92 : 0xd6b574
    }
  }
  for (let y = 2; y < 7; y += 1) {
    for (let x = 27; x < 32; x += 1) {
      const edge = y === 2 || y === 6 || x === 27 || x === 31
      put(pixels, x, y, edge ? 0xf6d54a : 0xfff1a8)
    }
  }
  anim.clouds.forEach((cx, i) => {
    const start = CLOUD_START[i]
    if (start !== undefined) sprite(pixels, CLOUDS[start.p]!, Math.round(cx), start.y, { W: 0xffffff })
  })
  for (let x = 0; x < W; x += 1) {
    const h = Math.max(1, Math.round(2.2 + 1.3 * Math.sin(x * 0.17) + 0.9 * Math.sin(x * 0.06 + 2)))
    for (let y = GROUND - h; y < GROUND; y += 1) put(pixels, x, y, y === GROUND - h ? 0xefd9a6 : 0xe3c88f)
  }
}

function drawWonder(pixels: Uint32Array, world: PyramidWorld, anim: Anim): void {
  const index = anim.done?.wonderIndex ?? world.progress.wonderIndex
  const wonder = wonderAt(index)
  const bricks = anim.done !== undefined ? wonder.slots.length : world.progress.bricks
  const cracked = anim.done !== undefined ? [] : world.progress.cracked
  const last = wonder.slots.length - 1
  wonder.slots.forEach((slot, i) => {
    for (let dy = 0; dy < BRICK_H; dy += 1) {
      for (let dx = 0; dx < BRICK_W; dx += 1) {
        let color: number
        if (i >= bricks) {
          // only some outline pixels, so an unbuilt slot reads as a faint dotted frame
          const isOutline = (dy === 0 && dx % 2 === 0) || (dx === 0 && dy === 1)
          color = isOutline ? mix(skyAt(slot.y + dy), 0xd6b574, 0.14) : skyAt(slot.y + dy)
        } else if (anim.done !== undefined && i === last) {
          color = dy === 0 && dx < 3 ? 0xffe27a : 0xe9b949
        } else if (anim.gold > 0) {
          color = dy === 0 ? 0xffe27a : 0xe9b949
        } else if (anim.flash > 0 && i === anim.flashSlot) {
          color = anim.flash % 2 === 1 ? 0xfff6d6 : 0xf2dfa8
        } else {
          const isMortar = dy === BRICK_H - 1 || dx === BRICK_W - 1
          const isCracked = cracked.includes(i)
          color = isCracked ? (isMortar ? CRACKED_MORTAR : CRACKED_FACE) : isMortar ? BRICK_MORTAR : BRICK_FACE
        }
        put(pixels, slot.x + dx, slot.y + dy, color)
      }
    }
    if (i < bricks && cracked.includes(i) && anim.done === undefined) {
      // a dark zig-zag across the whole brick, whatever flash is running
      for (const [dx, dy] of [[0, 1], [1, 0], [2, 1], [3, 0]] as const) put(pixels, slot.x + dx, slot.y + dy, CRACK)
    }
  })
}

function drawOverseer(pixels: Uint32Array, anim: Anim): void {
  sprite(pixels, BOSS, BOSS_X, BOSS_Y, PALETTE)
  const phase = anim.whip > 6 ? 'raise' : anim.whip > 2 ? 'crack' : 'rest'
  for (const [dx, dy] of WHIP[phase]) put(pixels, HAND.x + dx, HAND.y + dy, PALETTE.N!)
  if (phase === 'crack' && anim.whip % 2 === 1) {
    for (const [dx, dy, color] of SPARK) put(pixels, HAND.x + dx, HAND.y + dy, color)
  }
}

function drawCaravan(pixels: Uint32Array, anim: Anim): void {
  const { phase, x } = anim.caravan
  if (phase === 'none') return
  const top = GROUND - CAMEL_H
  sprite(pixels, CAMEL, x, top, PALETTE, phase === 'out')
  if (phase === 'in') sprite(pixels, SCROLL, x + 6, top, PALETTE)
  if (phase === 'hand') sprite(pixels, SCROLL, SCROLL_AT.x, SCROLL_AT.y, PALETTE)
}

const ZED_CYCLE = 48

// Two Zs of different sizes rise from the sleeper's head, half a cycle apart, and fade toward the sky colour.
function drawZeds(pixels: Uint32Array, x: number, top: number, tick: number): void {
  const zeds = [
    { rows: ZED_SMALL, age: tick % ZED_CYCLE, dx: 5 },
    { rows: ZED_LARGE, age: (tick + ZED_CYCLE / 2) % ZED_CYCLE, dx: 8 },
  ] as const
  for (const zed of zeds) {
    const y = top - 1 - Math.floor(zed.age / 4) - zed.rows.length
    const color = mix(0xffffff, skyAt(y), (zed.age / ZED_CYCLE) * 0.85)
    sprite(pixels, zed.rows, x + zed.dx + Math.floor(zed.age / 16), y, { W: color })
  }
}

function drawWorkers(pixels: Uint32Array, world: PyramidWorld, anim: Anim): void {
  const top = GROUND - WORKER_H
  for (const name of WORKER_NAMES) {
    const state = world.workers[name]
    const walker = anim.workers[name]
    const palette: Palette = { ...PALETTE, ...WORKER_SHIRT[name] }
    if (state === 'idle' && walker.x <= WORKER_HOME[name]) {
      sprite(pixels, SIT, walker.x, top, palette)
      drawZeds(pixels, walker.x, top, anim.tick)
      continue
    }
    const isStill = state === 'blocked' || state === 'waiting'
    const upper = walker.carry && !isStill ? UP_CARRY : UP_EMPTY
    const legs = isStill ? LEGS_B : walker.step % 2 === 1 ? LEGS_A : LEGS_B
    sprite(pixels, upper.concat(legs), walker.x, top, palette, walker.dir < 0)
    if (state === 'blocked') {
      sprite(pixels, DROPPED_BRICK, walker.x + 7, GROUND - 2, PALETTE)
      if (Math.floor(anim.tick / 5) % 2 === 1) sprite(pixels, QMARK, walker.x + 2, top - 6, PALETTE)
    }
  }
}

export function drawScene(world: PyramidWorld, anim: Anim): Uint32Array {
  const pixels = new Uint32Array(W * H)
  drawBackdrop(pixels, anim)
  drawWonder(pixels, world, anim)
  drawOverseer(pixels, anim)
  drawCaravan(pixels, anim)
  drawWorkers(pixels, world, anim)
  return pixels
}
