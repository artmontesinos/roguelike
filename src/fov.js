/**
 * Field-of-view helpers. Tiles are an array of row strings; '#' blocks sight.
 */

/**
 * Checks line of sight between two points with Bresenham's line.
 * Endpoints never block (so walls themselves are visible / targetable).
 *
 * @return {boolean} true if no wall sits strictly between the points
 */
export function hasLos(tiles, x0, y0, x1, y1) {
   const dx = Math.abs(x1 - x0);
   const dy = Math.abs(y1 - y0);
   const sx = x0 < x1 ? 1 : -1;
   const sy = y0 < y1 ? 1 : -1;
   let err = dx - dy;
   let x = x0;
   let y = y0;

   while (!(x === x1 && y === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx)  { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (tiles[y][x] === '#') return false;
   }
   return true;
}

/**
 * Computes the set of visible tiles around a point.
 *
 * @return {Set<string>} keys of the form "x,y"
 */
export function computeFov(tiles, px, py, radius) {
   const visible = new Set();
   const H = tiles.length;
   const W = tiles[0].length;

   for (let y = Math.max(0, py - radius); y <= Math.min(H - 1, py + radius); y++) {
      for (let x = Math.max(0, px - radius); x <= Math.min(W - 1, px + radius); x++) {
         const d2 = (x - px) * (x - px) + (y - py) * (y - py);
         if (d2 <= radius * radius + 1 && hasLos(tiles, px, py, x, y)) {
            visible.add(x + ',' + y);
         }
      }
   }
   return visible;
}
