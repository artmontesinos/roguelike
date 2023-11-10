export class Combat {
   player;
   monster;

   constructor(player, monster) {
      this.player = player;
      this.monster = monster;
   }

   /**
    * Executes a fight between the player and the monster in the game.
    *
    * @param {Game} game - The game object containing the player and the monster.
    *
    * @return {boolean} True if the fight is over, False otherwise.
    */
   fight(game) {
      let fightOver = false;
      let heroMessage;

      // players always goes first... optimize / randomize
      // chance of player hitting monster (+ for attack bonus)
      if (Math.random() > (.5 - (.1 * this.player.attackBonus))) {
         let damage = Math.floor(Math.random() * this.player.attackBonus * 5);
         heroMessage = `Hit: ${damage}`;

         // decrease monsters HP (one shot kill is fatal
         const oneShotKill = this.player.enchantments.includes('🏹');
         if (oneShotKill) {
            this.monster.health = 0;
         } else {
            this.monster.health -= damage;
         }
         if (this.monster.health <= 0) {
            // fight is now over
            fightOver = true;
            heroMessage += ' (*)';
         } else {
            console.log(`Monster health: ${this.monster.health}`);
         }
      } else {
         heroMessage = 'Missed';
      }

      // monster goes next...
      // chance of monster hitting player (+ for attack bonus)
      let monsterMessage;
      if (!fightOver && Math.random() > (.5 - (.1 * this.monster.attackBonus))) {
         let damage = Math.floor(Math.random() * this.monster.attackBonus);
         let deflected = Math.floor(damage * (.05 * this.player.armourClass));
         if (deflected > damage) {
            damage = 0;
         } else {
            damage -= deflected;
         }
         monsterMessage = `Dam: ${damage}`;

         // check for monster effects (poison, sleep, etc.)
         Object.keys(game.Effects).forEach(effect => {
            if (game.Effects[effect].includes(this.monster.type)) {
               // 50% chance of inflicting effect
               if (Math.random() > .5 && !this.player.curses.includes(effect)) {
                  this.player.curses.push(effect);
               }
            }
         });

         // decrease players HP (- for armour class)
         this.player.health -= damage;
         if (this.player.health <= 0) {

            // fight is now over - player dead!
            this.player.alive = false;
            fightOver = true;
            monsterMessage += ' (X)';
         }
      } else {
         monsterMessage = 'Dodge';
      }

      // display combat messages
      game.message('heroCombat', `H: ${heroMessage}`);
      game.message('monsterCombat', monsterMessage ? `M: ${monsterMessage}` : '');
      game.message('HP', `HP: ${this.player.health}`);
      game.message('curses', this.player.curses.join(''));
      return fightOver;
   }
}