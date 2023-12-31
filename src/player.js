'use strict';

import * as ROT from 'rot-js';
import {Combat} from './combat';

/**
 * A class that encompasses the player characters
 * attributes and actions
 */
export class Player {
   alive = true;
   experience = 0;
   lightRange = 2;
   enchantments = [];
   curses = [];
   display;
   world;
   justMoved = false;
   x;
   y;
   health = 20;
   attackBonus = 1;
   armourClass = 1;
   gold = 0;
   fight;

   constructor(world, display) {
      this.world = world;
      this.display = display;
   }

   /**
    * Initializes the player.
    */
   init() {
      // put the player in the first available free cell
      const playerStart = this.world.freeCells[0];
      this.x = playerStart.x;
      this.y = playerStart.y;

      // assume player is alive at the start of the game
      this.alive = true;

      // reset upgrades and show status messages
      this.powerDown(this.experience);
      this.showMessages(true);

      //reset combat
      this.fight = null;
   }

   /**
    * Displays various messages in the game.
    *
    * @param {boolean} resetCombat - Whether to reset the combat messages.
    */
   showMessages(resetCombat) {
      this.world.game.message('coordinates', `(${this.x}, ${this.y})`);
      this.world.game.message('AC', `AC: ${this.armourClass}`);
      this.world.game.message('Attack', `Att: ${this.attackBonus}`);
      this.world.game.message('HP', `HP: ${this.health}`);
      this.world.game.message('Gold', `$$: ${this.gold}`);
      this.world.game.message('Experience', `Exp: ${this.experience}`);
      if (resetCombat) {
         this.world.game.message('lockStatus', '');
         this.world.game.message('heroCombat', '');
         this.world.game.message('monsterCombat', '');
      }
      this.world.game.message('enchantments', this.enchantments.join(''));
      this.world.game.message('curses', this.curses.join(''));
   }

   /**
    * Asynchronously performs a player action.
    */
   async act() {
      let action = false;
      while (!action) {
         await new Promise((resolve) => setTimeout(resolve, 100));
         let event = await new Promise((resolve) => {
            window.addEventListener('keydown', resolve, { once: true });
         });
         action = this.handleKeyPress(event);
      }

      // if the player dies, end the game
      if (!this.alive) {
         this.world.game.endGame(`You died, level: ${this.experience}`);
      } else {
         // if the player reaches the exit, add experience
         // and maybe add a new level
         if (this.world.map[this.x][this.y] === this.world.exit) {
            this.experience++;

            // check if you reached level - 50, if so you win!
            if (this.experience >= this.world.game.maxLevel) {
               const completed = new Date();
               const timeInSeconds = (completed.getTime() - this.world.game.startTime.getTime()) / 1000;
               this.world.game.endGame(`You win, time: ${Math.floor(timeInSeconds)}s`);
               this.world.game.over = true;
               this.showMessages(true);
            } else {
               // regenerate the level
               this.world.game.createLevel();
               this.init();
            }
         }
      }
   }

   /**
    * Power down the character.
    *
    * @param {number} level - The level of the character
    */
   powerDown(level) {
      // health boost diminishes over time
      if (this.health > 100) {
         this.health -= Math.floor(Math.random() * 5) + 1;
         if (this.health < 100) {
            this.health = 100;
         }
      }

      // drop percentage is based on sleepiness
      let dropChance = this.curses.includes('😴') ? 0.5 : .95;
      if (level === 0) {
         dropChance = 1;
      }

      // chance you drop the ring of secrets
      if (Math.random() > dropChance) {
         this.enchantments = this.enchantments.filter(e => e !== '💍');
      } else if (this.enchantments.includes('💍')) {
         this.world.revealAllSecrets();
      }

      // chance your luck runs out
      if (Math.random() > dropChance) {
         this.enchantments = this.enchantments.filter(e => e !== '🍀');
      }

      // chance you break your bow
      if (Math.random() > dropChance) {
         this.enchantments = this.enchantments.filter(e => e !== '🏹');
      }

      // light spell diminishes over time
      this.lightRange -= Math.floor(Math.random() > .5 ? 1 : 0);
      if (this.lightRange < 2) {
         this.lightRange = 2;
      }
   }

   /**
    * Performs a power-up action based on the treasure.
    *
    * @param {string} item - item being picked up
    */
   powerUp(item) {
      const lucky = this.enchantments.includes('🍀');
      switch (item) {
         case '🗡️':
            this.attackBonus += Math.floor(Math.random() * 3 * (lucky ? 2 : 1)) + 1;
            break;

         case '🛡️':
            this.armourClass += Math.floor(Math.random() * 2 * (lucky ? 2 : 1)) + 1;
            break;

         case '💰':
            this.gold += Math.floor(Math.random() * 100 * (lucky ? 5 : 1));
            break;

         case '🥩':
            this.health += Math.floor(Math.random() * 50 * (lucky ? 2 : 1));
            break;

         case '🧪':
            this.health += Math.floor(Math.random() * 10 * (lucky ? 2 : 1));
            this.curses = this.curses.filter(c => c !== '☠️');
            break;

         case '🧫':
            this.health += Math.floor(Math.random() * 10 * (lucky ? 2 : 1));
            this.curses = this.curses.filter(c => c !== '😴');
            break;

         case '🏹':
            if (!this.enchantments.includes('🏹')) {
               this.enchantments.push('🏹');
            }
            break;

         case '💍':
            if (!this.enchantments.includes('💍')) {
               this.enchantments.push('💍');
            }
            this.world.revealAllSecrets();
            break;

         case '🍀':
            if (!this.enchantments.includes('🍀')) {
               this.enchantments.push('🍀');
            }
            break;

         case '📜':
            this.lightRange += Math.floor(Math.random() * 5 * (lucky ? 2 : 1));
            this.curses = this.curses.filter(c => c !== '🌙');
            if (this.lightRange > 5) {
               this.lightRange = 5;
            }
            break;
      }
      this.showMessages(false);
   }

   /**
    * Handles the key press event.
    *
    * @param {Event} event - The key press event.
    *
    * @return {boolean} Returns false if the key code is not in the keyCode array,
    * otherwise returns the result of the move function.
    */
   handleKeyPress(event) {
      const keyCode = [];
      // AWSD keys
      keyCode[87] = 0; // key-up
      keyCode[68] = 2; // key-right
      keyCode[83] = 4; // key-down
      keyCode[65] = 6; // key-left

      // Arrows keys
      keyCode[38] = 0; // key-up
      keyCode[39] = 2; // key-right
      keyCode[40] = 4; // key-down
      keyCode[37] = 6; // key-left

      const code = event.keyCode;

      // handle special case for the backspace key
      // since it is possible we generate an invalid
      // level allow the user a mechanism to create a
      // new level
      if (code === 8) {
         this.world.game.createLevel();
         this.init();
         return true;
      } else if (code === 88) {
         this.enchantments = ['💍', '🍀', '🏹'];
         this.curses = [];
         this.powerDown(0);
         this.showMessages(false);
         return true;
      }

      // if the character is not handled immediately return false
      if (!(code in keyCode)) {
         return false;
      }

      // otherwise determine the movement difference
      const diff = ROT.DIRS[8][keyCode[code]];
      return this.move(diff);
   }

   /**
    * Moves the player character by the specified delta. If the player encounters
    * an item in the world, it will be interacted with. Ex: combat, open chest, pick up item, etc.
    *
    * @param {number[]} delta - The change in x and y coordinates.
    *
    * @return {boolean} Returns true if the movement was successful, false otherwise.
    */
   move(delta) {
      // check for basic movement into free-space
      if (this.world.isPassable(this.x + delta[0], this.y + delta[1])) {
         this.x += delta[0];
         this.y += delta[1];
         this.justMoved = true;
         this.world.game.message('coordinates', `(${this.x}, ${this.y})`);

         // when player is healthy movement will gain HP, slowly over time
         // if the player is poisoned they will lose HP
         const poisoned = this.curses.includes('☠️');
         if (poisoned && Math.random() > .9) {
            this.health -= 1;
         } else if (!poisoned && Math.random() > .9) {
            this.health += 1;
         }
         this.world.game.message('HP', `HP: ${this.health}`);

         // return true to indicate movement was successful
         // as long as the player is alive
         this.alive = this.health > 0;
         return this.alive || this.justMoved;

      } else if (this.world.isBoss(this.x + delta[0], this.y + delta[1])) {
         // check for movement into combat...
         return this.combat({
            type: this.world.boss,
            ...this.world.bossCell
         }, this.x, this.y, delta);

      } else if (this.world.isChest(this.x + delta[0], this.y + delta[1])) {
         // open a chest ...
         return this.openChest(this.x, this.y, delta);

      } else if (this.world.isItem(this.x + delta[0], this.y + delta[1])) {
         // pick up an item / treasure ...
         return this.pickupItem(this.x, this.y, delta);

      } else if (this.world.isKey(this.x + delta[0], this.y + delta[1])) {
         // pickup a key ...
         return this.pickupKey(this.x, this.y, delta);

      } else {
         // otherwise movement is blocked
         return false;
      }
   }

   /**
    * Executes a combat with a boss at the specified coordinates.
    *
    * @param {object} boss - The boss object to fight against.
    * @param {number} x - The x-coordinate of the boss.
    * @param {number} y - The y-coordinate of the boss.
    * @param {number[]} diff - The difference between the player's and boss's coordinates.
    *
    * @return {boolean} - The result of the combat. Returns true if the player wins, false otherwise.
    */
   combat(boss, x, y, diff) {
      // start a combat -> fight
      if (!this.fight) {
         this.fight = new Combat(this, boss);
      }
      let combatResult = this.fight.fight(this.world.game);

      // deal with a fight being over...
      if (combatResult) {

         // if the player is still alive, defeat boss + drop loot
         if (this.alive) {
            this.world.defeatBoss();
            this.move(diff);

            // if level exit is locked monster will drop key
            if (this.world.locked) {
               this.world.dropItem(x, y, this.world.game.Objects.keys[0]);
            } else {
               // otherwise new treasure
               this.world.dropItem(x, y, this.world.game.Objects.chest);
            }
         } else {
            // game over ...

         }
      }

      return combatResult;
   }

   /**
    * Open the chest at the specified coordinates and reveal its contents.
    *
    * @param {number} x - The x-coordinate of the chest.
    * @param {number} y - The y-coordinate of the chest.
    * @param {number[]} diff - The difference between the chest and the player's position.
    *
    * @return {boolean} Returns true if the chest was successfully opened.
    */
   openChest(x, y, diff) {
      this.world.dropItem(x + diff[0], y + diff[1], '.');
      this.move(diff);

      // check if new position is loot
      let openingLoot = false;
      if (this.world.lootCell) {
         if (this.world.lootCell.x === x + diff[0] && this.world.lootCell.y === y + diff[1]) {
            openingLoot = true;
         }
      }

      let treasure = this.world.game.randomTreasure(this);

      // if level exit is chest will reveal a key
      if (openingLoot) {
         treasure = this.world.loot;
         // remove level loot to stop item fountain...
         this.world.lootDropped();

      } else if (this.world.locked) {
         treasure = this.world.game.Objects.keys[0];
      }

      // small chance for item fountain ...
      if (Math.random() > .95) {
         this.castAnything({
            startX: x - 1,
            startY: y - 1,
            endX: x + 1,
            endY: y + 1,
         }, this.world.game.Objects.treasure, true);
      } else {
         this.world.dropItem(x, y, treasure);
      }
      return true;
   }

   /**
    * Picks up a key at the specified coordinates and performs
    * necessary actions.
    *
    * @param {number} x - The x-coordinate of the key.
    * @param {number} y - The y-coordinate of the key.
    *
    * @param {number[]} diff - The difference in coordinates to the key and the player's position.
    *
    * @return {boolean} Returns true if the key is successfully picked up.
    */
   pickupKey(x, y, diff) {
      this.world.dropItem(x + diff[0], y + diff[1], '.');
      this.move(diff);
      this.world.locked = false;
      this.world.game.message('lockStatus', 'unlocked');
      return true;
   }

   /**
    * Picks up an item from the specified location and performs related actions.
    *
    * @param {number} x - The x-coordinate of the item location.
    * @param {number} y - The y-coordinate of the item location.
    * @param {number[]} diff - The difference between the current location and the item location.
    *
    * @return {boolean} Returns true if the item was successfully picked up, false otherwise.
    */
   pickupItem(x, y, diff) {
      const item = this.world.map[x + diff[0]][y + diff[1]];
      this.world.dropItem(x + diff[0], y + diff[1], '.');
      this.move(diff);
      this.powerUp(item);
      this.showMessages();
      return true;
   }

   /**
    * Draws the character on the screen and casts light around the player.
    */
   draw() {
      this.castLight(this.x, this.y);
      this.display.draw(this.x, this.y, this.world.game.Characters.hero, 'black');
   }

   /**
    * Kills the player character, cast 0 light and draw the 'dead' character.
    */
   die() {
      this.lightRange = 0;
      this.castLight(this.x, this.y);
      this.display.draw(this.x, this.y, this.world.game.Characters.dead, 'black');
   }

   /**
    * Casts light in a specified range around a given point.
    *
    * @param {number} x - The x-coordinate of the point.
    * @param {number} y - The y-coordinate of the point.
    */
   castLight(x, y) {
      // if you are cursed you cannot a lot of light
      const inDarkness = this.curses.includes('🌙');

      const range = {
         startX: x - (inDarkness ? 1 :this.lightRange),
         endX: x + (inDarkness ? 1 :this.lightRange),
         startY: y - (inDarkness ? 1 :this.lightRange),
         endY: y + (inDarkness ? 1 :this.lightRange),
      };

      // cast the light (empty space)
      this.castAnything(range, [' '], false);
   }

   /**
    * Iterates over a given range and casts random elements from the provided things array
    * onto the world map, if the element at that position is a dot and has not been revealed yet.
    *
    * @param {Object} range - The range object containing startX, startY, endX, and endY values.
    * @param {Array} things - The array of elements to cast onto the world map.
    * @param {boolean} drop - Whether to drop the cast element.
    */
   castAnything(range, things, drop) {
      // iterate over the range (x)
      for (let checkX = range.startX; checkX <= range.endX; checkX++) {
         // iterate over the range (y)
         for (let checkY = range.startY; checkY <= range.endY; checkY++) {
            let row = this.world.map[checkX];
            let element = row ? row[checkY] : '';

            // if the element is a shadow(.) and not revealed yet, reveal it
            if (element === '.' && !this.world.reveal(checkX, checkY)) {

               // get a random thing to cast onto the map
               element = things[Math.floor(Math.random() * things.length)];
               this.display.draw(checkX, checkY, element, this.world.game.Colors[element]);

               // drop the cast element (if specified)
               if (drop) {
                  this.world.dropItem(checkX, checkY, element);
               }
            }
         }
      }
   }
}
