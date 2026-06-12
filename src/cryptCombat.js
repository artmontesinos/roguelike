/**
 * Real-time combat simulation for the 3D crypt: monsters, melee, loot, and
 * turn-free item use/crafting. DOM-free — epilogue.js renders it, calling
 * `update()` every frame and consuming `drainEvents()` for hit/death/loot
 * effects. Player stats, inventory, xp, and the message log are shared with
 * the 2D run through the `Game` object, so kills and drops here persist.
 */
import { MONSTERS, ITEMS, RECIPES } from './data.js';
import { Rand } from './rng.js';
import { cryptBlockedAt, cryptSpawns } from './crypt.js';

const AGGRO_RADIUS = 6.5;        // monsters wake when the torch gets this close
const MONSTER_RADIUS = 0.32;     // wall-collision radius
const MONSTER_REACH = 1.15;      // distance at which monsters can strike
const MONSTER_COOLDOWN = 1.1;    // seconds between monster attacks
const HERO_REACH = 1.7;          // dagger swing range
const HERO_ARC_DOT = Math.cos(Math.PI / 3); // 120° swing cone
const HERO_COOLDOWN = 0.45;
const PICKUP_RADIUS = 0.8;

/** Per-type movement speed in units/s; ethereal types drift through walls. */
const SPEEDS = { spider: 3.0, skeleton: 1.7, wraith: 2.1 };
const ETHEREAL = new Set(['wraith']);

export class CryptSim {
   /**
    * @param {import('./game.js').Game} game - live run whose player fights here
    * @param {number} seed - for the sim's own dice (keeps `game.rng` untouched)
    */
   constructor(game, seed) {
      this.game = game;
      this.rng = new Rand(seed);
      this.monsters = cryptSpawns().map((spawn, i) => {
         const def = MONSTERS[spawn.type];
         return {
            key: i, type: spawn.type, name: def.name,
            x: spawn.x, z: spawn.z,
            hp: def.hp, maxHp: def.hp,
            atk: def.atk, def: def.def, xp: def.xp,
            drops: def.drops, goldChance: def.goldChance || 0,
            awake: false, attackCd: 0, dead: false,
         };
      });
      this.loot = [];
      this.lootKey = 0;
      this.heroCd = 0;
      this.events = [];
   }

   /** Same dice as the 2D game's bump combat: d(0..2) bonus, 10% crit x2. */
   rollDamage(atk, def) {
      let dmg = Math.max(1, atk + this.rng.int(0, 2) - def);
      if (this.rng.chance(0.1)) dmg *= 2;
      return dmg;
   }

   /**
    * Advances the world: monsters wake near the hero, chase, and strike;
    * loot underfoot is collected.
    *
    * @param {number} dt - seconds since last frame
    * @param {{x: number, z: number}} hero
    */
   update(dt, hero) {
      if (this.game.status !== 'playing') return;
      this.heroCd = Math.max(0, this.heroCd - dt);

      for (const m of this.monsters) {
         if (m.dead) continue;
         const dx = hero.x - m.x;
         const dz = hero.z - m.z;
         const dist = Math.hypot(dx, dz);

         if (!m.awake) {
            if (dist > AGGRO_RADIUS) continue;
            m.awake = true;
            this.events.push({ type: 'wake', key: m.key });
            this.game.log(`A ${m.name} stirs in the dark...`);
         }

         m.attackCd = Math.max(0, m.attackCd - dt);

         if (dist > MONSTER_REACH * 0.8) {
            const speed = SPEEDS[m.type] || 2;
            const nx = m.x + (dx / dist) * speed * dt;
            if (ETHEREAL.has(m.type) || !this.blockedCircle(nx, m.z)) m.x = nx;
            const nz = m.z + (dz / dist) * speed * dt;
            if (ETHEREAL.has(m.type) || !this.blockedCircle(m.x, nz)) m.z = nz;
         }

         if (dist <= MONSTER_REACH && m.attackCd === 0) {
            m.attackCd = MONSTER_COOLDOWN;
            const dmg = this.rollDamage(m.atk, this.game.playerDef());
            this.game.player.hp -= dmg;
            this.events.push({ type: 'heroHit', key: m.key, dmg });
            this.game.log(`The ${m.name} hits you for ${dmg}.`);
            if (this.game.player.hp <= 0) {
               this.game.player.hp = 0;
               this.game.status = 'dead';
               this.game.log('You fall in the world beyond, far from any sun...');
               this.events.push({ type: 'heroDeath' });
               return;
            }
         }
      }

      this.collectLoot(hero);
   }

   blockedCircle(x, z) {
      const r = MONSTER_RADIUS;
      return cryptBlockedAt(x - r, z - r) || cryptBlockedAt(x + r, z - r) ||
             cryptBlockedAt(x - r, z + r) || cryptBlockedAt(x + r, z + r);
   }

   /**
    * Swings the dagger in a cone in front of the hero, hitting every monster
    * in reach. Gated by the swing cooldown.
    *
    * @param {{x: number, z: number, angle: number}} hero - facing (sin a, cos a)
    * @return {boolean} true if a swing happened (hit or miss)
    */
   heroAttack(hero) {
      if (this.game.status !== 'playing' || this.heroCd > 0) return false;
      this.heroCd = HERO_COOLDOWN;
      this.events.push({ type: 'swing' });

      const fx = Math.sin(hero.angle);
      const fz = Math.cos(hero.angle);
      for (const m of this.monsters) {
         if (m.dead) continue;
         const dx = m.x - hero.x;
         const dz = m.z - hero.z;
         const dist = Math.hypot(dx, dz);
         if (dist > HERO_REACH) continue;
         const dot = (dx * fx + dz * fz) / (dist || 1);
         if (dot < HERO_ARC_DOT && dist > 0.6) continue; // behind us, unless point-blank

         const dmg = this.rollDamage(this.game.playerAtk(), m.def);
         m.hp -= dmg;
         m.awake = true;
         this.events.push({ type: 'monsterHit', key: m.key, dmg });
         this.game.log(`You strike the ${m.name} for ${dmg}.`);
         if (m.hp <= 0) this.killMonster(m);
      }
      return true;
   }

   killMonster(m) {
      m.dead = true;
      this.events.push({ type: 'monsterDie', key: m.key });
      this.game.log(`The ${m.name} is destroyed. (+${m.xp} xp)`);
      this.game.gainXp(m.xp);

      for (const drop of m.drops || []) {
         if (this.rng.chance(drop.chance)) this.spawnLoot({ id: drop.id }, m.x, m.z);
      }
      if (m.goldChance && this.rng.chance(m.goldChance)) {
         this.spawnLoot({ gold: 3 + this.rng.int(0, 12) }, m.x, m.z);
      }
   }

   /** Drops an item (`{id}`) or gold pile (`{gold}`) near the given point. */
   spawnLoot(what, x, z) {
      const piece = {
         key: this.lootKey++,
         ...what,
         x: x + (this.rng.next() - 0.5) * 0.6,
         z: z + (this.rng.next() - 0.5) * 0.6,
      };
      this.loot.push(piece);
      this.events.push({ type: 'lootSpawn', loot: piece });
   }

   collectLoot(hero) {
      for (let i = this.loot.length - 1; i >= 0; i--) {
         const piece = this.loot[i];
         if (Math.hypot(piece.x - hero.x, piece.z - hero.z) > PICKUP_RADIUS) continue;
         if (piece.gold !== undefined) {
            this.game.player.gold += piece.gold;
            this.game.log(`You pocket ${piece.gold} gold.`);
         } else {
            this.game.addItem(piece.id);
            this.game.log(`You take: ${ITEMS[piece.id].name}.`);
         }
         this.events.push({ type: 'lootTaken', key: piece.key });
         this.loot.splice(i, 1);
      }
   }

   /**
    * Real-time variant of Game.useItem: heals/equips without spending a 2D
    * turn (the dormant dungeon must not advance while we're in the crypt).
    *
    * @return {boolean} true if the item was used
    */
   useItem(id) {
      const game = this.game;
      if (game.status !== 'playing' || !game.player.inv[id]) return false;
      const item = ITEMS[id];

      if (item.kind === 'potion' || item.kind === 'food') {
         game.removeItem(id);
         const healed = Math.min(item.heal, game.player.maxHp - game.player.hp);
         game.player.hp += healed;
         game.log(`You consume the ${item.name}. (+${healed} HP)`);
      } else if (item.kind === 'weapon') {
         game.removeItem(id);
         if (game.player.weapon) game.addItem(game.player.weapon);
         game.player.weapon = id;
         game.log(`You wield the ${item.name}.`);
      } else if (item.kind === 'armor') {
         game.removeItem(id);
         if (game.player.armor) game.addItem(game.player.armor);
         game.player.armor = id;
         game.log(`You strap on the ${item.name}.`);
      } else {
         return false;
      }
      return true;
   }

   /**
    * Real-time variant of Game.craft: consumes materials and produces the
    * recipe's item without spending a 2D turn.
    *
    * @return {boolean} true if the recipe was crafted
    */
   craft(recipeId) {
      const game = this.game;
      if (game.status !== 'playing') return false;
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (!recipe || !game.canCraft(recipe)) return false;

      for (const [mat, count] of Object.entries(recipe.needs)) {
         game.removeItem(mat, count);
      }
      game.addItem(recipe.out);
      game.log(`You craft: ${ITEMS[recipe.out].name}.`);
      return true;
   }

   /** Returns and clears the effect events accumulated since the last call. */
   drainEvents() {
      const events = this.events;
      this.events = [];
      return events;
   }
}
