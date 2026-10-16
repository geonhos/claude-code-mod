# pyramid-site — design

A Claude Code mod that turns the harness conductor/worker loop into an animated pixel-art construction site in a side pane.
Visual reference (interactive mock): `.harness/pyramid-preview.html`. API facts and citations: `.harness/analyst-pyramid-feasibility.md`.

## Goal

While the conductor delegates work, a pane shows:

- an **overseer** (the conductor) cracking a whip each time `harness ask <worker>` is sent,
- three **workers** (analyst, implementer, reviewer) who sit, carry bricks, or stand blocked according to their real state,
- a **wonder** (pyramid first) that grows one brick per worker report and persists across sessions,
- a **camel caravan** that delivers a scroll to the overseer whenever the user submits a prompt,
- **cracks** in bricks when the reviewer reports findings, repaired by the next implementer report.

Out of scope for v1: sound, day/night, strike animation, brick log, achievements.

## Rendering

- One engine `Raster` (terminal surface) of **72 columns × 18 rows**, drawn from a **72×36 pixel** buffer.
- Default mode `half`: every cell is `▀` (U+2580), fg = upper pixel, bg = lower pixel.
- Mode `space` (userConfig `pixelMode`): every cell is a space with a bg colour; the 72×36 buffer is sampled to 36×18 pixels and each pixel is 2 cells wide. Same 72×18 cell size. For terminals that render ambiguous-width block glyphs as double width.
- Only width-1 glyphs (`▀`, space) go into the Raster, so the scene cannot misalign. No emoji, kaomoji, box drawing or combining characters inside it.
- Under the Raster: one plain `Text` status row, e.g. `👑 boss 채찍질! ■ analyst working 01:14 ■ implementer idle ■ reviewer ? blocked 🧱 9/28 · 완공 1`. Emoji used there are limited to single-code-point Emoji_Presentation emoji (🧱 👑 🐪); no VS16, no ZWJ.
- Narrow pane: if `bodyColumns < 72`, crop a horizontal window `x0 = max(0, 72 - bodyColumns)` (left sky goes first). If `bodyRows < 19`, crop sky rows from the top, never the ground.
- Non-terminal surfaces: Text-only fallback (the status row).
- Animation: 12 fps `$.clock.every(83)` loop pushes frames with `$.ui.blit`; it only blits when the frame changed, only runs while something animates (working worker, whip, caravan, flash, completion), drops to a 2 fps idle tick (clouds, zzz) otherwise, and stops when the pane is closed or blit is denied. Slow model state lives in `$.state` atoms and triggers re-render; animation frames never go through state.

## Scene

Palette and sprites follow the preview: sky gradient, blocky clouds, sun, dunes, speckled sand ground (ground row y=30).

| Actor | Sprite | Behaviour |
|---|---|---|
| Overseer | 9×14 pharaoh (gold/blue headdress), x=1 | whip phases rest → raise → crack (with spark) for ~10 ticks after each `harness ask` |
| Workers | 7×12, yellow hard hat, shirt colour per worker (analyst blue, implementer green, reviewer purple); homes x = 11, 18, 25 | `idle`: walk home, then sit with floating zzz. `working`: shuttle home ↔ the wonder's left foot, carrying a brick on the way out. `blocked`: stand, dropped brick beside, blinking red `?`. `waiting` (exit 4): stand still, no brick, no `?` |
| Caravan | camel (~12×10) carrying a scroll | enters from the right edge on each user prompt, walks to the overseer, hands over the scroll (scroll shown over the overseer for ~1 s), walks back out. A second prompt during a trip queues at most one more trip |
| Wonder | 4×2-px bricks in slots, built bottom-up, left-to-right | built bricks are sandstone; unbuilt slots are faint outlines; newest brick flashes; cracked bricks show a dark diagonal crack; gold flash = all built bricks gold for ~1 s; completion = gold capstone for ~3 s, then next wonder |

Wonders (cycle back to the first after the last, keeping the completed list):

1. **Pyramid**: 7 layers, 28 bricks (as in the preview).
2. **Obelisk**: narrow column with a pointed cap, about 20–24 bricks.
3. **Sphinx**: low body with a raised head, about 28–34 bricks.
4. **Great Pyramid**: 9 layers, 45 bricks.

Every wonder must fit x ∈ [36, 71], y ∈ [2, 29]. The workers' walk target is the wonder's left foot minus the sprite width, so they never overlap it.

## Events

Only the conductor session draws: when `HARNESS_ROLE === 'worker'` the mod registers nothing visible.

| Source | Detection | Domain event |
|---|---|---|
| `tool.call` Bash, before `next` | command matches `/(?:^|[;&|(]\s*|\s)harness\s+(ask|report)\s+(analyst|implementer|reviewer)\b/` with verb `ask` | `whip` + worker `working` |
| `tool.call` Bash, after `await next(e)` | exit = 0 on success, else parse `^Exit code (\d+)` from `text` | ask/report exit 0 with a report → `report{worker, text}`; ask exit 2 → `blocked`; ask exit 4 → `waiting`; ask exit 3 / report exit 3 → `idle` |
| `prompt.submit` | `origin.kind === 'composer'`, no `command`, not `isMeta` | `caravan` |
| `harness status` poll every 2.5 s | parse lines `%-12s %-8s pane` | reconcile worker states (idle/working/blocked); never adds bricks |

Hooks never deny and always return `next(e)`'s result unchanged; state writes are wrapped in try/catch.

## World rules (pure reducer)

- `report` from any worker: +1 brick, unless that report text was already counted (dedupe by a hash of the report, stored).
- `report` from **reviewer**: count findings = lines inside `## Findings…` (until the next `## `) matching `/^\s*-\s*\[(Critical|Major|Important|Minor)\]/i`.
  If `status: blocked`, no verdict (brick only). n = 0 → gold flash. n ≥ 1 → crack the `min(3, n)` most recent uncracked built bricks.
- `report` from **implementer** while cracks exist: repair all cracks first, then add its brick.
- Bricks reaching the wonder's total → completion: append `{ wonder, date: YYYY-MM-DD }` to the completed list, start the next wonder at 0 bricks.
- Worker becomes `idle` after its report.

## Persistence

`$.store` key `progress`: `{ v: 1, wonderIndex, bricks, cracked: number[], completed: {wonder, date}[], seenReports: string[] (last 20 hashes), paneWanted: boolean }`. Validate on read and fall back to a fresh state on any mismatch.

## Commands

- `/pyramid`: toggle the pane (`$.ui.open({ id: 'pyramid', title: 'Pyramid Site', columns: 72 })` / `$.ui.close`) and remember `paneWanted`. At session start, reopen when `paneWanted` is true.
- `/pyramid gallery`: text list of completed wonders with dates plus current progress (`🧱 9/28 Pyramid`).

## Module layout (`mods/pyramid-site/`)

Same conventions as `mods/kaomoji-status` (manifest with `types` and `userConfig.harnessPath`, strict tsconfig, tests next to the modules).

| file | responsibility |
|---|---|
| `hooks/register.tsx` | wiring only: role gate, store load, status poll, animation timers, Bash/prompt/command/render hooks |
| `hooks/events.ts` | parse harness command, exit code, map to domain events |
| `hooks/reports.ts` | `countFindings`, `reportStatus`, `reportId` |
| `hooks/status.ts` | parse `harness status` |
| `hooks/world.ts` | pure domain reducer (bricks, cracks, flashes, wonders, completion) |
| `hooks/sim.ts` | pure 12 fps animation reducer (walking, whip, caravan, timers), `isAnimating` |
| `hooks/sprites.ts` | palette, sprites, wonder slot layouts (data only) |
| `hooks/scene.ts` | `drawScene(world, anim) → 72×36 pixel buffer` |
| `hooks/cells.ts` | pixels → Raster cells (half/space, crop window), base64 encoder |
| `hooks/store.ts` | load/save/validate progress |
| `hooks/gallery.ts` | format `/pyramid gallery` text |
| `types/index.d.ts` | `PluginState['pyramid-site']` contract |

## Testing

- Pure unit tests for events, reports, status, world, sim, sprites (every row same width, glyphs in palette, wonder slots inside bounds and non-overlapping), scene (golden spots: overseer pixel, brick colour), cells (decode round-trip, `▀` vs space, crop sizes).
- Integration tests with `claude plugin test`: fake Bash results drive whip/brick/blocked; fake prompt drives caravan; pane mount returns a Raster 72×18; blits captured; gallery command text.
- `claude plugin validate`, `tsc -p mods/pyramid-site`.

## Repo

- Add the marketplace entry in `.claude-plugin/marketplace.json` and a README section (install, `/pyramid`, `pixelMode`).
