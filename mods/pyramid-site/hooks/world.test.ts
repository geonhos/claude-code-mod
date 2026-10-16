import { describe, expect, test } from 'claude-code/testing'

import type { PyramidProgress, PyramidWorld } from '../types'
import { ASK_GRACE_MS, SEEN_LIMIT, apply, initialWorld, localDate } from './world'

const NOW = new Date(2026, 9, 16, 12, 0, 0).getTime()
const progress = (over: Partial<PyramidProgress> = {}): PyramidProgress => ({
  v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: false, ...over,
})
const world = (over: Partial<PyramidProgress> = {}, workers: Partial<PyramidWorld['workers']> = {}): PyramidWorld => {
  const base = initialWorld(progress(over))
  return { ...base, workers: { ...base.workers, ...workers } }
}
const review = (findings: string[], status = 'done'): string =>
  ['# reviewer report — x', `status: ${status}`, '## Findings / Decisions', ...findings, '## Verification', '- ran'].join('\n')

describe('ask', () => {
  test('sets the worker working, stamps askedAt and cracks the whip', () => {
    const out = apply(world(), { kind: 'ask', worker: 'analyst' }, NOW)
    expect(out.world.workers.analyst).toBe('working')
    expect(out.world.askedAt.analyst).toBe(NOW)
    expect(out.cues).toEqual([{ kind: 'whip' }])
  })
})

describe('report', () => {
  test('adds one brick, flashes it and rests the worker', () => {
    const out = apply(world({ bricks: 4 }, { analyst: 'working' }), { kind: 'report', worker: 'analyst', text: '# a' }, NOW)
    expect(out.world.progress.bricks).toBe(5)
    expect(out.world.workers.analyst).toBe('idle')
    expect(out.cues).toEqual([{ kind: 'flash', slot: 4 }])
  })
  test('counts the same report text once', () => {
    const once = apply(world(), { kind: 'report', worker: 'analyst', text: '# a' }, NOW).world
    const twice = apply(once, { kind: 'report', worker: 'analyst', text: '\n# a\n' }, NOW)
    expect(twice.world.progress.bricks).toBe(1)
    expect(twice.cues).toEqual([])
  })
  test(`remembers only the last ${SEEN_LIMIT} reports`, () => {
    let w = world()
    for (let i = 0; i < SEEN_LIMIT + 5; i += 1) w = apply(w, { kind: 'report', worker: 'analyst', text: `# ${i}` }, NOW).world
    expect(w.progress.seenReports).toHaveLength(SEEN_LIMIT)
  })
  test('a clean review flashes gold', () => {
    const out = apply(world({ bricks: 3 }), { kind: 'report', worker: 'reviewer', text: review(['- no findings']) }, NOW)
    expect(out.cues).toEqual([{ kind: 'gold' }, { kind: 'flash', slot: 3 }])
    expect(out.world.progress.cracked).toEqual([])
  })
  test('findings crack up to three of the most recent uncracked bricks', () => {
    const two = apply(world({ bricks: 6 }), { kind: 'report', worker: 'reviewer', text: review(['- [Major] a', '- [Minor] b']) }, NOW)
    expect(two.world.progress.cracked).toEqual([4, 5])
    expect(two.world.progress.bricks).toBe(7)
    const five = apply(
      world({ bricks: 6, cracked: [5] }),
      { kind: 'report', worker: 'reviewer', text: review(['- [Critical] a', '- [Major] b', '- [Minor] c', '- [Minor] d', '- [Minor] e']) },
      NOW,
    )
    expect(five.world.progress.cracked).toEqual([2, 3, 4, 5])
  })
  test('a blocked review gives a brick but no verdict', () => {
    const out = apply(world({ bricks: 2 }), { kind: 'report', worker: 'reviewer', text: review(['- [Major] a'], 'blocked') }, NOW)
    expect(out.world.progress.cracked).toEqual([])
    expect(out.cues).toEqual([{ kind: 'flash', slot: 2 }])
  })
  test('an implementer report repairs every crack, then adds its brick', () => {
    const out = apply(world({ bricks: 6, cracked: [4, 5] }), { kind: 'report', worker: 'implementer', text: '# fix' }, NOW)
    expect(out.world.progress.cracked).toEqual([])
    expect(out.world.progress.bricks).toBe(7)
  })
  test('the last brick completes the wonder and starts the next one', () => {
    const out = apply(world({ bricks: 27, cracked: [3] }), { kind: 'report', worker: 'analyst', text: '# last' }, NOW)
    expect(out.world.progress).toMatchObject({ wonderIndex: 1, bricks: 0, cracked: [], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }] })
    expect(out.cues).toEqual([{ kind: 'flash', slot: 27 }, { kind: 'complete', wonderIndex: 0 }])
  })
  test('after the Great Pyramid the cycle starts over and keeps the list', () => {
    const done = [{ wonder: 'Pyramid', date: '2026-10-01' }]
    const out = apply(world({ wonderIndex: 3, bricks: 44, completed: done }), { kind: 'report', worker: 'analyst', text: '# z' }, NOW)
    expect(out.world.progress.wonderIndex).toBe(0)
    expect(out.world.progress.completed).toHaveLength(2)
  })
})

describe('worker states', () => {
  test('blocked, waiting and idle set the state', () => {
    expect(apply(world(), { kind: 'blocked', worker: 'reviewer' }, NOW).world.workers.reviewer).toBe('blocked')
    expect(apply(world(), { kind: 'waiting', worker: 'reviewer' }, NOW).world.workers.reviewer).toBe('waiting')
    expect(apply(world({}, { reviewer: 'working' }), { kind: 'idle', worker: 'reviewer' }, NOW).world.workers.reviewer).toBe('idle')
  })
  test('the caravan only cues', () => {
    const w = world()
    const out = apply(w, { kind: 'caravan' }, NOW)
    expect(out.world).toBe(w)
    expect(out.cues).toEqual([{ kind: 'caravan' }])
  })
})

describe('status reconcile', () => {
  test('takes working and blocked from the poll', () => {
    const out = apply(world(), { kind: 'status', polled: { analyst: 'working', reviewer: 'blocked' } }, NOW)
    expect(out.world.workers).toEqual({ analyst: 'working', implementer: 'idle', reviewer: 'blocked' })
    expect(out.cues).toEqual([])
  })
  test('keeps waiting while the worker still works', () => {
    expect(apply(world({}, { analyst: 'waiting' }), { kind: 'status', polled: { analyst: 'working' } }, NOW).world.workers.analyst).toBe('waiting')
  })
  test('idle and absent rest the worker, except just after an ask', () => {
    const asked = apply(world(), { kind: 'ask', worker: 'analyst' }, NOW).world
    expect(apply(asked, { kind: 'status', polled: { analyst: 'idle' } }, NOW + 1000).world.workers.analyst).toBe('working')
    expect(apply(asked, { kind: 'status', polled: { analyst: 'absent' } }, NOW + ASK_GRACE_MS).world.workers.analyst).toBe('idle')
  })
  test('returns the same world object when nothing changes', () => {
    const w = world()
    expect(apply(w, { kind: 'status', polled: { analyst: 'idle' } }, NOW).world).toBe(w)
  })
})

describe('localDate', () => {
  test('formats YYYY-MM-DD in local time', () => {
    expect(localDate(NOW)).toBe('2026-10-16')
  })
})
