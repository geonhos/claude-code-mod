# pyramid-site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `mods/pyramid-site`, a Claude Code mod that turns the harness conductor/worker loop into an animated half-block pixel-art construction site (overseer, three workers, a growing wonder, a camel caravan) in a side pane.

**Architecture:**
- Pure modules (sprites → cells → scene → reports/status/events → world → sim → store/gallery) hold all the logic and are unit-tested without the engine.
- `hooks/register.tsx` only wires engine events to them:
  - the `harness status` poll and `tool.call` (Bash) / `prompt.submit` produce domain events;
  - the `world` reducer turns events into a persisted `$.state` atom plus animation cues;
  - a 12 fps / 2 fps `$.clock.every` loop steps the `sim` reducer, draws a 72×36 pixel buffer and pushes it into one 72×18 `Raster` with `$.ui.blit`.

**Tech Stack:**
- TypeScript (ES modules, JSX with `h`) on the Claude Code 2.1.301 function-hook API (`claude-code` types).
- Tests run under `claude plugin test` with the `claude-code/testing` kit.
- Type checking uses `tsc` 5.6.3 through `npx`.

**Spec:** `docs/superpowers/specs/2026-10-16-pyramid-site-design.md`. Visual reference: `.harness/pyramid-preview.html`. API facts with d.ts line numbers: `.harness/analyst-pyramid-feasibility.md`.

---

## Ground rules for every task

- Run all commands from the repo root `claude-mod/`.
- Test command: `claude plugin test mods/pyramid-site`. It runs every `hooks/*.test.ts(x)` file and ends with `N pass` / `0 fail`. The pass counts in this plan are cumulative.
- Type check: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`. It prints nothing on success.
- Validate: `claude plugin validate mods/pyramid-site`. It ends with `✔ Validation passed`.
- Test-kit facts that this plan relies on (all verified by running this exact code against CLI 2.1.301):
  - A test's own `on(...)` hooks sit **beneath** the plugin and answer for the engine.
  - A `$` call such as `process.run`, `ui.open` or `ui.blit` is answered with `{ value: ... }` or `{ deny }`.
  - A plain event such as `tool.call` or `prompt.submit` is answered with its result shape.
  - `mock.clock(on, { now })` drives `$.clock`.
  - The test's own `$` has **no `store` noun**, so the integration rig answers `store.get` / `store.set` itself from a `Map`.
- `claude plugin validate` rejects passing `$` to your own functions (`engine = $`, `helper($)`). Only `read($, …)` and `update($, …)` from `'claude-code'` may take it. Everything that needs `$` therefore lives in closures inside the `session.start` hook, and the other hooks reach them through a module-level `site` object.
- Do not edit `mods/kaomoji-status`. Do not push.

## Decisions this plan makes where the spec is open or had to change

1. **Status row:**
   - It has no elapsed `mm:ss` and no `채찍질!`. A `Text` row redraws only when `$.state` changes; the animation lives outside state.
   - The row is `👑 boss  ■ analyst working  ■ implementer idle  ■ reviewer ? blocked  🧱 9/28 Pyramid · 완공 1`.
2. **Wonder layouts:**
   - Pyramid: 7 layers, 28 bricks, x 42–69.
   - Obelisk: a 3-brick base, 9 layers of 2, and a 1-brick cap; 22 bricks, x 50–61, top y 8.
   - Sphinx: 28 bricks. Body 2×7, a front paw, a 3-brick haunch, a 2×4 head and a 2-brick nemes.
   - Great Pyramid: 9 layers, 45 bricks, x 36–71.
   - Walk targets (left foot − 8) are 34 / 42 / 32 / 28.
3. **Where types live:**
   - The `Anim` frame-state type lives in `scene.ts`, because scene is built before sim; `sim.ts` imports it.
   - `Cue` lives in `world.ts`.
   - `statusSegments` (the status row text) lives in `gallery.ts` beside `formatGallery`: one module for the text the mod shows.
4. **Reviewer report:** it cracks existing bricks first, then lays its own brick. Its own brick is never cracked by the same report.
5. **Status-poll reconciliation:**
   - `-` (not live) and `idle`/`done` mean idle. `unknown` is ignored.
   - `working` never overrides `waiting`.
   - `idle` is ignored for 5 s after an `ask`, so the race with herdr picking up the prompt does not make the worker sit down.
6. **Bash results the spec left open:**
   - A denied `ask` → idle.
   - An auto-backgrounded Bash call (`backgroundTaskId`) → no change.
   - `ask` exiting 1 or any other code → idle.
   - `report` failing with a code other than 3 → no change.
   - An exit-0 call with empty stdout → idle.
7. **Space mode** follows the preview: each cell is a space whose background is the **lower** pixel of its 2×2 block (fg = terminal default).
8. **A blocked worker alone does not keep the 12 fps loop.** Its `?` blinks on the 2 fps idle tick.
9. **`/pyramid`:**
   - It toggles on `progress.paneWanted`, not `$.ui.panes()`.
   - Any other argument prints `Usage: /pyramid [gallery]`.
   - Worker sessions never register the command.
10. **Caravan:** the camel stops at x = 11. The scroll is shown at (3, 13) above the overseer for 12 ticks (1 s).
11. **Completion date:** local time of the mod runtime, formatted `YYYY-MM-DD`.
12. **Base64:** the encoder is hand-written in `cells.ts`. `Uint8Array.prototype.toBase64` is not in the `es2023` lib types.
13. **Hot reload:** a hot reload or a `/config` change does not re-run `session.start`, so the loop and poll stop until restart. This is the same limit kaomoji-status has; the README says so.

## File structure

```
mods/pyramid-site/
  .claude-plugin/plugin.json    manifest: name, version, types, userConfig.harnessPath, userConfig.pixelMode
  .claude-plugin/types/         engine declarations for tsc (gitignored by mods/*/.claude-plugin/types/)
  hooks/hooks.json              { "modules": ["./register.tsx"] }
  hooks/register.tsx            wiring only: role gate, store load, poll, frame loop, Bash/prompt/command/close/render hooks
  hooks/sprites.ts              data: scene size, palette, sprites, worker homes/colours, wonder slot layouts, walkTarget
  hooks/cells.ts                pixels → Raster cells (half/space), crop window (fitView), base64
  hooks/scene.ts                Anim type + drawScene(world, anim) → 72×36 pixel buffer
  hooks/reports.ts              countFindings, reportStatus, reportId
  hooks/status.ts               parseStatus(harness status stdout)
  hooks/events.ts               DomainEvent type, parseHarnessCall, exitCodeOf, interpretResult
  hooks/world.ts                Cue type + pure domain reducer apply(world, event, now)
  hooks/sim.ts                  pure 12 fps animation reducer: initialAnim, applyCue, step, isAnimating
  hooks/store.ts                PROGRESS_KEY, freshProgress, parseProgress (validation)
  hooks/gallery.ts              formatGallery, statusSegments
  hooks/*.test.ts(x)            one test file per module, register.test.tsx for wiring
  types/index.d.ts              PluginState['pyramid-site'] contract + exported Pyramid* types
  tsconfig.json                 strict, same as kaomoji-status
.claude-plugin/marketplace.json  + pyramid-site entry
README.md                         + pyramid-site section
```

Dependency order: types → sprites → cells, scene → reports, status → events → world → sim → store → gallery → register.

---

### Task 1: Scaffold the plugin

**Files:**
- Create: `mods/pyramid-site/.claude-plugin/plugin.json`
- Create: `mods/pyramid-site/hooks/hooks.json`
- Create: `mods/pyramid-site/hooks/register.tsx` (no-op for now)
- Create: `mods/pyramid-site/types/index.d.ts`
- Create: `mods/pyramid-site/tsconfig.json`
- Copy (gitignored): `mods/pyramid-site/.claude-plugin/types/`

- [ ] **Step 1: Write the manifest** `mods/pyramid-site/.claude-plugin/plugin.json`

```json
{
  "name": "pyramid-site",
  "version": "0.1.0",
  "description": "An animated pixel-art pyramid construction site in a side pane: the harness conductor cracks the whip, workers carry bricks, every report adds one.",
  "author": { "name": "geonhos" },
  "types": "./types/index.d.ts",
  "userConfig": {
    "harnessPath": {
      "type": "string",
      "title": "harness path",
      "description": "Absolute path to the harness executable. Leave empty to run `harness` from PATH.",
      "default": ""
    },
    "pixelMode": {
      "type": "string",
      "title": "pixel mode",
      "description": "half draws two pixels per cell with ▀; space draws coloured spaces, for terminals that show block glyphs double width.",
      "options": ["half", "space"],
      "default": "half"
    }
  }
}
```

- [ ] **Step 2: Write the hooks entry** `mods/pyramid-site/hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

- [ ] **Step 3: Write the no-op module** `mods/pyramid-site/hooks/register.tsx` (Task 12 replaces it)

```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

- [ ] **Step 4: Write the state contract** `mods/pyramid-site/types/index.d.ts`

```ts
export type PyramidWorkerName = 'analyst' | 'implementer' | 'reviewer'

export type PyramidWorkerState = 'idle' | 'working' | 'blocked' | 'waiting'

export type PyramidCompleted = { wonder: string; date: string }

export type PyramidProgress = {
  v: 1
  wonderIndex: number
  bricks: number
  cracked: number[]
  completed: PyramidCompleted[]
  seenReports: string[]
  paneWanted: boolean
}

export type PyramidWorld = {
  progress: PyramidProgress
  workers: Record<PyramidWorkerName, PyramidWorkerState>
  askedAt: Record<PyramidWorkerName, number>
}

declare module 'claude-code' {
  interface PluginState {
    'pyramid-site': { world: PyramidWorld }
  }
}
```

- [ ] **Step 5: Write** `mods/pyramid-site/tsconfig.json` (identical to kaomoji-status)

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

- [ ] **Step 6: Lay the engine declarations beside the mod** (gitignored by `mods/*/.claude-plugin/types/`)

```bash
mkdir -p mods/pyramid-site/.claude-plugin/types
cp -R mods/kaomoji-status/.claude-plugin/types/. mods/pyramid-site/.claude-plugin/types/
cp /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts mods/pyramid-site/.claude-plugin/types/claude-code/index.d.ts 2>/dev/null || true
```

The `cp -R` copies `claude-code/`, `claude-code-tools/`, `claude-code-mcp/`, `tsconfig.json` and `.gitignore`. The second `cp` refreshes the API file to the running build when the bundled skill folder exists.

- [ ] **Step 7: Validate and type-check**

Run: `claude plugin validate mods/pyramid-site`
Expected: it lists `declares state: pyramid-site.world` and `./register.tsx hooks: nothing`, then `✔ Validation passed`.

Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output, exit 0.

Run: `git status --short`
Expected: only `mods/pyramid-site/.claude-plugin/plugin.json`, `hooks/`, `types/` and `tsconfig.json` are listed. Nothing under `.claude-plugin/types/` appears.

- [ ] **Step 8: Commit**

```bash
git add mods/pyramid-site/.claude-plugin/plugin.json mods/pyramid-site/hooks mods/pyramid-site/types mods/pyramid-site/tsconfig.json
git commit -m "feat(pyramid-site): scaffold plugin manifest, hooks module and state contract"
```

---

### Task 2: Sprites and wonder layouts

Port the preview's sprites (`.harness/pyramid-preview.html` lines 151–170) to typed data. Add the camel, the scroll and the four wonders.

**Files:**
- Create: `mods/pyramid-site/hooks/sprites.ts`
- Test: `mods/pyramid-site/hooks/sprites.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/sprites.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  BOSS, BRICK_H, BRICK_W, CAMEL, CLOUDS, DROPPED_BRICK, LEGS_A, LEGS_B, PALETTE, QMARK, SCROLL, SIT,
  UP_CARRY, UP_EMPTY, WONDERS, WORKER_H, WORKER_SHIRT, WORKER_W, ZED, toHexColor, walkTarget,
} from './sprites'
import type { Palette, Sprite } from './sprites'

const SPRITES: Record<string, Sprite> = { BOSS, CAMEL, DROPPED_BRICK, LEGS_A, LEGS_B, QMARK, SCROLL, SIT, UP_CARRY, UP_EMPTY, ZED }
const WORKER_PALETTE: Palette = { ...PALETTE, ...WORKER_SHIRT.analyst }

describe('sprites', () => {
  test('every row of a sprite has the same width', () => {
    for (const [name, rows] of Object.entries({ ...SPRITES, CLOUD0: CLOUDS[0]!, CLOUD1: CLOUDS[1]! })) {
      const widths = new Set(rows.map(row => row.length))
      expect(widths.size, name).toBe(1)
    }
  })
  test('every glyph is transparent or in the palette', () => {
    for (const [name, rows] of Object.entries({ ...SPRITES, CLOUD0: CLOUDS[0]!, CLOUD1: CLOUDS[1]! })) {
      for (const glyph of rows.join('')) {
        expect(glyph === '.' || WORKER_PALETTE[glyph] !== undefined, `${name} ${glyph}`).toBe(true)
      }
    }
  })
  test('a standing worker and a sitting worker are 7×12', () => {
    expect(UP_CARRY.concat(LEGS_A)).toHaveLength(WORKER_H)
    expect(SIT).toHaveLength(WORKER_H)
    expect(SIT[0]!.length).toBe(WORKER_W)
  })
  test('the camel is 12×10', () => {
    expect(CAMEL).toHaveLength(10)
    expect(CAMEL[0]!.length).toBe(12)
  })
  test('toHexColor pads to six digits', () => {
    expect(toHexColor(0x0a0b0c)).toBe('#0a0b0c')
  })
})

describe('wonders', () => {
  test('have the planned brick totals', () => {
    expect(WONDERS.map(w => [w.name, w.slots.length])).toEqual([
      ['Pyramid', 28], ['Obelisk', 22], ['Sphinx', 28], ['Great Pyramid', 45],
    ])
  })
  test('fit x 36..71 and y 2..29', () => {
    for (const wonder of WONDERS) {
      for (const slot of wonder.slots) {
        expect(slot.x >= 36 && slot.x + BRICK_W - 1 <= 71, `${wonder.name} x ${slot.x}`).toBe(true)
        expect(slot.y >= 2 && slot.y + BRICK_H - 1 <= 29, `${wonder.name} y ${slot.y}`).toBe(true)
      }
    }
  })
  test('bricks never overlap', () => {
    for (const wonder of WONDERS) {
      const seen = new Set<string>()
      for (const slot of wonder.slots) {
        for (let dy = 0; dy < BRICK_H; dy += 1) {
          for (let dx = 0; dx < BRICK_W; dx += 1) {
            const key = `${slot.x + dx},${slot.y + dy}`
            expect(seen.has(key), `${wonder.name} ${key}`).toBe(false)
            seen.add(key)
          }
        }
      }
    }
  })
  test('are built bottom-up, left to right', () => {
    for (const wonder of WONDERS) {
      for (let i = 1; i < wonder.slots.length; i += 1) {
        const a = wonder.slots[i - 1]!
        const b = wonder.slots[i]!
        expect(a.y > b.y || (a.y === b.y && a.x < b.x), wonder.name).toBe(true)
      }
    }
  })
  test('workers stop one pixel left of the left foot', () => {
    expect(WONDERS.map(walkTarget)).toEqual([34, 42, 32, 28])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `sprites.test.ts` cannot import `./sprites` (module not found).

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/sprites.ts`

```ts
import type { PyramidWorkerName } from '../types'

export const W = 72
export const H = 36
export const GROUND = 30

export type Sprite = readonly string[]
export type Palette = Readonly<Record<string, number>>

export const PALETTE: Palette = {
  K: 0x2b2118, S: 0xe0ac69, s: 0xa87542, Y: 0xf2c14e, y: 0xc99a2e, R: 0xb5523b, r: 0x8e3b29,
  L: 0x3a3a46, W: 0xf4efe1, G: 0xe9b949, B: 0x2f5fa8, N: 0x5a3a1e, X: 0xe04848,
  A: 0xc8955a, a: 0x9c6b3a,
}

export const toHexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

export const WORKER_NAMES: readonly PyramidWorkerName[] = ['analyst', 'implementer', 'reviewer']
export const WORKER_HOME: Readonly<Record<PyramidWorkerName, number>> = { analyst: 11, implementer: 18, reviewer: 25 }
export const WORKER_SHIRT: Readonly<Record<PyramidWorkerName, Palette>> = {
  analyst: { C: 0x3b6ea5, c: 0x2a5080 },
  implementer: { C: 0x4f9a5a, c: 0x3b7445 },
  reviewer: { C: 0x8a5cb8, c: 0x6a4392 },
}
export const WORKER_W = 7
export const WORKER_H = 12

export const UP_CARRY: Sprite = ['..YYY..', '.YYYYY.', 'yyyyyyy', '..SSKS.', '..SSSS.', 'RRCCCC.', 'rrCCCCS', '..CCCC.', '..cccc.']
export const UP_EMPTY: Sprite = ['..YYY..', '.YYYYY.', 'yyyyyyy', '..SSKS.', '..SSSS.', '..CCCC.', '.SCCCCS', '..CCCC.', '..cccc.']
export const LEGS_A: Sprite = ['..L..L.', '.L...L.', 'KK...KK']
export const LEGS_B: Sprite = ['..LLL..', '...LL..', '...KKK.']
export const SIT: Sprite = ['.......', '.......', '.......', '..YYY..', '.YYYYY.', 'yyyyyyy', '..SSsS.', '..SSSS.', '.SCCCCS', '..CCCC.', '..ccLLL', '..LLLKK']
export const QMARK: Sprite = ['XXX', '..X', '.XX', '...', '.X.']
export const ZED: Sprite = ['WWW', '.W.', 'WWW']
export const DROPPED_BRICK: Sprite = ['RRr', 'rrr']
export const BOSS: Sprite = [
  '...GGG...', '..GBGBG..', '.GBSSSKG.', '.BGSSSSB.', '.G.SSN.G.', '..GGGGG..', '..WWWWWS.',
  '..WWWWW..', '..GGGGG..', '..WWWWW..', '..WW.WW..', '..SS.SS..', '..SS.SS..', '.NNN.NNN.',
]
export const BOSS_X = 1
export const BOSS_Y = 16
export const HAND = { x: 8, y: 22 } as const
export const CLOUDS: readonly Sprite[] = [
  ['..WWW...', '.WWWWWW.', 'WWWWWWWW'],
  ['...WW.....', '.WWWWWWW..', 'WWWWWWWWWW'],
]
export const CLOUD_START: ReadonlyArray<{ x: number; y: number; p: number }> = [
  { x: 3, y: 3, p: 0 },
  { x: 38, y: 7, p: 1 },
  { x: 58, y: 2, p: 0 },
]
export type Offset = readonly [number, number]
export const WHIP: Readonly<Record<'rest' | 'raise' | 'crack', readonly Offset[]>> = {
  rest: [[1, 1], [1, 2], [1, 3], [2, 4], [2, 5], [3, 6], [4, 7]],
  raise: [[0, -1], [-1, -2], [-1, -3], [-2, -4], [-3, -4], [-4, -3]],
  crack: [[1, 0], [2, -1], [3, -1], [4, 0], [5, 0], [6, -1], [7, -1], [8, 0], [9, 0]],
}
export const SPARK: ReadonlyArray<readonly [number, number, number]> = [
  [10, -1, 0xfff6c2], [11, -2, 0xf2c14e], [11, 0, 0xf2c14e], [12, -1, 0xffffff],
]
export const CAMEL: Sprite = [
  '.aa.........',
  'aaaa........',
  '.aa.....AA..',
  '.aa....AAAA.',
  '.aaAAAAAAAAA',
  '..AAAAAAAAAA',
  '..AAAAAAAAA.',
  '...A.A..A.A.',
  '...A.A..A.A.',
  '...K.K..K.K.',
]
export const CAMEL_H = 10
export const SCROLL: Sprite = ['NWWWN', '.WWW.']

export type Slot = { x: number; y: number }
export type Wonder = { name: string; slots: readonly Slot[] }
export const BRICK_W = 4
export const BRICK_H = 2

const ordered = (slots: readonly Slot[]): Slot[] => [...slots].sort((a, b) => b.y - a.y || a.x - b.x)

const stepped = (layers: number, left: number): Slot[] => {
  const out: Slot[] = []
  for (let k = 0; k < layers; k += 1) {
    for (let i = 0; i < layers - k; i += 1) out.push({ x: left + k * 2 + i * 4, y: GROUND - 2 * (k + 1) })
  }
  return out
}

const grid = (xs: readonly number[], ys: readonly number[]): Slot[] => ys.flatMap(y => xs.map(x => ({ x, y })))

export const WONDERS: readonly Wonder[] = [
  { name: 'Pyramid', slots: ordered(stepped(7, 42)) },
  {
    name: 'Obelisk',
    slots: ordered([
      ...grid([50, 54, 58], [28]),
      ...grid([52, 56], [26, 24, 22, 20, 18, 16, 14, 12, 10]),
      { x: 54, y: 8 },
    ]),
  },
  {
    name: 'Sphinx',
    slots: ordered([
      ...grid([40, 44, 48, 52, 56, 60, 64], [28, 26]),
      { x: 68, y: 28 },
      ...grid([40, 44, 48], [24]),
      ...grid([60, 64], [24, 22, 20, 18]),
      ...grid([56], [22, 20]),
    ]),
  },
  { name: 'Great Pyramid', slots: ordered(stepped(9, 36)) },
]

export const wonderAt = (index: number): Wonder => WONDERS[index] ?? WONDERS[0]!

export function walkTarget(wonder: Wonder): number {
  const footY = Math.max(...wonder.slots.map(slot => slot.y))
  const foot = Math.min(...wonder.slots.filter(slot => slot.y === footY).map(slot => slot.x))
  return foot - WORKER_W - 1
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `10 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/sprites.ts mods/pyramid-site/hooks/sprites.test.ts
git commit -m "feat(pyramid-site): add palette, sprites and wonder layouts"
```

---

### Task 3: Raster cells (half/space, crop window, base64)

**Files:**
- Create: `mods/pyramid-site/hooks/cells.ts`
- Test: `mods/pyramid-site/hooks/cells.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/cells.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, SPACE, UPPER_HALF, decodeBase64, decodeCells, encodeBase64, fitView, toCells, toWords } from './cells'
import { H, W } from './sprites'

const bytesOf = (text: string): Uint8Array => new Uint8Array([...text].map(c => c.charCodeAt(0)))

const ramp = (): Uint32Array => {
  const pixels = new Uint32Array(W * H)
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) pixels[y * W + x] = (y << 8) | x
  return pixels
}

describe('base64', () => {
  test('matches the standard padded alphabet', () => {
    expect(encodeBase64(bytesOf(''))).toBe('')
    expect(encodeBase64(bytesOf('f'))).toBe('Zg==')
    expect(encodeBase64(bytesOf('fo'))).toBe('Zm8=')
    expect(encodeBase64(bytesOf('foo'))).toBe('Zm9v')
    expect(encodeBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
  })
  test('decodes what it encodes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253])
    expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes])
  })
  test('packs one orange cell as the engine example does', () => {
    expect(decodeCells(toCells(new Uint32Array(W * H).fill(0xff8800), 'half', { x0: 0, y0: 0, columns: 1, rows: 1 }))).toEqual(
      Uint32Array.of(UPPER_HALF, 0xff8800, 0xff8800),
    )
  })
})

describe('fitView', () => {
  test('shows the whole 72×18 scene when there is room', () => {
    expect(fitView(100, 30)).toEqual({ x0: 0, y0: 0, columns: 72, rows: 18 })
  })
  test('crops the left sky first on a narrow pane', () => {
    expect(fitView(40, 30)).toEqual({ x0: 32, y0: 0, columns: 40, rows: 18 })
  })
  test('keeps one row for the status line and crops sky rows from the top', () => {
    expect(fitView(72, 10)).toEqual({ x0: 0, y0: 9, columns: 72, rows: 9 })
  })
  test('never goes below one cell', () => {
    expect(fitView(0, 0)).toEqual({ x0: 71, y0: 17, columns: 1, rows: 1 })
  })
})

describe('toWords', () => {
  test('half mode: ▀ with the upper pixel as fg and the lower as bg', () => {
    const words = toWords(ramp(), 'half', { x0: 5, y0: 2, columns: 2, rows: 1 })
    expect([...words]).toEqual([UPPER_HALF, (4 << 8) | 5, (5 << 8) | 5, UPPER_HALF, (4 << 8) | 6, (5 << 8) | 6])
  })
  test('space mode: a space on the lower pixel of each 2-wide pair', () => {
    const words = toWords(ramp(), 'space', { x0: 5, y0: 2, columns: 2, rows: 1 })
    expect([...words]).toEqual([SPACE, DEFAULT_COLOR, (5 << 8) | 4, SPACE, DEFAULT_COLOR, (5 << 8) | 6])
  })
  test('one triplet per cell', () => {
    expect(toWords(ramp(), 'half', fitView(72, 30))).toHaveLength(72 * 18 * 3)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `cells.test.ts` cannot import `./cells`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/cells.ts`

The cell format is defined by RasterProps (engine d.ts:9650–9677): standard padded base64 of little-endian u32 triplets `[codePoint, fg, bg]`, row-major. A colour is `0x00RRGGBB`; `0x01000000` is the terminal default.

```ts
import { H, W } from './sprites'

export type PixelMode = 'half' | 'space'
export type View = { x0: number; y0: number; columns: number; rows: number }

export const SCENE_ROWS = H / 2
export const UPPER_HALF = 0x2580
export const SPACE = 0x20
export const DEFAULT_COLOR = 0x01000000

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, Math.floor(value)))

export function fitView(bodyColumns: number, bodyRows: number): View {
  const columns = clamp(bodyColumns, 1, W)
  const rows = clamp(bodyRows - 1, 1, SCENE_ROWS)
  return { x0: W - columns, y0: SCENE_ROWS - rows, columns, rows }
}

export function toWords(pixels: Uint32Array, mode: PixelMode, view: View): Uint32Array {
  const words = new Uint32Array(view.columns * view.rows * 3)
  let at = 0
  for (let row = 0; row < view.rows; row += 1) {
    const top = (view.y0 + row) * 2
    for (let column = 0; column < view.columns; column += 1) {
      const x = view.x0 + column
      if (mode === 'half') {
        words[at] = UPPER_HALF
        words[at + 1] = pixels[top * W + x] ?? 0
        words[at + 2] = pixels[(top + 1) * W + x] ?? 0
      } else {
        const sampled = pixels[(top + 1) * W + (x - (x % 2))] ?? 0
        words[at] = SPACE
        words[at + 1] = DEFAULT_COLOR
        words[at + 2] = sampled
      }
      at += 3
    }
  }
  return words
}

export function wordsToBytes(words: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((word, i) => {
    bytes[i * 4] = word & 0xff
    bytes[i * 4 + 1] = (word >>> 8) & 0xff
    bytes[i * 4 + 2] = (word >>> 16) & 0xff
    bytes[i * 4 + 3] = (word >>> 24) & 0xff
  })
  return bytes
}

export function bytesToWords(bytes: Uint8Array): Uint32Array {
  const words = new Uint32Array(Math.floor(bytes.length / 4))
  for (let i = 0; i < words.length; i += 1) {
    words[i] = ((bytes[i * 4] ?? 0) | ((bytes[i * 4 + 1] ?? 0) << 8) | ((bytes[i * 4 + 2] ?? 0) << 16) | ((bytes[i * 4 + 3] ?? 0) << 24)) >>> 0
  }
  return words
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function encodeBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]!
    out += i + 1 < bytes.length ? ALPHABET[(n >>> 6) & 63]! : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '='
  }
  return out
}

export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let at = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, ALPHABET.indexOf(clean[i + k] ?? 'A')), 0)
    if (at < bytes.length) bytes[at++] = (n >>> 16) & 0xff
    if (at < bytes.length) bytes[at++] = (n >>> 8) & 0xff
    if (at < bytes.length) bytes[at++] = n & 0xff
  }
  return bytes
}

export function toCells(pixels: Uint32Array, mode: PixelMode, view: View): string {
  return encodeBase64(wordsToBytes(toWords(pixels, mode, view)))
}

export function decodeCells(cells: string): Uint32Array {
  return bytesToWords(decodeBase64(cells))
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `20 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/cells.ts mods/pyramid-site/hooks/cells.test.ts
git commit -m "feat(pyramid-site): pack pixels into half-block or space Raster cells"
```

---

### Task 4: Scene drawing

Port `drawScene` from the preview (lines 189–255) to a pure function on a `Uint32Array`. Add cracks, the gold flash, the completion capstone, the caravan and the waiting pose. The `Anim` type is defined here because scene is built before sim.

**Files:**
- Create: `mods/pyramid-site/hooks/scene.ts`
- Test: `mods/pyramid-site/hooks/scene.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/scene.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `scene.test.ts` cannot import `./scene`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/scene.ts`

```ts
import type { PyramidWorkerName, PyramidWorld } from '../types'
import {
  BOSS, BOSS_X, BOSS_Y, BRICK_H, BRICK_W, CAMEL, CAMEL_H, CLOUD_START, CLOUDS, DROPPED_BRICK, GROUND, H, HAND, LEGS_A, LEGS_B,
  PALETTE, QMARK, SCROLL, SIT, SPARK, UP_CARRY, UP_EMPTY, W, WHIP, WORKER_H, WORKER_HOME, WORKER_NAMES, WORKER_SHIRT,
  ZED, wonderAt,
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
export const CRACK = 0x4a2f1a
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
          color = mix(skyAt(slot.y + dy), 0xd6b574, dy === 0 || dx === 0 ? 0.32 : 0.16)
        } else if (anim.done !== undefined && i === last) {
          color = dy === 0 && dx < 3 ? 0xffe27a : 0xe9b949
        } else if (anim.gold > 0) {
          color = dy === 0 ? 0xffe27a : 0xe9b949
        } else if (anim.flash > 0 && i === anim.flashSlot) {
          color = anim.flash % 2 === 1 ? 0xfff6d6 : 0xf2dfa8
        } else {
          color = dy === 0 ? (dx < 3 ? 0xecd59f : 0xd4b373) : dx < 3 ? 0xd4b373 : 0xa8864c
        }
        put(pixels, slot.x + dx, slot.y + dy, color)
      }
    }
    if (i < bricks && cracked.includes(i)) {
      put(pixels, slot.x + 1, slot.y, CRACK)
      put(pixels, slot.x + 2, slot.y + 1, CRACK)
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

function drawWorkers(pixels: Uint32Array, world: PyramidWorld, anim: Anim): void {
  const top = GROUND - WORKER_H
  for (const name of WORKER_NAMES) {
    const state = world.workers[name]
    const walker = anim.workers[name]
    const palette: Palette = { ...PALETTE, ...WORKER_SHIRT[name] }
    if (state === 'idle' && walker.x <= WORKER_HOME[name]) {
      sprite(pixels, SIT, walker.x, top, palette)
      const beat = Math.floor(anim.tick / 8)
      if (beat % 6 < 4) sprite(pixels, ZED, walker.x + 4, 14 - (beat % 4), { W: 0xffffff })
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
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `30 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/scene.ts mods/pyramid-site/hooks/scene.test.ts
git commit -m "feat(pyramid-site): draw the construction site into a 72x36 pixel buffer"
```

---

### Task 5: Worker reports (findings, status, id)

**Files:**
- Create: `mods/pyramid-site/hooks/reports.ts`
- Test: `mods/pyramid-site/hooks/reports.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/reports.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import { countFindings, findingLines, reportId, reportStatus } from './reports'

const REVIEW = [
  '# reviewer report — main...HEAD, 3 files',
  'status: done',
  '## Findings / Decisions',
  '- **READY TO PUSH: not yet.**',
  '- [Critical] a.ts:1 — breaks',
  '- [Important] b.ts:2 — not in the contract but real reports use it',
  '  - [Minor] nested bullets count too',
  '- [Minor] c.ts:3 — nit',
  '## Verification',
  '- [Major] this is not in the Findings section',
  '## Open questions',
  '- none',
].join('\n')

describe('findingLines', () => {
  test('returns the lines between ## Findings and the next ## heading', () => {
    expect(findingLines(REVIEW)).toHaveLength(5)
  })
  test('is empty without a Findings section', () => {
    expect(findingLines('# x\nstatus: done\n')).toEqual([])
  })
})

describe('countFindings', () => {
  test('counts severity-tagged bullets in the Findings section only', () => {
    expect(countFindings(REVIEW)).toBe(4)
  })
  test('is zero for a clean review', () => {
    expect(countFindings('status: done\n## Findings / Decisions\n- no findings\n## Verification\n')).toBe(0)
  })
  test('ignores case of the tag', () => {
    expect(countFindings('## Findings\n- [minor] x\n')).toBe(1)
  })
})

describe('reportStatus', () => {
  test('reads the status line', () => {
    expect(reportStatus(REVIEW)).toBe('done')
    expect(reportStatus('# r\nstatus: blocked\n')).toBe('blocked')
    expect(reportStatus('# r\nStatus: Partial\n')).toBe('partial')
  })
  test('is undefined without one', () => {
    expect(reportStatus('# r\n')).toBeUndefined()
  })
})

describe('reportId', () => {
  test('is stable and ignores surrounding whitespace', () => {
    expect(reportId(REVIEW)).toBe(reportId(`\n${REVIEW}\n\n`))
    expect(reportId(REVIEW)).toMatch(/^[0-9a-f]{8}-\d+$/)
  })
  test('differs for different reports', () => {
    expect(reportId('a')).not.toBe(reportId('b'))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `reports.test.ts` cannot import `./reports`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/reports.ts`

```ts
export type ReportStatus = 'done' | 'partial' | 'blocked'

const FINDINGS_HEADING = /^##\s+Findings/i
const NEXT_HEADING = /^##\s/
const FINDING = /^\s*-\s*\[(Critical|Major|Important|Minor)\]/i
const STATUS = /^status:\s*(done|partial|blocked)\b/im

export function findingLines(markdown: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => FINDINGS_HEADING.test(line))
  if (start < 0) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => NEXT_HEADING.test(line))
  return end < 0 ? rest : rest.slice(0, end)
}

export function countFindings(markdown: string): number {
  return findingLines(markdown).filter(line => FINDING.test(line)).length
}

export function reportStatus(markdown: string): ReportStatus | undefined {
  const match = STATUS.exec(markdown)
  return match === null ? undefined : (match[1]!.toLowerCase() as ReportStatus)
}

export function reportId(markdown: string): string {
  const text = markdown.trim()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length}`
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `39 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/reports.ts mods/pyramid-site/hooks/reports.test.ts
git commit -m "feat(pyramid-site): count reviewer findings and fingerprint reports"
```

---

### Task 6: harness status parsing

**Files:**
- Create: `mods/pyramid-site/hooks/status.ts`
- Test: `mods/pyramid-site/hooks/status.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/status.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import { parseStatus } from './status'

describe('parseStatus', () => {
  test('maps every harness status line', () => {
    expect(
      parseStatus('analyst      working  w5:p2\nimplementer  done     w5:p3\nreviewer     -\n'),
    ).toEqual({ analyst: 'working', implementer: 'idle', reviewer: 'absent' })
  })
  test('keeps blocked and idle', () => {
    expect(parseStatus('analyst blocked w1:p1\nreviewer idle w1:p2')).toEqual({ analyst: 'blocked', reviewer: 'idle' })
  })
  test('skips unknown states, unknown names and junk', () => {
    expect(parseStatus('analyst unknown w1:p1\nboss working w1:p9\n\nharness: oops\n')).toEqual({})
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `status.test.ts` cannot import `./status`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/status.ts`

`harness status` prints `printf '%-12s %-8s %s'` (name, state, pane), or `name -` for a worker that is not live.

```ts
import type { PyramidWorkerName } from '../types'
import { WORKER_NAMES } from './sprites'

export type PolledState = 'idle' | 'working' | 'blocked' | 'absent'
export type Polled = Partial<Record<PyramidWorkerName, PolledState>>

const isWorker = (name: string): name is PyramidWorkerName => (WORKER_NAMES as readonly string[]).includes(name)

const STATES: Readonly<Record<string, PolledState>> = {
  '-': 'absent',
  idle: 'idle',
  done: 'idle',
  working: 'working',
  blocked: 'blocked',
}

export function parseStatus(stdout: string): Polled {
  const polled: Polled = {}
  for (const line of stdout.split('\n')) {
    const [name, state] = line.trim().split(/\s+/)
    if (name === undefined || state === undefined || !isWorker(name)) continue
    const mapped = STATES[state]
    if (mapped !== undefined) polled[name] = mapped
  }
  return polled
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `42 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/status.ts mods/pyramid-site/hooks/status.test.ts
git commit -m "feat(pyramid-site): parse harness status lines"
```

---

### Task 7: Harness calls → domain events

**Files:**
- Create: `mods/pyramid-site/hooks/events.ts`
- Test: `mods/pyramid-site/hooks/events.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/events.test.ts`

```ts
import type { ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { exitCodeOf, interpretResult, parseHarnessCall } from './events'

const ok = (stdout: string): ToolCallResult => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })
const failed = (code: number, rest = 'harness: x'): ToolCallResult => ({ isError: true, result: `Exit code ${code}\n${rest}`, text: `Exit code ${code}\n${rest}` })
const ASK = { verb: 'ask', worker: 'analyst' } as const
const REPORT = { verb: 'report', worker: 'reviewer' } as const

describe('parseHarnessCall', () => {
  test('finds ask and report for the three workers', () => {
    expect(parseHarnessCall("harness ask analyst 'Read .harness/task-analyst.md and do it.'")).toEqual(ASK)
    expect(parseHarnessCall('harness report reviewer')).toEqual(REPORT)
    expect(parseHarnessCall('cd /repo && harness ask implementer "go"')).toEqual({ verb: 'ask', worker: 'implementer' })
    expect(parseHarnessCall('(harness ask reviewer x)')).toEqual({ verb: 'ask', worker: 'reviewer' })
  })
  test('ignores other verbs, other agents and look-alikes', () => {
    expect(parseHarnessCall('harness status')).toBeUndefined()
    expect(parseHarnessCall('harness spawn analyst')).toBeUndefined()
    expect(parseHarnessCall('harness ask boss now')).toBeUndefined()
    expect(parseHarnessCall('myharness ask analyst x')).toBeUndefined()
    expect(parseHarnessCall('harness ask analysts x')).toBeUndefined()
  })
})

describe('exitCodeOf', () => {
  test('is 0 on success and parsed from the error text otherwise', () => {
    expect(exitCodeOf(ok('# report'))).toBe(0)
    expect(exitCodeOf(failed(3))).toBe(3)
  })
  test('is undefined on a deny or an error without a code', () => {
    expect(exitCodeOf({ deny: 'no' })).toBeUndefined()
    expect(exitCodeOf({ isError: true, result: 'Interrupted', text: 'Interrupted' })).toBeUndefined()
  })
})

describe('interpretResult', () => {
  test('a printed report becomes a report event', () => {
    expect(interpretResult(ASK, ok('# analyst report\nstatus: done\n'))).toEqual({
      kind: 'report', worker: 'analyst', text: '# analyst report\nstatus: done\n',
    })
    expect(interpretResult(REPORT, ok('# reviewer report\n'))).toEqual({ kind: 'report', worker: 'reviewer', text: '# reviewer report\n' })
  })
  test('ask exit codes map to blocked, waiting and idle', () => {
    expect(interpretResult(ASK, failed(2))).toEqual({ kind: 'blocked', worker: 'analyst' })
    expect(interpretResult(ASK, failed(4))).toEqual({ kind: 'waiting', worker: 'analyst' })
    expect(interpretResult(ASK, failed(3))).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(ASK, failed(1))).toEqual({ kind: 'idle', worker: 'analyst' })
  })
  test('report exit 3 is idle; other report failures say nothing', () => {
    expect(interpretResult(REPORT, failed(3))).toEqual({ kind: 'idle', worker: 'reviewer' })
    expect(interpretResult(REPORT, failed(1))).toBeUndefined()
  })
  test('an empty success is idle, a denied ask is idle', () => {
    expect(interpretResult(ASK, ok('  \n'))).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(ASK, { deny: 'no' })).toEqual({ kind: 'idle', worker: 'analyst' })
    expect(interpretResult(REPORT, { deny: 'no' })).toBeUndefined()
  })
  test('a backgrounded ask leaves the worker as it is', () => {
    expect(interpretResult(ASK, { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `events.test.ts` cannot import `./events`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/events.ts`

Bash `tool.call` results carry **no exit code on success**. A non-zero exit is `{ isError: true, text: "Exit code N\n…" }`; this was verified in this repo's transcripts.

```ts
import type { ToolCallResult } from 'claude-code'

import type { PyramidWorkerName } from '../types'
import type { Polled } from './status'

export type HarnessVerb = 'ask' | 'report'
export type HarnessCall = { verb: HarnessVerb; worker: PyramidWorkerName }

export type DomainEvent =
  | { kind: 'ask'; worker: PyramidWorkerName }
  | { kind: 'report'; worker: PyramidWorkerName; text: string }
  | { kind: 'blocked'; worker: PyramidWorkerName }
  | { kind: 'waiting'; worker: PyramidWorkerName }
  | { kind: 'idle'; worker: PyramidWorkerName }
  | { kind: 'caravan' }
  | { kind: 'status'; polled: Polled }

const CALL = /(?:^|[;&|(]\s*|\s)harness\s+(ask|report)\s+(analyst|implementer|reviewer)\b/
const EXIT = /^Exit code (\d+)/

export function parseHarnessCall(command: string): HarnessCall | undefined {
  const match = CALL.exec(command)
  if (match === null) return undefined
  return { verb: match[1] as HarnessVerb, worker: match[2] as PyramidWorkerName }
}

export function exitCodeOf(result: ToolCallResult): number | undefined {
  if (result.deny !== undefined) return undefined
  if (result.isError === true) {
    const match = EXIT.exec(result.text ?? '')
    return match === null ? undefined : Number(match[1])
  }
  return 0
}

const recordOf = (result: ToolCallResult): Record<string, unknown> | undefined =>
  typeof result.result === 'object' && result.result !== null ? (result.result as Record<string, unknown>) : undefined

export function isBackgrounded(result: ToolCallResult): boolean {
  return typeof recordOf(result)?.backgroundTaskId === 'string'
}

export function reportTextOf(result: ToolCallResult): string {
  const stdout = recordOf(result)?.stdout
  return typeof stdout === 'string' ? stdout : result.text ?? ''
}

export function interpretResult(call: HarnessCall, result: ToolCallResult): DomainEvent | undefined {
  const { verb, worker } = call
  if (result.deny !== undefined) return verb === 'ask' ? { kind: 'idle', worker } : undefined
  if (isBackgrounded(result)) return undefined
  const code = exitCodeOf(result)
  if (code === undefined) return undefined
  if (code === 0) {
    const text = reportTextOf(result)
    return text.trim() === '' ? { kind: 'idle', worker } : { kind: 'report', worker, text }
  }
  if (verb === 'report') return code === 3 ? { kind: 'idle', worker } : undefined
  if (code === 2) return { kind: 'blocked', worker }
  if (code === 4) return { kind: 'waiting', worker }
  return { kind: 'idle', worker }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `51 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/events.ts mods/pyramid-site/hooks/events.test.ts
git commit -m "feat(pyramid-site): map harness ask/report results to domain events"
```

---

### Task 8: World reducer

**Files:**
- Create: `mods/pyramid-site/hooks/world.ts`
- Test: `mods/pyramid-site/hooks/world.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/world.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `world.test.ts` cannot import `./world`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/world.ts`

`apply` returns the **same world object** when nothing changed. `register.tsx` relies on that to skip a state write on every quiet poll.

```ts
import type { PyramidProgress, PyramidWorkerName, PyramidWorkerState, PyramidWorld } from '../types'
import type { DomainEvent } from './events'
import { countFindings, reportId, reportStatus } from './reports'
import { WONDERS, WORKER_NAMES, wonderAt } from './sprites'

export type Cue =
  | { kind: 'whip' }
  | { kind: 'flash'; slot: number }
  | { kind: 'gold' }
  | { kind: 'complete'; wonderIndex: number }
  | { kind: 'caravan' }

export type Applied = { world: PyramidWorld; cues: Cue[] }

export const MAX_CRACKS = 3
export const SEEN_LIMIT = 20
export const ASK_GRACE_MS = 5000

export function initialWorld(progress: PyramidProgress): PyramidWorld {
  return {
    progress,
    workers: { analyst: 'idle', implementer: 'idle', reviewer: 'idle' },
    askedAt: { analyst: 0, implementer: 0, reviewer: 0 },
  }
}

export function localDate(now: number): string {
  const date = new Date(now)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const setWorker = (world: PyramidWorld, worker: PyramidWorkerName, state: PyramidWorkerState): PyramidWorld =>
  world.workers[worker] === state ? world : { ...world, workers: { ...world.workers, [worker]: state } }

function crackRecent(progress: PyramidProgress, count: number): number[] {
  const picked: number[] = []
  for (let i = progress.bricks - 1; i >= 0 && picked.length < count; i -= 1) {
    if (!progress.cracked.includes(i)) picked.push(i)
  }
  return [...progress.cracked, ...picked].sort((a, b) => a - b)
}

function applyReport(world: PyramidWorld, worker: PyramidWorkerName, text: string, now: number): Applied {
  const rested = setWorker(world, worker, 'idle')
  const id = reportId(text)
  if (world.progress.seenReports.includes(id)) return { world: rested, cues: [] }

  const cues: Cue[] = []
  let progress: PyramidProgress = { ...world.progress, seenReports: [...world.progress.seenReports, id].slice(-SEEN_LIMIT) }
  if (worker === 'reviewer' && reportStatus(text) !== 'blocked') {
    const findings = countFindings(text)
    if (findings === 0) cues.push({ kind: 'gold' })
    else progress = { ...progress, cracked: crackRecent(progress, Math.min(MAX_CRACKS, findings)) }
  }
  if (worker === 'implementer' && progress.cracked.length > 0) progress = { ...progress, cracked: [] }

  cues.push({ kind: 'flash', slot: progress.bricks })
  progress = { ...progress, bricks: progress.bricks + 1 }
  const wonder = wonderAt(progress.wonderIndex)
  if (progress.bricks >= wonder.slots.length) {
    cues.push({ kind: 'complete', wonderIndex: progress.wonderIndex })
    progress = {
      ...progress,
      completed: [...progress.completed, { wonder: wonder.name, date: localDate(now) }],
      wonderIndex: (progress.wonderIndex + 1) % WONDERS.length,
      bricks: 0,
      cracked: [],
    }
  }
  return { world: { ...rested, progress }, cues }
}

function applyStatus(world: PyramidWorld, event: Extract<DomainEvent, { kind: 'status' }>, now: number): Applied {
  let next = world
  for (const name of WORKER_NAMES) {
    const polled = event.polled[name]
    const current = world.workers[name]
    if (polled === undefined) continue
    if (polled === 'working') next = setWorker(next, name, current === 'waiting' ? 'waiting' : 'working')
    else if (polled === 'blocked') next = setWorker(next, name, 'blocked')
    else if (!(current === 'working' && now - world.askedAt[name] < ASK_GRACE_MS)) next = setWorker(next, name, 'idle')
  }
  return { world: next, cues: [] }
}

export function apply(world: PyramidWorld, event: DomainEvent, now: number): Applied {
  switch (event.kind) {
    case 'ask':
      return {
        world: { ...setWorker(world, event.worker, 'working'), askedAt: { ...world.askedAt, [event.worker]: now } },
        cues: [{ kind: 'whip' }],
      }
    case 'report':
      return applyReport(world, event.worker, event.text, now)
    case 'blocked':
    case 'waiting':
    case 'idle':
      return { world: setWorker(world, event.worker, event.kind), cues: [] }
    case 'caravan':
      return { world, cues: [{ kind: 'caravan' }] }
    case 'status':
      return applyStatus(world, event, now)
  }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `68 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/world.ts mods/pyramid-site/hooks/world.test.ts
git commit -m "feat(pyramid-site): reduce worker events into bricks, cracks and wonders"
```

---

### Task 9: Animation reducer

**Files:**
- Create: `mods/pyramid-site/hooks/sim.ts`
- Test: `mods/pyramid-site/hooks/sim.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/sim.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `sim.test.ts` cannot import `./sim`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/sim.ts`

Walking follows the preview's `step()` (lines 307–320): workers move one pixel every second tick.

```ts
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
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `78 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/sim.ts mods/pyramid-site/hooks/sim.test.ts
git commit -m "feat(pyramid-site): animate walking, whip, flashes and the caravan"
```

---

### Task 10: Persisted progress

**Files:**
- Create: `mods/pyramid-site/hooks/store.ts`
- Test: `mods/pyramid-site/hooks/store.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/store.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import { freshProgress, parseProgress } from './store'

const GOOD = {
  v: 1, wonderIndex: 2, bricks: 9, cracked: [8, 7], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }],
  seenReports: ['a', 'b'], paneWanted: true,
}

describe('parseProgress', () => {
  test('keeps a valid record, sorting cracks', () => {
    expect(parseProgress(GOOD)).toEqual({ ...GOOD, cracked: [7, 8] })
  })
  test('starts fresh on nothing or another version', () => {
    expect(parseProgress(undefined)).toEqual(freshProgress())
    expect(parseProgress({ ...GOOD, v: 2 })).toEqual(freshProgress())
    expect(parseProgress([GOOD])).toEqual(freshProgress())
  })
  test('starts fresh on any field out of range', () => {
    for (const bad of [
      { wonderIndex: 4 }, { wonderIndex: 1.5 }, { bricks: 28, wonderIndex: 0 }, { bricks: -1 },
      { cracked: [9] }, { cracked: [1, 1] }, { completed: [{ wonder: 'x' }] }, { seenReports: [1] }, { paneWanted: 'yes' },
    ]) {
      expect(parseProgress({ ...GOOD, ...bad }), JSON.stringify(bad)).toEqual(freshProgress())
    }
  })
  test('keeps only the last 20 report ids', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `r${i}`)
    expect(parseProgress({ ...GOOD, seenReports: ids }).seenReports).toEqual(ids.slice(-20))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `store.test.ts` cannot import `./store`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/store.ts`

```ts
import type { PyramidCompleted, PyramidProgress } from '../types'
import { WONDERS } from './sprites'
import { SEEN_LIMIT } from './world'

export const PROGRESS_KEY = 'progress'

export function freshProgress(): PyramidProgress {
  return { v: 1, wonderIndex: 0, bricks: 0, cracked: [], completed: [], seenReports: [], paneWanted: false }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isIndex = (value: unknown, below: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < below
const isCompleted = (value: unknown): value is PyramidCompleted =>
  isRecord(value) && typeof value.wonder === 'string' && typeof value.date === 'string'

export function parseProgress(raw: unknown): PyramidProgress {
  if (!isRecord(raw) || raw.v !== 1) return freshProgress()
  const { wonderIndex, bricks, cracked, completed, seenReports, paneWanted } = raw
  if (!isIndex(wonderIndex, WONDERS.length)) return freshProgress()
  const total = WONDERS[wonderIndex]!.slots.length
  if (!isIndex(bricks, total)) return freshProgress()
  if (!Array.isArray(cracked) || !cracked.every(i => isIndex(i, bricks)) || new Set(cracked).size !== cracked.length) return freshProgress()
  if (!Array.isArray(completed) || !completed.every(isCompleted)) return freshProgress()
  if (!Array.isArray(seenReports) || !seenReports.every(id => typeof id === 'string')) return freshProgress()
  if (typeof paneWanted !== 'boolean') return freshProgress()
  return {
    v: 1,
    wonderIndex,
    bricks,
    cracked: [...(cracked as number[])].sort((a, b) => a - b),
    completed: completed.map(c => ({ wonder: c.wonder, date: c.date })),
    seenReports: (seenReports as string[]).slice(-SEEN_LIMIT),
    paneWanted,
  }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `82 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/store.ts mods/pyramid-site/hooks/store.test.ts
git commit -m "feat(pyramid-site): validate progress loaded from the store"
```

---

### Task 11: Gallery text and status row

**Files:**
- Create: `mods/pyramid-site/hooks/gallery.ts`
- Test: `mods/pyramid-site/hooks/gallery.test.ts`

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/gallery.test.ts`

```ts
import { describe, expect, test } from 'claude-code/testing'

import { formatGallery, statusSegments } from './gallery'
import { freshProgress } from './store'
import { initialWorld } from './world'

const textOf = (segments: ReadonlyArray<{ text: string }>): string => segments.map(s => s.text).join('')

describe('formatGallery', () => {
  test('shows progress and says when nothing is finished', () => {
    expect(formatGallery({ ...freshProgress(), bricks: 9 })).toBe('🧱 9/28 Pyramid\nNo wonders completed yet.')
  })
  test('lists completed wonders with dates', () => {
    expect(
      formatGallery({ ...freshProgress(), wonderIndex: 1, bricks: 3, completed: [{ wonder: 'Pyramid', date: '2026-10-16' }] }),
    ).toBe('🧱 3/22 Obelisk\nCompleted wonders:\n- Pyramid — 2026-10-16')
  })
})

describe('statusSegments', () => {
  test('reads as one status row', () => {
    const world = initialWorld({ ...freshProgress(), bricks: 9, completed: [{ wonder: 'Pyramid', date: 'd' }] })
    const row = statusSegments({ ...world, workers: { analyst: 'working', implementer: 'idle', reviewer: 'blocked' } })
    expect(textOf(row)).toBe('👑 boss  ■ analyst working  ■ implementer idle  ■ reviewer ? blocked  🧱 9/28 Pyramid · 완공 1')
    expect(row.find(s => s.text === '■ analyst')?.color).toBe('#3b6ea5')
    expect(row.find(s => s.text === ' ? blocked')?.color).toBe('#e04848')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: FAIL, because `gallery.test.ts` cannot import `./gallery`.

- [ ] **Step 3: Write the implementation** `mods/pyramid-site/hooks/gallery.ts`

```ts
import type { PyramidProgress, PyramidWorkerState, PyramidWorld } from '../types'
import { PALETTE, WORKER_NAMES, WORKER_SHIRT, toHexColor, wonderAt } from './sprites'

export type Segment = { text: string; color?: string }

export function progressLine(progress: PyramidProgress): string {
  const wonder = wonderAt(progress.wonderIndex)
  return `🧱 ${progress.bricks}/${wonder.slots.length} ${wonder.name}`
}

export function formatGallery(progress: PyramidProgress): string {
  const lines = [progressLine(progress)]
  if (progress.completed.length === 0) lines.push('No wonders completed yet.')
  else lines.push('Completed wonders:', ...progress.completed.map(done => `- ${done.wonder} — ${done.date}`))
  return lines.join('\n')
}

const STATE_TEXT: Readonly<Record<PyramidWorkerState, Segment>> = {
  idle: { text: ' idle' },
  working: { text: ' working' },
  blocked: { text: ' ? blocked', color: toHexColor(PALETTE.X!) },
  waiting: { text: ' waiting' },
}

export function statusSegments(world: PyramidWorld): Segment[] {
  const segments: Segment[] = [{ text: '👑 boss' }]
  for (const name of WORKER_NAMES) {
    segments.push({ text: '  ' }, { text: `■ ${name}`, color: toHexColor(WORKER_SHIRT[name].C!) }, STATE_TEXT[world.workers[name]])
  }
  segments.push({ text: `  ${progressLine(world.progress)} · 완공 ${world.progress.completed.length}` })
  return segments
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `85 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/gallery.ts mods/pyramid-site/hooks/gallery.test.ts
git commit -m "feat(pyramid-site): format the gallery and the status row"
```

---

### Task 12: Wiring — role gate, store load, poll, frame loop, command registration

This task replaces the no-op `register.tsx` with the module header and the whole `session.start` hook. The hooks added by Tasks 13–16 call the closures defined here through `site`. The import block already lists everything later tasks use, so they only insert hook blocks.

**Files:**
- Modify: `mods/pyramid-site/hooks/register.tsx` (full replacement)
- Test: `mods/pyramid-site/hooks/register.test.tsx` (new)

- [ ] **Step 1: Write the failing test** `mods/pyramid-site/hooks/register.test.tsx` (the shared rig plus the first four tests)

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: 3 failures in `register.test.tsx`. The worker-session test already passes, because the no-op does nothing. The no-op module never polls, registers or opens, e.g. `polls harness status at start and every 2.5 s` expects `[['harness','status']]` and receives `[]`.

- [ ] **Step 3: Replace** `mods/pyramid-site/hooks/register.tsx` **with**

```tsx
import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import { fitView, toCells } from './cells'
import type { PixelMode, View } from './cells'
import { interpretResult, parseHarnessCall } from './events'
import type { DomainEvent } from './events'
import { formatGallery, statusSegments } from './gallery'
import { drawScene } from './scene'
import type { Anim } from './scene'
import { applyCue, initialAnim, isAnimating, step } from './sim'
import { parseStatus } from './status'
import { PROGRESS_KEY, freshProgress, parseProgress } from './store'
import { apply, initialWorld } from './world'
import type { Cue } from './world'

export const PANE = 'pyramid'
export const PANE_TITLE = 'Pyramid Site'
export const RASTER_KEY = 'scene'
export const FRAME_MS = 83
export const IDLE_MS = 500
export const POLL_MS = 2500
const RUN_TIMEOUT_MS = 2000

const world = atom({ plugin: 'pyramid-site', key: 'world' } as const, initialWorld(freshProgress()))

type Site = {
  emit: (event: DomainEvent) => Promise<void>
  setPaneWanted: (paneWanted: boolean) => Promise<void>
  openPane: () => Promise<boolean>
  ensureLoop: () => Promise<void>
}

export const register: Register = (on, options) => {
  const configured = typeof options.harnessPath === 'string' ? options.harnessPath.trim() : ''
  const harness = configured === '' ? 'harness' : configured
  const mode: PixelMode = options.pixelMode === 'space' ? 'space' : 'half'

  let site: Site | undefined
  let anim: Anim = initialAnim()
  let view: View | undefined
  let loop: Timer | undefined
  let loopMs = 0
  let lastCells = ''

  const stopLoop = (): void => {
    loop?.cancel()
    loop = undefined
    loopMs = 0
  }

  on('session.start', async ($, e, next) => {
    let role: string | undefined
    try {
      role = await $.env.get('HARNESS_ROLE')
    } catch {
      role = undefined
    }
    if (role === 'worker') return next(e)

    let isTicking = false
    let isPolling = false

    const ensureLoop = async (): Promise<void> => {
      if (view === undefined) {
        stopLoop()
        return
      }
      const wanted = isAnimating(anim, await read($, world)) ? FRAME_MS : IDLE_MS
      if (loop !== undefined && loopMs === wanted) return
      stopLoop()
      loopMs = wanted
      loop = $.clock.every(wanted, () => {
        void tick()
      })
    }

    const tick = async (): Promise<void> => {
      if (isTicking) return
      isTicking = true
      try {
        const current = await read($, world)
        anim = step(anim, current)
        if (view !== undefined) {
          const cells = toCells(drawScene(current, anim), mode, view)
          if (cells !== lastCells) {
            const shown = await $.ui.blit({ requestId: PANE, key: RASTER_KEY, cells })
            if (shown.deny === undefined) lastCells = cells
            else view = undefined
          }
        }
        await ensureLoop()
      } catch {
        // a failed frame waits for the next tick
      } finally {
        isTicking = false
      }
    }

    const emit = async (event: DomainEvent): Promise<void> => {
      try {
        const now = await $.clock.now()
        const before = await read($, world)
        const preview = apply(before, event, now)
        if (preview.world === before && preview.cues.length === 0) return
        let cues: Cue[] = []
        let isProgressChanged = false
        const after = await update($, world, current => {
          const applied = apply(current, event, now)
          cues = applied.cues
          isProgressChanged = applied.world.progress !== current.progress
          return applied.world
        })
        for (const cue of cues) anim = applyCue(anim, cue)
        if (isProgressChanged) await $.store.set(PROGRESS_KEY, after.progress)
        await ensureLoop()
      } catch {
        // the poll or the next report brings the world back in line
      }
    }

    const setPaneWanted = async (paneWanted: boolean): Promise<void> => {
      const after = await update($, world, current => ({ ...current, progress: { ...current.progress, paneWanted } }))
      await $.store.set(PROGRESS_KEY, after.progress)
    }

    const openPane = async (): Promise<boolean> => {
      try {
        const opened = await $.ui.open({ id: PANE, title: PANE_TITLE, columns: 72 })
        return opened.isPlaced
      } catch {
        return false
      }
    }

    site = { emit, setPaneWanted, openPane, ensureLoop }

    try {
      const progress = parseProgress(await $.store.get(PROGRESS_KEY))
      await update($, world, () => initialWorld(progress))
    } catch {
      // keep the fresh world
    }
    try {
      await $.command.register({
        name: 'pyramid',
        description: 'Toggle the pyramid construction site pane; `/pyramid gallery` lists finished wonders',
        argumentHint: '[gallery]',
        immediate: true,
      })
    } catch {
      // the pane still opens from paneWanted
    }

    const poll = async (): Promise<void> => {
      if (isPolling) return
      isPolling = true
      try {
        const ran = await $.process.run([harness, 'status'], { timeoutMs: RUN_TIMEOUT_MS })
        if (ran.exitCode === 0) await emit({ kind: 'status', polled: parseStatus(ran.stdout) })
      } catch {
        // harness missing or slow: keep the last known states
      } finally {
        isPolling = false
      }
    }
    void poll()
    $.clock.every(POLL_MS, () => {
      void poll()
    })

    try {
      if ((await read($, world)).progress.paneWanted) await openPane()
    } catch {
      // the person can open it with /pyramid
    }
    return next(e)
  })
}
```

- [ ] **Step 4: Run tests, type-check, validate**

Run: `claude plugin test mods/pyramid-site`
Expected: `89 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.
Run: `claude plugin validate mods/pyramid-site`
Expected: `env reads: HARNESS_ROLE`, `✔ Validation passed`.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.tsx mods/pyramid-site/hooks/register.test.tsx
git commit -m "feat(pyramid-site): gate on role, load progress, poll harness and run the frame loop"
```

---

### Task 13: Wiring — Pane render with Raster and status row

**Files:**
- Modify: `mods/pyramid-site/hooks/register.tsx`: insert the block below before the final `}` that closes `register`
- Test: `mods/pyramid-site/hooks/register.test.tsx`: append the tests below

- [ ] **Step 1: Append the failing tests** to the end of `mods/pyramid-site/hooks/register.test.tsx`

```tsx
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `claude plugin test mods/pyramid-site`
Expected: 6 failures with `HooksError: $.ui.mount: no implementation for ui.render`.

- [ ] **Step 3: Insert the render hook** before the last `}` of `register` in `mods/pyramid-site/hooks/register.tsx`

```tsx
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (site === undefined) return next(e)
    const current = await read($, world)
    const segments = statusSegments(current)
    const { Box, Text } = $.ui.resolve(e)
    const row = (
      <Text wrap="truncate-end">
        {segments.map(segment => (segment.color === undefined ? segment.text : <Text color={segment.color}>{segment.text}</Text>))}
      </Text>
    )
    if (e.surface !== 'terminal') {
      view = undefined
      return (
        <Box key="pyramid-site" flexDirection="column">
          {row}
        </Box>
      )
    }
    const { Raster } = $.ui.resolve(e)
    const nextView = fitView(e.props.bodyColumns, e.props.scroll.bodyRows)
    const cells = toCells(drawScene(current, anim), mode, nextView)
    view = nextView
    lastCells = cells
    void site.ensureLoop()
    return (
      <Box key="pyramid-site" flexDirection="column">
        <Raster key={RASTER_KEY} columns={nextView.columns} rows={nextView.rows} cells={cells} />
        {row}
      </Box>
    )
  })
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `95 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.tsx mods/pyramid-site/hooks/register.test.tsx
git commit -m "feat(pyramid-site): draw the site pane as a Raster with a status row"
```

---

### Task 14: Wiring — Bash `harness ask/report` hook

**Files:**
- Modify: `mods/pyramid-site/hooks/register.tsx`: insert before the final `}` of `register`
- Test: `mods/pyramid-site/hooks/register.test.tsx`: append

- [ ] **Step 1: Append the failing tests**

```tsx
test('harness ask sets the worker working, its report lays a brick', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.answers.push(printed(REPORT))
  await $.tool.call(bash("harness ask analyst 'Read .harness/task-analyst.md and do it.'"))
  expect(await statusText(ui)).toContain('■ analyst idle')
  expect(await statusText(ui)).toContain('🧱 1/28 Pyramid')
  expect(r.store.get('progress')).toMatchObject({ bricks: 1 })
})

test('exit 2 shows the worker blocked, exit 4 waiting', async ($, on) => {
  const r = rig(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })
  r.answers.push(exited(2), exited(4))
  await $.tool.call(bash('harness ask reviewer go'))
  expect(await statusText(ui)).toContain('■ reviewer ? blocked')
  await $.tool.call(bash('harness ask implementer go'))
  expect(await statusText(ui)).toContain('■ implementer waiting')
})

test('reviewer findings crack bricks and the implementer repairs them', async ($, on) => {
  const r = rig(on, { store: { progress: { v: 1, wonderIndex: 0, bricks: 5, cracked: [], completed: [], seenReports: [], paneWanted: false } } })
  await $.session.start(START)
  r.answers.push(printed('# reviewer report\nstatus: done\n## Findings / Decisions\n- [Major] a\n- [Minor] b\n## Verification\n'))
  await $.tool.call(bash('harness report reviewer'))
  expect(r.store.get('progress')).toMatchObject({ bricks: 6, cracked: [3, 4] })
  r.answers.push(printed('# implementer report\nstatus: done\n'))
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `claude plugin test mods/pyramid-site`
Expected: 3 failures. For example, `harness ask sets the worker working…` expects the status row to contain `🧱 1/28 Pyramid` but finds `🧱 0/28`. `other Bash commands pass through untouched` already passes.

- [ ] **Step 3: Insert the hook**

```tsx
  on('tool.call', async (_$, e, next) => {
    if (site === undefined || e.tool !== 'Bash') return next(e)
    const call = parseHarnessCall(e.command)
    if (call === undefined) return next(e)
    if (call.verb === 'ask') await site.emit({ kind: 'ask', worker: call.worker })
    const result = await next(e)
    const event = interpretResult(call, result)
    if (event !== undefined) await site.emit(event)
    return result
  })
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `99 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.tsx mods/pyramid-site/hooks/register.test.tsx
git commit -m "feat(pyramid-site): crack the whip on harness ask and lay a brick per report"
```

---

### Task 15: Wiring — prompt caravan

**Files:**
- Modify: `mods/pyramid-site/hooks/register.tsx`: insert before the final `}` of `register`
- Test: `mods/pyramid-site/hooks/register.test.tsx`: append

- [ ] **Step 1: Append the failing test**

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `claude plugin test mods/pyramid-site`
Expected: 1 failure. `expect(sawCamel).toBe(true)` receives `false`.

- [ ] **Step 3: Insert the hook**

```tsx
  on('prompt.submit', async (_$, e, next) => {
    const result = await next(e)
    if (site !== undefined && e.origin.kind === 'composer' && e.command === undefined && e.isMeta !== true) {
      await site.emit({ kind: 'caravan' })
    }
    return result
  })
```

- [ ] **Step 4: Run tests and type-check**

Run: `claude plugin test mods/pyramid-site`
Expected: `100 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.tsx mods/pyramid-site/hooks/register.test.tsx
git commit -m "feat(pyramid-site): send a camel caravan for every prompt"
```

---

### Task 16: Wiring — `/pyramid`, `/pyramid gallery` and the person's close

**Files:**
- Modify: `mods/pyramid-site/hooks/register.tsx`: insert both blocks before the final `}` of `register`
- Test: `mods/pyramid-site/hooks/register.test.tsx`: append

- [ ] **Step 1: Append the failing tests**

```tsx
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `claude plugin test mods/pyramid-site`
Expected: 2 failures with `no implementation for command.run`.

- [ ] **Step 3: Insert the command hook and the close hook**

```tsx
  on('command.run', { command: 'pyramid' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, world)
    if (arg === 'gallery') return { text: formatGallery(current.progress) }
    if (arg !== '') return { text: 'Usage: /pyramid [gallery]' }
    if (site === undefined) return { text: 'The pyramid site only runs in the conductor session.' }
    if (current.progress.paneWanted) {
      await site.setPaneWanted(false)
      view = undefined
      stopLoop()
      try {
        await $.ui.close({ id: PANE })
      } catch {
        // already closed
      }
      return { text: 'Pyramid site closed.' }
    }
    await site.setPaneWanted(true)
    const isPlaced = await site.openPane()
    return { text: isPlaced ? 'Pyramid site opened.' : 'Pyramid site opens as soon as the terminal has room.' }
  })
  on('ui.close', { id: PANE }, async (_$, e, next) => {
    const result = await next(e)
    view = undefined
    stopLoop()
    if (e.origin.kind === 'person' && site !== undefined) {
      try {
        await site.setPaneWanted(false)
      } catch {
        // the next /pyramid fixes paneWanted
      }
    }
    return result
  })
```

- [ ] **Step 4: Run tests, type-check, validate**

Run: `claude plugin test mods/pyramid-site`
Expected: `102 pass`, `0 fail`.
Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.
Run: `claude plugin validate mods/pyramid-site`
Expected:
- `hooks: session.start, ui.render{component=Pane, requestId=pyramid}, tool.call, prompt.submit, command.run{command=pyramid}, ui.close{id=pyramid}`
- `answers its own command: command.run{command=pyramid}`
- `✔ Validation passed`

The `gating hook without .catch` lines for `tool.call`, `prompt.submit` and `ui.close` are intended. A failing hook is skipped and the call goes on, which is what an observer wants.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.tsx mods/pyramid-site/hooks/register.test.tsx
git commit -m "feat(pyramid-site): toggle the pane with /pyramid and list wonders with /pyramid gallery"
```

---

### Task 17: End-to-end integration test and live check

**Files:**
- Test: `mods/pyramid-site/hooks/register.test.tsx`: append

- [ ] **Step 1: Append the end-to-end test**

```tsx
test('a day on site: reports finish the pyramid and the gallery records it', async ($, on) => {
  const r = rig(on, {
    now: new Date(2026, 9, 16, 15, 0, 0).getTime(),
    store: { progress: { v: 1, wonderIndex: 0, bricks: 25, cracked: [], completed: [], seenReports: [], paneWanted: false } },
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...MOUNT, props: PANE_PROPS })

  r.answers.push(printed('# analyst report — a\nstatus: done\n'))
  await $.tool.call(bash("harness ask analyst 'look'"))
  r.answers.push(printed('# reviewer report — b\nstatus: done\n## Findings / Decisions\n- [Minor] x.ts:1 — nit\n## Verification\n'))
  await $.tool.call(bash("harness ask reviewer 'review'"))
  expect(r.store.get('progress')).toMatchObject({ bricks: 27, cracked: [25] })

  r.answers.push(printed('# implementer report — c\nstatus: done\n'))
  await $.tool.call(bash("harness ask implementer 'fix'"))
  expect(r.store.get('progress')).toMatchObject({ wonderIndex: 1, bricks: 0, cracked: [], completed: [{ wonder: 'Pyramid', date: '2026-10-16' }] })
  expect(await statusText(ui)).toContain('🧱 0/22 Obelisk · 완공 1')

  r.answers.push(printed('# implementer report — c\nstatus: done\n'))
  await $.tool.call(bash('harness report implementer'))
  expect(r.store.get('progress')).toMatchObject({ bricks: 0 })

  await r.clock.advance(83 * 40)
  expect((await $.command.run(command('gallery'))).text).toBe('🧱 0/22 Obelisk\nCompleted wonders:\n- Pyramid — 2026-10-16')
})
```

- [ ] **Step 2: Run the whole suite**

Run: `claude plugin test mods/pyramid-site`
Expected: `103 pass`, `0 fail`. The test passes immediately because it exercises Tasks 12–16 together; it is a regression guard.

If it fails, the bug is in a wiring task. Fix it there, rerun, and include the fix in this commit.

- [ ] **Step 3: Full static checks**

Run: `npx -y -p typescript@5.6.3 tsc -p mods/pyramid-site`
Expected: no output.
Run: `claude plugin validate mods/pyramid-site`
Expected: `✔ Validation passed`.

- [ ] **Step 4: Live check in a herdr conductor session** (manual; record what you saw in the commit body)

```bash
claude --plugin-dir mods/pyramid-site
```

1. Type `/pyramid`. A pane titled "Pyramid Site" docks (fullscreen ≥ 110 cols) or opens inline. It shows sky, sun, pyramid outline, overseer and three sitting workers, with the status row underneath.
2. Run `harness ask analyst 'say hi and write your report'` as the conductor. The whip cracks, the analyst walks bricks, and on the report one brick flashes and `🧱 1/28` shows.
3. Type any prompt. A camel walks in from the right, hands a scroll to the overseer and walks out.
4. Narrow the terminal below 72 columns. The left sky is cropped and the pyramid stays visible.
5. Set `/config` → pyramid-site → **pixel mode** to `space` and restart. The scene draws as coloured spaces, with the same size.
6. `/pyramid` closes the pane. Restart; it stays closed. `/pyramid` again, restart; it reopens.
7. `/pyramid gallery` prints the progress line.
8. Watch CPU (Activity Monitor) for 30 s with everyone idle (2 fps) and with one worker working (12 fps). Note both numbers.

- [ ] **Step 5: Commit**

```bash
git add mods/pyramid-site/hooks/register.test.tsx
git commit -m "test(pyramid-site): cover a full day on site end to end"
```

---

### Task 18: Marketplace entry and README

**Files:**
- Modify: `.claude-plugin/marketplace.json` (add a second entry to `plugins`)
- Modify: `README.md` (mods table row, install line, a `### pyramid-site` section)

- [ ] **Step 1: Add the marketplace entry.** `.claude-plugin/marketplace.json` becomes:

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
    },
    {
      "name": "pyramid-site",
      "source": "./mods/pyramid-site",
      "description": "A pixel-art pyramid construction site in a side pane, built one brick per harness report."
    }
  ]
}
```

- [ ] **Step 2: Update `README.md`.** In the mods table, add a row under kaomoji-status:

```markdown
| [pyramid-site](mods/pyramid-site) | An animated pixel-art pyramid site in a side pane: the conductor cracks the whip, workers carry bricks. |
```

Under `## Install`, below the kaomoji-status code block, add:

````markdown
```
/plugin install pyramid-site --marketplace geonhos/claude-code-mod
```
````

After the `### kaomoji-status` section (before `## Local development`), add:

```markdown
### pyramid-site

A construction site in a side pane, drawn as half-block pixel art (72×18 cells):

- The overseer (the conductor) cracks a whip on every `harness ask <worker>`; that worker starts carrying bricks.
- Every worker report lays one brick. A reviewer report with findings cracks up to three recent bricks; the next
  implementer report repairs them. A clean review flashes the building gold.
- Blocked workers (exit 2) drop their brick under a red `?`; exit 4 makes them wait.
- Every prompt you type sends a camel caravan with a scroll for the overseer.
- Wonders: Pyramid (28) → Obelisk (22) → Sphinx (28) → Great Pyramid (45), kept across sessions.

Commands: `/pyramid` toggles the pane (it reopens next session if you left it open); `/pyramid gallery` lists finished
wonders with dates. Only the conductor session draws (`HARNESS_ROLE=worker` sessions stay quiet).

Settings in `/config` → pyramid-site: **harness path** (as kaomoji-status) and **pixel mode**: `half` (default, `▀`
glyphs) or `space` (coloured spaces) for terminals that draw block glyphs double width, e.g. iTerm2 or Terminal.app
with "ambiguous characters are double-width" turned on. Restart Claude Code after a change: the poll and the
animation start at session start.
```

In `## Local development`, add one line after the kaomoji-status `tsc` line:

```bash
claude plugin test mods/pyramid-site && claude plugin validate mods/pyramid-site
```

- [ ] **Step 3: Validate the marketplace and the mod**

Run: `claude plugin validate .`
Expected: `✔ Validation passed`, listing both plugins.
Run: `claude plugin validate mods/pyramid-site && claude plugin test mods/pyramid-site`
Expected: `✔ Validation passed`, then `103 pass`, `0 fail`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json README.md
git commit -m "docs: document pyramid-site install, commands and pixel mode"
```

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| One Raster 72×18 from a 72×36 buffer | 3 (`toWords`), 4 (`drawScene`), 13 (render) |
| `half` = `▀` fg upper / bg lower; `space` = sampled 36×18, 2 cells per pixel, same size, `pixelMode` | 3, 1 (userConfig), 12 (`mode`) |
| Only width-1 glyphs inside the Raster | 3 (`UPPER_HALF`/`SPACE` only) |
| Status row under the Raster, single-code-point emoji only | 11 (`statusSegments`), 13 |
| Crop `x0 = max(0, 72 − bodyColumns)`, crop sky rows when `bodyRows < 19` | 3 (`fitView`), 13 (narrow test) |
| Non-terminal surfaces get a Text-only fallback | 13 (other surfaces test) |
| 12 fps loop, blit only on change, 2 fps idle, stop on close / denied blit; animation outside state | 12 (`ensureLoop`/`tick`), 13 (loop tests), 16 (`ui.close`) |
| Scene: sky gradient, clouds, sun, dunes, speckled ground at y = 30 | 4 |
| Overseer 9×14 at x = 1, whip rest → raise → crack with spark | 2, 4, 9 (`WHIP_TICKS`) |
| Workers 7×12, shirt per worker, homes 11/18/25; idle sit + zzz; working shuttle carrying; blocked dropped brick + blinking `?`; waiting stand still | 2, 4, 9 |
| Caravan enters right, walks to the overseer, hands the scroll ~1 s, walks out, queues ≤ 1 more | 4, 9, 15 |
| Wonder: bottom-up left-to-right slots, faint outlines, flash, cracks, gold flash, gold capstone ~3 s then next | 2, 4, 8, 9 |
| Four wonders inside x 36–71, y 2–29; walk target = left foot − sprite width | 2 |
| Only the conductor draws (`HARNESS_ROLE`) | 12 (worker test) |
| Bash detection regex, whip + working before `next` | 7, 14 |
| Exit parsing and event mapping after `next` | 7, 14 |
| `prompt.submit` composer / no command / not meta → caravan | 15 |
| `harness status` poll every 2.5 s reconciles, never adds bricks | 6, 8, 12, 13 |
| Hooks never deny, return `next(e)` unchanged, state writes in try/catch | 12–16 (`emit` catches; hooks return `result`) |
| Report → +1 brick, deduped by hash (last 20) | 5, 8 |
| Reviewer findings count, blocked = no verdict, 0 → gold, n → crack min(3, n) | 5, 8 |
| Implementer repairs all cracks, then adds its brick | 8, 14 |
| Completion appends `{wonder, date}`, next wonder at 0 | 8, 17 |
| `$.store` `progress` with `v`, `wonderIndex`, `bricks`, `cracked`, `completed`, `seenReports`, `paneWanted`; validate or fresh | 10, 12 |
| `/pyramid` toggles and remembers `paneWanted`; reopen at start | 12, 16 |
| `/pyramid gallery` lists wonders with dates plus progress | 11, 16 |
| Module layout and conventions as kaomoji-status | 1 (+ `statusSegments` in gallery.ts, `Anim` in scene.ts: decisions 3) |
| Tests: pure units, integration via `claude plugin test`, validate, tsc | 2–17 |
| Marketplace entry and README (install, `/pyramid`, `pixelMode`) | 18 |

The placeholder scan found no TBD or TODO entries; every code step holds complete code.

The names were checked across tasks: `apply`, `initialWorld`, `Cue`, `DomainEvent`, `Anim`, `applyCue`, `step`, `isAnimating`, `toCells`, `fitView`, `decodeCells`, `parseProgress`, `freshProgress`, `PROGRESS_KEY`, `formatGallery`, `statusSegments`, `parseStatus`, `parseHarnessCall`, `interpretResult`, `walkTarget`, `wonderAt`.

All code in this plan was run in a scratch copy against CLI 2.1.301:
- After Tasks 12, 13, 14, 15 and 16, the suite stood at 89, 95, 99, 100 and 102 passing tests; with Task 17 it reached 103.
- `tsc` was clean.
- `claude plugin validate` passed.
