import { Game } from './game.js';

const SAVE_KEY = 'darkhollow-save';
const RECORDS_KEY = 'darkhollow-records';

/** @return {object|null} parsed save data, or null if absent/invalid */
export function loadSave() {
   try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.v !== Game.saveVersion || data.status !== 'playing') return null;
      return data;
   } catch {
      return null;
   }
}

export function saveGame(game) {
   try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize()));
   } catch {
      // storage full or unavailable — play on without persistence
   }
}

export function clearSave() {
   localStorage.removeItem(SAVE_KEY);
}

/** @return {{runs: number, wins: number, bestDepth: number}} */
export function loadRecords() {
   try {
      return { runs: 0, wins: 0, bestDepth: 0, ...JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}') };
   } catch {
      return { runs: 0, wins: 0, bestDepth: 0 };
   }
}

/** Records the outcome of a finished run (death or victory). */
export function recordRun(game) {
   const records = loadRecords();
   records.runs++;
   if (game.status === 'won') records.wins++;
   records.bestDepth = Math.max(records.bestDepth, game.depth);
   try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
   } catch {
      // ignore storage failures
   }
}
