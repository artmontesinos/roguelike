'use strict';

import '../styles.css';
import * as ROT from 'rot-js';
import { GameWorld } from './world';
import { Player } from './player';

/**
 * A class representing the overall game being played
 */
export class Game {
   map = [];
   winning = false;
   world = new GameWorld();
   player = new Player();
   display;
   canvas;

   /** Options for the display screen: dimensions, etc.  */
   DisplayOptions = {
      // Configure the display
      bg: 'white', // background
      fg: 'dimGrey', // foreground
      fontFamily: 'Fira Mono', // font (use a monospace for esthetics)
      width: 25,
      height: 20, // canvas height and width
      fontSize: 18, // canvas fontsize
      forceSquareRatio: true, // make the canvas squared ratio
   };

   /** Colors used for various things */
   Colors = {
      '.': 'lightgrey', // the shadows
      ' ': 'white', // the light
      '+': 'black',
   };

   /** Characters that play in the game */
   Characters = {
      hero:  '🧙🏼‍️',
      dead:  '☠️',
      allies: ['🧚🏻‍️'],
      monsters: ['🐉', '🐍', '🧌', '🧞', '🦂', '💀', '🕷️', '🦇'],
   };

   /** Objects used in the game */
   Objects = {
      walls:  ['🪨', '🗻'],
      door: '🚪',
      chest: '🗃',
      keys: ['🗝', '🔑'],
      treasure: ['🗡️','🛡️', '💰', '🏹', '🧪', '📜', '💍', '🍀']
   };

   constructor() {
   }

   /**
    * Sleeps for a given number of milliseconds.
    *
    * @param {number} ms - The number of milliseconds to sleep.
    *
    * @return {Promise} A Promise that resolves after the given number of milliseconds.
    */
   sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
   }

   /**
    * Generates a random monster.
    *
    * @return {string} The randomly generated monster.
    */
   randomMonster() {
      return this.randomThing(this.Characters.monsters);
   }

   /**
    * Generate a random treasure.
    *
    * @param {any} player - The player object.
    *
    * @return {string} The randomly generated treasure.
    */
   randomTreasure(player) {
      const treasure = this.randomThing(this.Objects.treasure);
      if (player.enchantments.includes(treasure)) {
         return this.randomTreasure(player);
      } else {
         return treasure;
      }
   }

   /**
    * Selects a random element from an array.
    *
    * @param {any[]} things - The array of elements to choose from.
    *
    * @return {any} The randomly selected element.
    */
   randomThing(things) {
      return things[Math.floor(Math.random() * things.length)];
   }

   /**
    * Sets the text content of an element with the provided id.
    *
    * @param {string} id - The id of the element.
    * @param {string} content - The text content to set.
    */
   message(id, content) {
      document.getElementById(id).innerText = content;
   }

   /**
    * Initializes the game, by starting the display, player, and world.
    *
    * @return {Promise} - A promise that resolves once the initialization is complete.
    */
   async init() {
      // we make the init function sleep to help load fonts
      await this.sleep(500).then(() => {
         // pass the configuration defined as arguments
         this.display = new ROT.Display(this.DisplayOptions);
         this.canvas = document.getElementById('canvas');
         // append the created display to the HTML element
         this.canvas.appendChild(this.display.getContainer());
         this.world = new GameWorld(this, this.display);
         this.player = new Player(this.world, this.display);
      });

      // remove anything being displayed and create a new game/level
      this.display.clear();
      this.createLevel();
      this.player.init();
      this.winning = true;
      // start the engine, but do not await the player's actions
      this.engine();
      this.draw();
   }

   /**
    * Runs the basic game engine. While the game is still in a winning state,
    * wait for the player to act.
    */
   async engine() {
      // as long as the player is still winning the game, keep playing
      while (this.winning) {
         await this.player.act();
         this.draw();
      }
   }

   /**
    * Create a new world level.
    */
   createLevel() {
      this.world.generate();
   }

   /**
    * Draws the game by clearing the display, drawing the world and player .
    */
   draw() {
      this.display.clear();
      this.world.draw();
      if (this.player.alive) {
         this.player.draw();
      } else {
         this.player.die();
      }
   }

   /**
    * Ends the game and displays a message.
    *
    * @param {string} message - The message to display.
    */
   endGame(message) {
      this.player.die();
      this.winning = false;
      this.message('gameOver', message);
      this.draw();
   }
}

/**
 * Initializes the window.onload function and sets up event listeners for keydown events.
 */
window.onload = function() {
   // listen to keystrokes
   window.addEventListener('keydown', (e) => {
      // space and arrow keys
      if ([8, 32, 37, 38, 39, 40, 65, 68, 83, 87].indexOf(e.keyCode) > -1) {
         e.preventDefault();
      }
   }, false);

   // create new game and initialize it
   const game = new Game();
   game.init().then(() => {
      this.canvas.focus();
   });
}
