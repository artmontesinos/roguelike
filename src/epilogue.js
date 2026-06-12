import * as THREE from 'three';
import {
   CRYPT_MAP, CRYPT_ROWS, CRYPT_COLS, CRYPT_TILE,
   cryptTileCenter, cryptBlockedAt, cryptStart,
} from './crypt.js';
import { CryptSim } from './cryptCombat.js';

const WALL_HEIGHT = 2.6;
const MOVE_SPEED = 4.2;     // units / second
const HERO_RADIUS = 0.38;   // collision radius against walls
const REVEAL_RADIUS = 7;    // torchlight distance at which the crypt fades in
const REVEAL_SPEED = 2.4;   // reveal opacity per second

/**
 * Starts the post-victory 3D epilogue: a hooded thief — torch raised in one
 * hand, dagger in the other, cape streaming behind — explores a ruined crypt
 * beyond Darkhollow. Diablo-dark: the world is swallowed by fog and shadow,
 * and walls, braziers, and bones fade into view only as the torch nears
 * (a 3D fog of war). Beyond the broken north wall, something vast watches.
 * Built entirely from procedural geometry and materials — no external assets.
 *
 * When `opts.game` is a live run (`status === 'playing'`), a `CryptSim`
 * brings the crypt to life: monsters lunge out of the unrevealed dark, the
 * dagger swings (Space/X or the d-pad's center button), and kills feed xp,
 * loot, and gold back into the shared player state.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} width - render width in CSS pixels
 * @param {number} height - render height in CSS pixels
 * @param {object} [opts]
 * @param {import('./game.js').Game} [opts.game] - live run to fight with
 * @param {() => void} [opts.onStateChange] - player state changed (refresh UI)
 * @param {() => void} [opts.onHeroDeath] - hp hit 0; caller tears the scene down
 *
 * @return {{keys: Set<string>, sim: CryptSim|null, attack: () => void,
 *   dispose: () => void}} controller; `keys` holds lowercased keydown names
 *   (e.g. `'arrowup'`) and can be mutated by touch controls to drive movement
 */
export function startEpilogue(canvas, width, height, opts = {}) {
   const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
   renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
   renderer.setSize(width, height);

   const scene = new THREE.Scene();
   scene.background = new THREE.Color(0x030206);
   scene.fog = new THREE.FogExp2(0x030206, 0.05);

   const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);

   scene.add(new THREE.AmbientLight(0x16121f, 0.5));
   const moon = new THREE.DirectionalLight(0x303a66, 0.15);
   moon.position.set(-12, 18, -8);
   scene.add(moon);

   // Unrevealed crypt geometry starts invisible and fades in near the torch.
   const pending = [];
   const braziers = buildCrypt(scene, pending);

   // tiles the torch has touched, mirrored onto the corner minimap
   const revealedTiles = new Set();
   const minimap = setupMinimap();
   let eyeKnown = false;
   const rubbleKeys = [];
   for (let row = 0; row < CRYPT_ROWS; row++) {
      for (let col = 0; col < CRYPT_COLS; col++) {
         if (CRYPT_MAP[row][col] === '=') rubbleKeys.push(col + ',' + row);
      }
   }

   const hero = buildHero();
   scene.add(hero.group);

   const eye = buildEye();
   const northGap = cryptTileCenter(CRYPT_COLS / 2, 0);
   eye.group.position.set(0, 6.5, northGap.z - 11);
   scene.add(eye.group);

   const embers = buildEmbers();
   scene.add(embers.points);

   // live combat sim (only when entered with an ongoing run)
   const sim = opts.game && opts.game.status === 'playing'
      ? new CryptSim(opts.game, Math.floor(Math.random() * 2 ** 31))
      : null;
   const onStateChange = opts.onStateChange || (() => {});
   const onHeroDeath = opts.onHeroDeath || (() => {});
   const monsterViews = new Map();
   const lootViews = new Map();
   const dying = [];
   let stateDirty = false;
   let heroDead = false;
   let swingT = 0;
   let camShake = 0;
   if (sim) {
      for (const m of sim.monsters) {
         const view = buildMonsterView(m.type);
         view.group.position.set(m.x, 0, m.z);
         view.group.visible = false;
         scene.add(view.group);
         monsterViews.set(m.key, view);
      }
   }

   // hero wakes in the start chamber, facing north toward the Eye
   const start = cryptStart();
   const hero3 = { x: start.x, z: start.z, angle: Math.PI };
   let speedFactor = 0;
   const camOffset = new THREE.Vector3(0, 8.2, 6.4);
   camera.position.set(hero3.x + camOffset.x, camOffset.y, hero3.z + camOffset.z);
   camera.lookAt(hero3.x, 0.9, hero3.z);

   const keys = new Set();
   const onKeyDown = (e) => keys.add(e.key.toLowerCase());
   const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
   window.addEventListener('keydown', onKeyDown);
   window.addEventListener('keyup', onKeyUp);

   const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
   };
   window.addEventListener('resize', onResize);

   let last = performance.now();
   let raf = requestAnimationFrame(animate);

   function animate(now) {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      // eight-way screen-relative movement: up walks north (deeper in)
      let mx = 0;
      let mz = 0;
      if (keys.has('arrowup') || keys.has('w')) mz -= 1;
      if (keys.has('arrowdown') || keys.has('s')) mz += 1;
      if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
      if (keys.has('arrowright') || keys.has('d')) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      speedFactor += ((moving ? 1 : 0) - speedFactor) * Math.min(1, dt * 8);

      if (moving) {
         const len = Math.hypot(mx, mz);
         mx /= len;
         mz /= len;
         const step = MOVE_SPEED * dt;
         const nx = hero3.x + mx * step;
         if (!collides(nx, hero3.z)) hero3.x = nx;
         const nz = hero3.z + mz * step;
         if (!collides(hero3.x, nz)) hero3.z = nz;

         // turn smoothly toward the direction of travel
         const target = Math.atan2(mx, mz);
         let d = target - hero3.angle;
         d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
         hero3.angle += d * Math.min(1, dt * 10);
      }

      swingT = Math.max(0, swingT - dt * 4);
      camShake = Math.max(0, camShake - dt * 3);

      hero.group.position.set(hero3.x, 0, hero3.z);
      hero.group.rotation.y = hero3.angle;
      hero.animate(t, dt, speedFactor, swingT);

      if (sim) {
         if (keys.has(' ') || keys.has('x')) doAttack();
         sim.update(dt, hero3);
         for (const ev of sim.drainEvents()) handleEvent(ev);

         for (const m of sim.monsters) {
            const view = monsterViews.get(m.key);
            if (!view || m.dead) continue;
            view.group.position.set(m.x, 0, m.z);
            const dist = Math.hypot(m.x - hero3.x, m.z - hero3.z);
            view.group.visible = dist < REVEAL_RADIUS + 1.5;
            if (view.group.visible) {
               view.group.rotation.y = Math.atan2(hero3.x - m.x, hero3.z - m.z);
               view.flash = Math.max(0, view.flash - dt);
               view.group.scale.setScalar(1 + view.flash * 1.4);
               view.animate(t, m.awake);
            }
         }

         for (let i = dying.length - 1; i >= 0; i--) {
            const d = dying[i];
            d.t += dt;
            const k = Math.min(1, d.t / 0.7);
            d.view.group.scale.setScalar(Math.max(0.01, 1 - k * 0.8));
            d.view.group.position.y = -0.7 * k;
            if (k >= 1) {
               removeFromScene(d.view.group);
               dying.splice(i, 1);
            }
         }

         for (const [, lootView] of lootViews) {
            lootView.group.position.y = 0.25 + Math.sin(t * 3 + lootView.phase) * 0.07;
            lootView.group.rotation.y = t * 1.5 + lootView.phase;
         }

         if (stateDirty) {
            stateDirty = false;
            onStateChange();
         }
         if (heroDead) {
            onHeroDeath();
            return;
         }
      }

      updateReveal(pending, hero3.x, hero3.z, dt, revealedTiles);
      if (!eyeKnown) eyeKnown = rubbleKeys.some((key) => revealedTiles.has(key));
      if (minimap) drawMinimap(minimap, hero3, revealedTiles, eyeKnown, sim);

      camera.position.lerp(
         new THREE.Vector3(hero3.x + camOffset.x, camOffset.y, hero3.z + camOffset.z),
         0.1
      );
      camera.position.x += (Math.random() - 0.5) * 0.22 * camShake;
      camera.position.y += (Math.random() - 0.5) * 0.16 * camShake;
      camera.lookAt(hero3.x, 0.9, hero3.z);

      for (const brazier of braziers) {
         brazier.light.intensity =
            brazier.reveal.amount *
            (brazier.base + Math.sin(t * 9 + brazier.phase) * 0.3 + (Math.random() - 0.5) * 0.1);
      }

      eye.animate(t);
      embers.animate();

      renderer.render(scene, camera);
   }

   /** Swings the dagger; renderer-side feedback comes back via events. */
   function doAttack() {
      if (!sim) return;
      if (sim.heroAttack(hero3)) swingT = 1;
      for (const ev of sim.drainEvents()) handleEvent(ev);
   }

   function handleEvent(ev) {
      if (ev.type === 'monsterHit') {
         const view = monsterViews.get(ev.key);
         if (view) view.flash = 0.18;
         stateDirty = true;
      } else if (ev.type === 'monsterDie') {
         const view = monsterViews.get(ev.key);
         if (view) {
            dying.push({ view, t: 0 });
            monsterViews.delete(ev.key);
         }
         stateDirty = true;
      } else if (ev.type === 'heroHit') {
         camShake = 1;
         stateDirty = true;
      } else if (ev.type === 'heroDeath') {
         heroDead = true;
         stateDirty = true;
      } else if (ev.type === 'lootSpawn') {
         const view = buildLootView(ev.loot);
         scene.add(view.group);
         lootViews.set(ev.loot.key, view);
      } else if (ev.type === 'lootTaken') {
         const view = lootViews.get(ev.key);
         if (view) {
            removeFromScene(view.group);
            lootViews.delete(ev.key);
         }
         stateDirty = true;
      } else if (ev.type === 'wake') {
         stateDirty = true;
      }
   }

   /** Removes a group and frees its GPU resources (it won't be in the final traverse). */
   function removeFromScene(group) {
      scene.remove(group);
      group.traverse((obj) => {
         if (obj.geometry) obj.geometry.dispose();
         if (obj.material) {
            for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
               if (mat.map) mat.map.dispose();
               mat.dispose();
            }
         }
      });
   }

   return {
      keys,
      sim,
      attack: doAttack,
      dispose() {
         cancelAnimationFrame(raf);
         window.removeEventListener('keydown', onKeyDown);
         window.removeEventListener('keyup', onKeyUp);
         window.removeEventListener('resize', onResize);
         scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
               for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
                  if (mat.map) mat.map.dispose();
                  mat.dispose();
               }
            }
         });
         renderer.dispose();
      },
   };
}

/** Wall collision for the hero's circle, checked at its four corners. */
function collides(x, z) {
   const r = HERO_RADIUS;
   return cryptBlockedAt(x - r, z - r) || cryptBlockedAt(x + r, z - r) ||
          cryptBlockedAt(x - r, z + r) || cryptBlockedAt(x + r, z + r);
}

/**
 * Registers an object for the fog-of-war reveal: all its materials are
 * cloned, made transparent, and start at opacity 0. `key` is the object's
 * "col,row" map tile, reported to the minimap once revealing starts.
 */
function makeRevealable(obj, x, z, pending, key) {
   const mats = [];
   obj.traverse((o) => {
      if (o.material) {
         o.material = o.material.clone();
         o.material.transparent = true;
         o.material.opacity = 0;
         mats.push(o.material);
      }
   });
   const entry = { x, z, key, amount: 0, mats };
   pending.push(entry);
   return entry;
}

/** Fades in any pending geometry within torch range; revealed tiles stay lit. */
function updateReveal(pending, px, pz, dt, revealedTiles) {
   for (let i = pending.length - 1; i >= 0; i--) {
      const entry = pending[i];
      if (entry.amount === 0 && Math.hypot(entry.x - px, entry.z - pz) > REVEAL_RADIUS) continue;
      entry.amount = Math.min(1, entry.amount + REVEAL_SPEED * dt);
      revealedTiles.add(entry.key);
      for (const mat of entry.mats) mat.opacity = entry.amount;
      if (entry.amount >= 1) {
         for (const mat of entry.mats) {
            mat.transparent = false;
            mat.needsUpdate = true;
         }
         pending.splice(i, 1);
      }
   }
}

/** Sizes the corner minimap canvas to the crypt map, if it's in the page. */
function setupMinimap() {
   const canvas = document.getElementById('minimap');
   if (!canvas) return null;
   const scale = 7;
   canvas.width = CRYPT_COLS * scale;
   canvas.height = CRYPT_ROWS * scale;
   return { canvas, ctx: canvas.getContext('2d'), scale };
}

/**
 * Redraws the minimap: only torch-revealed tiles appear, with brazier dots,
 * awake monsters in red, dropped loot in gold, a gold arrow for the hero's
 * position/facing, and — once the rubble vantage has been found — a red
 * glow at the north edge marking the Eye.
 */
function drawMinimap(minimap, hero3, revealedTiles, eyeKnown, sim) {
   const { canvas, ctx, scale } = minimap;
   ctx.fillStyle = '#050408';
   ctx.fillRect(0, 0, canvas.width, canvas.height);

   for (let row = 0; row < CRYPT_ROWS; row++) {
      for (let col = 0; col < CRYPT_COLS; col++) {
         if (!revealedTiles.has(col + ',' + row)) continue;
         const tile = CRYPT_MAP[row][col];
         ctx.fillStyle = tile === '#' ? '#6b5a3e' : tile === '=' ? '#8a6a3a' : '#352e24';
         ctx.fillRect(col * scale, row * scale, scale, scale);
         if (tile === 't') {
            ctx.fillStyle = '#ffaa33';
            ctx.beginPath();
            ctx.arc((col + 0.5) * scale, (row + 0.5) * scale, scale * 0.28, 0, Math.PI * 2);
            ctx.fill();
         }
      }
   }

   if (eyeKnown) {
      ctx.fillStyle = 'rgba(255, 50, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, scale * 0.7, scale * 0.55, 0, Math.PI * 2);
      ctx.fill();
   }

   const toMap = (x, z) => [
      (x / CRYPT_TILE + CRYPT_COLS / 2) * scale,
      (z / CRYPT_TILE + CRYPT_ROWS / 2) * scale,
   ];

   if (sim) {
      ctx.fillStyle = '#ffd75e';
      for (const piece of sim.loot) {
         const [lx, ly] = toMap(piece.x, piece.z);
         ctx.fillRect(lx - scale * 0.18, ly - scale * 0.18, scale * 0.36, scale * 0.36);
      }
      ctx.fillStyle = '#e0392b';
      for (const m of sim.monsters) {
         if (m.dead || !m.awake) continue;
         const [mx, my] = toMap(m.x, m.z);
         ctx.beginPath();
         ctx.arc(mx, my, scale * 0.32, 0, Math.PI * 2);
         ctx.fill();
      }
   }

   // hero arrow: map north is up, so a hero angle of PI (facing -z) points up
   const hx = (hero3.x / CRYPT_TILE + CRYPT_COLS / 2) * scale;
   const hy = (hero3.z / CRYPT_TILE + CRYPT_ROWS / 2) * scale;
   ctx.save();
   ctx.translate(hx, hy);
   ctx.rotate(Math.PI - hero3.angle);
   ctx.fillStyle = '#c9a227';
   ctx.beginPath();
   ctx.moveTo(0, -scale * 0.65);
   ctx.lineTo(scale * 0.45, scale * 0.45);
   ctx.lineTo(-scale * 0.45, scale * 0.45);
   ctx.closePath();
   ctx.fill();
   ctx.restore();
}

/**
 * Builds the crypt from the tile map: chunky stone floors, blocky walls with
 * visible mortar courses, waist-high rubble at the broken north wall, plus
 * braziers, bones, and debris. Every piece is registered as revealable.
 *
 * @return {Array<{light: THREE.PointLight, base: number, phase: number, reveal: object}>}
 *   brazier flames to flicker each frame
 */
function buildCrypt(scene, pending) {
   const stoneTex = makeStoneTexture();
   const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x7a6a4e, roughness: 0.92 });
   const floorMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x4e4639, roughness: 0.96 });
   const rubbleMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x5c4f3a, roughness: 0.95 });
   const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.9 });

   const wallGeo = new THREE.BoxGeometry(CRYPT_TILE, WALL_HEIGHT, CRYPT_TILE);
   const floorGeo = new THREE.BoxGeometry(CRYPT_TILE, 0.2, CRYPT_TILE);
   const rubbleGeo = new THREE.BoxGeometry(CRYPT_TILE, 0.9, CRYPT_TILE * 0.8);

   const braziers = [];

   for (let row = 0; row < CRYPT_ROWS; row++) {
      for (let col = 0; col < CRYPT_COLS; col++) {
         const tile = CRYPT_MAP[row][col];
         if (tile === ' ') continue;
         const { x, z } = cryptTileCenter(col, row);
         const key = col + ',' + row;

         if (tile === '#') {
            const wall = new THREE.Mesh(wallGeo, wallMat);
            const h = WALL_HEIGHT * (0.92 + Math.random() * 0.16);
            wall.scale.y = h / WALL_HEIGHT;
            wall.position.set(x, h / 2, z);
            varyTint(makeRevealable(wall, x, z, pending, key));
            scene.add(wall);
            continue;
         }

         // every walkable (and rubble) tile gets a floor slab
         const floor = new THREE.Mesh(floorGeo, floorMat);
         floor.position.set(x, -0.1, z);
         varyTint(makeRevealable(floor, x, z, pending, key));
         scene.add(floor);

         if (tile === '=') {
            const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
            rubble.position.set(x, 0.45, z);
            rubble.rotation.y = (Math.random() - 0.5) * 0.2;
            varyTint(makeRevealable(rubble, x, z, pending, key));
            scene.add(rubble);
         } else if (tile === 't') {
            const brazier = buildBrazier();
            brazier.group.position.set(x, 0, z);
            const reveal = makeRevealable(brazier.group, x, z, pending, key);
            braziers.push({ light: brazier.light, base: 1.6, phase: row * 7 + col, reveal });
            scene.add(brazier.group);
         } else if (tile === 'b') {
            const bones = buildBones(boneMat);
            bones.position.set(x, 0, z);
            makeRevealable(bones, x, z, pending, key);
            scene.add(bones);
         } else if (tile === 'r') {
            const pile = buildRubblePile(rubbleMat);
            pile.position.set(x, 0, z);
            varyTint(makeRevealable(pile, x, z, pending, key));
            scene.add(pile);
         }
      }
   }

   return braziers;
}

/** Slight per-tile brightness variance so the stonework reads as masonry. */
function varyTint(revealEntry) {
   const k = 0.82 + Math.random() * 0.32;
   for (const mat of revealEntry.mats) {
      if (mat.color) mat.color.multiplyScalar(k);
   }
}

/** A standing iron brazier with a guttering flame and its light. */
function buildBrazier() {
   const group = new THREE.Group();
   const iron = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 0.7, metalness: 0.4 });

   const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.1, 8), iron);
   pole.position.y = 0.55;
   group.add(pole);

   const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.16, 10), iron);
   bowl.position.y = 1.14;
   group.add(bowl);

   const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff7700, emissiveIntensity: 2.2 })
   );
   flame.position.y = 1.32;
   group.add(flame);

   const light = new THREE.PointLight(0xff9944, 0, 9, 2);
   light.position.y = 1.45;
   group.add(light);

   return { group, light };
}

/** A scatter of old bones: a few fallen long bones and a skull. */
function buildBones(boneMat) {
   const group = new THREE.Group();
   for (let i = 0; i < 3; i++) {
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 3, 6), boneMat);
      bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      bone.position.set((Math.random() - 0.5) * 0.9, 0.05, (Math.random() - 0.5) * 0.9);
      group.add(bone);
   }
   const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), boneMat);
   skull.position.set((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6);
   skull.scale.y = 0.85;
   group.add(skull);
   return group;
}

/** A small heap of fallen masonry. */
function buildRubblePile(rubbleMat) {
   const group = new THREE.Group();
   for (let i = 0; i < 3; i++) {
      const size = 0.18 + Math.random() * 0.18;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rubbleMat);
      rock.position.set((Math.random() - 0.5) * 0.8, size * 0.7, (Math.random() - 0.5) * 0.8);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(rock);
   }
   return group;
}

/** Generates a tileable stone-block texture (no external image assets). */
function makeStoneTexture() {
   const size = 256;
   const c = document.createElement('canvas');
   c.width = c.height = size;
   const ctx = c.getContext('2d');

   ctx.fillStyle = '#3a3024';
   ctx.fillRect(0, 0, size, size);

   for (let i = 0; i < 1000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = Math.floor(Math.random() * 24) - 12;
      const shade = 30 + v;
      ctx.fillStyle = `rgba(${shade + 20}, ${shade + 16}, ${shade + 10}, ${0.15 + Math.random() * 0.3})`;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
   }

   ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
   ctx.lineWidth = 2;
   const cell = size / 4;
   for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.stroke();
   }

   const tex = new THREE.CanvasTexture(c);
   tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
   return tex;
}

/**
 * The hooded thief: slim and low to the ground, amber eyes glinting under a
 * dark cowl, torch raised in the right hand, a steel dagger in the left, and
 * a cape that drapes at rest and streams behind him as he runs (animated at
 * the vertex level). The model faces +z when its rotation is 0.
 *
 * `animate(t, dt, speedFactor)` drives the sneak-run lean, leg swing, cape
 * physics, torch flicker, and the trail of embers rising off the torch.
 */
function buildHero() {
   const group = new THREE.Group();
   const body = new THREE.Group();
   group.add(body);

   const cloth = new THREE.MeshStandardMaterial({ color: 0x221e2c, roughness: 0.9 });
   const leather = new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.85 });
   const capeMat = new THREE.MeshStandardMaterial({ color: 0x191622, roughness: 0.95, side: THREE.DoubleSide });
   const trim = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6 });
   const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.8 });
   const limb = new THREE.MeshStandardMaterial({ color: 0x1c1812, roughness: 0.85 });

   const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 8), leather);
   torso.position.y = 0.95;
   body.add(torso);

   const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.46, 10), cloth);
   hood.position.y = 1.5;
   hood.rotation.x = 0.16;
   body.add(hood);

   const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a7a64, roughness: 0.8 }));
   face.position.set(0, 1.37, 0.06);
   body.add(face);

   const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 1.6 });
   for (const side of [-1, 1]) {
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
      glint.position.set(side * 0.06, 1.4, 0.18);
      body.add(glint);
   }

   const belt = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 16), trim);
   belt.rotation.x = Math.PI / 2;
   belt.position.y = 0.72;
   body.add(belt);

   const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.65, 8);
   const legL = new THREE.Mesh(legGeo, limb);
   const legR = new THREE.Mesh(legGeo, limb);
   legL.position.set(-0.12, 0.33, 0);
   legR.position.set(0.12, 0.33, 0);
   body.add(legL, legR);

   // right arm raised, holding the torch high
   const armGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8);
   const armR = new THREE.Mesh(armGeo, cloth);
   armR.position.set(0.34, 1.32, 0.05);
   armR.rotation.z = -0.85;
   body.add(armR);

   const torchGroup = new THREE.Group();
   const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), limb);
   const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff7700, emissiveIntensity: 2.5 })
   );
   flame.position.y = 0.26;
   torchGroup.add(handle, flame);
   torchGroup.position.set(0.52, 1.6, 0.1);
   body.add(torchGroup);

   const torchLight = new THREE.PointLight(0xff9944, 2.4, 11, 2);
   torchLight.position.set(0.52, 1.85, 0.1);
   body.add(torchLight);

   // left arm forward and low, dagger drawn
   const armL = new THREE.Mesh(armGeo, cloth);
   armL.position.set(-0.3, 1.08, 0.18);
   armL.rotation.x = 1.15;
   body.add(armL);

   const dagger = new THREE.Group();
   const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 6), steel);
   blade.rotation.x = Math.PI / 2;
   const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), trim);
   dagger.add(blade, guard);
   dagger.position.set(-0.3, 0.98, 0.42);
   body.add(dagger);

   const capeGeo = new THREE.PlaneGeometry(0.62, 1.05, 3, 6);
   capeGeo.translate(0, -0.525, 0);
   const cape = new THREE.Mesh(capeGeo, capeMat);
   cape.position.set(0, 1.42, -0.18);
   body.add(cape);

   // embers shed by the torch, drifting upward in the hero's local space
   const trailCount = 14;
   const trailPos = new Float32Array(trailCount * 3);
   const trailLife = new Float32Array(trailCount);
   const trailGeo = new THREE.BufferGeometry();
   trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
   const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
   }));
   body.add(trail);

   function resetEmber(i) {
      trailPos[i * 3] = 0.52 + (Math.random() - 0.5) * 0.08;
      trailPos[i * 3 + 1] = 1.85;
      trailPos[i * 3 + 2] = 0.1 + (Math.random() - 0.5) * 0.08;
      trailLife[i] = 0.3 + Math.random() * 0.8;
   }
   for (let i = 0; i < trailCount; i++) resetEmber(i);

   function animate(t, dt, speedFactor, attackT = 0) {
      // sneak-run: lean into the dark, slight crouch, quick leg swing
      body.rotation.x = 0.18 * speedFactor + attackT * 0.12;
      body.position.y = -0.05 * speedFactor + Math.sin(t * 2) * 0.012;

      const swing = Math.sin(t * 10) * 0.55 * speedFactor;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;

      // dagger jab: arm thrusts forward over the swing's decay
      armL.rotation.x = 1.15 - attackT * 0.85 + Math.sin(t * 10) * 0.18 * speedFactor;
      dagger.position.z = 0.42 + attackT * 0.32;

      // cape: drapes at rest, billows and ripples behind him at speed
      const pos = capeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
         const x = pos.getX(i);
         const y = pos.getY(i);
         const drape = -y / 1.05; // 0 at the shoulders, 1 at the hem
         const billow = drape * drape * (0.22 + speedFactor * 0.7);
         const ripple = Math.sin(t * (3 + speedFactor * 7) + y * 5 + x * 3) * 0.06 * drape;
         pos.setZ(i, -billow + ripple);
      }
      pos.needsUpdate = true;
      capeGeo.computeVertexNormals();

      flame.scale.setScalar(1 + Math.sin(t * 20) * 0.15);
      torchLight.intensity = 2.4 + Math.sin(t * 15) * 0.3;

      for (let i = 0; i < trailCount; i++) {
         trailLife[i] -= dt;
         if (trailLife[i] <= 0) {
            resetEmber(i);
            continue;
         }
         trailPos[i * 3] += (Math.random() - 0.5) * 0.01;
         trailPos[i * 3 + 1] += dt * 1.1;
         trailPos[i * 3 + 2] += (Math.random() - 0.5) * 0.01;
      }
      trailGeo.attributes.position.needsUpdate = true;
   }

   return { group, animate };
}

/** Picks the primitive-built model for a monster type. */
function buildMonsterView(type) {
   const view = type === 'spider' ? buildSpiderView()
      : type === 'wraith' ? buildWraithView()
      : buildSkeletonView();
   view.flash = 0;
   return view;
}

/** A shambling skeleton with ember eyes and a corroded blade. */
function buildSkeletonView() {
   const group = new THREE.Group();
   const bone = new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 0.85 });

   const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 8), bone);
   torso.position.y = 1.0;
   group.add(torso);

   const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), bone);
   skull.position.y = 1.48;
   skull.scale.y = 0.9;
   group.add(skull);

   const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5500, emissiveIntensity: 1.6 });
   for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
      eye.position.set(side * 0.06, 1.5, 0.13);
      group.add(eye);
   }

   const limbGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6);
   const armL = new THREE.Mesh(limbGeo, bone);
   const armR = new THREE.Mesh(limbGeo, bone);
   armL.position.set(-0.3, 1.05, 0);
   armR.position.set(0.3, 1.05, 0);
   group.add(armL, armR);

   const legL = new THREE.Mesh(limbGeo, bone);
   const legR = new THREE.Mesh(limbGeo, bone);
   legL.position.set(-0.11, 0.32, 0);
   legR.position.set(0.11, 0.32, 0);
   group.add(legL, legR);

   const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x5e6166, roughness: 0.5, metalness: 0.7 })
   );
   blade.position.set(0.36, 0.85, 0.18);
   blade.rotation.x = 0.9;
   group.add(blade);

   function animate(t, awake) {
      const drive = awake ? 1 : 0.15;
      group.rotation.z = Math.sin(t * 5) * 0.06 * drive;
      const step = Math.sin(t * 7) * 0.4 * drive;
      legL.rotation.x = step;
      legR.rotation.x = -step;
      armL.rotation.x = -step * 0.7;
      armR.rotation.x = step * 0.7;
   }

   return { group, animate };
}

/** A low, scuttling crypt spider with burning red eyes. */
function buildSpiderView() {
   const group = new THREE.Group();
   const chitin = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.9 });

   const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), chitin);
   body.position.y = 0.32;
   body.scale.set(1, 0.7, 1.2);
   group.add(body);

   const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), chitin);
   head.position.set(0, 0.3, 0.36);
   group.add(head);

   const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2200, emissiveIntensity: 2 });
   for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
      eye.position.set(side * 0.06, 0.34, 0.48);
      group.add(eye);
   }

   const legs = [];
   const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.55, 5);
   for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
         const leg = new THREE.Mesh(legGeo, chitin);
         leg.position.set(side * 0.3, 0.28, -0.25 + i * 0.17);
         leg.rotation.z = side * 1.15;
         legs.push({ mesh: leg, base: side * 1.15, phase: i * 1.7 + (side > 0 ? 0.9 : 0) });
         group.add(leg);
      }
   }

   function animate(t, awake) {
      const drive = awake ? 1 : 0.25;
      for (const leg of legs) {
         leg.mesh.rotation.z = leg.base + Math.sin(t * 16 + leg.phase) * 0.13 * drive;
      }
      body.position.y = 0.32 + Math.sin(t * 9) * 0.015 * drive;
   }

   return { group, animate };
}

/** A drifting wraith: a translucent shroud around a cold inner light. */
function buildWraithView() {
   const group = new THREE.Group();

   const shroud = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 1.5, 10, 1, true),
      new THREE.MeshStandardMaterial({
         color: 0x141026, roughness: 1,
         transparent: true, opacity: 0.78, side: THREE.DoubleSide,
      })
   );
   shroud.position.y = 0.95;
   group.add(shroud);

   const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x224436, emissive: 0x7dffd2, emissiveIntensity: 2 })
   );
   core.position.y = 1.1;
   group.add(core);

   const glow = new THREE.PointLight(0x66ffcc, 0.7, 5, 2);
   glow.position.y = 1.1;
   group.add(glow);

   function animate(t, awake) {
      const drift = Math.sin(t * 2) * 0.12;
      shroud.position.y = 0.95 + drift;
      core.position.y = 1.1 + drift;
      glow.position.y = 1.1 + drift;
      shroud.rotation.y = t * 0.6;
      shroud.material.opacity = 0.7 + Math.sin(t * 3) * 0.08;
      glow.intensity = (awake ? 0.9 : 0.5) + Math.sin(t * 4) * 0.15;
   }

   return { group, animate };
}

/** Tints for dropped materials; gold piles get their own octahedron. */
const LOOT_COLORS = {
   hide: 0x8a5a33, bone: 0xe6dec4, gem: 0xd03048, mushroom: 0xb08ab0,
   iron: 0x9aa0aa, wood: 0x8a6a3c, herb: 0x57904a,
};

/** A small glowing pickup bobbing where a monster fell. */
function buildLootView(loot) {
   const isGold = loot.gold !== undefined;
   const color = isGold ? 0xe8c34a : (LOOT_COLORS[loot.id] || 0xc9a227);
   const mesh = new THREE.Mesh(
      isGold ? new THREE.OctahedronGeometry(0.14, 0) : new THREE.IcosahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4 })
   );
   const group = new THREE.Group();
   group.add(mesh);
   group.position.set(loot.x, 0.25, loot.z);
   return { group, phase: Math.random() * Math.PI * 2 };
}

/**
 * The vast presence beyond Darkhollow: a dark, faceted shell with a glowing
 * eye that looms past the broken north wall. `animate(t)` pulses its glow.
 */
function buildEye() {
   const group = new THREE.Group();

   const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(7, 1),
      new THREE.MeshStandardMaterial({ color: 0x0a0810, roughness: 1, flatShading: true })
   );
   group.add(shell);

   const iris = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2200, emissiveIntensity: 1 })
   );
   iris.position.z = 6.4;
   group.add(iris);

   const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffaa00, emissiveIntensity: 0.6 })
   );
   pupil.position.z = 7.3;
   group.add(pupil);

   const glow = new THREE.PointLight(0xff3300, 2, 40, 2);
   glow.position.z = 7;
   group.add(glow);

   function animate(t) {
      group.rotation.y = Math.sin(t * 0.05) * 0.12;
      const pulse = 0.6 + Math.sin(t * 0.6) * 0.4;
      iris.material.emissiveIntensity = 0.6 + pulse;
      pupil.material.emissiveIntensity = 0.4 + pulse * 0.8;
      glow.intensity = 1 + pulse * 4;
   }

   return { group, animate };
}

/** Drifting embers rising through the crypt, additive-blended points. */
function buildEmbers() {
   const count = 90;
   const spanX = (CRYPT_COLS / 2) * CRYPT_TILE;
   const spanZ = (CRYPT_ROWS / 2) * CRYPT_TILE;
   const positions = new Float32Array(count * 3);
   const speeds = new Float32Array(count);

   for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * spanX;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * spanZ;
      speeds[i] = 0.01 + Math.random() * 0.02;
   }

   const geometry = new THREE.BufferGeometry();
   geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
   const material = new THREE.PointsMaterial({
      color: 0xffaa33,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
   });
   const points = new THREE.Points(geometry, material);

   function animate() {
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
         pos[i * 3 + 1] += speeds[i];
         if (pos[i * 3 + 1] > 5) pos[i * 3 + 1] = 0;
      }
      geometry.attributes.position.needsUpdate = true;
   }

   return { points, animate };
}
