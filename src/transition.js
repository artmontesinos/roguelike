/**
 * Full-screen special-effects transitions played on the 2D game canvas
 * between the main crawler and the 3D epilogue.
 */

const SHATTER_MS = 900;
const FLASH_MS = 600;

/**
 * Shatters the current frame into tumbling shards that fly outward, then
 * washes the screen in light before fading to black.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {() => void} onComplete - called once the canvas is solid black
 */
export function playFractureTransition(canvas, onComplete) {
   const ctx = canvas.getContext('2d');
   const { width, height } = canvas;

   const snapshot = document.createElement('canvas');
   snapshot.width = width;
   snapshot.height = height;
   snapshot.getContext('2d').drawImage(canvas, 0, 0);

   const cols = 10;
   const rows = 7;
   const shardW = width / cols;
   const shardH = height / rows;
   const cx = width / 2;
   const cy = height / 2;

   const shards = [];
   for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
         const sx = c * shardW;
         const sy = r * shardH;
         const px = sx + shardW / 2;
         const py = sy + shardH / 2;
         const dx = px - cx;
         const dy = py - cy;
         const dist = Math.hypot(dx, dy) || 1;
         shards.push({
            sx, sy,
            vx: dx / dist,
            vy: dy / dist,
            speed: 220 + Math.random() * 260,
            spin: (Math.random() - 0.5) * 0.015,
            delay: Math.random() * 180,
         });
      }
   }

   const start = performance.now();

   function frame(now) {
      const t = now - start;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      if (t < SHATTER_MS) {
         for (const shard of shards) {
            const local = Math.max(0, Math.min(1, (t - shard.delay) / (SHATTER_MS - shard.delay)));
            if (local <= 0) {
               ctx.drawImage(snapshot, shard.sx, shard.sy, shardW, shardH, shard.sx, shard.sy, shardW, shardH);
               continue;
            }
            const eased = local * local;
            const travel = eased * shard.speed;
            ctx.save();
            ctx.globalAlpha = 1 - local;
            ctx.translate(shard.sx + shardW / 2 + shard.vx * travel, shard.sy + shardH / 2 + shard.vy * travel);
            ctx.rotate(shard.spin * travel);
            ctx.drawImage(snapshot, shard.sx, shard.sy, shardW, shardH, -shardW / 2, -shardH / 2, shardW, shardH);
            ctx.restore();
         }
         requestAnimationFrame(frame);
      } else if (t < SHATTER_MS + FLASH_MS) {
         const ft = (t - SHATTER_MS) / FLASH_MS;
         const alpha = ft < 0.4 ? ft / 0.4 : 1 - (ft - 0.4) / 0.6;
         const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.8);
         glow.addColorStop(0, `rgba(255, 224, 170, ${Math.max(0, alpha)})`);
         glow.addColorStop(1, 'rgba(255, 224, 170, 0)');
         ctx.fillStyle = glow;
         ctx.fillRect(0, 0, width, height);
         requestAnimationFrame(frame);
      } else {
         onComplete();
      }
   }

   requestAnimationFrame(frame);
}
