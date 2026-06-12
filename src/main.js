import './styles.css';
import { Game } from './game.js';
import { createRenderer, STAGE_WIDTH, STAGE_HEIGHT } from './render.js';
import { updateUI } from './ui.js';
import { loadSave, saveGame, clearSave, loadRecords, recordRun } from './save.js';
import { playFractureTransition } from './transition.js';

let game = null;
let finished = false;
let epilogueCtl = null;
let epilogueReady = false;

const renderer = createRenderer(document.getElementById('game-canvas'));
const overlay = document.getElementById('overlay');

/** Lore revealed once the Pale Wyrm falls, paced one line at a time. */
const EPILOGUE_LORE = [
   "The crown's weight is wrong — too light, too cold, as though it holds no metal at all.",
   'Where its jewels should sit, you find only depth: a blackness with no floor.',
   'The walls of Darkhollow were never walls. They were a held breath.',
   'Beyond the eighth depth, the world folds outward — and something ancient opens its eye.',
];

const DIRS = {
   ArrowUp: [0, -1],    w: [0, -1], W: [0, -1],
   ArrowDown: [0, 1],   s: [0, 1],  S: [0, 1],
   ArrowLeft: [-1, 0],  a: [-1, 0], A: [-1, 0],
   ArrowRight: [1, 0],  d: [1, 0],  D: [1, 0],
};

/** Maps the d-pad's `data-dir` values to the epilogue's keyboard key names. */
const EPILOGUE_KEY_MAP = {
   '0,-1': 'arrowup',
   '0,1': 'arrowdown',
   '-1,0': 'arrowleft',
   '1,0': 'arrowright',
};

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

// TEMP: jump straight into the 3D crypt instead of the title screen + 2D
// dungeon, while the epilogue scene is being iterated on. Flip to false (or
// remove) to restore the normal title-screen -> dungeon -> epilogue flow.
const DEV_3D_PREVIEW = true;

function refresh() {
   if (!game) return;
   renderer.draw(game);
   updateUI(game);
}

/** Runs after every player action: redraw, persist, handle run end. */
function afterAction() {
   refresh();
   if (game.status === 'playing') {
      saveGame(game);
      return;
   }
   if (!finished) {
      finished = true;
      clearSave();
      recordRun(game);
      if (game.status === 'dead') {
         showOverlay(
            'You Have Fallen',
            `Slain on depth ${game.depth} at level ${game.player.level}, carrying ${game.player.gold} gold. The crypts keep their secrets.`,
            [['New Run', startNewRun]]
         );
      } else {
         beginReveal();
      }
   }
}

/**
 * Hides the 2D canvas, shows the epilogue canvas, and starts the 3D scene.
 * Entered with a live run ('playing'), the crypt is hostile: monsters,
 * Space/X (or d-pad ⚔) melee, loot, and shared xp/inventory. Entered after
 * victory ('won'), it stays the peaceful lore vision.
 */
async function enterEpilogue() {
   document.getElementById('game-canvas').classList.add('hidden');
   const epilogueCanvas = document.getElementById('epilogue-canvas');
   epilogueCanvas.classList.remove('hidden');

   const combat = game && game.status === 'playing';
   const { startEpilogue } = await import('./epilogue.js');
   epilogueCtl = startEpilogue(epilogueCanvas, STAGE_WIDTH, STAGE_HEIGHT, combat ? {
      game,
      onStateChange: () => {
         updateUI(game);
         if (game.status === 'playing') saveGame(game);
      },
      onHeroDeath: handleCryptDeath,
   } : {});
   document.getElementById('minimap').classList.remove('hidden');

   const centerBtn = document.querySelector('#dpad [data-act="descend"]');
   if (centerBtn) centerBtn.textContent = combat ? '⚔' : '⏎';
}

/**
 * Plays the dimensional-reveal sequence: the 2D view shatters, then the
 * adventurer steps into a 3D epilogue while lore lines fade in. Pressing
 * Enter once the lore finishes ends the epilogue and shows the win overlay.
 */
function beginReveal() {
   const gameCanvas = document.getElementById('game-canvas');
   const loreBox = document.getElementById('epilogue-text');

   playFractureTransition(gameCanvas, async () => {
      loreBox.classList.remove('hidden');
      loreBox.innerHTML = '';

      await enterEpilogue();

      const wakeBtn = document.querySelector('#dpad [data-act="descend"]');
      if (wakeBtn) wakeBtn.textContent = '⏎';

      let i = 0;
      const showNextLine = () => {
         if (i < EPILOGUE_LORE.length) {
            const p = document.createElement('p');
            p.className = 'lore-line';
            p.textContent = EPILOGUE_LORE[i];
            loreBox.appendChild(p);
            requestAnimationFrame(() => p.classList.add('show'));
            i++;
            setTimeout(showNextLine, 3400);
         } else {
            const prompt = document.createElement('p');
            prompt.className = 'lore-line lore-prompt';
            prompt.textContent = TOUCH
               ? 'Tap ⏎ to awaken in the world beyond...'
               : 'Press Enter to awaken in the world beyond...';
            loreBox.appendChild(prompt);
            requestAnimationFrame(() => prompt.classList.add('show'));
            epilogueReady = true;
         }
      };
      setTimeout(showNextLine, 1200);
   });
}

/** Disposes the 3D scene and restores the 2D canvas and d-pad. */
function teardownEpilogue() {
   epilogueReady = false;
   if (epilogueCtl) {
      epilogueCtl.dispose();
      epilogueCtl = null;
   }
   document.getElementById('epilogue-canvas').classList.add('hidden');
   document.getElementById('epilogue-text').classList.add('hidden');
   document.getElementById('minimap').classList.add('hidden');
   document.getElementById('game-canvas').classList.remove('hidden');

   const centerBtn = document.querySelector('#dpad [data-act="descend"]');
   if (centerBtn) centerBtn.textContent = '▼▼';
}

/** The hero fell in the crypt: permadeath, then offer a fresh run. */
function handleCryptDeath() {
   if (finished) return;
   finished = true;
   clearSave();
   recordRun(game);
   updateUI(game);
   teardownEpilogue();
   showOverlay(
      'You Have Fallen',
      `Slain in the world beyond at level ${game.player.level}, carrying ${game.player.gold} gold. ` +
      'The dark keeps what it takes.',
      [['New Run', startNewRun]]
   );
}

/** Tears down the 3D scene, restores the dungeon canvas, and shows the win overlay. */
function endEpilogue() {
   teardownEpilogue();

   showOverlay(
      'The Crown Is Yours',
      `You slew the Pale Wyrm and claimed the Crown of the Forsaken King at level ${game.player.level}, with ${game.player.gold} gold. ` +
      'But the crown was never the prize — only a key. Somewhere beyond the eighth depth, a far older dark has noticed you. A legend is born... and a greater one begins.',
      [['New Run', startNewRun]]
   );
}

function startNewRun() {
   finished = false;
   game = new Game(Math.floor(Math.random() * 2 ** 31));
   hideOverlay();
   saveGame(game);
   if (DEV_3D_PREVIEW) {
      updateUI(game);
      enterEpilogue();
   } else {
      refresh();
   }
}

function continueRun(data) {
   finished = false;
   game = Game.fromSave(data);
   hideOverlay();
   refresh();
}

function showOverlay(title, body, buttons) {
   document.getElementById('overlay-title').textContent = title;
   document.getElementById('overlay-body').textContent = body;
   const buttonBox = document.getElementById('overlay-buttons');
   buttonBox.innerHTML = '';
   for (const [label, handler] of buttons) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', handler);
      buttonBox.appendChild(btn);
   }
   overlay.classList.remove('hidden');
}

function hideOverlay() {
   overlay.classList.add('hidden');
}

function overlayOpen() {
   return !overlay.classList.contains('hidden');
}

// --- input wiring ---

window.addEventListener('keydown', (e) => {
   const key = e.key.toLowerCase();

   if (key === 'f') {
      toggleFullscreen();
      return;
   }
   if (key === 'i' || key === 'c') {
      e.preventDefault();
      toggleHud(key === 'i' ? 'inventory-hud' : 'character-hud');
      return;
   }
   if (key === 'm' && epilogueCtl) {
      toggleHud('minimap');
      return;
   }

   if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
   }

   if (epilogueReady && e.key === 'Enter') {
      endEpilogue();
      return;
   }

   if (epilogueCtl) return; // the 3D epilogue owns movement input

   if (!game || game.status !== 'playing' || overlayOpen()) return;

   const dir = DIRS[e.key];
   if (dir) {
      if (game.tryMove(dir[0], dir[1])) afterAction();
   } else if (e.key === 'Enter' || e.key === ' ' || e.key === '>') {
      if (game.descend()) afterAction();
   }
});

// --- fullscreen + HUD overlay toggles ---

const stage = document.getElementById('stage');
const fullscreenBtn = document.getElementById('fullscreen-btn');

function toggleFullscreen() {
   if (document.fullscreenElement) {
      document.exitFullscreen();
   } else {
      (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage);
   }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
   fullscreenBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
});

function toggleHud(id) {
   document.getElementById(id).classList.toggle('hidden');
}

/**
 * Use/equip/craft clicks from the side panel or the in-stage HUD overlay.
 * During the 3D crypt these route through the sim's turn-free variants so
 * the dormant 2D dungeon doesn't advance; in 2D they spend a turn as usual.
 */
function handleItemClick(e) {
   if (!game || game.status !== 'playing' || overlayOpen()) return;
   const itemRow = e.target.closest('[data-item]');
   const recipeRow = e.target.closest('[data-recipe]');
   if (!itemRow && !recipeRow) return;

   if (epilogueCtl && epilogueCtl.sim) {
      const acted = itemRow
         ? epilogueCtl.sim.useItem(itemRow.dataset.item)
         : epilogueCtl.sim.craft(recipeRow.dataset.recipe);
      if (acted) {
         updateUI(game);
         saveGame(game);
      }
      return;
   }

   if (itemRow && game.useItem(itemRow.dataset.item)) afterAction();
   else if (recipeRow && game.craft(recipeRow.dataset.recipe)) afterAction();
}

document.getElementById('side-panel').addEventListener('click', handleItemClick);
document.getElementById('inventory-hud').addEventListener('click', handleItemClick);

document.getElementById('stats-panel').addEventListener('click', (e) => {
   if (!game || overlayOpen()) return;
   if (e.target.id === 'btn-descend' && game.descend()) afterAction();
});

const dpad = document.getElementById('dpad');

dpad.addEventListener('click', (e) => {
   const btn = e.target.closest('button');
   if (!btn) return;

   if (epilogueCtl) {
      if (btn.dataset.act === 'descend') {
         if (epilogueReady) endEpilogue();
         else epilogueCtl.attack(); // ⚔: explicit swing, same as Space
      }
      return;
   }

   if (!game || game.status !== 'playing' || overlayOpen()) return;
   if (btn.dataset.dir) {
      const [dx, dy] = btn.dataset.dir.split(',').map(Number);
      if (game.tryMove(dx, dy)) afterAction();
   } else if (btn.dataset.act === 'descend') {
      if (game.descend()) afterAction();
   }
});

// Holding a d-pad direction button during the 3D epilogue steers the
// adventurer in real time, mirroring the held-key controls on desktop.
function epilogueDirKey(e) {
   const btn = e.target.closest('button');
   return btn && EPILOGUE_KEY_MAP[btn.dataset.dir];
}

dpad.addEventListener('pointerdown', (e) => {
   const key = epilogueCtl && epilogueDirKey(e);
   if (key) {
      e.preventDefault();
      epilogueCtl.keys.add(key);
   }
});

for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
   dpad.addEventListener(evt, (e) => {
      const key = epilogueCtl && epilogueDirKey(e);
      if (key) epilogueCtl.keys.delete(key);
   });
}

// --- boot ---

const save = loadSave();

if (DEV_3D_PREVIEW) {
   // Skip the title screen: load (or start) a run for its stats/inventory
   // data, then drop straight into the 3D crypt.
   game = save ? Game.fromSave(save) : new Game(Math.floor(Math.random() * 2 ** 31));
   if (!save) saveGame(game);
   updateUI(game);
   enterEpilogue();
} else {
   const records = loadRecords();
   const recordLine = records.runs
      ? ` Runs: ${records.runs} · Wins: ${records.wins} · Deepest: ${records.bestDepth}.`
      : '';

   showOverlay(
      'Darkhollow Depths',
      'Eight depths below the ruined keep lies the hoard of the Pale Wyrm — and the Crown of the Forsaken King. ' +
      'Fight, loot, craft, and descend. Death is permanent; the dark remembers.' + recordLine,
      save
         ? [['Continue', () => continueRun(save)], ['New Run', startNewRun]]
         : [['New Run', startNewRun]]
   );
}
