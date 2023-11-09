import * as ROT from 'rot-js';

/**
 * class representing a game world / level
 */
export class GameWorld {
   game;
   display;
   map = [];
   freeCells = [];
   boss;
   bossCell;
   exit;
   exitCell;
   loot;
   lootCell;
   locked = false;

   constructor(game, display) {
      this.game = game;
      this.display = display;
   }

   /**
    * Generate the map for the game.
    */
   generate() {
      this.map = [];
      // width becomes -> x coordinate
      Array.from({length: this.game.DisplayOptions.width}).forEach((value, x) => {
         this.map[x] = [];
         // height becomes -> y coordinate
         Array.from({length: this.game.DisplayOptions.height}).forEach((value, y) => {
            this.map[x][y] = '+'; // create the walls around the map
         });
      });

      const freeCells = []; // this is where we shall store the moveable space
      // we create a cellular map using RotJS
      let digger = new ROT.Map.Cellular(
         this.game.DisplayOptions.width - 2,
         this.game.DisplayOptions.height - 2
      );

      // randomize(probability) set all cells to "alive" with a
      // given probability (0 = no cells, 1 = all cells)
      digger.randomize(0.4);
      const wallType = this.game.Objects.walls[Math.random() > .5 ? 1: 0];
      digger.create((x, y, value) => {
         if (value) {
            this.map[x + 1][y + 1] = wallType; // create the walls
         } else {
            freeCells.push({ x: x + 1, y: y + 1 });
            this.map[x + 1][y + 1] = '.'; // add . to every free space just for esthetics
         }
      });

      // initialize level items
      this.boss = null;
      this.bossCell = null;
      this.exit = null;
      this.exitCell = null;
      this.loot = null;
      this.lootCell = null;
      this.locked = false;

      // always set an exit cell...
      this.generateExit(freeCells);

      // sometimes set a monster + random loot cell...
      this.generateBoss(freeCells);
      this.generateRandomTreasure(freeCells);
      this.freeCells = freeCells;

      // if we have loot / boss, chance they drop key to unlock door
      if (this.loot || this.boss) {
         // 50% chance boss will lock the door
         this.locked = Math.random() > .5;
      }
   }

   /**
    * Generate a boss monster for the level.
    *
    * @param {any[]} freeCells - An array of cells that are free for the boss monster to occupy.
    */
   generateBoss(freeCells) {
      // calculate if level will have a boss = 80%
      const bossProbability = Math.random();
      if (bossProbability > .01) {
         // set a cell for the boss and generate a random baddie...
         this.bossCell = freeCells[Math.floor(bossProbability * freeCells.length)];
         const bossIndex = freeCells.indexOf(this.bossCell);
         this.boss = this.game.randomMonster();
         this.bossCell.attackBonus = Math.floor(Math.random() * 10) + 1;
         this.bossCell.health = Math.floor(Math.random() * 20) + 1;
         freeCells.splice(bossIndex, 1);

         // initially the boss is hidden
         this.map[this.bossCell.x][this.bossCell.y] = '.';
      }
   }

   generateExit(freeCells) {
      const exitProbability = Math.random();
      if (Math.floor(exitProbability * freeCells.length) === 0) {
         this.generateExit(freeCells);
      } else {
         this.exitCell = freeCells[Math.floor(exitProbability * freeCells.length)];
         const exitIndex = freeCells.indexOf(this.exitCell);
         this.exit = this.game.Objects.door;
         freeCells.splice(exitIndex, 1);

         // initially the exit is hidden
         this.map[this.exitCell.x][this.exitCell.y] = '.';
      }
   }

   /**
    * Generates a random treasure for the given free cells.
    *
    * @param {any[]} freeCells - An array of free cells where the treasure can be placed.
    */
   generateRandomTreasure(freeCells) {
      // set a cell for the loot at a random spot...
      const lootProbability = Math.random();
      if (lootProbability > .2) {
         this.lootCell = freeCells[Math.floor(lootProbability * freeCells.length)];
         const lootIndex = freeCells.indexOf(this.lootCell);
         this.loot = this.game.randomTreasure(this.game.player);
         freeCells.splice(lootIndex, 1);

         // initially the loot is hidden
         this.map[this.lootCell.x][this.lootCell.y] = '.';
      }
   }

   /**
    * Defeats the boss on the map.
    */
   defeatBoss() {
      this.map[this.bossCell.x][this.bossCell.y] = '.';
      this.bossCell = null;
      this.boss = '';
   }

   /**
    * Remove the dropped loot from the map and reset the loot cell and loot variable.
    */
   lootDropped() {
      this.map[this.lootCell.x][this.lootCell.y] = '.';
      this.lootCell = null;
      this.loot = '';
   }

   /**
    * Reveal all secrets in the map, including:
    * - the boss
    * - the loot
    * - the exit
    */
   revealAllSecrets() {
      if (this.lootCell) {
         this.map[this.lootCell.x][this.lootCell.y] = this.game.Objects.chest;
      }
      if (this.bossCell) {
         this.map[this.bossCell.x][this.bossCell.y] = this.boss;
      }
      if (this.exitCell) {
         this.map[this.exitCell.x][this.exitCell.y] = this.exit;
      }
   }

   /**
    * Drops an item at the specified coordinates on the map.
    *
    * @param {number} x - The x-coordinate of the location where the item should be dropped.
    * @param {number} y - The y-coordinate of the location where the item should be dropped.
    *
    * @param {any} item - The item to be dropped on the map.
    */
   dropItem(x, y, item) {
      this.map[x][y] = item;
      this.display.draw(x, y, item, 'black');
   }

   /**
    * Reveals a hidden boss, loot, or exit cell on the map if the given coordinates match.
    *
    * @param {number} x - The x-coordinate to check.
    * @param {number} y - The y-coordinate to check.
    *
    * @returns {boolean} True if a boss, loot, or exit cell is revealed, false otherwise.
    */
   reveal(x, y) {
      // check if we have a hidden boss...
      if (this.bossCell) {
         if (x === this.bossCell.x && y === this.bossCell.y) {
            this.map[this.bossCell.x][this.bossCell.y] = this.boss;
            return true;
         }
      }
      // check if we have a hidden loot...
      if (this.lootCell) {
         if (x === this.lootCell.x && y === this.lootCell.y) {
            this.map[this.lootCell.x][this.lootCell.y] = this.game.Objects.chest;
            return true;
         }
      }
      if (x === this.exitCell.x && y === this.exitCell.y) {
         this.map[this.exitCell.x][this.exitCell.y] = this.exit;
         if (this.locked) {
            this.game.message('lockStatus', 'locked');
         }
         return true;
      }

      return false;
   }

   /**
    * Draws the map by iterating over each element and calling the draw function of the display object.
    */
   draw() {
      this.map.forEach((element, x) => {
         element.forEach((element, y) => {
            this.display.draw(x, y, element, this.game.Colors[element] || 'red');
         });
      });
   }

   /**
    * Checks if a given position on the map is passable.
    *
    * @param {number} x - The x-coordinate of the position.
    * @param {number} y - The y-coordinate of the position.
    *
    * @return {boolean} Returns true if the position is passable, false otherwise.
    */
   isPassable(x, y) {
      console.log(`X: ${x} Y: ${y}`);
      const isBorder = this.map[x][y] === '+';
      const isWall = this.game.Objects.walls.includes(this.map[x][y]);
      const isLocked = this.game.Objects.door === this.map[x][y] && this.game.world.locked;

      return !isBorder && !isWall && !isLocked &&
         !this.isBoss(x,y) && !this.isChest(x,y) &&
         !this.isItem(x,y) && !this.isKey(x,y);
   }

   /**
    * Checks if the value at the given coordinates in the map is equal to the boss value.
    *
    * @param {number} x - The x-coordinate of the value in the map.
    * @param {number} y - The y-coordinate of the value in the map.
    *
    * @return {boolean} Returns true if the value at the given coordinates is equal to the boss value, otherwise returns false.
    */
   isBoss(x, y) {
      return this.map[x][y] === this.boss;
   }

   /**
    * Determines if there is a chest at the specified coordinates.
    *
    * @param {number} x - The x-coordinate of the location to check.
    * @param {number} y - The y-coordinate of the location to check.
    *
    * @return {boolean} Returns true if there is a chest at the specified coordinates, false otherwise.
    */
   isChest(x, y) {
      return this.map[x][y] === this.game.Objects.chest;
   }

   /**
    * Check if the specified coordinates contain an item.
    *
    * @param {number} x - The x-coordinate.
    * @param {number} y - The y-coordinate.
    *
    * @return {boolean} - True if the coordinates contain an item, false otherwise.
    */
   isItem(x, y) {
      return this.game.Objects.treasure.includes(this.map[x][y]);
   }

   /**
    * Determines if the given coordinates represent a key in the game.
    *
    * @param {number} x - The x-coordinate of the location to check.
    * @param {number} y - The y-coordinate of the location to check.
    *
    * @return {boolean} True if the location contains a key, false otherwise.
    */
   isKey(x, y) {
      return this.game.Objects.keys.includes(this.map[x][y]);
   }
}
