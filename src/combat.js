export class Combat {
   player;
   monster;

   constructor(player, monster) {
      this.player = player;
      this.monster = monster;
   }

   fight(game) {
      let fightOver = false;
      let heroMessage;

      // players always goes first... optimize / randomize
      // chance of player hitting monster (+ for attack bonus)
      if (Math.random() > (.5 - (.1 * this.player.attackBonus))) {
         const damage = Math.floor(Math.random() * this.player.attackBonus * 5);
         heroMessage = `Hit: ${damage}`;

         // decrease monsters HP (one shot kill is fatal
         const oneShotKill = this.player.enchantments.includes('🏹');
         this.monster.health -=  oneShotKill ? this.monster.health : damage;
         if (this.monster.health <= 0) {

            // fight is now over
            fightOver = true;
            heroMessage += ' (*)';
         }
      } else {
         heroMessage = 'Missed';
      }

      // monster goes next...
      // chance of monster hitting player (+ for attack bonus)
      let monsterMessage;
      if (!fightOver && Math.random() > (.5 - (.1 * this.monster.attackBonus))) {
         let damage = Math.floor(Math.random() * this.monster.attackBonus);
         damage = Math.floor(damage * (1 - (.1 * this.player.armourClass)));
         monsterMessage = `Dam: ${damage}`;

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
      return fightOver;
   }
}