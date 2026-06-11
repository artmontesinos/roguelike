/**
 * Static game data: tiles, monsters, items, crafting recipes, loot tables.
 * All gameplay tuning lives in this file.
 */

export const TILE = { WALL: '#', FLOOR: '.' };

export const MAX_DEPTH = 8;
export const FOV_RADIUS = 8;

/** Flavor names shown when entering each depth (index = depth - 1). */
export const DEPTH_NAMES = [
   'The Gatehouse Cellars',
   'The Bone Warrens',
   'The Flooded Galleries',
   'The Silent Chapel',
   'The Forge of Chains',
   'The Starless Crypts',
   'The Throat of the Mountain',
   "The Wyrm's Hoard",
];

/**
 * Item registry. `kind` drives behavior:
 *  - potion/food: consumed on use, restores `heal` HP
 *  - weapon: equip, adds `atk`
 *  - armor: equip, adds `def`
 *  - material: crafting ingredient only
 *  - quest: picking it up wins the game
 */
export const ITEMS = {
   // consumables
   potion:     { name: 'Healing Potion',   glyph: '🧪', kind: 'potion', heal: 12 },
   gpotion:    { name: 'Greater Potion',   glyph: '⚗️', kind: 'potion', heal: 30 },
   bread:      { name: 'Stale Bread',      glyph: '🍞', kind: 'food',   heal: 5 },

   // weapons
   dagger:     { name: 'Rusty Dagger',     glyph: '🗡️', kind: 'weapon', atk: 2 },
   sword:      { name: 'Iron Sword',       glyph: '⚔️', kind: 'weapon', atk: 4 },
   axe:        { name: 'Battle Axe',       glyph: '🪓', kind: 'weapon', atk: 6 },
   dragonbane: { name: 'Dragonbane Blade', glyph: '🔱', kind: 'weapon', atk: 9 },

   // armor
   leather:    { name: 'Leather Armor',    glyph: '🛡️', kind: 'armor', def: 2 },
   chain:      { name: 'Chain Mail',       glyph: '🛡️', kind: 'armor', def: 3 },
   plate:      { name: 'Plate Armor',      glyph: '🛡️', kind: 'armor', def: 5 },

   // crafting materials
   herb:       { name: 'Bitter Herb',      glyph: '🌿', kind: 'material' },
   mushroom:   { name: 'Cave Mushroom',    glyph: '🍄', kind: 'material' },
   wood:       { name: 'Oak Haft',         glyph: '🪵', kind: 'material' },
   iron:       { name: 'Iron Ore',         glyph: '🪨', kind: 'material' },
   bone:       { name: 'Ancient Bone',     glyph: '🦴', kind: 'material' },
   hide:       { name: 'Beast Hide',       glyph: '🟤', kind: 'material' },
   gem:        { name: 'Bloodstone Gem',   glyph: '💎', kind: 'material' },

   // quest
   crown:      { name: 'Crown of the Forsaken King', glyph: '👑', kind: 'quest' },
};

/**
 * Monster registry. Monsters appear from `minDepth` to roughly minDepth + 3,
 * and their stats scale slightly with depth. `drops` are material drop
 * chances rolled on death; `goldChance` is an independent gold-pile roll.
 */
export const MONSTERS = {
   bat:      { id: 'bat',      name: 'Cave Bat',     glyph: '🦇', hp: 4,  atk: 2,  def: 0, xp: 2,  minDepth: 1,
               drops: [{ id: 'hide', chance: 0.25 }] },
   rat:      { id: 'rat',      name: 'Giant Rat',    glyph: '🐀', hp: 6,  atk: 2,  def: 0, xp: 3,  minDepth: 1,
               drops: [{ id: 'hide', chance: 0.6 }] },
   goblin:   { id: 'goblin',   name: 'Goblin',       glyph: '👺', hp: 9,  atk: 3,  def: 1, xp: 5,  minDepth: 1, goldChance: 0.4,
               drops: [{ id: 'wood', chance: 0.35 }, { id: 'iron', chance: 0.2 }] },
   spider:   { id: 'spider',   name: 'Crypt Spider', glyph: '🕷️', hp: 8,  atk: 4,  def: 0, xp: 6,  minDepth: 2,
               drops: [{ id: 'hide', chance: 0.3 }, { id: 'mushroom', chance: 0.3 }] },
   skeleton: { id: 'skeleton', name: 'Skeleton',     glyph: '💀', hp: 12, atk: 4,  def: 1, xp: 7,  minDepth: 2,
               drops: [{ id: 'bone', chance: 0.7 }] },
   orc:      { id: 'orc',      name: 'Orc Reaver',   glyph: '👹', hp: 16, atk: 5,  def: 2, xp: 10, minDepth: 3, goldChance: 0.5,
               drops: [{ id: 'iron', chance: 0.45 }] },
   wraith:   { id: 'wraith',   name: 'Wraith',       glyph: '👻', hp: 14, atk: 7,  def: 1, xp: 13, minDepth: 4,
               drops: [{ id: 'gem', chance: 0.25 }, { id: 'bone', chance: 0.3 }] },
   troll:    { id: 'troll',    name: 'Cave Troll',   glyph: '🧌', hp: 26, atk: 8,  def: 3, xp: 18, minDepth: 5, goldChance: 0.4,
               drops: [{ id: 'hide', chance: 0.5 }, { id: 'iron', chance: 0.4 }, { id: 'gem', chance: 0.15 }] },
   dragon:   { id: 'dragon',   name: 'The Pale Wyrm', glyph: '🐉', hp: 70, atk: 11, def: 4, xp: 50, minDepth: MAX_DEPTH, boss: true,
               drops: [] },
};

/** Crafting recipes: consume `needs` (itemId -> count) and produce one `out`. */
export const RECIPES = [
   { id: 'potion',     out: 'potion',     needs: { herb: 2 } },
   { id: 'gpotion',    out: 'gpotion',    needs: { herb: 1, mushroom: 1 } },
   { id: 'sword',      out: 'sword',      needs: { wood: 1, iron: 1 } },
   { id: 'axe',        out: 'axe',        needs: { wood: 1, iron: 2 } },
   { id: 'leather',    out: 'leather',    needs: { hide: 2 } },
   { id: 'chain',      out: 'chain',      needs: { iron: 3 } },
   { id: 'plate',      out: 'plate',      needs: { iron: 3, gem: 1 } },
   { id: 'dragonbane', out: 'dragonbane', needs: { iron: 1, bone: 2, gem: 1 } },
];

/**
 * Floor-loot weights. `gold: true` entries spawn a gold pile instead of an
 * item; `minDepth` gates deeper-only loot.
 */
export const LOOT_TABLE = [
   { gold: true,     w: 20 },
   { id: 'herb',     w: 14 },
   { id: 'wood',     w: 10 },
   { id: 'iron',     w: 10 },
   { id: 'potion',   w: 10 },
   { id: 'hide',     w: 8 },
   { id: 'mushroom', w: 7 },
   { id: 'bread',    w: 6 },
   { id: 'bone',     w: 6 },
   { id: 'gem',      w: 3, minDepth: 3 },
   { id: 'dagger',   w: 2 },
   { id: 'sword',    w: 2, minDepth: 2 },
   { id: 'leather',  w: 2 },
];
