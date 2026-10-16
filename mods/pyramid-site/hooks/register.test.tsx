import type { Args, On, RenderPropsOf, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { decodeCells } from './cells'
import { PALETTE } from './sprites'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Pyramid Site',
  isFocused: false,
  bodyColumns: 72,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}
const MOUNT = { plugin: 'pyramid-site', surface: 'terminal', component: 'Pane', requestId: 'pyramid' } as const
const REPORT = '# analyst report — x\nstatus: done\n## Findings / Decisions\n- ok\n'

const bash = (command: string): Args<'tool.call'> => ({ tool: 'Bash', tool_use_id: 'toolu_1', command }) as unknown as Args<'tool.call'>
const printed = (stdout: string): ToolCallResult => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })
const exited = (code: number): ToolCallResult => ({ isError: true, result: `Exit code ${code}\nharness: x`, text: `Exit code ${code}\nharness: x` })
const command = (args: string): Args<'command.run'> => ({
  command: 'pyramid', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 },
})

type Rig = {
  clock: ReturnType<typeof mock.clock>
  blits: string[]
  opened: string[]
  registered: string[]
  polls: string[][]
  answers: ToolCallResult[]
  store: Map<string, unknown>
  setStatus: (stdout: string) => void
  denyBlits: () => void
}

type RigOptions = { env?: Record<string, string>; store?: Record<string, unknown>; now?: number }

function rig(on: On, { env = {}, store = {}, now = 0 }: RigOptions = {}): Rig {
  const clock = mock.clock(on, { now })
  mock.env(on, env)
  const saved = new Map<string, unknown>(Object.entries(store))
  on('store.get', async (_$, e) => ({ value: saved.get(e.key) }))
  on('store.set', async (_$, e) => {
    saved.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  const blits: string[] = []
  const opened: string[] = []
  const registered: string[] = []
  const polls: string[][] = []
  const answers: ToolCallResult[] = []
  let status = ''
  let isBlitDenied = false
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async (_$, e) => {
    polls.push([...e.argv])
    return { value: { exitCode: 0, stdout: status, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', async (_$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.blit', async (_$, e) => {
    if (isBlitDenied) return { value: { deny: 'not mounted' } }
    if ('cells' in e) blits.push(e.cells)
    return { value: {} }
  })
  on('tool.call', async () => answers.shift() ?? printed(''))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  return {
    clock, blits, opened, registered, polls, answers, store: saved,
    setStatus: stdout => { status = stdout },
    denyBlits: () => { isBlitDenied = true },
  }
}

const statusText = async (ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }): Promise<string> =>
  (await ui.find({ key: 'pyramid-site' }))?.text ?? ''

test('a worker session draws nothing and polls nothing', async ($, on) => {
  const r = rig(on, { env: { HARNESS_ROLE: 'worker' } })
  await $.session.start(START)
  await r.clock.advance(5000)
  expect(r.polls).toEqual([])
  expect(r.registered).toEqual([])
})

test('session start reopens the pane the person left open', async ($, on) => {
  const r = rig(on, { store: { progress: { v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: true } } })
  await $.session.start(START)
  expect(r.opened).toEqual(['pyramid'])
})

test('polls harness status at start and every 2.5 s', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await r.clock.advance(0)
  expect(r.polls).toEqual([['harness', 'status']])
  await r.clock.advance(2500)
  expect(r.polls).toHaveLength(2)
})

test('harnessPath is the command the poll runs', { options: { harnessPath: '/opt/bin/harness' } }, async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await r.clock.advance(0)
  expect(r.polls[0]).toEqual(['/opt/bin/harness', 'status'])
})

test('the pane is a 72×18 Raster with a status row', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  expect(r.registered).toEqual(['pyramid'])
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(72)
  expect(raster?.props.rows).toBe(18)
  expect(decodeCells(String(raster?.props.cells))).toHaveLength(72 * 18 * 3)
  expect(await statusText(ui)).toContain('🧱 0/28 Pyramid · 완공 0')
})

test('a narrow, short pane crops the scene', async ($, on) => {
  rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: { ...PANE_PROPS, bodyColumns: 40, scroll: { offset: 0, bodyRows: 10 } } })
  const raster = await ui.find({ type: 'Raster' })
  expect([raster?.props.columns, raster?.props.rows]).toEqual([40, 9])
})

test('other surfaces get the status row alone', async ($, on) => {
  rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await statusText(ui)).toContain('👑 boss')
})

test('the frame loop idles at 2 fps and only blits changes', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  await r.clock.advance(5000)
  expect(r.blits.length).toBeGreaterThan(0)
  expect(r.blits.length).toBeLessThanOrEqual(10)
  expect(new Set(r.blits).size).toBe(r.blits.length)
})

test('a denied blit stops the loop', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.denyBlits()
  await r.clock.advance(1000)
  const count = r.blits.length
  await r.clock.advance(5000)
  expect(r.blits.length).toBe(count)
})

test('the status poll reconciles worker states', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.setStatus('analyst      working  w1:p1\nimplementer  idle     w1:p2\nreviewer     blocked  w1:p3\n')
  await r.clock.advance(2500)
  expect(await statusText(ui)).toContain('■ analyst working')
  expect(await statusText(ui)).toContain('■ reviewer ? blocked')
  expect(r.polls[0]).toEqual(['harness', 'status'])
})
