# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Project Overview

A browser-based, emoji-rendered roguelike dungeon crawler. The game runs entirely
client-side, rendered onto a [rot-js](https://ondras.github.io/rot.js/hp/) `Display`
canvas embedded in `index.html`. There is no backend, database, or build server beyond
the Parcel bundler.

The "graphics" are Unicode emoji characters drawn into the rot-js canvas — there are no
image/sprite assets.

## Tech Stack

- **Language**: vanilla JavaScript (ES2015+ classes/modules), no TypeScript
- **Game engine library**: `rot-js` v2.1.4 (map generation, display, directions)
- **Bundler**: `parcel-bundler` v1.x (zero-config dev server + build)
- **Transpilation**: `@babel/core` (via Parcel's default Babel integration)
- **No framework** (no React/Vue/etc.) — DOM is manipulated directly via
  `document.getElementById(...)`
- **No test suite, no linter, and no CI configuration** currently exist in this repo

## Repository Structure

```
.
├── index.html        # Page shell: side panels (HP/AC/Attack/Exp/Gold), canvas
│                      # mount point, on-screen mobile D-pad (hidden by default),
│                      # and the sendKey() helper that dispatches keydown events
├── styles.css         # Layout + fonts for the panels, header, canvas container
├── src/
│   ├── game.js        # `Game` class: entry point, display config, color/emoji
│   │                   #   tables (Characters/Objects/Effects/Colors), main loop
│   ├── world.js        # `GameWorld` class: level/map generation, free cells,
│   │                   #   boss/loot/exit/locked-door placement, passability
│   ├── player.js       # `Player` class: stats, movement, key handling,
│   │                   #   item/key/chest interactions, combat trigger,
│   │                   #   light/visibility (castLight / castAnything)
│   └── combat.js       # `Combat` class: turn resolution for player vs. monster
├── package.json
├── package-lock.json
└── .gitpod.yml         # Gitpod task: `npm install && npm run build` then `npm start`
```

## Development Workflow

```bash
npm install     # install dependencies
npm start       # parcel index.html --open  -> dev server with live reload
npm run build   # parcel build index.html   -> production build into dist/
```

- `dist/`, `node_modules/`, `.cache/`, and `.idea/` are gitignored — never commit them.
- There is no test command. Verify changes by running `npm start` and playing the game
  in a browser (or describing the manual verification you performed, since this is a
  browser game with randomized world generation).
- Parcel handles Babel transpilation automatically; there's no separate `.babelrc` to
  maintain unless build issues require one.

## Architecture Notes

### `Game` (src/game.js)
The central object (`const game = new Game()`), created on `window.onload`. Holds:
- `DisplayOptions` — rot-js `Display` config (25x18-ish grid, monospace font, etc.)
- `Characters`, `Objects`, `Effects`, `Colors` — lookup tables mapping emoji to their
  role in the game (hero, monsters, walls, doors, treasure, curses, allies, etc.)
- `maxLevel` — number of dungeon levels to win the game (currently 10)
- `init()` — boots the rot-js display, creates the world & player, starts `engine()`
- `engine()` — async loop: `await player.act()` then `draw()`, until `game.over`
- `endGame(message)` — stops the loop and shows a win/lose message

### `GameWorld` (src/world.js)
Represents a single dungeon level.
- `generate()` builds `this.map` (2D array indexed `map[x][y]`) using rot-js's
  `ROT.Map.Cellular` generator, then randomly places an **exit**, a **boss** monster,
  and **loot** on free cells (each placement is probabilistic — see
  `generateExit`/`generateBoss`/`generateRandomTreasure`)
- Boss/loot/exit cells start hidden (`'.'`) and are revealed via `reveal(x, y)` as the
  player explores (fog-of-war)
- `'+' ` = outer border wall; walls are emoji from `Objects.walls`
- 50% chance a level is "locked" (`this.locked`), requiring a key drop from the boss
  to reach the exit
- `isPassable`, `isBoss`, `isChest`, `isItem`, `isKey` are the tile-type predicates used
  by `Player.move()`

### `Player` (src/player.js)
- Core stats: `health`, `attackBonus`, `armourClass`, `gold`, `experience`,
  `lightRange`, `enchantments[]`, `curses[]`
- `act()` is the per-turn entry point: blocks on a `keydown` event via
  `handleKeyPress`, then checks win/death/level-advance conditions
- Movement is via arrow keys **or WASD**; `move(delta)` dispatches to combat, chest
  opening, item pickup, key pickup, or plain movement based on the target tile
- Special keys: **Backspace** regenerates the current level (escape hatch for
  unsolvable/bad maps); **X** is a debug/cheat key that grants all enchantments and
  clears curses
- `castLight`/`castAnything` implement the fog-of-war / reveal radius around the player
- Enchantments and curses modify gameplay (see Game Mechanics below)

### `Combat` (src/combat.js)
- One `fight()` call = one round: player attacks first (chance based on
  `attackBonus`), then the monster counter-attacks (chance based on its own
  `attackBonus`, mitigated by player `armourClass`)
- Monsters can inflict curses on hit, based on the `Game.Effects` mapping
  (monster emoji -> curse emoji)
- Returns `true` when the fight is fully resolved (boss dead or player dead)

## Game Mechanics / Emoji Legend

These tables live in `Game` (src/game.js) and are the single source of truth — when
adding new monsters/items/effects, update them there:

- `Characters.hero` 🧝 / `Characters.dead` 🪦 — the player
- `Characters.monsters` — pool of bosses (🐉🐍🧌🧞🦂💀🕷️🦇👹👻)
- `Effects` maps curses to the monsters that can inflict them:
  - ☠️ poison (🐍🦂🕷️) — slowly drains HP, cured by 🧪
  - 😴 sleep (🧌👹🧞) — increases item-loss chance, cured by 🧫
  - 🌙 darkness (🦇👻💀) — shrinks light radius to 1, cured by 📜
- `Objects.treasure` enchantment effects (picked up via `Player.powerUp`):
  - 🗡️ sword — increases `attackBonus`
  - 🛡️ shield — increases `armourClass`
  - 💰 gold — increases `gold`
  - 🥩 meat — heals HP
  - 🧪/🧫 potions — heal HP and cure ☠️/😴 respectively
  - 🏹 bow — guarantees a one-shot kill in combat (persistent enchantment)
  - 💍 ring — reveals all hidden boss/loot/exit on the level (persistent)
  - 🍀 clover — "lucky", multiplies most positive random rolls (persistent)
  - 📜 scroll — increases `lightRange`, cures 🌙
- `Objects.keys` — dropped by bosses on locked levels, unlocks the exit door 🚪
- Persistent enchantments (🏹💍🍀) have a chance to be lost each level via
  `Player.powerDown`, and that chance increases while cursed with 😴

## Code Style Conventions

- **3-space indentation** (matches existing files — do not switch to 2 or 4)
- ES module `import`/`export` syntax (`export class Foo { ... }`)
- `'use strict';` at the top of entry-point-style files (game.js, player.js)
- JSDoc-style `/** ... */` comments above non-trivial methods, documenting
  `@param`/`@return` — follow this pattern for new public methods
- Class fields declared at the top of the class body (public fields, no `private`/`#`
  fields used)
- Prefer small, single-purpose methods on the relevant class (`Game`, `GameWorld`,
  `Player`, `Combat`) over free functions
- The map is indexed `map[x][y]` (column-major) throughout — keep this convention
  consistent when touching `world.js`/`player.js`

## Things to Watch Out For

- **No automated tests or linting** — be extra careful with manual logic changes
  (especially probability thresholds and map-generation edge cases), since incorrect
  map generation can produce unsolvable levels (the Backspace key is the player's only
  recourse).
- Map generation is randomized and can occasionally produce a level with no boss/loot
  (by design — see the probabilities in `generateBoss`/`generateRandomTreasure`).
- `index.html` is in French (`<html lang="fr">`) but in-game text/messages are in
  English — be consistent with existing language per context when adding UI text.
- `package.json` lists `"license": "ISC"` but the repo ships a GPLv3 `LICENSE` file —
  this is a pre-existing inconsistency; don't "fix" it without being asked.
- `index.html` includes a mobile on-screen D-pad (`<table>` with Up/Left/Down/Right
  buttons) that is hidden by default (`style="display: none;"`) and dispatches
  synthetic `keydown` events via `sendKey()`.
