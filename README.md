# claude-code-mod

Mods for [Claude Code](https://claude.com/claude-code): function-hook plugins, one per folder under `mods/`.

## Mods

| mod | what it does |
|-----|--------------|
| [kaomoji-status](mods/kaomoji-status) | One row of dancing kaomoji above the prompt, one per harness worker. |

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

- idle: grey, slowly snoring (a `done` worker shows the same as idle); working: yellow, dancing; blocked: pink-red, asking for help.
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

## License

MIT, see [LICENSE](LICENSE).
