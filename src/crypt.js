/**
 * Layout of the crypt beyond Darkhollow — the explorable 3D epilogue area.
 * DOM-free so the smoke tests can verify connectivity headlessly.
 *
 * Legend:
 *   '#'  full-height wall
 *   '='  waist-high rubble: blocks movement, see over it (frames the Eye)
 *   ' '  void beyond the broken north wall (never reachable)
 *   '.'  floor
 *   'S'  the adventurer's starting tile
 *   't'  floor with a standing brazier
 *   'b'  floor with scattered bones
 *   'r'  floor with a rubble pile
 *   'k'  floor where a skeleton lurks
 *   'p'  floor where a crypt spider lurks
 *   'w'  floor where a wraith lurks
 */
export const CRYPT_MAP = [
   '######        ######',
   '######========######',
   '###........w.....###',
   '##.....t....t.....##',
   '##......k.........##',
   '##....########....##',
   '###...########...###',
   '###.p.########...###',
   '###...########.k.###',
   '###....######....###',
   '###.b..######..r.###',
   '###....######....###',
   '####.........p..####',
   '####..t..S...b..####',
   '####............####',
   '####################',
];

/** Map letters that mark monster ambush spots, keyed to MONSTERS ids. */
export const CRYPT_SPAWN_TYPES = { k: 'skeleton', p: 'spider', w: 'wraith' };

/** @return {Array<{type: string, x: number, z: number}>} monster spawn points */
export function cryptSpawns() {
   const spawns = [];
   for (let row = 0; row < CRYPT_ROWS; row++) {
      for (let col = 0; col < CRYPT_COLS; col++) {
         const type = CRYPT_SPAWN_TYPES[CRYPT_MAP[row][col]];
         if (type) spawns.push({ type, ...cryptTileCenter(col, row) });
      }
   }
   return spawns;
}

export const CRYPT_ROWS = CRYPT_MAP.length;
export const CRYPT_COLS = CRYPT_MAP[0].length;

/** World-units per map tile. */
export const CRYPT_TILE = 2;

/** @return {string} tile character, treating out-of-bounds as wall */
export function cryptTile(col, row) {
   if (row < 0 || row >= CRYPT_ROWS || col < 0 || col >= CRYPT_COLS) return '#';
   return CRYPT_MAP[row][col];
}

export function isCryptWalkable(tile) {
   return tile !== '#' && tile !== '=' && tile !== ' ';
}

/** Center of a map tile in world space (map centered on the origin). */
export function cryptTileCenter(col, row) {
   return {
      x: (col - CRYPT_COLS / 2 + 0.5) * CRYPT_TILE,
      z: (row - CRYPT_ROWS / 2 + 0.5) * CRYPT_TILE,
   };
}

/** Whether the world-space point lies on a tile that blocks movement. */
export function cryptBlockedAt(x, z) {
   const col = Math.floor(x / CRYPT_TILE + CRYPT_COLS / 2);
   const row = Math.floor(z / CRYPT_TILE + CRYPT_ROWS / 2);
   return !isCryptWalkable(cryptTile(col, row));
}

/** World position of the 'S' start tile. */
export function cryptStart() {
   for (let row = 0; row < CRYPT_ROWS; row++) {
      const col = CRYPT_MAP[row].indexOf('S');
      if (col !== -1) return cryptTileCenter(col, row);
   }
   return { x: 0, z: 0 };
}
