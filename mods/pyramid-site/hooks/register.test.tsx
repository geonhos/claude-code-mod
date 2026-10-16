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
  files: Map<string, string>
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
  const files = new Map<string, string>()
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
  on('fs.read', async (_$, e) => {
    // the engine resolves the relative path against the session cwd before the hook sees it
    const key = [...files.keys()].find(name => e.path === name || e.path.endsWith(`/${name}`))
    return key === undefined ? { deny: 'ENOENT' } : { value: files.get(key)! }
  })
  on('tool.call', async () => answers.shift() ?? printed(''))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  return {
    clock, blits, opened, registered, polls, answers, files, store: saved,
    setStatus: stdout => { status = stdout },
    denyBlits: () => { isBlitDenied = true },
  }
}

const ANALYST_FILE = '.harness/reports/analyst.md'
const REVIEWER_FILE = '.harness/reports/reviewer.md'
const IMPLEMENTER_FILE = '.harness/reports/implementer.md'

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

test('polls harness status at start and every 2.5 s while the pane is wanted', async ($, on) => {
  const r = rig(on, { store: { progress: { v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: true } } })
  await $.session.start(START)
  await r.clock.advance(0)
  expect(r.polls).toEqual([['harness', 'status']])
  await r.clock.advance(2500)
  expect(r.polls).toHaveLength(2)
})

test('harnessPath is the command the poll runs', { options: { harnessPath: '/opt/bin/harness' } }, async ($, on) => {
  const r = rig(on, { store: { progress: { v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: true } } })
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
  expect(await statusText(ui)).toContain('🧱 0/28 Pyramid | 완공 0')
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
  expect(await statusText(ui)).toContain('analyst working')
  expect(await statusText(ui)).toContain('reviewer ? blocked')
  expect(r.polls[0]).toEqual(['harness', 'status'])
})

test('harness ask sets the worker working, its report lays a brick', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.files.set(ANALYST_FILE, REPORT)
  r.answers.push(printed('screen text'))
  await $.tool.call(bash("harness ask analyst 'Read .harness/task-analyst.md and do it.'"))
  expect(await statusText(ui)).toContain('analyst idle')
  expect(await statusText(ui)).toContain('🧱 1/28 Pyramid')
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('exit 2 shows the worker blocked, exit 4 waiting', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.answers.push(exited(2), exited(4))
  await $.tool.call(bash('harness ask reviewer go'))
  expect(await statusText(ui)).toContain('reviewer ? blocked')
  await $.tool.call(bash('harness ask implementer go'))
  expect(await statusText(ui)).toContain('implementer waiting')
})

test('reviewer findings crack bricks and the implementer repairs them', async ($, on) => {
  const r = rig(on, { store: { progress: { v: 1, wonderIndex: 0, bricks: 5, cracked: [], completed: [], seenReports: [], paneWanted: false } } })
  await $.session.start(START)
  r.files.set(REVIEWER_FILE, '# reviewer report\nstatus: done\n## Findings / Decisions\n- [Major] a\n- [Minor] b\n## Verification\n')
  await $.tool.call(bash('harness report reviewer'))
  expect(r.store.get('progress')).toMatchObject({ bricks: 6, cracked: [3, 4] })
  r.files.set(IMPLEMENTER_FILE, '# implementer report\nstatus: done\n')
  await $.tool.call(bash("harness ask implementer 'fix'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 7, cracked: [] })
})

test('other Bash commands pass through untouched', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.answers.push(printed('hello'))
  const result = await $.tool.call(bash('echo hello'))
  expect(result.text).toBe('hello')
  expect(r.store.get('progress')).toBeUndefined()
})

test('a prompt sends the caravan across the scene', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } } as Args<'prompt.submit'>)
  await r.clock.advance(83 * 12)
  const camel = new Set([PALETTE.A!, PALETTE.a!])
  const sawCamel = r.blits.some(cells => decodeCells(cells).some((word, i) => i % 3 !== 0 && camel.has(word)))
  expect(sawCamel).toBe(true)
})

test('/pyramid toggles the pane and remembers it', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  expect((await $.command.run(command(''))).text).toBe('Pyramid site opened.')
  expect(r.opened).toEqual(['pyramid'])
  expect(r.store.get('progress')).toMatchObject({ paneWanted: true })
  expect((await $.command.run(command(''))).text).toBe('Pyramid site closed.')
  expect(r.store.get('progress')).toMatchObject({ paneWanted: false })
})

test('/pyramid gallery lists finished wonders', async ($, on) => {
  rig(on, {
    store: {
      progress: {
        v: 1, wonderIndex: 1, bricks: 3, cracked: [], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }], seenReports: [], paneWanted: false,
      },
    },
  })
  await $.session.start(START)
  expect((await $.command.run(command('gallery'))).text).toBe('🧱 3/22 Obelisk\nCompleted wonders:\n- Pyramid — 2026-10-16')
})

test('a day on site: reports finish the pyramid and the gallery records it', async ($, on) => {
  const r = rig(on, {
    now: new Date(2026, 9, 16, 15, 0, 0).getTime(),
    store: { progress: { v: 1, wonderIndex: 0, bricks: 25, cracked: [], completed: [], seenReports: [], paneWanted: false } },
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })

  r.files.set(ANALYST_FILE, '# analyst report — a\nstatus: done\n')
  await $.tool.call(bash("harness ask analyst 'look'"))
  r.files.set(REVIEWER_FILE, '# reviewer report — b\nstatus: done\n## Findings / Decisions\n- [Minor] x.ts:1 — nit\n## Verification\n')
  await $.tool.call(bash("harness ask reviewer 'review'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 27, cracked: [25] })

  r.files.set(IMPLEMENTER_FILE, '# implementer report — c\nstatus: done\n')
  await $.tool.call(bash("harness ask implementer 'fix'"))
  expect(r.store.get('progress')).toMatchObject({ wonderIndex: 1, bricks: 0, cracked: [], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }] })
  expect(await statusText(ui)).toContain('🧱 0/22 Obelisk | 완공 1')

  await $.tool.call(bash('harness report implementer'))
  expect(r.store.get('progress')).toMatchObject({ bricks: 0 })

  await r.clock.advance(83 * 40)
  expect((await $.command.run(command('gallery'))).text).toBe('🧱 0/22 Obelisk\nCompleted wonders:\n- Pyramid — 2026-10-16')
})

test('a reload without session.start still sets the site up', async ($, on) => {
  const r = rig(on)
  expect((await $.command.run(command(''))).text).toBe('Pyramid site opened.')
  expect(r.registered).toEqual(['pyramid'])
  r.files.set(ANALYST_FILE, REPORT)
  await $.tool.call(bash("harness ask analyst 'go'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('a piped ask never lays a brick from screen text', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.answers.push(printed('╭ screen of the pane ╮'), printed('╭ screen again ╮'), exited(2))
  await $.tool.call(bash("harness ask reviewer 'x' 2>&1 | tail -n 40"))
  await $.tool.call(bash("harness ask reviewer 'x' || true"))
  expect(r.store.get('progress')).toBeUndefined()
  await $.tool.call(bash("harness ask reviewer 'x' | cat"))
  expect(await statusText(ui)).toContain('reviewer working')
})

test('a piped ask lays a brick once the report file is there', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.files.set(REVIEWER_FILE, '# reviewer report\nstatus: done\n## Findings / Decisions\n- no findings\n')
  r.answers.push(printed('truncated tail'))
  await $.tool.call(bash("harness ask reviewer 'x' | tail -n 5"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('a quoted mention of harness is not a call', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.files.set(REVIEWER_FILE, REPORT)
  r.answers.push(printed('[main abc] harness ask reviewer'))
  await $.tool.call(bash('git commit -m "harness ask reviewer"'))
  expect(await statusText(ui)).toContain('reviewer idle')
  expect(r.store.get('progress')).toBeUndefined()
})

test('a path-prefixed harness call counts', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.files.set(ANALYST_FILE, REPORT)
  await $.tool.call(bash("/opt/bin/harness ask analyst 'go'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('harness report replaying the same file lays no second brick', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.files.set(ANALYST_FILE, REPORT)
  await $.tool.call(bash("harness ask analyst 'go'"))
  await $.tool.call(bash('harness report analyst'))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('a harness call made by a subagent does not drive the scene', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.files.set(ANALYST_FILE, REPORT)
  await $.tool.call({ ...bash("harness ask analyst 'go'"), agentId: 'sub-1' } as Args<'tool.call'>)
  expect(r.store.get('progress')).toBeUndefined()
  expect(await statusText(ui)).toContain('analyst idle')
})

test('nothing polls while the pane is closed and not wanted', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await r.clock.advance(20000)
  expect(r.polls).toEqual([])
})

test('/pyramid starts the poll and closing it stops the poll', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await $.command.run(command(''))
  await r.clock.advance(5000)
  const whileOpen = r.polls.length
  expect(whileOpen).toBeGreaterThanOrEqual(2)
  await $.command.run(command(''))
  await r.clock.advance(10000)
  expect(r.polls.length).toBe(whileOpen)
})

test('a hook arriving during the boot waits for it instead of being overwritten', async ($, on) => {
  const r = rig(on)
  r.files.set(ANALYST_FILE, REPORT)
  await Promise.all([$.command.run(command('')), $.tool.call(bash("harness ask analyst 'go'"))])
  expect((await $.command.run(command('gallery'))).text).toContain('🧱 1/28 Pyramid')
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('a whole ask that exits 0 without a report file falls back to its stdout', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.answers.push(printed(REPORT))
  await $.tool.call(bash("harness ask analyst 'go'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('an env-prefixed, timeout-wrapped call counts; a backgrounded one is not whole', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  r.files.set(ANALYST_FILE, REPORT)
  await $.tool.call(bash("FOO=1 timeout 700 harness ask analyst 'go'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.answers.push(exited(2))
  await $.tool.call(bash("harness ask reviewer 'go' &"))
  expect(await statusText(ui)).toContain('reviewer working')
})

test('the non-terminal pane polls too', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  await $.ui.mount({ ...MOUNT, surface: 'desktop', props: PANE_PROPS })
  await r.clock.advance(2500)
  expect(r.polls.length).toBeGreaterThanOrEqual(2)
})

test('ui.render never runs the setup itself, it schedules it', async ($, on) => {
  const r = rig(on)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  expect(r.registered).toEqual([])
  expect(await statusText(ui)).toBe('')
  await r.clock.advance(0)
  expect(r.registered).toEqual(['pyramid'])
  expect(await statusText(ui)).toContain('👑 boss')
})
