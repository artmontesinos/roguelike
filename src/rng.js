/**
 * Small seedable PRNG (mulberry32). The internal state `s` is a plain
 * integer so it can be serialized into the save file.
 */
export class Rand {
   constructor(seed) {
      this.s = (seed >>> 0) || 1;
   }

   /** @return {number} float in [0, 1) */
   next() {
      let t = (this.s += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   }

   /** @return {number} integer in [min, max] inclusive */
   int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
   }

   /** @return {boolean} true with probability p */
   chance(p) {
      return this.next() < p;
   }

   /** @return {any} random element of the array */
   pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
   }
}
