/**
 * Headless smoke tests for the DOM-free game logic.
 * Run with: npm test  (node scripts/smoke.js)
 */
import assert from 'node:assert/strict';
import { Rand } from '../src/rng.js';
import { generateDungeon } from '../src/dungeon.js';
import { Game } from '../src/game.js';
import { MAX_DEPTH, RECIPES } from '../src/data.js';
import { CRYPT_MAP, cryptTile, isCryptWalkable } from '../src/crypt.js';

let passed = 0;
function ok(label, fn) {
   fn();
   passed++;
   console.log(`  ✓ ${label}`);
}

console.log('dungeon generation');

ok('every level is connected (start can reach stairs / boss)', () => {
   for (let seed = 1; seed <= 25; seed++) {
      for (let depth = 1; depth <= MAX_DEPTH; depth++) {
         const level = generateDungeon(new Rand(seed * 1000 + depth), depth);
         const goal = level.stairs ?? level.monsters.find((m) => m.boss);
         assert.ok(goal, `depth ${depth} has no goal`);
         assert.ok(reachable(level.tiles, level.start, goal),
            `seed ${seed} depth ${depth}: goal unreachable`);
      }
   }
});

ok('monsters and items spawn on floor tiles', () => {
   const level = generateDungeon(new Rand(42), 3);
   for (const m of level.monsters) assert.equal(level.tiles[m.y][m.x], '.');
   for (const i of level.items) assert.equal(level.tiles[i.y][i.x], '.');
});

console.log('game logic');

ok('random walk of 300 turns does not crash', () => {
   const game = new Game(7);
   const rand = new Rand(99);
   const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
   for (let i = 0; i < 300 && game.status === 'playing'; i++) {
      const [dx, dy] = rand.pick(dirs);
      game.tryMove(dx, dy);
   }
});

ok('bump combat kills an adjacent monster and grants xp', () => {
   const game = new Game(11);
   game.monsters = [{
      id: 'rat', name: 'Giant Rat', glyph: '🐀', boss: false,
      hp: 6, maxHp: 6, atk: 0, def: 0, xp: 3,
      drops: [], goldChance: 0,
      awake: true, x: game.player.x + 1, y: game.player.y,
   }];
   game.player.hp = 999;
   game.player.maxHp = 999;
   for (let i = 0; i < 20 && game.monsters.length; i++) {
      game.tryMove(1, 0);
      // step back if the kill let us walk forward
      if (game.monsters.length) continue;
   }
   assert.equal(game.monsters.length, 0, 'monster should die');
   assert.ok(game.player.xp > 0 || game.player.level > 1, 'xp granted');
});

ok('crafting consumes materials and yields the product', () => {
   const game = new Game(13);
   game.player.inv = { herb: 2 };
   assert.equal(game.craft('potion'), true);
   assert.equal(game.player.inv.potion, 1);
   assert.equal(game.player.inv.herb, undefined);
});

ok('crafting fails without materials', () => {
   const game = new Game(13);
   game.player.inv = {};
   for (const recipe of RECIPES) {
      assert.equal(game.craft(recipe.id), false);
   }
});

ok('equipping a crafted weapon raises attack', () => {
   const game = new Game(17);
   const before = game.playerAtk();
   game.player.inv = { wood: 1, iron: 1 };
   game.craft('sword');
   game.useItem('sword');
   assert.equal(game.player.weapon, 'sword');
   assert.ok(game.playerAtk() > before);
});

ok('potions heal and are consumed', () => {
   const game = new Game(19);
   game.player.hp = 5;
   game.player.inv = { potion: 1 };
   game.useItem('potion');
   assert.ok(game.player.hp > 5);
   assert.equal(game.player.inv.potion, undefined);
});

console.log('persistence');

ok('serialize / fromSave round-trips exactly', () => {
   const game = new Game(23);
   game.tryMove(1, 0);
   game.tryMove(0, 1);
   const snapshot = JSON.parse(JSON.stringify(game.serialize()));
   const restored = Game.fromSave(snapshot);
   assert.deepEqual(restored.serialize(), snapshot);
});

ok('descend advances depth and regenerates the level', () => {
   const game = new Game(29);
   game.player.x = game.stairs.x;
   game.player.y = game.stairs.y;
   const oldTiles = game.tiles;
   assert.equal(game.descend(), true);
   assert.equal(game.depth, 2);
   assert.notEqual(game.tiles, oldTiles);
});

console.log('epilogue crypt');

ok('every walkable tile is reachable from the start', () => {
   assert.ok(CRYPT_MAP.every((row) => row.length === CRYPT_MAP[0].length), 'ragged map rows');
   const seen = floodCrypt();
   for (let row = 0; row < CRYPT_MAP.length; row++) {
      for (let col = 0; col < CRYPT_MAP[0].length; col++) {
         if (isCryptWalkable(cryptTile(col, row))) {
            assert.ok(seen.has(col + ',' + row), `tile ${col},${row} unreachable`);
         }
      }
   }
});

ok('the rubble vantage onto the Eye is reachable', () => {
   const seen = floodCrypt();
   let vantage = false;
   for (const key of seen) {
      const [col, row] = key.split(',').map(Number);
      if (cryptTile(col, row - 1) === '=') vantage = true;
   }
   assert.ok(vantage, 'no reachable tile borders the rubble wall');
});

console.log(`\n${passed} checks passed.`);

/** BFS over the epilogue crypt's walkable tiles from the start. */
function floodCrypt() {
   const startRow = CRYPT_MAP.findIndex((row) => row.includes('S'));
   const startCol = CRYPT_MAP[startRow].indexOf('S');
   const seen = new Set([startCol + ',' + startRow]);
   const queue = [[startCol, startRow]];
   while (queue.length) {
      const [col, row] = queue.shift();
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
         const key = (col + dc) + ',' + (row + dr);
         if (!seen.has(key) && isCryptWalkable(cryptTile(col + dc, row + dr))) {
            seen.add(key);
            queue.push([col + dc, row + dr]);
         }
      }
   }
   return seen;
}

/** BFS over floor tiles. */
function reachable(tiles, from, to) {
   const H = tiles.length;
   const W = tiles[0].length;
   const seen = new Set([from.x + ',' + from.y]);
   const queue = [[from.x, from.y]];
   while (queue.length) {
      const [x, y] = queue.shift();
      if (x === to.x && y === to.y) return true;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
         const nx = x + dx;
         const ny = y + dy;
         const key = nx + ',' + ny;
         if (nx >= 0 && ny >= 0 && nx < W && ny < H &&
             tiles[ny][nx] !== '#' && !seen.has(key)) {
            seen.add(key);
            queue.push([nx, ny]);
         }
      }
   }
   return false;
}
