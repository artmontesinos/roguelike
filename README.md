# Darkhollow Depths

A dark-fantasy, top-down roguelike dungeon crawler that runs entirely in the
browser. Fight, loot, craft, and descend eight depths to slay the Pale Wyrm
and claim the Crown of the Forsaken King.

## Features

- Turn-based, top-down dungeon crawling with bump-to-attack combat
- Procedurally generated levels (rooms + corridors) with fog of war and torchlight
- Monsters that scale with depth, ending in a dragon boss fight
- Loot, gold, and material drops; auto-pickup
- Inventory with equippable weapons and armor, potions and food
- Crafting system (potions, weapons, armor) from gathered materials
- Permadeath, with run history tracked across games
- Saves automatically to `localStorage` after every turn — close the tab and continue later

## Play

```bash
npm install
npm run dev     # opens a dev server
npm run build   # production build into dist/
npm test        # headless smoke tests of the game logic
```

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Move (bump a monster to attack) |
| Walk over loot | Pick it up |
| Enter / Space / `>` on the stairs 🪜 | Descend |
| Click inventory items | Use / equip |
| Click recipes | Craft |

## License

GPL-3.0 — see [LICENSE](LICENSE).
