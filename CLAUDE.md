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

On victory (claiming the crown), a special-effects transition shatters the 2D
view and reveals a 3D epilogue: a Three.js scene in the same dark-fantasy
palette, hinting that Darkhollow was only the first layer of something far
larger.

## Tech Stack

- **Language**: vanilla JavaScript (ES modules, `"type": "module"`), no TypeScript
- **Build/dev server**: Vite 5
- **Runtime dependency**: `three` — used **only** by `src/epilogue.js`, the
  post-victory 3D scene, and lazy-loaded via dynamic `import()` so the main
  game bundle stays small. Everything else has no runtime deps; DOM panels
  are rebuilt via `innerHTML` templates and the dungeon view is a hand-rolled
  2D canvas renderer
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
│   │                     #   (also exports STAGE_WIDTH/HEIGHT for epilogue.js)
│   ├── ui.js            # DOM panels: stats, inventory, crafting, log
│   ├── save.js          # localStorage save/load/clear + run records
│   ├── transition.js    # 2D canvas "reality fracture" shatter/flash effect
│   ├── crypt.js         # Tile map + helpers for the 3D epilogue crypt
│   │                     #   (DOM-free; connectivity is smoke-tested)
│   ├── cryptCombat.js   # `CryptSim`: real-time monsters/melee/loot for the
│   │                     #   3D crypt (DOM-free; shares player state via Game)
│   ├── epilogue.js       # Post-victory 3D scene (Three.js, lazy-loaded);
│   │                     #   procedural geometry/textures, no asset files
│   └── styles.css       # Dark medieval theme (Cinzel / IM Fell English fonts)
├── scripts/
│   └── smoke.js         # Headless tests: connectivity, combat, crafting, saves
└── .gitpod.yml          # Gitpod: install + build, then dev server
```

## Architecture

The key boundary: **`game.js` (plus `dungeon.js`, `fov.js`, `rng.js`,
`data.js`, `crypt.js`, and `cryptCombat.js`) is completely DOM-free** and
runs in plain Node — this is what makes `npm test` possible. Keep it that
way: anything touching `document`, `canvas`, `localStorage`, or `three`
belongs in `main.js`, `ui.js`, `render.js`, `save.js`, `transition.js`, or
`epilogue.js`.

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

### Win reveal (src/transition.js + src/epilogue.js)
On `game.status === 'won'`, `main.js#beginReveal()`:
1. Runs `playFractureTransition()` on `#game-canvas` — shatters the current
   frame into shards that fly outward, flashes, then leaves the canvas black.
2. Hides `#game-canvas`, shows `#epilogue-canvas`, and dynamically imports
   `epilogue.js` (`startEpilogue(canvas, STAGE_WIDTH, STAGE_HEIGHT)`), which
   sets up a Three.js scene: a hooded thief (raised torch, dagger,
   vertex-animated cape) explores a ruined crypt laid out by the tile map in
   `src/crypt.js` — a DOM-free module whose connectivity is smoke-tested.
   WASD/arrows or the touch d-pad move eight-way in real time (not
   turn-based). A Diablo-style fog of war fades crypt geometry in permanently
   as the torch nears (`makeRevealable`/`updateReveal`); braziers, bones,
   drifting embers, and a glowing "Eye" loom past a rubble wall — all built
   from primitives + a canvas-generated stone texture, no asset files. The
   `#minimap` canvas (M to toggle) charts only torch-revealed tiles, plus
   the hero's position/facing, awake monsters, loot, and the Eye once the
   rubble vantage is found. When `startEpilogue` is given a live run
   (`opts.game`, `status === 'playing'`), `cryptCombat.js`'s `CryptSim`
   makes the crypt hostile: monsters (map markers `k`/`p`/`w` in crypt.js)
   wake near the torch, chase, and strike on cooldowns; the hero's dagger
   swings a 120° cone via an **explicit** attack input (Space/X or d-pad ⚔)
   — never by bumping; drops/xp/gold flow into the shared `Game` player,
   and `sim.useItem`/`sim.craft` are turn-free so the dormant 2D dungeon
   never advances. Entered after victory ('won'), no sim is created and the
   crypt remains the peaceful lore vision.
3. Lore lines fade in via `#epilogue-text`; once they finish, Enter calls
   `endEpilogue()`, which disposes the Three.js renderer/scene, restores the
   2D canvas, and shows the normal win overlay.

`epilogue.js` owns its own `keydown`/`keyup`/`resize` listeners and must
remove them (and dispose geometries/materials/renderer) in `dispose()` —
`endEpilogue()` is the only caller.

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
  `fov.js`, `rng.js`, `data.js`, `crypt.js`, or `cryptCombat.js` — it will
  break `npm test`.
- The save format round-trip test (`serialize` → `fromSave` → `serialize`
  deep-equal) means new `Game` state fields must be added to **both**
  `serialize()` and `fromSave()`.
- `dist/`, `node_modules/`, `.cache/` are gitignored; never commit them.
- The repo is GPL-3.0 (`LICENSE` + `package.json` agree).
