import type { ProcessRunResult, RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PROPS: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const BAND = { plugin: 'kaomoji-status', surface: 'terminal', component: 'AbovePrompt' } as const

const ok = (stdout: string): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

test('polls harness status every 2.5 s and draws one row of faces', async ($, on) => {
  const clock = mock.clock(on)
  const calls: string[][] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async (_$, e) => {
    calls.push([...e.argv])
    return ok('analyst      idle     w5:p2\nimplementer  working  w5:p3\nreviewer     -\n')
  })
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, props: PROPS })
  expect(await ui.find({ key: 'kaomoji-status' })).toBeUndefined()

  await clock.advance(2500)
  expect(calls).toEqual([['harness', 'status']])
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง')

  await clock.advance(250)
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst (｡-ω-)zzZ  implementer ᕕ( ᐛ )ᕗ ')
})

test('runs harnessPath when it is set', { options: { harnessPath: '/opt/bin/harness' } }, async ($, on) => {
  const clock = mock.clock(on)
  const calls: string[][] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async (_$, e) => {
    calls.push([...e.argv])
    return ok('')
  })

  await $.session.start(START)
  await clock.advance(2500)
  expect(calls).toEqual([['/opt/bin/harness', 'status']])
})

test('skips a poll while the previous run is in flight', async ($, on) => {
  const clock = mock.clock(on)
  let runs = 0
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => {
    runs += 1
    await clock.sleep(4000)
    return ok('analyst idle w1:p1\n')
  })

  await $.session.start(START)
  await clock.advance(2500)
  expect(runs).toBe(1)
  await clock.advance(2500)
  expect(runs).toBe(1)
  await clock.advance(2500)
  expect(runs).toBe(2)
})

test('stops the frame timer when every worker is idle', async ($, on) => {
  const clock = mock.clock(on)
  let stdout = 'analyst working w1:p1\n'
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => ok(stdout))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, props: PROPS })
  await clock.advance(2500)
  await clock.advance(250)
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst ᕕ( ᐛ )ᕗ ')

  stdout = 'analyst idle w1:p1\n'
  await clock.advance(2250)
  const still = (await ui.find({ key: 'kaomoji-status' }))?.text
  expect(still?.startsWith('analyst (｡-ω-)')).toBe(true)

  await clock.advance(1000)
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe(still)
})

test('yields to the engine while a survey holds the band', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => ok('analyst working w1:p1\n'))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start(START)
  await clock.advance(2500)
  const ui = await $.ui.mount({ ...BAND, props: { ...PROPS, hasSurvey: true } })
  expect(await ui.find({ key: 'kaomoji-status' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'engine' }))?.text).toBe('engine')
})

test('hides the row when harness fails, exits non-zero or prints nothing', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Array<{ value: ProcessRunResult } | { deny: string }> = [
    ok('analyst working w1:p1\n'),
    { deny: 'harness: command not found' },
    ok('analyst working w1:p1\n'),
    { value: { exitCode: 1, stdout: 'analyst working w1:p1\n', stderr: 'boom', isStdoutTruncated: false, isStderrTruncated: false } },
    ok('analyst working w1:p1\n'),
    ok(''),
  ]
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => answers.shift() ?? ok(''))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, props: PROPS })
  for (let round = 0; round < 3; round += 1) {
    await clock.advance(2500)
    expect(await ui.find({ key: 'kaomoji-status' })).toBeDefined()
    await clock.advance(2500)
    expect(await ui.find({ key: 'kaomoji-status' })).toBeUndefined()
  }
})

test('shortens names to fit bodyColumns', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => ok('analyst idle w1:p1\nreviewer blocked w1:p2\n'))

  await $.session.start(START)
  await clock.advance(2500)
  const ui = await $.ui.mount({ ...BAND, props: { ...PROPS, bodyColumns: 31 } })
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('A (｡-ω-)zzZ  R (⊙_⊙)? 도와줘요!')
})
