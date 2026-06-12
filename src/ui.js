import { ITEMS, RECIPES, DEPTH_NAMES } from './data.js';

const KIND_ORDER = ['weapon', 'armor', 'potion', 'food', 'material', 'quest'];

/**
 * Rebuilds the DOM side panels (stats, inventory, crafting, message log)
 * from the current game state. Click handling is delegated in main.js via
 * the data-item / data-recipe / button id attributes emitted here.
 */
export function updateUI(game) {
   renderStats(game);
   renderInventory(game);
   renderCrafting(game);
   renderLog(game);
   renderHud(game);
}

function renderStats(game) {
   const p = game.player;
   const onStairs = game.stairs && p.x === game.stairs.x && p.y === game.stairs.y;
   const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));

   document.getElementById('stats-panel').innerHTML = `
      <h3>The Adventurer</h3>
      <div class="bar"><div class="bar-fill" style="width:${hpPct}%"></div></div>
      <div class="stat-row"><span>HP</span><span>${p.hp} / ${p.maxHp}</span></div>
      <div class="stat-row"><span>Level ${p.level}</span><span class="muted">${p.xp} / ${game.xpToNext()} xp</span></div>
      <div class="stat-row"><span>Attack</span><span>${game.playerAtk()}</span></div>
      <div class="stat-row"><span>Defense</span><span>${game.playerDef()}</span></div>
      <div class="stat-row"><span>Gold</span><span>💰 ${p.gold}</span></div>

      <h3>Equipment</h3>
      <div class="stat-row"><span class="muted">Weapon</span><span>${equipName(p.weapon)}</span></div>
      <div class="stat-row"><span class="muted">Armor</span><span>${equipName(p.armor)}</span></div>

      <h3>Depth ${game.depth}</h3>
      <div class="depth-name">${DEPTH_NAMES[game.depth - 1]}</div>
      ${onStairs ? '<button id="btn-descend">Descend the Stairs ▼</button>' : ''}
      <p class="hint">Arrows / WASD to move · bump to attack · walk over loot to take it${game.stairs ? ' · Enter on 🪜 to descend' : ''}</p>
   `;
}

function equipName(id) {
   return id ? `${ITEMS[id].glyph} ${ITEMS[id].name}` : '<span class="muted">—</span>';
}

function renderInventory(game) {
   document.getElementById('inventory').innerHTML = inventoryRows(game, true);
}

/**
 * Renders the player's inventory as a list of rows. When `interactive` is
 * true, rows carry `data-item` + an action label for the side-panel's click
 * handling; the read-only HUD overlay omits both.
 */
function inventoryRows(game, interactive) {
   const inv = game.player.inv;
   const ids = Object.keys(inv).sort(
      (a, b) =>
         KIND_ORDER.indexOf(ITEMS[a].kind) - KIND_ORDER.indexOf(ITEMS[b].kind) ||
         ITEMS[a].name.localeCompare(ITEMS[b].name)
   );

   if (ids.length === 0) {
      return '<p class="muted">Your pack is empty.</p>';
   }

   return ids
      .map((id) => {
         const item = ITEMS[id];
         const qty = inv[id] > 1 ? ` ×${inv[id]}` : '';
         if (!interactive) {
            return `<div class="row material"><span>${item.glyph} ${item.name}${qty}</span></div>`;
         }
         const action =
            item.kind === 'potion' || item.kind === 'food' ? 'Use' :
            item.kind === 'weapon' || item.kind === 'armor' ? 'Equip' : '';
         const cls = action ? 'row' : 'row material';
         return `<div class="${cls}" data-item="${id}">
            <span>${item.glyph} ${item.name}${qty}</span>
            <span class="muted">${action}</span>
         </div>`;
      })
      .join('');
}

function renderCrafting(game) {
   document.getElementById('crafting').innerHTML = craftingRows(game);
}

function craftingRows(game) {
   return RECIPES.map((recipe) => {
      const out = ITEMS[recipe.out];
      const craftable = game.canCraft(recipe);
      const needs = Object.entries(recipe.needs)
         .map(([mat, count]) => {
            const have = game.player.inv[mat] || 0;
            const ok = have >= count;
            return `<span class="${ok ? 'need-ok' : 'need-miss'}">${count}×${ITEMS[mat].glyph}</span>`;
         })
         .join(' ');
      const stat = out.atk ? ` <span class="muted">(+${out.atk} atk)</span>` :
                   out.def ? ` <span class="muted">(+${out.def} def)</span>` :
                   out.heal ? ` <span class="muted">(+${out.heal} hp)</span>` : '';
      return `<div class="row recipe ${craftable ? '' : 'locked'}" data-recipe="${recipe.id}">
         <span>${out.glyph} ${out.name}${stat}</span>
         <span>${needs}</span>
      </div>`;
   }).join('');
}

/**
 * Fills the toggleable inventory/character overlays shown over the 3D view.
 * The pack HUD is interactive (use/equip/craft) — clicks are handled by the
 * same delegate as the side panel in main.js.
 */
function renderHud(game) {
   const invHud = document.getElementById('inventory-hud-content');
   const charHud = document.getElementById('character-hud-content');
   if (invHud) invHud.innerHTML = inventoryRows(game, true) + '<h3>Craft</h3>' + craftingRows(game);
   if (charHud) charHud.innerHTML = characterSheet(game);
}

function characterSheet(game) {
   const p = game.player;
   const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
   return `
      <div class="bar"><div class="bar-fill" style="width:${hpPct}%"></div></div>
      <div class="stat-row"><span>HP</span><span>${p.hp} / ${p.maxHp}</span></div>
      <div class="stat-row"><span>Level ${p.level}</span><span class="muted">${p.xp} / ${game.xpToNext()} xp</span></div>
      <div class="stat-row"><span>Attack</span><span>${game.playerAtk()}</span></div>
      <div class="stat-row"><span>Defense</span><span>${game.playerDef()}</span></div>
      <div class="stat-row"><span>Gold</span><span>💰 ${p.gold}</span></div>
      <h3>Equipment</h3>
      <div class="stat-row"><span class="muted">Weapon</span><span>${equipName(p.weapon)}</span></div>
      <div class="stat-row"><span class="muted">Armor</span><span>${equipName(p.armor)}</span></div>
      <h3>Depth ${game.depth}</h3>
      <div class="depth-name">${DEPTH_NAMES[game.depth - 1]}</div>
   `;
}

function renderLog(game) {
   const logEl = document.getElementById('log');
   const msgs = game.msgs.slice(-14);
   logEl.innerHTML = msgs
      .map((m, i) => `<div class="${i >= msgs.length - 4 ? 'new' : 'old'}">${m}</div>`)
      .join('');
   logEl.scrollTop = logEl.scrollHeight;
}
