import { MONSTERS, LOOT_TABLE, MAX_DEPTH } from './data.js';

/**
 * Procedural level generator: scatters non-overlapping rooms, links each new
 * room to the previous one with an L-shaped corridor (guaranteeing
 * connectivity), then populates monsters and loot scaled by depth.
 *
 * @param {Rand} rand - seeded RNG
 * @param {number} depth - current dungeon depth (1-based)
 *
 * @return {{tiles: string[], start: object, stairs: object|null,
 *           monsters: object[], items: object[], W: number, H: number}}
 */
export function generateDungeon(rand, depth, W = 48, H = 30) {
   let grid, rooms;

   // retry until we get a reasonable number of rooms
   do {
      grid = Array.from({ length: H }, () => Array(W).fill('#'));
      rooms = [];

      for (let i = 0; i < 80 && rooms.length < 11; i++) {
         const w = rand.int(4, 9);
         const h = rand.int(3, 7);
         const x = rand.int(1, W - w - 2);
         const y = rand.int(1, H - h - 2);

         // reject rooms that touch existing ones (1-tile pad)
         const overlaps = rooms.some((r) =>
            x <= r.x + r.w && x + w >= r.x - 1 &&
            y <= r.y + r.h && y + h >= r.y - 1
         );
         if (overlaps) continue;

         for (let ry = y; ry < y + h; ry++) {
            for (let rx = x; rx < x + w; rx++) {
               grid[ry][rx] = '.';
            }
         }

         const room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
         if (rooms.length > 0) {
            carveCorridor(grid, rand, rooms[rooms.length - 1], room);
         }
         rooms.push(room);
      }
   } while (rooms.length < 4);

   const tiles = grid.map((row) => row.join(''));
   const start = { x: rooms[0].cx, y: rooms[0].cy };

   // the farthest room holds the stairs down — or the dragon on the last depth
   const farRoom = rooms.reduce((best, r) => {
      const d = Math.abs(r.cx - start.x) + Math.abs(r.cy - start.y);
      return d > best.d ? { r, d } : best;
   }, { r: rooms[0], d: -1 }).r;

   const monsters = [];
   let stairs = null;
   if (depth >= MAX_DEPTH) {
      monsters.push(spawnMonster(MONSTERS.dragon, depth, farRoom.cx, farRoom.cy));
   } else {
      stairs = { x: farRoom.cx, y: farRoom.cy };
   }

   // floor cells available for spawning, excluding the area near the start
   const floorCells = [];
   for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
         if (tiles[y][x] === '.' &&
             Math.abs(x - start.x) + Math.abs(y - start.y) > 6) {
            floorCells.push({ x, y });
         }
      }
   }

   const taken = new Set(monsters.map((m) => m.x + ',' + m.y));
   const claim = () => {
      for (let tries = 0; tries < 40; tries++) {
         const c = rand.pick(floorCells);
         const key = c.x + ',' + c.y;
         if (!taken.has(key)) {
            taken.add(key);
            return c;
         }
      }
      return null;
   };

   // monsters scale in count and tier with depth
   const pool = Object.values(MONSTERS).filter((m) =>
      !m.boss && m.minDepth <= depth && depth <= m.minDepth + 3
   );
   const monsterCount = Math.min(12, 4 + depth);
   for (let i = 0; i < monsterCount; i++) {
      const cell = claim();
      if (!cell) break;
      monsters.push(spawnMonster(rand.pick(pool), depth, cell.x, cell.y));
   }

   // ground loot
   const items = [];
   const itemCount = rand.int(5, 8);
   for (let i = 0; i < itemCount; i++) {
      const cell = claim();
      if (!cell) break;
      items.push({ ...lootRoll(rand, depth), x: cell.x, y: cell.y });
   }

   return { tiles, start, stairs, monsters, items, W, H };
}

/** Carves an L-shaped corridor between two room centers. */
function carveCorridor(grid, rand, a, b) {
   const horizontalFirst = rand.chance(0.5);
   const bend = horizontalFirst ? { x: b.cx, y: a.cy } : { x: a.cx, y: b.cy };
   carveLine(grid, a.cx, a.cy, bend.x, bend.y);
   carveLine(grid, bend.x, bend.y, b.cx, b.cy);
}

/** Carves a straight horizontal or vertical line of floor. */
function carveLine(grid, x0, y0, x1, y1) {
   const sx = Math.sign(x1 - x0);
   const sy = Math.sign(y1 - y0);
   let x = x0;
   let y = y0;
   grid[y][x] = '.';
   while (x !== x1 || y !== y1) {
      if (x !== x1) x += sx;
      else y += sy;
      grid[y][x] = '.';
   }
}

/** Creates a live monster instance from a registry entry, scaled by depth. */
function spawnMonster(def, depth, x, y) {
   const tier = Math.max(0, depth - def.minDepth);
   const hp = def.hp + tier * 2;
   return {
      id: def.id,
      name: def.name,
      glyph: def.glyph,
      boss: !!def.boss,
      hp,
      maxHp: hp,
      atk: def.atk + (tier >> 1),
      def: def.def,
      xp: def.xp + tier,
      drops: def.drops || [],
      goldChance: def.goldChance || 0,
      awake: false,
      x,
      y,
   };
}

/** Rolls one entry from the weighted loot table. */
function lootRoll(rand, depth) {
   const eligible = LOOT_TABLE.filter((e) => !e.minDepth || depth >= e.minDepth);
   const total = eligible.reduce((sum, e) => sum + e.w, 0);
   let roll = rand.next() * total;
   for (const entry of eligible) {
      roll -= entry.w;
      if (roll <= 0) {
         if (entry.gold) return { gold: 5 + rand.int(0, 10 * depth) };
         return { id: entry.id };
      }
   }
   return { id: 'herb' };
}
