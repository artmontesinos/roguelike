import { FOV_RADIUS, ITEMS } from './data.js';

const TILE_PX = 26;
const VIEW_W = 29;
const VIEW_H = 19;

/** Pixel dimensions of the play view, shared with the 3D epilogue canvas. */
export const STAGE_WIDTH = VIEW_W * TILE_PX;
export const STAGE_HEIGHT = VIEW_H * TILE_PX;

/**
 * Canvas renderer: dark stone tiles with a torchlight falloff around the
 * player, fog of war for explored-but-unseen areas, emoji glyphs for
 * entities, and a vignette for atmosphere.
 */
export function createRenderer(canvas) {
   canvas.width = VIEW_W * TILE_PX;
   canvas.height = VIEW_H * TILE_PX;
   const ctx = canvas.getContext('2d');

   /** Deterministic per-tile brightness variation so the stone looks rough. */
   function tileNoise(x, y) {
      const h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
      return (h % 7) - 3;
   }

   function drawGlyph(glyph, sx, sy, scale = 1, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.floor((TILE_PX - 5) * scale)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d8c9a3';
      ctx.fillText(glyph, sx * TILE_PX + TILE_PX / 2, sy * TILE_PX + TILE_PX / 2 + 1);
      ctx.globalAlpha = 1;
   }

   function draw(game) {
      const p = game.player;
      const camX = Math.max(0, Math.min(p.x - (VIEW_W >> 1), game.W - VIEW_W));
      const camY = Math.max(0, Math.min(p.y - (VIEW_H >> 1), game.H - VIEW_H));

      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // terrain
      for (let sy = 0; sy < VIEW_H; sy++) {
         for (let sx = 0; sx < VIEW_W; sx++) {
            const wx = camX + sx;
            const wy = camY + sy;
            if (wx >= game.W || wy >= game.H || !game.explored[wy][wx]) continue;

            const visible = game.visible.has(wx + ',' + wy);
            const isWall = game.tiles[wy][wx] === '#';
            const dist = Math.hypot(wx - p.x, wy - p.y);
            const light = visible ? Math.max(0.5, 1 - dist / (FOV_RADIUS * 1.7)) : 0.3;
            const base = isWall ? 26 : 15;
            const lum = Math.max(3, (base + tileNoise(wx, wy)) * light);
            const hue = isWall ? 34 : 28;
            const sat = isWall ? 22 : 12;

            ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`;
            ctx.fillRect(sx * TILE_PX, sy * TILE_PX, TILE_PX, TILE_PX);
         }
      }

      // torch glow around the player
      const px = (p.x - camX) * TILE_PX + TILE_PX / 2;
      const py = (p.y - camY) * TILE_PX + TILE_PX / 2;
      const glow = ctx.createRadialGradient(px, py, TILE_PX, px, py, TILE_PX * 6);
      glow.addColorStop(0, 'rgba(255, 170, 80, 0.10)');
      glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // stairs are remembered once seen, even out of sight
      if (game.stairs) {
         const { x, y } = game.stairs;
         if (game.explored[y][x] &&
             x >= camX && x < camX + VIEW_W && y >= camY && y < camY + VIEW_H) {
            const visible = game.visible.has(x + ',' + y);
            drawGlyph('🪜', x - camX, y - camY, 1, visible ? 1 : 0.35);
         }
      }

      // ground items (visible tiles only)
      for (const item of game.items) {
         if (!game.visible.has(item.x + ',' + item.y)) continue;
         if (item.x < camX || item.x >= camX + VIEW_W || item.y < camY || item.y >= camY + VIEW_H) continue;
         const glyph = item.gold !== undefined ? '💰' : gameItemGlyph(item.id);
         drawGlyph(glyph, item.x - camX, item.y - camY, 0.85);
      }

      // monsters
      for (const monster of game.monsters) {
         if (!game.visible.has(monster.x + ',' + monster.y)) continue;
         if (monster.x < camX || monster.x >= camX + VIEW_W || monster.y < camY || monster.y >= camY + VIEW_H) continue;
         const sx = monster.x - camX;
         const sy = monster.y - camY;
         drawGlyph(monster.glyph, sx, sy, monster.boss ? 1.25 : 1);

         if (monster.hp < monster.maxHp) {
            const barW = TILE_PX - 8;
            ctx.fillStyle = '#1a0505';
            ctx.fillRect(sx * TILE_PX + 4, sy * TILE_PX + 1, barW, 3);
            ctx.fillStyle = '#a4262c';
            ctx.fillRect(sx * TILE_PX + 4, sy * TILE_PX + 1, barW * (monster.hp / monster.maxHp), 3);
         }
      }

      // the adventurer
      drawGlyph(game.status === 'dead' ? '🪦' : '🧙', p.x - camX, p.y - camY);

      // vignette
      const vignette = ctx.createRadialGradient(
         canvas.width / 2, canvas.height / 2, canvas.height / 2.4,
         canvas.width / 2, canvas.height / 2, canvas.width / 1.2
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
   }

   return { draw };
}

function gameItemGlyph(id) {
   return ITEMS[id] ? ITEMS[id].glyph : '❓';
}
