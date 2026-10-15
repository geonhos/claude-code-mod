# kaomoji-status: dancing worker faces above the prompt

Date: 2026-10-13
Repo: `geonhos/claude-code-mod` (one repo, many mods)

## Goal

Show each harness worker (analyst, implementer, reviewer, …) as a cute kaomoji
in a single coloured row above the Claude Code prompt. Faces dance while a worker
is busy, so the conductor can see at a glance who is working and who needs help.

```
analyst (｡-ω-)zzZ  implementer ᕕ( ᐛ )ᕗ  reviewer (⊙_⊙)? 도와줘요!
────────────────────────────────────────────
❯
```

## Repository layout

```
claude-code-mod/
  .claude-plugin/marketplace.json     # lists every mod: { name, source: "./mods/<name>" }
  README.md                           # mod list + install: /plugin install <mod> --marketplace geonhos/claude-code-mod
  mods/
    kaomoji-status/
      .claude-plugin/plugin.json      # name, version 0.1.0, description, "types": "./types/index.d.ts"
      hooks/hooks.json                # { "modules": ["./register.tsx"] }
      hooks/register.tsx              # thin wiring: timers, process, render hook
      hooks/faces.ts                  # pure logic (parse, frames, row model)
      hooks/faces.test.ts             # unit tests
      types/index.d.ts                # PluginState contract for the mod's atoms
```

Later mods go in `mods/<name>/` and get one entry in `marketplace.json`.
Local development: `claude --plugin-dir mods/kaomoji-status` (hot-reloads on save).

## Behaviour

### Faces

| state     | frames (cycled)                                                        | colour      | frame period |
|-----------|------------------------------------------------------------------------|-------------|--------------|
| idle      | `(｡-ω-)zzZ` / `(｡-ω-)zZ`                                               | dim grey    | static when all idle, else 1 s |
| working   | `(ง •̀_•́)ง` → `ᕕ( ᐛ )ᕗ` → `└( ･ω･)┐` → `┌(･ω･ )┘`                       | yellow      | 250 ms |
| blocked   | `(⊙_⊙)? 도와줘요!` / `(⊙_⊙)! 도와줘요!`                                  | pink / red, bold | 500 ms |
| other     | `(・_・) <state>`                                                       | dim grey    | static |

Each entry is `<worker name> <face>`, entries separated by two spaces.

### Data flow

1. `session.start`: start a **poll timer** (`$.clock.every(2500, …)`) that runs
   `$.process.run(['harness', 'status'], { timeoutMs: 2000 })`. Skip a tick if
   the previous run is still in flight.
2. Parse stdout (`<name> <state> <pane>` per line, whitespace-separated) into
   `Worker[] = { name, state }` and write the `workers` atom.
3. A **frame timer** (`$.clock.every(250, …)`) increments the `frame` atom. It runs
   only while some worker is `working` or `blocked`; when a poll finds every
   worker idle (or none), the timer is cancelled and the row is drawn static.
   It restarts on the next poll that sees activity.
4. `ui.render` on `{ component: 'AbovePrompt' }`: read `workers` and `frame`,
   build the row with `faces.ts`, draw with `Box`/`Text` from `$.ui.resolve(e)`.
   The render hook never writes state.

### Layout and fallbacks

- Yield (`return next(e)`) when `e.props.hasSurvey`, when there are no workers,
  or when `harness` failed.
- If the row is wider than `e.props.bodyColumns`, shorten names to their first
  letter (`A (｡-ω-)zzZ`); if still too wide, drop names entirely.
- `harness` missing, non-zero exit, timeout or empty output → `workers = []`,
  row hidden, no error shown. If a bare `harness` is not found on PATH, an
  optional `userConfig` option `harnessPath` supplies an absolute path.

## Units

- `faces.ts` (pure, no `$`):
  - `parseStatus(stdout: string): Worker[]`
  - `faceFor(state: string, frame: number): { text: string; color: string; bold?: boolean }`
  - `isActive(workers: Worker[]): boolean`
  - `buildRow(workers: Worker[], frame: number, columns: number): Segment[]`
- `register.tsx`: timers, process call, atoms, render hook. No logic beyond wiring.

## Testing

- `faces.test.ts` via `claude plugin test mods/kaomoji-status`:
  parse (normal, blank lines, unknown state, garbage), frame cycling per state,
  `isActive`, width shortening at several column counts.
- `claude plugin validate mods/kaomoji-status` and `tsc -p mods/kaomoji-status`.
- Manual: run with `--plugin-dir`, send a worker a task, watch it dance; check
  CPU while dancing and that the timer stops when all workers are idle.

## Out of scope (for now)

Elapsed time, last task name, toast on blocked, status-line summary, sound.
