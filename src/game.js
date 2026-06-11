import { ITEMS, RECIPES, DEPTH_NAMES, MAX_DEPTH, FOV_RADIUS } from './data.js';
import { generateDungeon } from './dungeon.js';
import { computeFov, hasLos } from './fov.js';
import { Rand } from './rng.js';

const SAVE_VERSION = 1;

/**
 * Core game state and turn logic. Deliberately DOM-free so it can be
 * exercised headlessly (see scripts/smoke.js) — rendering and UI live in
 * render.js / ui.js.
 */
export class Game {
   constructor(seed) {
      this.rng = new Rand(seed);
      this.status = 'playing'; // 'playing' | 'dead' | 'won'
      this.depth = 1;
      this.turn = 0;
      this.msgs = [];
      this.player = {
         x: 0, y: 0,
         hp: 24, maxHp: 24,
         level: 1, xp: 0,
         gold: 0,
         weapon: 'dagger',
         armor: null,
         inv: { potion: 1, bread: 2 },
      };
      this.enterLevel();
      this.log('You descend into the dark, dagger in hand.');
      this.log('Move with the arrow keys or WASD. Bump into monsters to attack.');
   }

   /** Restores a Game from the plain object produced by serialize(). */
   static fromSave(data) {
      const g = Object.create(Game.prototype);
      g.rng = new Rand(1);
      g.rng.s = data.rngState;
      g.status = data.status;
      g.depth = data.depth;
      g.turn = data.turn;
      g.msgs = data.msgs;
      g.player = data.player;
      g.tiles = data.tiles;
      g.W = data.W;
      g.H = data.H;
      g.stairs = data.stairs;
      g.monsters = data.monsters;
      g.items = data.items;
      g.explored = data.explored.map((row) => row.split('').map(Number));
      g.refreshFov();
      return g;
   }

   /** @return {object} JSON-safe snapshot of the full game state */
   serialize() {
      return {
         v: SAVE_VERSION,
         rngState: this.rng.s,
         status: this.status,
         depth: this.depth,
         turn: this.turn,
         msgs: this.msgs.slice(-40),
         player: this.player,
         tiles: this.tiles,
         W: this.W,
         H: this.H,
         stairs: this.stairs,
         monsters: this.monsters,
         items: this.items,
         explored: this.explored.map((row) => row.join('')),
      };
   }

   static get saveVersion() {
      return SAVE_VERSION;
   }

   /** Generates and moves the player into the level for the current depth. */
   enterLevel() {
      const level = generateDungeon(this.rng, this.depth);
      this.tiles = level.tiles;
      this.W = level.W;
      this.H = level.H;
      this.stairs = level.stairs;
      this.monsters = level.monsters;
      this.items = level.items;
      this.explored = Array.from({ length: this.H }, () => Array(this.W).fill(0));
      this.player.x = level.start.x;
      this.player.y = level.start.y;
      this.refreshFov();
      this.log(`— Depth ${this.depth}: ${DEPTH_NAMES[this.depth - 1]} —`);
      if (this.depth >= MAX_DEPTH) {
         this.log('A vast presence stirs in the gloom. This is the wyrm\'s lair.');
      }
   }

   log(text) {
      this.msgs.push(text);
      if (this.msgs.length > 80) this.msgs.shift();
   }

   walkable(x, y) {
      return x >= 0 && y >= 0 && x < this.W && y < this.H && this.tiles[y][x] !== '#';
   }

   monsterAt(x, y) {
      return this.monsters.find((m) => m.x === x && m.y === y);
   }

   playerAtk() {
      const weapon = this.player.weapon ? ITEMS[this.player.weapon].atk : 0;
      return 2 + Math.floor(this.player.level / 2) + weapon;
   }

   playerDef() {
      const armor = this.player.armor ? ITEMS[this.player.armor].def : 0;
      return Math.floor(this.player.level / 3) + armor;
   }

   /**
    * Handles one player movement input: attacks if a monster blocks the way,
    * otherwise steps and auto-picks-up anything on the new tile.
    *
    * @param {number} dx
    * @param {number} dy
    *
    * @return {boolean} true if a turn was spent
    */
   tryMove(dx, dy) {
      if (this.status !== 'playing') return false;
      const nx = this.player.x + dx;
      const ny = this.player.y + dy;

      const target = this.monsterAt(nx, ny);
      if (target) {
         this.attackMonster(target);
      } else if (this.walkable(nx, ny)) {
         this.player.x = nx;
         this.player.y = ny;
         this.pickupAt(nx, ny);
      } else {
         return false; // bumped a wall, no turn spent
      }

      this.endTurn();
      return true;
   }

   /** Collects everything lying on the given tile. */
   pickupAt(x, y) {
      const here = this.items.filter((i) => i.x === x && i.y === y);
      for (const item of here) {
         if (item.gold !== undefined) {
            this.player.gold += item.gold;
            this.log(`You pocket ${item.gold} gold.`);
         } else if (item.id === 'crown') {
            this.status = 'won';
            this.log('You lift the Crown of the Forsaken King. The darkness recedes!');
         } else {
            this.addItem(item.id);
            this.log(`You pick up: ${ITEMS[item.id].name}.`);
         }
      }
      this.items = this.items.filter((i) => !(i.x === x && i.y === y));
   }

   addItem(id, count = 1) {
      this.player.inv[id] = (this.player.inv[id] || 0) + count;
   }

   removeItem(id, count = 1) {
      this.player.inv[id] -= count;
      if (this.player.inv[id] <= 0) delete this.player.inv[id];
   }

   /** Player strikes a monster (bump attack). */
   attackMonster(monster) {
      const crit = this.rng.chance(0.1);
      let dmg = Math.max(1, this.playerAtk() + this.rng.int(0, 2) - monster.def);
      if (crit) dmg *= 2;
      monster.hp -= dmg;
      monster.awake = true;
      this.log(`You hit the ${monster.name} for ${dmg}${crit ? ' — critical!' : '.'}`);

      if (monster.hp <= 0) {
         this.killMonster(monster);
      }
   }

   killMonster(monster) {
      this.log(`The ${monster.name} is slain. (+${monster.xp} xp)`);
      this.monsters = this.monsters.filter((m) => m !== monster);

      // material and gold drops land where the monster died
      for (const drop of monster.drops) {
         if (this.rng.chance(drop.chance)) {
            this.items.push({ id: drop.id, x: monster.x, y: monster.y });
            this.log(`It drops: ${ITEMS[drop.id].name}.`);
         }
      }
      if (monster.goldChance && this.rng.chance(monster.goldChance)) {
         this.items.push({ gold: 3 + this.rng.int(0, 8 * this.depth), x: monster.x, y: monster.y });
      }

      if (monster.boss) {
         this.items.push({ id: 'crown', x: monster.x, y: monster.y });
         this.log('The Pale Wyrm collapses! Its hoard lies open before you.');
      }

      this.gainXp(monster.xp);
   }

   gainXp(amount) {
      this.player.xp += amount;
      while (this.player.xp >= this.xpToNext()) {
         this.player.xp -= this.xpToNext();
         this.player.level++;
         this.player.maxHp += 6;
         this.player.hp = Math.min(this.player.maxHp, this.player.hp + 6);
         this.log(`You feel stronger. Welcome to level ${this.player.level}.`);
      }
   }

   xpToNext() {
      return this.player.level * 10;
   }

   /**
    * Uses or equips an inventory item.
    *
    * @return {boolean} true if a turn was spent
    */
   useItem(id) {
      if (this.status !== 'playing' || !this.player.inv[id]) return false;
      const item = ITEMS[id];

      if (item.kind === 'potion' || item.kind === 'food') {
         this.removeItem(id);
         const healed = Math.min(item.heal, this.player.maxHp - this.player.hp);
         this.player.hp += healed;
         this.log(`You consume the ${item.name}. (+${healed} HP)`);
      } else if (item.kind === 'weapon') {
         this.removeItem(id);
         if (this.player.weapon) this.addItem(this.player.weapon);
         this.player.weapon = id;
         this.log(`You wield the ${item.name}.`);
      } else if (item.kind === 'armor') {
         this.removeItem(id);
         if (this.player.armor) this.addItem(this.player.armor);
         this.player.armor = id;
         this.log(`You strap on the ${item.name}.`);
      } else {
         return false; // materials have no direct use
      }

      this.endTurn();
      return true;
   }

   /**
    * Crafts a recipe if the materials are in the inventory.
    *
    * @return {boolean} true if a turn was spent
    */
   craft(recipeId) {
      if (this.status !== 'playing') return false;
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (!recipe || !this.canCraft(recipe)) return false;

      for (const [mat, count] of Object.entries(recipe.needs)) {
         this.removeItem(mat, count);
      }
      this.addItem(recipe.out);
      this.log(`You craft: ${ITEMS[recipe.out].name}.`);
      this.endTurn();
      return true;
   }

   canCraft(recipe) {
      return Object.entries(recipe.needs).every(
         ([mat, count]) => (this.player.inv[mat] || 0) >= count
      );
   }

   /**
    * Descends the stairs if the player is standing on them.
    *
    * @return {boolean} true if the player descended
    */
   descend() {
      if (this.status !== 'playing' || !this.stairs) return false;
      if (this.player.x !== this.stairs.x || this.player.y !== this.stairs.y) return false;
      this.depth++;
      this.enterLevel();
      return true;
   }

   /** Advances the world one turn: regen tick, then monsters act. */
   endTurn() {
      this.turn++;
      if (this.turn % 10 === 0 && this.player.hp < this.player.maxHp) {
         this.player.hp++;
      }
      this.monstersAct();
      this.refreshFov();
   }

   monstersAct() {
      for (const monster of this.monsters) {
         if (this.status !== 'playing') break;

         const dx = this.player.x - monster.x;
         const dy = this.player.y - monster.y;
         const dist = Math.abs(dx) + Math.abs(dy);

         if (!monster.awake) {
            if (dist <= FOV_RADIUS &&
                hasLos(this.tiles, monster.x, monster.y, this.player.x, this.player.y)) {
               monster.awake = true;
            } else {
               continue;
            }
         }

         if (dist === 1) {
            this.monsterAttack(monster);
         } else {
            this.monsterStep(monster, dx, dy);
         }
      }
   }

   /** Greedy 4-directional step toward the player. */
   monsterStep(monster, dx, dy) {
      const stepX = [Math.sign(dx), 0];
      const stepY = [0, Math.sign(dy)];
      const order = Math.abs(dx) > Math.abs(dy) ? [stepX, stepY] : [stepY, stepX];

      for (const [sx, sy] of order) {
         if (sx === 0 && sy === 0) continue;
         const nx = monster.x + sx;
         const ny = monster.y + sy;
         if (this.walkable(nx, ny) &&
             !this.monsterAt(nx, ny) &&
             !(nx === this.player.x && ny === this.player.y)) {
            monster.x = nx;
            monster.y = ny;
            return;
         }
      }
   }

   monsterAttack(monster) {
      const dmg = Math.max(1, monster.atk + this.rng.int(0, 2) - this.playerDef());
      this.player.hp -= dmg;
      this.log(`The ${monster.name} hits you for ${dmg}.`);
      if (this.player.hp <= 0) {
         this.player.hp = 0;
         this.status = 'dead';
         this.log('You die in the dark, far from the sun...');
      }
   }

   refreshFov() {
      this.visible = computeFov(this.tiles, this.player.x, this.player.y, FOV_RADIUS);
      for (const key of this.visible) {
         const [x, y] = key.split(',').map(Number);
         this.explored[y][x] = 1;
      }
   }
}
