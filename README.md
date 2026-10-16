# claude-code-mod

Mods for [Claude Code](https://claude.com/claude-code): function-hook plugins, one per folder under `mods/`.

## Mods

| mod | what it does |
|-----|--------------|
| [kaomoji-status](mods/kaomoji-status) | One row of dancing kaomoji above the prompt, one per harness worker. |
| [pyramid-site](mods/pyramid-site) | An animated pixel-art pyramid site in a side pane: the conductor cracks the whip, workers carry bricks. |

## Install

Type at the prompt of a terminal Claude Code session:

```
/plugin install kaomoji-status --marketplace geonhos/claude-code-mod
```

```
/plugin install pyramid-site --marketplace geonhos/claude-code-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

### kaomoji-status

Shows each `harness` (herdr) worker as a kaomoji in one row above the prompt:

```
analyst (｡-ω-)zzZ  implementer ᕕ( ᐛ )ᕗ  reviewer (⊙_⊙)? 도와줘요!
```

- idle: grey, slowly snoring (a `done` worker shows the same as idle); working: yellow, dancing; blocked: pink-red, asking for help.
- Polls `harness status` every 2.5 s. If `harness` is not on Claude Code's PATH, set the absolute path in
  `/config` → kaomoji-status → **harness path**, then restart Claude Code (a config change reloads the mod, and its poll timer starts only at session start).
- The row hides itself when harness is missing or no worker is live.

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
with "ambiguous characters are double-width" turned on. A change applies the next time the mod is used; no restart is needed.

The pane polls `harness status` only while it is open. Bricks come from the worker's report file
(`.harness/reports/<worker>.md`) after a `harness ask` or `harness report`, never from the command's screen output.
Progress is one record shared by every conductor session: two sessions running at once overwrite each other (last write wins).

## Local development

```bash
claude --plugin-dir mods/kaomoji-status        # hot-reloads on save
claude plugin test mods/kaomoji-status         # unit + wiring tests
claude plugin validate mods/kaomoji-status     # manifest, hooks, state contract
npx -y -p typescript@5.6.3 tsc -p mods/kaomoji-status
claude plugin test mods/pyramid-site && claude plugin validate mods/pyramid-site
```

`tsc` needs the engine declarations in `mods/<mod>/.claude-plugin/types/` (gitignored). An interactive
`claude --plugin-dir mods/<mod>` session writes them. You can also copy `plugin-authoring/types/claude-code.d.ts` from the
bundled skills folder to `mods/<mod>/.claude-plugin/types/claude-code/index.d.ts`.

Add a new mod as `mods/<name>/` and give it one entry in `.claude-plugin/marketplace.json`.

## License

MIT, see [LICENSE](LICENSE).
