# kaomoji-status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `kaomoji-status` mod in the `geonhos/claude-code-mod` marketplace repo. It draws one row of coloured, dancing kaomoji above the Claude Code prompt, one per harness worker.

**Architecture:** There are two layers. `hooks/faces.ts` is pure logic: parse, cell width, frames, and the row model. `hooks/register.tsx` is thin wiring. A `session.start` hook starts a 2.5 s poll timer that runs `harness status` and writes the `workers` atom. A 250 ms frame timer bumps the `frame` atom and runs only while someone is working or blocked. An `AbovePrompt` `ui.render` hook reads both atoms and draws `Box`/`Text`, and never writes state.

**Tech Stack:** TypeScript/TSX ES modules on the Claude Code function-hooks API (`claude-code`, verified against the 2.1.296 declarations, CLI 2.1.300). Tests use `claude-code/testing` run by `claude plugin test`. Type-checking uses `npx -p typescript@5.6.3 tsc`. Structural checks use `claude plugin validate`. git and `gh` handle the repo.

---

## Deviations from the spec and design notes

Each item below was checked against `types/claude-code.d.ts`, `reference.md`, or a scratch probe run with `claude plugin test` and `validate`.

1. **`$.process.run` rejects** when the command can't start or runs past `timeoutMs`; it doesn't resolve with an error code. The poll wraps the call in `try/catch` and treats a rejection as `workers = []`. The result shape `{ exitCode, stdout, stderr, isStdoutTruncated, isStderrTruncated }` is as the spec assumed. `$.clock.every(ms, fn)` returns a `Timer` with `.cancel()`, as the spec assumed.
2. **The real `harness status` output** prints non-live workers with two fields: `implementer  -`. A sample capture:
   ```
   analyst      working  w5:p2
   implementer  -
   reviewer     -
   ```
   `parseStatus` keeps only lines of exactly three whitespace-separated fields with a word-like name and state. Non-live workers and garbage (`harness: not found`, usage text) are dropped. Live states seen in `~/.local/bin/harness` are `idle`, `working`, `blocked`, `done` and `unknown`. **User decision (2026-10-15): `done` renders exactly like `idle`**: the same frames, dim grey, the same 1 s sway, and it is not active for `isActive`. `unknown` and any other state still take the spec's "other" face, `(・_・) unknown`.
3. **Width is measured in terminal cells, not `.length`.** `(ง •̀_•́)ง` has two zero-width combining accents. `도와줘요` is Hangul at 2 cells per syllable, and `・` is fullwidth. `faces.ts` gains a pure `cellWidth(s)`, which isn't in the spec's unit list.
4. **Layout is sized by each state's widest frame**, not the current frame. The working frames differ in width (7 vs 8 cells), and so do the idle frames (9 vs 8). Sizing by the current frame would make names flicker between full and initial as the faces dance.
5. **There is one frame counter, not per-state timers.** The frame timer ticks every 250 ms, and `faceFor` divides it per state: working uses `frame % 4` (250 ms), blocked uses `⌊frame/2⌋ % 2` (500 ms), and idle uses `⌊frame/4⌋ % 2` (1 s). When all workers are idle the timer is cancelled, so idle faces freeze. That is the spec's "static when all idle".
6. **Colours** are `gray` for dim grey, `yellow`, and `#ff5f87` for pink/red. A hex value was confirmed to pass the terminal surface's tree validation in a probe. The spec's `faceFor` return `{ text, color, bold? }` is kept as is.
7. **Tests:** `claude plugin test` needs `hooks/hooks.json` to name a loadable module, so Task 1 ships a no-op `register.tsx`. Wiring tests must:
   - answer `session.start` with `{ cwd }`, using `($, e)` argument order
   - answer `process.run` with `{ value: ProcessRunResult }` or `{ deny }`
   - give `ui.render` a bottom that returns a real tree
   - find the band by its keyed **Box**, because a `Text` key is not kept
   - avoid `console`, which is not in the lib
8. **Type-checking needs the engine's declarations on disk.** They are laid into `mods/kaomoji-status/.claude-plugin/types/` only by an interactive `claude --plugin-dir` load, so Task 1 copies them from the bundled plugin-authoring skill, and they are gitignored. There is no global `tsc`, so the plan uses `npx -y -p typescript@5.6.3 tsc`.
9. **Repo setup:** the working directory isn't empty and isn't a git repo, so the plan uses `git init -b main` plus `git remote add` rather than `git clone`.
10. **`.claude/` is gitignored**, like `.harness/`. Agents write their memory there on every run, which would otherwise dirty the tree. Remove that line if agent memory should be versioned.
11. **Additions to the spec's manifests:** `plugin.json` gets `author` and `marketplace.json` gets `description`. Without them `claude plugin validate` passes with warnings.
12. **Faces are padded to the widest frame of their state** (added after Task 6 review). Sizing the layout by the widest frame alone left a worker's face narrower on some ticks (working `ᕕ( ᐛ )ᕗ` is 7 cells vs 8, idle `(｡-ω-)zZ` is 8 vs 9), so every entry after it shifted left one cell and the row jittered. `buildRow` pads each face segment with trailing spaces up to `widestFace(state)`. The two-space separator and the width boundaries are unchanged. The padded segments, not the bare frames, are what tests compare; a working worker on frame 1 therefore ends with one trailing pad space in the Task 7 wiring tests.
13. **The first poll runs at `session.start`, and `poll` never rejects** (added after Task 7 review). Waiting 2.5 s for the first poll left the row empty on startup, so `session.start` now calls `poll()` once before arming the 2.5 s timer; the `isPolling` guard still prevents overlap. The state write and the frame-timer reconcile moved inside `poll`'s outer `try`, with a `catch` that swallows a failed write (the next tick retries), and the frame tick's `update` has its own `.catch`, so `void poll()` can't raise an unhandled rejection. Because the first poll lands at t=0, the frame timer starts at t=0 and the wiring tests count frames from there. The `process.run` init is read as `e.init?.timeoutMs`.

## File structure

All paths are relative to the repo root, `/Users/geonho.yeom/workspace/claude-mod`.

```
.gitignore                                   # .harness/, .claude/, mods/*/.claude-plugin/types/, node_modules/, .DS_Store
.claude-plugin/marketplace.json              # marketplace "claude-code-mod", one entry per mod
README.md                                    # mod list, install line, local development
docs/superpowers/...                         # existing specs and plans (kept)
mods/kaomoji-status/
  .claude-plugin/plugin.json                 # manifest: name, version, author, types, userConfig.harnessPath
  .claude-plugin/types/                      # engine declarations (generated/copied, gitignored)
  tsconfig.json                              # tsc -p config for the hooks module
  hooks/hooks.json                           # { "modules": ["./register.tsx"] }
  hooks/faces.ts                             # pure: cellWidth, parseStatus, faceFor, isActive, buildRow
  hooks/faces.test.ts                        # unit tests for faces.ts
  hooks/register.tsx                         # wiring: poll timer, frame timer, AbovePrompt render
  hooks/register.test.tsx                    # wiring tests on the engine test kit (mock clock, mocked process.run)
  types/index.d.ts                           # PluginState contract: kaomoji-status.{workers,frame}
```

Every test command is run from the repo root.

---

### Task 0: Repository setup, marketplace and README skeleton

**Files:**
- Create: `.gitignore`, `.claude-plugin/marketplace.json`, `README.md`

- [ ] **Step 1: Initialise git on `main` and add the remote**

```bash
cd /Users/geonho.yeom/workspace/claude-mod
git init -b main
git remote add origin https://github.com/geonhos/claude-code-mod.git
gh repo view geonhos/claude-code-mod --json isEmpty
```
Expected: `Initialized empty Git repository …`, then `{"isEmpty":true}`.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
.harness/
.claude/
mods/*/.claude-plugin/types/
node_modules/
.DS_Store
```

- [ ] **Step 3: Write `.claude-plugin/marketplace.json`**

```json
{
  "name": "claude-code-mod",
  "description": "Claude Code mods by geonhos: small function-hook plugins for the terminal UI.",
  "owner": { "name": "geonhos" },
  "plugins": [
    {
      "name": "kaomoji-status",
      "source": "./mods/kaomoji-status",
      "description": "Dancing kaomoji above the prompt, one per harness worker."
    }
  ]
}
```

- [ ] **Step 4: Write the `README.md` skeleton** (Task 9 fills in the install details)

````markdown
# claude-code-mod

Mods for [Claude Code](https://claude.com/claude-code): function-hook plugins, one per folder under `mods/`.

## Mods

| mod | what it does |
|-----|--------------|
| [kaomoji-status](mods/kaomoji-status) | One row of dancing kaomoji above the prompt, one per harness worker. |

## Install

```
/plugin install <mod> --marketplace geonhos/claude-code-mod
```
````

- [ ] **Step 5: Check what will be committed**

Run: `git status --short`
Expected: `.claude-plugin/`, `.gitignore`, `README.md` and `docs/` are untracked, and `.harness/` and `.claude/` are **not** listed.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .claude-plugin/marketplace.json README.md docs/
git commit -m "chore: set up claude-code-mod marketplace repo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Plugin scaffold that passes validate, test and tsc

**Files:**
- Create: `mods/kaomoji-status/.claude-plugin/plugin.json`, `mods/kaomoji-status/hooks/hooks.json`, `mods/kaomoji-status/hooks/register.tsx`, `mods/kaomoji-status/types/index.d.ts`, `mods/kaomoji-status/tsconfig.json`

- [ ] **Step 1: Run validate and confirm it fails first**

Run: `claude plugin validate mods/kaomoji-status`
Expected: FAIL (non-zero exit), because the folder and its manifest do not exist yet. For an empty folder, validate prints `No manifest found in directory` and `✘ Validation failed`.

- [ ] **Step 2: Write `mods/kaomoji-status/.claude-plugin/plugin.json`**

```json
{
  "name": "kaomoji-status",
  "version": "0.1.0",
  "description": "Dancing kaomoji above the prompt, one per harness worker: who is working, who is idle, who needs help.",
  "author": { "name": "geonhos" },
  "types": "./types/index.d.ts",
  "userConfig": {
    "harnessPath": {
      "type": "string",
      "title": "harness path",
      "description": "Absolute path to the harness executable. Leave empty to run `harness` from PATH.",
      "default": ""
    }
  }
}
```

- [ ] **Step 3: Write `mods/kaomoji-status/hooks/hooks.json`**

```json
{ "modules": ["./register.tsx"] }
```

- [ ] **Step 4: Write `mods/kaomoji-status/types/index.d.ts`** (the PluginState contract)

```ts
export type KaomojiWorker = { name: string; state: string }

declare module 'claude-code' {
  interface PluginState {
    'kaomoji-status': { workers: KaomojiWorker[]; frame: number }
  }
}
```

- [ ] **Step 5: Write a no-op `mods/kaomoji-status/hooks/register.tsx`** (`claude plugin test` refuses a folder that has no loadable hooks module)

```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

- [ ] **Step 6: Write `mods/kaomoji-status/tsconfig.json`** (the header config from `claude-code.d.ts`)

```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": [".claude-plugin/types", "hooks", "types"]
}
```

- [ ] **Step 7: Lay the engine declarations for tsc** (gitignored; repeat after a Claude Code update)

```bash
SRC=$(ls -d /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | tail -1)
echo "$SRC"
mkdir -p mods/kaomoji-status/.claude-plugin/types/claude-code
cp "$SRC" mods/kaomoji-status/.claude-plugin/types/claude-code/index.d.ts
head -1 mods/kaomoji-status/.claude-plugin/types/claude-code/index.d.ts
```
Expected: a path ending in `plugin-authoring/types/claude-code.d.ts`, and the first line `// Written by Claude Code 2.1.xxx.`. If `SRC` is empty, run `claude --plugin-dir mods/kaomoji-status` once interactively and quit. It writes `.claude-plugin/types/` itself.

- [ ] **Step 8: Run validate, tsc and the (empty) test suite**

```bash
claude plugin validate mods/kaomoji-status
claude plugin validate .
npx -y -p typescript@5.6.3 tsc -p mods/kaomoji-status && echo TSC_OK
```
Expected:
- The first validate prints `types ./types/index.d.ts declares state: kaomoji-status.workers, kaomoji-status.frame`, `./register.tsx hooks: nothing`, and `✔ Validation passed`.
- The second, on the marketplace, prints `✔ Validation passed`.
- tsc prints `TSC_OK`.

- [ ] **Step 9: Commit**

```bash
git add mods/kaomoji-status
git commit -m "feat(kaomoji-status): scaffold plugin manifest, hooks module and state contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `cellWidth`, terminal cell width of a string

**Files:**
- Create: `mods/kaomoji-status/hooks/faces.ts`, `mods/kaomoji-status/hooks/faces.test.ts`

- [ ] **Step 1: Write the failing test.** Create `mods/kaomoji-status/hooks/faces.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { cellWidth } from './faces'

describe('cellWidth', () => {
  test('counts ASCII as one cell each', () => {
    expect(cellWidth('analyst')).toBe(7)
  })
  test('counts halfwidth forms as one cell', () => {
    expect(cellWidth('(｡-ω-)zzZ')).toBe(9)
    expect(cellWidth('└( ･ω･)┐')).toBe(8)
  })
  test('counts combining accents as zero cells', () => {
    expect(cellWidth('(ง •̀_•́)ง')).toBe(8)
  })
  test('counts Hangul and fullwidth forms as two cells', () => {
    expect(cellWidth('도와줘요!')).toBe(9)
    expect(cellWidth('(・_・)')).toBe(7)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL (non-zero exit): `(fail) the file did not load` and `cannot import "./faces" (from hooks/faces.test.ts): no such file`.

- [ ] **Step 3: Minimal implementation.** Create `mods/kaomoji-status/hooks/faces.ts`:

```ts
import type { KaomojiWorker } from '../types'

export type Worker = KaomojiWorker

export type Face = { text: string; color: string; bold?: boolean }

export type Segment = { text: string; color?: string; bold?: boolean }

const ZERO_WIDTH: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
]

const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
]

const inRanges = (code: number, ranges: ReadonlyArray<readonly [number, number]>): boolean =>
  ranges.some(([lo, hi]) => code >= lo && code <= hi)

export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (inRanges(code, ZERO_WIDTH)) continue
    width += inRanges(code, WIDE) ? 2 : 1
  }
  return width
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `4 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mods/kaomoji-status/hooks/faces.ts mods/kaomoji-status/hooks/faces.test.ts
git commit -m "feat(kaomoji-status): measure kaomoji in terminal cells

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `parseStatus`

**Files:**
- Modify: `mods/kaomoji-status/hooks/faces.ts` (append), `mods/kaomoji-status/hooks/faces.test.ts`

- [ ] **Step 1: Write the failing test.** In `faces.test.ts`, replace the line `import { cellWidth } from './faces'` with:

```ts
import { cellWidth, parseStatus } from './faces'
```
and append to the end of the file:

```ts

describe('parseStatus', () => {
  test('parses name, state and pane per line', () => {
    expect(parseStatus('analyst      working  w5:p2\nreviewer     idle     w5:p3\n')).toEqual([
      { name: 'analyst', state: 'working' },
      { name: 'reviewer', state: 'idle' },
    ])
  })
  test('skips blank lines', () => {
    expect(parseStatus('\n\nanalyst idle w1:p1\n   \n')).toEqual([{ name: 'analyst', state: 'idle' }])
  })
  test('keeps an unknown state as given', () => {
    expect(parseStatus('analyst done w1:p1')).toEqual([{ name: 'analyst', state: 'done' }])
  })
  test('drops workers that are not live (name and "-" only)', () => {
    expect(parseStatus('analyst      working  w5:p2\nimplementer  -\nreviewer     -\n')).toEqual([
      { name: 'analyst', state: 'working' },
    ])
  })
  test('drops garbage lines', () => {
    expect(parseStatus('usage:\nharness: not found\n')).toEqual([])
    expect(parseStatus('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL: `(fail) the file did not load` and `Export named 'parseStatus' not found in module '…/hooks/faces.ts'.`

- [ ] **Step 3: Minimal implementation.** Append to `faces.ts`:

```ts

const NAME = /^[\w.-]+$/
const STATE = /^[\w-]+$/

export function parseStatus(stdout: string): Worker[] {
  const workers: Worker[] = []
  for (const line of stdout.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 3) continue
    const [name = '', state = ''] = fields
    if (!NAME.test(name) || !STATE.test(state)) continue
    workers.push({ name, state })
  }
  return workers
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `9 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mods/kaomoji-status/hooks
git commit -m "feat(kaomoji-status): parse harness status into live workers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `faceFor`, frame tables per state

**Files:**
- Modify: `mods/kaomoji-status/hooks/faces.ts` (append), `mods/kaomoji-status/hooks/faces.test.ts`

- [ ] **Step 1: Write the failing test.** Replace the faces import line with:

```ts
import { cellWidth, faceFor, parseStatus } from './faces'
```
and append:

```ts

describe('faceFor', () => {
  test('working cycles four frames, one per tick', () => {
    expect([0, 1, 2, 3, 4].map(frame => faceFor('working', frame).text)).toEqual([
      '(ง •̀_•́)ง',
      'ᕕ( ᐛ )ᕗ',
      '└( ･ω･)┐',
      '┌(･ω･ )┘',
      '(ง •̀_•́)ง',
    ])
    expect(faceFor('working', 0).color).toBe('yellow')
    expect(faceFor('working', 0).bold).toBeUndefined()
  })
  test('blocked alternates every two ticks, pink-red and bold', () => {
    expect([0, 1, 2, 3, 4].map(frame => faceFor('blocked', frame).text)).toEqual([
      '(⊙_⊙)? 도와줘요!',
      '(⊙_⊙)? 도와줘요!',
      '(⊙_⊙)! 도와줘요!',
      '(⊙_⊙)! 도와줘요!',
      '(⊙_⊙)? 도와줘요!',
    ])
    expect(faceFor('blocked', 0)).toEqual({ text: '(⊙_⊙)? 도와줘요!', color: '#ff5f87', bold: true })
  })
  test('idle alternates every four ticks, grey', () => {
    expect([0, 3, 4, 7, 8].map(frame => faceFor('idle', frame).text)).toEqual([
      '(｡-ω-)zzZ',
      '(｡-ω-)zzZ',
      '(｡-ω-)zZ',
      '(｡-ω-)zZ',
      '(｡-ω-)zzZ',
    ])
    expect(faceFor('idle', 0).color).toBe('gray')
  })
  test('done looks exactly like idle on every frame', () => {
    const frames = [0, 1, 3, 4, 5, 7, 8, 13]
    expect(frames.map(frame => faceFor('done', frame))).toEqual(frames.map(frame => faceFor('idle', frame)))
    expect(faceFor('done', 4)).toEqual({ text: '(｡-ω-)zZ', color: 'gray' })
  })
  test('any other state is a static grey face naming the state', () => {
    expect(faceFor('unknown', 0)).toEqual({ text: '(・_・) unknown', color: 'gray' })
    expect(faceFor('unknown', 5)).toEqual({ text: '(・_・) unknown', color: 'gray' })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL: `Export named 'faceFor' not found in module '…/hooks/faces.ts'.`

- [ ] **Step 3: Minimal implementation.** Append to `faces.ts`:

```ts

const IDLE_FRAMES = ['(｡-ω-)zzZ', '(｡-ω-)zZ'] as const
const WORKING_FRAMES = ['(ง •̀_•́)ง', 'ᕕ( ᐛ )ᕗ', '└( ･ω･)┐', '┌(･ω･ )┘'] as const
const BLOCKED_FRAMES = ['(⊙_⊙)? 도와줘요!', '(⊙_⊙)! 도와줘요!'] as const

const GREY = 'gray'
const YELLOW = 'yellow'
const PINK_RED = '#ff5f87'

const isResting = (state: string): boolean => state === 'idle' || state === 'done'

function framesFor(state: string): readonly string[] {
  if (isResting(state)) return IDLE_FRAMES
  if (state === 'working') return WORKING_FRAMES
  if (state === 'blocked') return BLOCKED_FRAMES
  return [`(・_・) ${state}`]
}

export function faceFor(state: string, frame: number): Face {
  const tick = Math.max(0, Math.floor(frame))
  if (state === 'working') {
    return { text: WORKING_FRAMES[tick % 4] ?? WORKING_FRAMES[0], color: YELLOW }
  }
  if (state === 'blocked') {
    return { text: BLOCKED_FRAMES[Math.floor(tick / 2) % 2] ?? BLOCKED_FRAMES[0], color: PINK_RED, bold: true }
  }
  if (isResting(state)) {
    return { text: IDLE_FRAMES[Math.floor(tick / 4) % 2] ?? IDLE_FRAMES[0], color: GREY }
  }
  return { text: `(・_・) ${state}`, color: GREY }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `14 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mods/kaomoji-status/hooks
git commit -m "feat(kaomoji-status): add idle/done, working, blocked and fallback faces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `isActive`

**Files:**
- Modify: `mods/kaomoji-status/hooks/faces.ts` (append), `mods/kaomoji-status/hooks/faces.test.ts`

- [ ] **Step 1: Write the failing test.** Replace the faces import line with:

```ts
import { cellWidth, faceFor, isActive, parseStatus } from './faces'
```
and append:

```ts

describe('isActive', () => {
  test('is false for no workers', () => {
    expect(isActive([])).toBe(false)
  })
  test('is false when every worker is idle, done or another state', () => {
    expect(isActive([{ name: 'a', state: 'idle' }, { name: 'b', state: 'done' }, { name: 'c', state: 'unknown' }])).toBe(false)
  })
  test('is true when some worker is working', () => {
    expect(isActive([{ name: 'a', state: 'idle' }, { name: 'b', state: 'working' }])).toBe(true)
  })
  test('is true when some worker is blocked', () => {
    expect(isActive([{ name: 'a', state: 'blocked' }])).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL: `Export named 'isActive' not found in module '…/hooks/faces.ts'.`

- [ ] **Step 3: Minimal implementation.** Append to `faces.ts`:

```ts

export function isActive(workers: readonly Worker[]): boolean {
  return workers.some(worker => worker.state === 'working' || worker.state === 'blocked')
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `18 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mods/kaomoji-status/hooks
git commit -m "feat(kaomoji-status): detect when any worker is busy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `buildRow`, with width shortening

**Files:**
- Modify: `mods/kaomoji-status/hooks/faces.ts` (append), `mods/kaomoji-status/hooks/faces.test.ts`

- [ ] **Step 1: Write the failing test.** Replace the faces import line with these three lines (the import, the type import and the helper):

```ts
import { buildRow, cellWidth, faceFor, isActive, parseStatus } from './faces'
import type { Segment, Worker } from './faces'

const textOf = (segments: readonly Segment[]): string => segments.map(segment => segment.text).join('')
```
and append:

```ts

describe('buildRow', () => {
  const TEAM: Worker[] = [
    { name: 'analyst', state: 'idle' },
    { name: 'implementer', state: 'working' },
    { name: 'reviewer', state: 'blocked' },
  ]
  // Widest frames: idle 9, working 8, blocked 16 cells.
  // full names: 8+9 + 2 + 12+8 + 2 + 9+16 = 66; initials: 2+9 + 2 + 2+8 + 2 + 2+16 = 43; none: 9+2+8+2+16 = 37

  test('draws full names when the row fits', () => {
    expect(textOf(buildRow(TEAM, 0, 80))).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง  reviewer (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 66))).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง  reviewer (⊙_⊙)? 도와줘요!')
  })
  test('shortens names to their first letter when one column too narrow', () => {
    expect(textOf(buildRow(TEAM, 0, 65))).toBe('A (｡-ω-)zzZ  I (ง •̀_•́)ง  R (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 43))).toBe('A (｡-ω-)zzZ  I (ง •̀_•́)ง  R (⊙_⊙)? 도와줘요!')
  })
  test('drops names when initials still do not fit', () => {
    expect(textOf(buildRow(TEAM, 0, 42))).toBe('(｡-ω-)zzZ  (ง •̀_•́)ง  (⊙_⊙)? 도와줘요!')
    expect(textOf(buildRow(TEAM, 0, 10))).toBe('(｡-ω-)zzZ  (ง •̀_•́)ง  (⊙_⊙)? 도와줘요!')
  })
  test('keeps the same layout on every frame (sized by the widest frame)', () => {
    // "analyst (｡-ω-)zZ" is 16 cells but "analyst (｡-ω-)zzZ" is 17: at 16 columns the name must stay short on every frame.
    const sleeper: Worker[] = [{ name: 'analyst', state: 'idle' }]
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map(frame => textOf(buildRow(sleeper, frame, 16)))
    expect(rows).toEqual([
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zzZ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
      'A (｡-ω-)zZ ',
    ])
  })
  test('colours the faces and leaves names and separators plain', () => {
    expect(buildRow([{ name: 'reviewer', state: 'blocked' }, { name: 'analyst', state: 'idle' }], 0, 80)).toEqual([
      { text: 'reviewer ' },
      { text: '(⊙_⊙)? 도와줘요!', color: '#ff5f87', bold: true },
      { text: '  ' },
      { text: 'analyst ' },
      { text: '(｡-ω-)zzZ', color: 'gray' },
    ])
  })
  test('is empty for no workers', () => {
    expect(buildRow([], 0, 80)).toEqual([])
  })
  test('starts the next worker at the same cell on every frame', () => {
    const team: Worker[] = [
      { name: 'implementer', state: 'working' },
      { name: 'analyst', state: 'idle' },
      { name: 'reviewer', state: 'blocked' },
    ]
    const offsetOf = (segments: readonly Segment[], text: string): number => {
      const index = segments.findIndex(segment => segment.text === text)
      return cellWidth(textOf(segments.slice(0, index)))
    }
    const frames = [0, 1, 2, 3, 4, 5, 6, 7]
    const analyst = frames.map(frame => offsetOf(buildRow(team, frame, 80), 'analyst '))
    const reviewer = frames.map(frame => offsetOf(buildRow(team, frame, 80), 'reviewer '))
    expect(new Set(analyst).size).toBe(1)
    expect(new Set(reviewer).size).toBe(1)
  })
  test('pads every face to the widest frame of its state', () => {
    const widest: Record<string, number> = { working: 8, blocked: 16, idle: 9, done: 9, unknown: 15 }
    for (const state of Object.keys(widest)) {
      for (const frame of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const segments = buildRow([{ name: 'x', state }], frame, 80)
        const face = segments[segments.length - 1]
        expect(cellWidth(face?.text ?? '')).toBe(widest[state])
      }
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL: `Export named 'buildRow' not found in module '…/hooks/faces.ts'.`

- [ ] **Step 3: Minimal implementation.** Append to `faces.ts`:

```ts

type Labels = 'full' | 'initial' | 'none'

function labelFor(name: string, labels: Labels): string {
  if (labels === 'full') return name
  if (labels === 'initial') return name.slice(0, 1).toUpperCase()
  return ''
}

function widestFace(state: string): number {
  return Math.max(...framesFor(state).map(cellWidth))
}

function rowWidth(workers: readonly Worker[], labels: Labels): number {
  let width = 0
  workers.forEach((worker, index) => {
    if (index > 0) width += 2
    const label = labelFor(worker.name, labels)
    if (label !== '') width += cellWidth(label) + 1
    width += widestFace(worker.state)
  })
  return width
}

export function buildRow(workers: readonly Worker[], frame: number, columns: number): Segment[] {
  const labels: Labels =
    rowWidth(workers, 'full') <= columns ? 'full' : rowWidth(workers, 'initial') <= columns ? 'initial' : 'none'
  const segments: Segment[] = []
  workers.forEach((worker, index) => {
    if (index > 0) segments.push({ text: '  ' })
    const label = labelFor(worker.name, labels)
    if (label !== '') segments.push({ text: `${label} ` })
    const face = faceFor(worker.state, frame)
    const text = face.text + ' '.repeat(Math.max(0, widestFace(worker.state) - cellWidth(face.text)))
    segments.push(face.bold === true ? { text, color: face.color, bold: true } : { text, color: face.color })
  })
  return segments
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `26 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add mods/kaomoji-status/hooks
git commit -m "feat(kaomoji-status): build the face row and shorten names to fit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wiring in `register.tsx` (poll timer, frame timer, render hook, harnessPath)

**Files:**
- Create: `mods/kaomoji-status/hooks/register.test.tsx`
- Modify: `mods/kaomoji-status/hooks/register.tsx` (replace the no-op)

- [ ] **Step 1: Write the failing wiring tests.** Create `mods/kaomoji-status/hooks/register.test.tsx`:

```tsx
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
  expect(calls).toEqual([['harness', 'status']])
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst (｡-ω-)zzZ  implementer (ง •̀_•́)ง')

  await clock.advance(250)
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst (｡-ω-)zzZ  implementer ᕕ( ᐛ )ᕗ ')

  await clock.advance(2250)
  expect(calls).toEqual([['harness', 'status'], ['harness', 'status']])
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
  expect(calls).toEqual([['/opt/bin/harness', 'status']])
  await clock.advance(2500)
  expect(calls).toEqual([['/opt/bin/harness', 'status'], ['/opt/bin/harness', 'status']])
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
  expect(runs).toBe(1)
  await clock.advance(2500)
  expect(runs).toBe(1)
  await clock.advance(2500)
  expect(runs).toBe(2)
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
  // the first answer is consumed by the poll at session.start
  expect(await ui.find({ key: 'kaomoji-status' })).toBeDefined()
  for (let round = 0; round < 3; round += 1) {
    await clock.advance(2500)
    expect(await ui.find({ key: 'kaomoji-status' })).toBeUndefined()
    if (round < 2) {
      await clock.advance(2500)
      expect(await ui.find({ key: 'kaomoji-status' })).toBeDefined()
    }
  }
})

test('shortens names to fit bodyColumns', async ($, on) => {
  mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => ok('analyst idle w1:p1\nreviewer blocked w1:p2\n'))

  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, props: { ...PROPS, bodyColumns: 31 } })
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('A (｡-ω-)zzZ  R (⊙_⊙)? 도와줘요!')
})

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

test('polls once right at session.start, no clock advance needed', async ($, on) => {
  mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async () => ok('analyst working w1:p1\n'))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start(START)
  await flush()
  const ui = await $.ui.mount({ ...BAND, props: PROPS })
  expect((await ui.find({ key: 'kaomoji-status' }))?.text).toBe('analyst (ง •̀_•́)ง')
})

test('runs harness status with a 2000 ms timeout', async ($, on) => {
  mock.clock(on)
  const timeouts: Array<number | undefined> = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async (_$, e) => {
    timeouts.push(e.init?.timeoutMs)
    return ok('')
  })

  await $.session.start(START)
  await flush()
  expect(timeouts).toEqual([2000])
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test mods/kaomoji-status`
Expected: FAIL. Eight tests fail, `27 pass` and `8 fail`:
- `polls harness status every 2.5 s …`
- `runs harnessPath when it is set`
- `skips a poll while the previous run is in flight`
- `stops the frame timer when every worker is idle`
- `hides the row when harness fails …`
- `shortens names to fit bodyColumns`
- `polls once right at session.start, no clock advance needed`
- `runs harness status with a 2000 ms timeout`

The survey test passes already, because the no-op module always yields.

- [ ] **Step 3: Implement the wiring.** Replace `mods/kaomoji-status/hooks/register.tsx` with:

```tsx
import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { KaomojiWorker } from '../types'
import { buildRow, isActive, parseStatus } from './faces'

const POLL_MS = 2500
const FRAME_MS = 250
const RUN_TIMEOUT_MS = 2000

const workers = atom({ plugin: 'kaomoji-status', key: 'workers' } as const, [] as KaomojiWorker[])
const frame = atom({ plugin: 'kaomoji-status', key: 'frame' } as const, 0)

export const register: Register = (on, options) => {
  const configured = typeof options.harnessPath === 'string' ? options.harnessPath.trim() : ''
  const harness = configured === '' ? 'harness' : configured
  let isPolling = false
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    const poll = async (): Promise<void> => {
      if (isPolling) return
      isPolling = true
      try {
        let list: KaomojiWorker[] = []
        try {
          const ran = await $.process.run([harness, 'status'], { timeoutMs: RUN_TIMEOUT_MS })
          list = ran.exitCode === 0 ? parseStatus(ran.stdout) : []
        } catch {
          list = []
        }
        await update($, workers, () => list)
        if (isActive(list)) {
          ticker ??= $.clock.every(FRAME_MS, () => {
            void update($, frame, n => n + 1).catch(() => {})
          })
        } else {
          ticker?.cancel()
          ticker = undefined
        }
      } catch {
        // poll never rejects: a failed state write just waits for the next tick
      } finally {
        isPolling = false
      }
    }

    void poll()
    $.clock.every(POLL_MS, () => {
      void poll()
    })

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, workers)
    if (list.length === 0) return next(e)
    const segments = buildRow(list, await read($, frame), e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="kaomoji-status">
        <Text wrap="truncate-end">
          {segments.map(segment =>
            segment.color === undefined ? (
              segment.text
            ) : (
              <Text color={segment.color} bold={segment.bold === true}>
                {segment.text}
              </Text>
            ),
          )}
        </Text>
      </Box>
    )
  })
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `claude plugin test mods/kaomoji-status`
Expected: PASS: `35 pass`, `0 fail`.

- [ ] **Step 5: Confirm that validate sees the wiring**

Run: `claude plugin validate mods/kaomoji-status`
Expected:
```
❯ ./register.tsx hooks: session.start, ui.render{component=AbovePrompt}
❯ ./register.tsx calls: $.clock.every, $.process.run, $.state.get, $.state.set, $.ui.resolve
❯ ./register.tsx state writes: kaomoji-status.frame, kaomoji-status.workers
❯ ./register.tsx state reads: kaomoji-status.frame, kaomoji-status.workers
✔ Validation passed
```

- [ ] **Step 6: Commit**

```bash
git add mods/kaomoji-status/hooks
git commit -m "feat(kaomoji-status): poll harness and draw dancing faces above the prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run every automated check**

```bash
claude plugin test mods/kaomoji-status
npx -y -p typescript@5.6.3 tsc -p mods/kaomoji-status && echo TSC_OK
claude plugin validate mods/kaomoji-status
claude plugin validate .
```
Expected:
- tests: `35 pass`, `0 fail`
- tsc: `TSC_OK`
- both validates: `✔ Validation passed`, with no warnings

- [ ] **Step 2: Mutation spot-checks** (prove the wiring tests have teeth; revert after each)
  - Comment out `ticker?.cancel()` in `register.tsx`. `(fail) stops the frame timer when every worker is idle` should appear.
  - Comment out `if (isPolling) return`. `(fail) skips a poll while the previous run is in flight` should appear.
  - Delete `if (e.props.hasSurvey) return next(e)`. `(fail) yields to the engine while a survey holds the band` should appear.
  - Then run `git diff --exit-code mods/` to confirm everything was reverted. Expected exit code: 0.

- [ ] **Step 3: Confirm a clean tree.** No commit is needed if nothing changed.

Run: `git status --short`
Expected: no output.

---

### Task 9: Manual verification and README install docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the manual checklist** in a real terminal with herdr and harness running. Tick each item:
  - [ ] `claude --plugin-dir mods/kaomoji-status` starts with no `kaomoji-status:` error line, and with every worker non-live the band stays empty.
  - [ ] Run `harness spawn analyst`. Within about 2.5 s the band shows `analyst (｡-ω-)zzZ` in grey.
  - [ ] Run `harness ask analyst '<a task>'`. The face dances in yellow, cycling through 4 frames at about 4 fps.
  - [ ] Make a worker block on a prompt. It shows `(⊙_⊙)? 도와줘요!` / `(⊙_⊙)! 도와줘요!` in pink-red bold, toggling every 0.5 s.
  - [ ] Narrow the terminal. Names first become initials (`A (｡-ω-)zzZ`), then disappear. They don't flicker between forms while the faces dance.
  - [ ] Watch CPU while dancing in Activity Monitor or `top -pid $(pgrep -n claude)`. The claude process stays low, with no sustained spike.
  - [ ] Once every worker is idle, the faces stop changing within one poll (the frame timer is cancelled).
  - [ ] Quit herdr, or temporarily move `harness` off PATH. The band hides and no error is shown. Set `/config` → kaomoji-status → harness path to the absolute path (`~/.local/bin/harness`, expanded). Restart Claude Code. The band comes back.
  - [ ] Save `hooks/faces.ts` with no change to trigger a hot reload. Check whether the row keeps updating, and note the result in the report. A reload drops timers and `session.start` may not fire again. This is an open question, not a blocker.
  - [ ] Open a survey or feedback prompt if one appears. The band yields to it.

- [ ] **Step 2: Fill in the README install section.** Replace everything from `## Install` to the end of `README.md` with:

````markdown
## Install

Type at the prompt of a terminal Claude Code session:

```
/plugin install kaomoji-status --marketplace geonhos/claude-code-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

### kaomoji-status

Shows each `harness` (herdr) worker as a kaomoji in one row above the prompt:

```
analyst (｡-ω-)zzZ  implementer ᕕ( ᐛ )ᕗ  reviewer (⊙_⊙)? 도와줘요!
```

- idle: grey, slowly snoring; working: yellow, dancing; blocked: pink-red, asking for help.
- Polls `harness status` every 2.5 s. If `harness` is not on Claude Code's PATH, set the absolute path in
  `/config` → kaomoji-status → **harness path**, then restart Claude Code (a config change reloads the mod, and its poll timer starts only at session start).
- The row hides itself when harness is missing or no worker is live.

## Local development

```bash
claude --plugin-dir mods/kaomoji-status        # hot-reloads on save
claude plugin test mods/kaomoji-status         # unit + wiring tests
claude plugin validate mods/kaomoji-status     # manifest, hooks, state contract
npx -y -p typescript@5.6.3 tsc -p mods/kaomoji-status
```

`tsc` needs the engine declarations in `mods/<mod>/.claude-plugin/types/` (gitignored). An interactive
`claude --plugin-dir mods/<mod>` session writes them. You can also copy `plugin-authoring/types/claude-code.d.ts` from the
bundled skills folder to `mods/<mod>/.claude-plugin/types/claude-code/index.d.ts`.

Add a new mod as `mods/<name>/` and give it one entry in `.claude-plugin/marketplace.json`.
````

- [ ] **Step 3: Validate and commit**

```bash
claude plugin validate .
git add README.md
git commit -m "docs: document kaomoji-status install and local development

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push.** Do this only once the conductor or user has approved publishing.

```bash
git push -u origin main
gh repo view geonhos/claude-code-mod --json defaultBranchRef
```
Expected: `{"defaultBranchRef":{"name":"main"}}`.

---

## Spec coverage

| spec section | covered by |
|---|---|
| Repo layout (marketplace, README, mods/kaomoji-status/…) | Tasks 0, 1, 9 |
| Faces table: frames, colours, periods, `<name> <face>`, two-space separators | Tasks 4, 6 (frame math in design note 5) |
| Data flow 1: `session.start` poll, `$.clock.every(2500)`, `harness status`, `timeoutMs: 2000`, in-flight skip | Task 7 (tests: polls…, skips a poll…) |
| Data flow 2: parse `<name> <state> <pane>` into the `workers` atom | Tasks 3, 7 |
| Data flow 3: 250 ms frame timer only while working or blocked, cancelled when all idle, restarted on activity | Tasks 5, 7 (test: stops the frame timer…) |
| Data flow 4: `AbovePrompt` render reads atoms, `Box`/`Text` from `$.ui.resolve(e)`, never writes | Task 7 (validate shows reads in render; writes only in timers) |
| Yield on `hasSurvey`, on no workers, or when harness failed | Task 7 (tests: yields…, hides the row…) |
| Width: initials, then no names, against `bodyColumns` | Tasks 2, 6, 7 (test: shortens names…) |
| Failures hidden; `userConfig.harnessPath` | Tasks 1, 7 (tests: hides…, runs harnessPath…), Task 9 manual |
| Units: `faces.ts` pure; `register.tsx` wiring only | Tasks 2–7 |
| Testing: plugin test, validate, tsc, manual CPU and timer stop | Tasks 8, 9 |
| Out of scope (elapsed time, task name, toast, status line, sound) | not implemented |
