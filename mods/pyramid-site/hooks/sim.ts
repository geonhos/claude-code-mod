import type { PyramidWorkerName, PyramidWorld } from '../types'
import type { Anim, WorkerAnim } from './scene'
import { BOSS_X, CLOUD_START, W, WORKER_HOME, WORKER_NAMES, walkTarget, wonderAt } from './sprites'
import type { Cue } from './world'

export const WHIP_TICKS = 10
export const FLASH_TICKS = 10
export const GOLD_TICKS = 12
export const DONE_TICKS = 36
export const HAND_TICKS = 12
export const CARAVAN_STOP = BOSS_X + 10
export const CLOUD_SPEED = 0.05

export function initialAnim(): Anim {
  const home = (name: PyramidWorkerName): WorkerAnim => ({ x: WORKER_HOME[name], dir: 1, carry: true, step: 0 })
  return {
    tick: 0,
    whip: 0,
    flash: 0,
    flashSlot: -1,
    gold: 0,
    done: undefined,
    workers: { analyst: home('analyst'), implementer: home('implementer'), reviewer: home('reviewer') },
    caravan: { phase: 'none', x: W, hold: 0, queued: false },
    clouds: CLOUD_START.map(cloud => cloud.x),
  }
}

export function applyCue(anim: Anim, cue: Cue): Anim {
  switch (cue.kind) {
    case 'whip':
      return { ...anim, whip: WHIP_TICKS }
    case 'flash':
      return { ...anim, flash: FLASH_TICKS, flashSlot: cue.slot }
    case 'gold':
      return { ...anim, gold: GOLD_TICKS }
    case 'complete':
      return { ...anim, done: { wonderIndex: cue.wonderIndex, ticks: DONE_TICKS } }
    case 'caravan':
      return anim.caravan.phase === 'none'
        ? { ...anim, caravan: { phase: 'in', x: W, hold: 0, queued: false } }
        : { ...anim, caravan: { ...anim.caravan, queued: true } }
  }
}

function walk(walker: WorkerAnim, state: PyramidWorld['workers'][PyramidWorkerName], home: number, target: number): WorkerAnim {
  if (state === 'working') {
    if (walker.dir > 0) {
      return walker.x < target
        ? { ...walker, x: walker.x + 1, step: walker.step + 1 }
        : { ...walker, dir: -1, carry: false, step: walker.step + 1 }
    }
    return walker.x > home
      ? { ...walker, x: walker.x - 1, step: walker.step + 1 }
      : { ...walker, dir: 1, carry: true, step: walker.step + 1 }
  }
  if (state === 'idle') {
    return walker.x > home
      ? { x: walker.x - 1, dir: -1, carry: false, step: walker.step + 1 }
      : { x: home, dir: 1, carry: true, step: walker.step }
  }
  return walker
}

function moveCaravan(anim: Anim, isStride: boolean): Anim['caravan'] {
  const caravan = anim.caravan
  switch (caravan.phase) {
    case 'none':
      return caravan
    case 'in':
      if (!isStride) return caravan
      return caravan.x - 1 <= CARAVAN_STOP
        ? { ...caravan, phase: 'hand', x: CARAVAN_STOP, hold: HAND_TICKS }
        : { ...caravan, x: caravan.x - 1 }
    case 'hand':
      return caravan.hold <= 1 ? { ...caravan, phase: 'out', hold: 0 } : { ...caravan, hold: caravan.hold - 1 }
    case 'out':
      if (!isStride) return caravan
      if (caravan.x + 1 < W) return { ...caravan, x: caravan.x + 1 }
      return caravan.queued ? { phase: 'in', x: W, hold: 0, queued: false } : { phase: 'none', x: W, hold: 0, queued: false }
  }
}

export function step(anim: Anim, world: PyramidWorld): Anim {
  const tick = anim.tick + 1
  const isStride = tick % 2 === 0
  const target = walkTarget(wonderAt(world.progress.wonderIndex))
  const workers = { ...anim.workers }
  if (isStride) {
    for (const name of WORKER_NAMES) workers[name] = walk(anim.workers[name], world.workers[name], WORKER_HOME[name], target)
  }
  return {
    tick,
    whip: Math.max(0, anim.whip - 1),
    flash: Math.max(0, anim.flash - 1),
    flashSlot: anim.flash > 1 ? anim.flashSlot : -1,
    gold: Math.max(0, anim.gold - 1),
    done: anim.done === undefined || anim.done.ticks <= 1 ? undefined : { ...anim.done, ticks: anim.done.ticks - 1 },
    workers,
    caravan: moveCaravan(anim, isStride),
    clouds: anim.clouds.map(x => (x + CLOUD_SPEED > W + 2 ? -12 : x + CLOUD_SPEED)),
  }
}

export function isAnimating(anim: Anim, world: PyramidWorld): boolean {
  if (anim.whip > 0 || anim.flash > 0 || anim.gold > 0 || anim.done !== undefined) return true
  if (anim.caravan.phase !== 'none') return true
  return WORKER_NAMES.some(name => {
    const state = world.workers[name]
    return state === 'working' || (state === 'idle' && anim.workers[name].x > WORKER_HOME[name])
  })
}
