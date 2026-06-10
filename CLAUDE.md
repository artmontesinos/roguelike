# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Project Overview

**Darkhollow Depths** — a dark-fantasy, top-down roguelike dungeon crawler that
runs entirely in the browser. Turn-based movement and combat, procedurally
generated levels, loot/inventory/crafting, permadeath, and automatic
`localStorage` persistence. The goal: descend 8 depths and slay the dragon boss
("The Pale Wyrm") to claim the Crown of the Forsaken King.

Rendering is a 2D canvas: programmatically shaded stone tiles (no image assets)
with emoji glyphs for all entities, plus torchlight falloff, fog of war, and a
vignette for the D&D-dark aesthetic.

## Tech Stack

- **Language**: vanilla JavaScript (ES modules, `"type": "module"`), no TypeScript
- **Build/dev server**: Vite 5 (the only dependency; dev-only)
- **No runtime dependencies, no framework** — DOM panels are rebuilt via
  `innerHTML` templates; the dungeon view is a hand-rolled canvas renderer
- **Persistence**: `localStorage` (save game + run records)
- **Tests**: headless smoke tests in Node (`npm test`) — no test framework

## Commands

```bash
npm install
npm run dev      # vite dev server (also: npm start)
npm run build    # production build -> dist/
npm run preview  # serve the production build
npm test         # node scripts/smoke.js — headless logic tests
```

## Repository Structure

```
.
├── index.html          # Page shell: stats panel, canvas + overlay, inventory/
│                        # crafting panel, message log, touch d-pad
├── src/
│   ├── main.js          # Bootstrap: input wiring (keys, clicks, d-pad),
│   │                     #   overlay/title screen, save-after-action loop
│   ├── game.js          # `Game` class: ALL game state & turn logic (DOM-free)
│   ├── dungeon.js       # Procedural level generator (rooms + L corridors)
│   ├── data.js          # ALL tuning data: ITEMS, MONSTERS, RECIPES,
│   │                     #   LOOT_TABLE, depth names, constants
│   ├── fov.js           # Bresenham line-of-sight + visible-tile set
│   ├── rng.js           # `Rand`: seedable mulberry32 PRNG (serializable state)
│   ├── render.js        # Canvas renderer: tiles, lighting, glyphs, vignette
│   ├── ui.js            # DOM panels: stats, inventory, crafting, log
│   ├── save.js          # localStorage save/load/clear + run records
│   └── styles.css       # Dark medieval theme (Cinzel / IM Fell English fonts)
├── scripts/
│   └── smoke.js         # Headless tests: connectivity, combat, crafting, saves
└── .gitpod.yml          # Gitpod: install + build, then dev server
```

## Architecture

The key boundary: **`game.js` (plus `dungeon.js`, `fov.js`, `rng.js`,
`data.js`) is completely DOM-free** and runs in plain Node — this is what makes
`npm test` possible. Keep it that way: anything touching `document`, `canvas`,
or `localStorage` belongs in `main.js`, `ui.js`, `render.js`, or `save.js`.

### Turn loop
Input arrives in `main.js`, which calls a `Game` method (`tryMove`, `useItem`,
`craft`, `descend`). Methods that spend a turn call `endTurn()` internally
(regen tick → monsters act → recompute FOV) and return `true`; `main.js` then
runs `afterAction()` → redraw, update panels, and either auto-save (still
playing) or finalize the run (clear save, update records, show overlay).

### `Game` (src/game.js)
- Player state: `hp/maxHp`, `level/xp`, `gold`, `weapon`/`armor` (equipped item
  ids), `inv` (itemId → count map)
- Level state: `tiles` (array of row strings, indexed `tiles[y][x]`, `'#'` =
  wall), `monsters[]`, `items[]` (ground loot; `{id,x,y}` or `{gold,x,y}`),
  `stairs`, `explored` grid, `visible` Set (recomputed, never saved)
- `status`: `'playing' | 'dead' | 'won'` — won by picking up the `crown` item
  dropped by the boss
- Combat: bump-to-attack; damage = `max(1, atk + d(0..2) − def)`, 10% crit ×2.
  Player attack/defense derive from level + equipped gear (`playerAtk`/`playerDef`)
- Monster AI: wakes on line of sight within `FOV_RADIUS`, then greedily steps
  4-directionally toward the player; attacks when orthogonally adjacent
- `serialize()` / `Game.fromSave()` must stay lossless — there's a round-trip
  smoke test that will catch drift. Bump `SAVE_VERSION` on any breaking shape
  change (old saves are silently discarded by `save.js`)

### Data-driven design (src/data.js)
All balance/content lives in `data.js` — new monsters, items, recipes, and
loot weights go there, not in logic files:
- `ITEMS`: `kind` drives behavior — `potion`/`food` (heal, consumed),
  `weapon` (`atk`), `armor` (`def`), `material` (crafting only), `quest`
- `MONSTERS`: stats, `minDepth` (spawns from `minDepth` to `minDepth + 3`,
  scaling with depth in `dungeon.js`), `drops` (chance-rolled materials),
  `goldChance`; the dragon has `boss: true`
- `RECIPES`: `needs` (itemId → count) → one `out` item
- `LOOT_TABLE`: weighted floor loot, optional `minDepth` gates

### Generation (src/dungeon.js)
Scatters non-overlapping rooms, links consecutive rooms with L-shaped
corridors (this guarantees connectivity — preserve that invariant), places
stairs in the room farthest from the start (or the dragon on depth
`MAX_DEPTH`), then spawns monsters and loot away from the start.

### Persistence (src/save.js)
- `darkhollow-save`: full serialized game, written after every action; cleared
  on death/victory (permadeath). Only `status === 'playing'` saves are resumed.
- `darkhollow-records`: `{runs, wins, bestDepth}` across all runs.

## Testing & Verification

- `npm test` runs `scripts/smoke.js`: level connectivity across seeds and all
  depths (BFS), combat kills, crafting consume/produce, equip effects, potion
  use, save round-trip, descend. **Run it after any logic change**, and extend
  it when adding mechanics.
- There is no browser automation; verify UI/rendering changes with
  `npm run dev` manually, and at minimum confirm `npm run build` succeeds.

## Code Style Conventions

- **3-space indentation** (consistent across all files)
- ES module `import`/`export`; classes for stateful things (`Game`, `Rand`),
  plain functions for helpers
- JSDoc `/** ... */` comments on non-obvious functions, documenting
  `@param`/`@return`
- Coordinates: `tiles[y][x]` (row strings); entity positions are `{x, y}`;
  visibility keys are `"x,y"` strings
- All randomness in game logic must go through the game's seeded `Rand`
  instance (`this.rng`) so saves stay deterministic — `Math.random()` is only
  acceptable for picking a new run's seed in `main.js`

## Things to Watch Out For

- Don't introduce DOM/localStorage references into `game.js`, `dungeon.js`,
  `fov.js`, `rng.js`, or `data.js` — it will break `npm test`.
- The save format round-trip test (`serialize` → `fromSave` → `serialize`
  deep-equal) means new `Game` state fields must be added to **both**
  `serialize()` and `fromSave()`.
- `dist/`, `node_modules/`, `.cache/` are gitignored; never commit them.
- The repo is GPL-3.0 (`LICENSE` + `package.json` agree).
