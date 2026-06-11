import './styles.css';
import { Game } from './game.js';
import { createRenderer } from './render.js';
import { updateUI } from './ui.js';
import { loadSave, saveGame, clearSave, loadRecords, recordRun } from './save.js';

let game = null;
let finished = false;

const renderer = createRenderer(document.getElementById('game-canvas'));
const overlay = document.getElementById('overlay');

const DIRS = {
   ArrowUp: [0, -1],    w: [0, -1], W: [0, -1],
   ArrowDown: [0, 1],   s: [0, 1],  S: [0, 1],
   ArrowLeft: [-1, 0],  a: [-1, 0], A: [-1, 0],
   ArrowRight: [1, 0],  d: [1, 0],  D: [1, 0],
};

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
         showOverlay(
            'The Crown Is Yours',
            `You slew the Pale Wyrm and claimed the Crown of the Forsaken King at level ${game.player.level}, with ${game.player.gold} gold. A legend is born.`,
            [['New Run', startNewRun]]
         );
      }
   }
}

function startNewRun() {
   finished = false;
   game = new Game(Math.floor(Math.random() * 2 ** 31));
   hideOverlay();
   refresh();
   saveGame(game);
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
   if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
   }
   if (!game || game.status !== 'playing' || overlayOpen()) return;

   const dir = DIRS[e.key];
   if (dir) {
      if (game.tryMove(dir[0], dir[1])) afterAction();
   } else if (e.key === 'Enter' || e.key === ' ' || e.key === '>') {
      if (game.descend()) afterAction();
   }
});

document.getElementById('side-panel').addEventListener('click', (e) => {
   if (!game || game.status !== 'playing' || overlayOpen()) return;
   const itemRow = e.target.closest('[data-item]');
   const recipeRow = e.target.closest('[data-recipe]');
   if (itemRow && game.useItem(itemRow.dataset.item)) afterAction();
   else if (recipeRow && game.craft(recipeRow.dataset.recipe)) afterAction();
});

document.getElementById('stats-panel').addEventListener('click', (e) => {
   if (!game || overlayOpen()) return;
   if (e.target.id === 'btn-descend' && game.descend()) afterAction();
});

document.getElementById('dpad').addEventListener('click', (e) => {
   if (!game || game.status !== 'playing' || overlayOpen()) return;
   const btn = e.target.closest('button');
   if (!btn) return;
   if (btn.dataset.dir) {
      const [dx, dy] = btn.dataset.dir.split(',').map(Number);
      if (game.tryMove(dx, dy)) afterAction();
   } else if (btn.dataset.act === 'descend') {
      if (game.descend()) afterAction();
   }
});

// --- boot: title screen, with Continue when a save exists ---

const save = loadSave();
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
