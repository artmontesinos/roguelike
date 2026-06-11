import * as THREE from 'three';

const PLATFORM_RADIUS = 14;
const MOVE_SPEED = 4;   // units / second
const TURN_SPEED = 2.2; // radians / second

/**
 * Starts the post-victory 3D epilogue: the adventurer steps onto a shattered
 * platform adrift in the dark beyond Darkhollow, where something vast and
 * ancient watches from the fog. Built entirely from procedural geometry and
 * materials (low-poly figures, generated stone textures, particle embers) —
 * same dark-fantasy palette as the 2D crawler, no external assets.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} width - render width in CSS pixels
 * @param {number} height - render height in CSS pixels
 *
 * @return {{dispose: () => void}} controller to tear down the scene
 */
export function startEpilogue(canvas, width, height) {
   const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
   renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
   renderer.setSize(width, height);
   renderer.shadowMap.enabled = true;
   renderer.shadowMap.type = THREE.PCFSoftShadowMap;

   const scene = new THREE.Scene();
   scene.background = new THREE.Color(0x05050a);
   scene.fog = new THREE.FogExp2(0x05050a, 0.022);

   const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);

   buildLighting(scene);
   const torchLights = buildPillars(scene);
   const hero = buildHero();
   scene.add(hero.group);
   const eye = buildEye();
   eye.group.position.set(0, 9, -PLATFORM_RADIUS * 1.8);
   scene.add(eye.group);
   const embers = buildEmbers();
   scene.add(embers.points);
   scene.add(buildGround());

   // hero starts near the platform's edge, facing out toward the Eye
   const hero3 = { x: 0, z: PLATFORM_RADIUS - 3, angle: 0 };
   const camDist = 5;
   const camHeight = 2.6;
   camera.position.set(hero3.x, camHeight, hero3.z + camDist);
   camera.lookAt(hero3.x, 1.2, hero3.z);

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

      if (keys.has('arrowleft') || keys.has('a')) hero3.angle += TURN_SPEED * dt;
      if (keys.has('arrowright') || keys.has('d')) hero3.angle -= TURN_SPEED * dt;

      const fx = -Math.sin(hero3.angle);
      const fz = -Math.cos(hero3.angle);
      let moving = false;
      if (keys.has('arrowup') || keys.has('w')) {
         hero3.x += fx * MOVE_SPEED * dt;
         hero3.z += fz * MOVE_SPEED * dt;
         moving = true;
      }
      if (keys.has('arrowdown') || keys.has('s')) {
         hero3.x -= fx * MOVE_SPEED * dt;
         hero3.z -= fz * MOVE_SPEED * dt;
         moving = true;
      }

      // keep the adventurer on the platform
      const dist = Math.hypot(hero3.x, hero3.z);
      if (dist > PLATFORM_RADIUS - 1.5) {
         const scale = (PLATFORM_RADIUS - 1.5) / dist;
         hero3.x *= scale;
         hero3.z *= scale;
      }

      hero.group.position.set(hero3.x, 0, hero3.z);
      hero.group.rotation.y = hero3.angle;
      hero.animate(t, moving);

      camera.position.lerp(
         new THREE.Vector3(hero3.x - fx * camDist, camHeight, hero3.z - fz * camDist),
         0.08
      );
      camera.lookAt(hero3.x, 1.2, hero3.z);

      for (const torch of torchLights) {
         torch.light.intensity = torch.base + Math.sin(t * 9 + torch.phase) * 0.25 + (Math.random() - 0.5) * 0.1;
      }

      eye.animate(t);
      embers.animate();

      renderer.render(scene, camera);
   }

   return {
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

/** Dim cool ambience plus a far moonlight glow — torches do the real work. */
function buildLighting(scene) {
   scene.add(new THREE.AmbientLight(0x202035, 0.7));
   const moon = new THREE.DirectionalLight(0x4060a0, 0.3);
   moon.position.set(-12, 18, -8);
   scene.add(moon);
}

/** Procedurally textured stone disc the platform rests on. */
function buildGround() {
   const tex = makeStoneTexture();
   tex.repeat.set(6, 6);
   const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x6b5a3c, roughness: 0.95, metalness: 0.03 });
   const ground = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 1.04, 1, 48), mat);
   ground.position.y = -0.5;
   ground.receiveShadow = true;
   return ground;
}

/** A ring of broken pillars around the platform edge, half of them lit by torches. */
function buildPillars(scene) {
   const tex = makeStoneTexture();
   const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x4a3c28, roughness: 0.9 });
   const flameMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff7700, emissiveIntensity: 2.2 });
   const torchLights = [];
   const count = 8;

   for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = PLATFORM_RADIUS - 1.3;
      const h = 2 + Math.random() * 2.5;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, h, 12), mat);
      pillar.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
      pillar.castShadow = true;
      scene.add(pillar);

      if (i % 2 === 0) {
         const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), flameMat);
         flame.position.set(pillar.position.x, h + 0.3, pillar.position.z);
         scene.add(flame);

         const light = new THREE.PointLight(0xff9944, 1.4, 13, 2);
         light.position.copy(flame.position);
         scene.add(light);
         torchLights.push({ light, base: 1.4, phase: i });
      }
   }

   return torchLights;
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
 * A low-poly adventurer built from primitives, carrying the same torch
 * glyph from the 2D game. `animate(t, moving)` drives idle breathing and a
 * walk-cycle leg/arm swing.
 */
function buildHero() {
   const group = new THREE.Group();

   const robeMat = new THREE.MeshStandardMaterial({ color: 0x6e1f17, roughness: 0.7 });
   const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.6 });
   const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6 });
   const limbMat = new THREE.MeshStandardMaterial({ color: 0x3a2c15, roughness: 0.8 });

   const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), robeMat);
   torso.position.y = 1.1;
   torso.castShadow = true;
   group.add(torso);

   const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), skinMat);
   head.position.y = 1.75;
   head.castShadow = true;
   group.add(head);

   const belt = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 8, 16), trimMat);
   belt.rotation.x = Math.PI / 2;
   belt.position.y = 0.85;
   group.add(belt);

   const legGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8);
   const legL = new THREE.Mesh(legGeo, limbMat);
   const legR = new THREE.Mesh(legGeo, limbMat);
   legL.position.set(-0.15, 0.4, 0);
   legR.position.set(0.15, 0.4, 0);
   legL.castShadow = legR.castShadow = true;
   group.add(legL, legR);

   const armGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.6, 8);
   const armL = new THREE.Mesh(armGeo, robeMat);
   const armR = new THREE.Mesh(armGeo, robeMat);
   armL.position.set(-0.45, 1.15, 0);
   armR.position.set(0.45, 1.15, 0);
   group.add(armL, armR);

   const torchGroup = new THREE.Group();
   const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), limbMat);
   const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff7700, emissiveIntensity: 2.5 })
   );
   flame.position.y = 0.3;
   torchGroup.add(handle, flame);
   torchGroup.position.set(0.5, 0.9, 0.15);
   group.add(torchGroup);

   const torchLight = new THREE.PointLight(0xff9944, 1.2, 6, 2);
   torchLight.position.set(0.5, 1.3, 0.15);
   group.add(torchLight);

   function animate(t, moving) {
      const bob = moving ? Math.sin(t * 8) : Math.sin(t * 2) * 0.3;
      torso.position.y = 1.1 + bob * 0.04;
      head.position.y = 1.75 + bob * 0.04;

      const swing = moving ? Math.sin(t * 8) * 0.5 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.6;
      armR.rotation.x = swing * 0.6;

      flame.scale.setScalar(1 + Math.sin(t * 20) * 0.15);
      torchLight.intensity = 1.2 + Math.sin(t * 15) * 0.2;
   }

   return { group, animate };
}

/**
 * The vast presence beyond Darkhollow: a dark, faceted shell with a glowing
 * eye that slowly drifts open. `animate(t)` pulses its emissive glow.
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

/** Drifting embers rising from the platform, additive-blended points. */
function buildEmbers() {
   const count = 90;
   const positions = new Float32Array(count * 3);
   const speeds = new Float32Array(count);

   for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * PLATFORM_RADIUS;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = Math.sin(angle) * r;
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
