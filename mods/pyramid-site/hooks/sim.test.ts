import { describe, expect, test } from 'claude-code/testing'

import type { PyramidWorld } from '../types'
import type { Anim } from './scene'
import { CARAVAN_STOP, DONE_TICKS, HAND_TICKS, WHIP_TICKS, applyCue, initialAnim, isAnimating, step } from './sim'
import { W, WONDERS, walkTarget } from './sprites'
import { initialWorld } from './world'

const world = (workers: Partial<PyramidWorld['workers']> = {}): PyramidWorld => {
  const base = initialWorld({ v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: false })
  return { ...base, workers: { ...base.workers, ...workers } }
}
const run = (anim: Anim, w: PyramidWorld, ticks: number): Anim => {
  let out = anim
  for (let i = 0; i < ticks; i += 1) out = step(out, w)
  return out
}

describe('cues', () => {
  test('whip, flash, gold and complete start their timers', () => {
    expect(applyCue(initialAnim(), { kind: 'whip' }).whip).toBe(WHIP_TICKS)
    expect(applyCue(initialAnim(), { kind: 'flash', slot: 4 })).toMatchObject({ flash: 10, flashSlot: 4 })
    expect(applyCue(initialAnim(), { kind: 'gold' }).gold).toBe(12)
    expect(applyCue(initialAnim(), { kind: 'complete', wonderIndex: 0 }).done).toEqual({ wonderIndex: 0, ticks: DONE_TICKS })
  })
  test('timers count down to zero', () => {
    const after = run(applyCue(applyCue(initialAnim(), { kind: 'whip' }), { kind: 'complete', wonderIndex: 0 }), world(), DONE_TICKS)
    expect(after.whip).toBe(0)
    expect(after.done).toBeUndefined()
  })
})

describe('workers', () => {
  test('a working worker carries a brick to the wonder and walks back empty', () => {
    const w = world({ analyst: 'working' })
    const target = walkTarget(WONDERS[0]!)
    const out = run(initialAnim(), w, (target - 11) * 2)
    expect(out.workers.analyst).toMatchObject({ x: target, dir: 1, carry: true })
    const turned = run(out, w, 2)
    expect(turned.workers.analyst).toMatchObject({ x: target, dir: -1, carry: false })
    const back = run(turned, w, (target - 11) * 2 + 2)
    expect(back.workers.analyst).toMatchObject({ x: 11, dir: 1, carry: true })
  })
  test('an idle worker away from home walks home', () => {
    const away: Anim = { ...initialAnim(), workers: { ...initialAnim().workers, analyst: { x: 20, dir: 1, carry: true, step: 0 } } }
    expect(run(away, world(), 18).workers.analyst.x).toBe(11)
  })
  test('blocked and waiting workers stand still', () => {
    const w = world({ analyst: 'blocked', reviewer: 'waiting' })
    const out = run(initialAnim(), w, 10)
    expect(out.workers.analyst.x).toBe(11)
    expect(out.workers.reviewer.x).toBe(25)
  })
})

describe('caravan', () => {
  test('walks in, hands over the scroll, walks out', () => {
    let anim = applyCue(initialAnim(), { kind: 'caravan' })
    expect(anim.caravan).toEqual({ phase: 'in', x: W, hold: 0, queued: false })
    anim = run(anim, world(), (W - CARAVAN_STOP) * 2)
    expect(anim.caravan).toMatchObject({ phase: 'hand', x: CARAVAN_STOP })
    anim = run(anim, world(), HAND_TICKS)
    expect(anim.caravan.phase).toBe('out')
    anim = run(anim, world(), (W - CARAVAN_STOP) * 2)
    expect(anim.caravan.phase).toBe('none')
  })
  test('queues at most one more trip', () => {
    let anim = applyCue(initialAnim(), { kind: 'caravan' })
    anim = applyCue(applyCue(anim, { kind: 'caravan' }), { kind: 'caravan' })
    expect(anim.caravan.queued).toBe(true)
    anim = run(anim, world(), (W - CARAVAN_STOP) * 4 + HAND_TICKS)
    expect(anim.caravan).toMatchObject({ phase: 'in', queued: false })
  })
})

describe('isAnimating', () => {
  test('is false for a quiet site and true while anything moves', () => {
    expect(isAnimating(initialAnim(), world())).toBe(false)
    expect(isAnimating(initialAnim(), world({ implementer: 'working' }))).toBe(true)
    expect(isAnimating(applyCue(initialAnim(), { kind: 'caravan' }), world())).toBe(true)
    expect(isAnimating(applyCue(initialAnim(), { kind: 'whip' }), world())).toBe(true)
  })
  test('a blocked worker alone does not keep the 12 fps loop', () => {
    expect(isAnimating(initialAnim(), world({ reviewer: 'blocked' }))).toBe(false)
  })
})

describe('clouds', () => {
  test('drift right and wrap', () => {
    const anim: Anim = { ...initialAnim(), clouds: [W + 1.99] }
    expect(step(anim, world()).clouds).toEqual([-12])
  })
})
