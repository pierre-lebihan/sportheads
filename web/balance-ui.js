import { BUFF_STATS, BALANCE_PRESETS, AID_AMOUNTS, createBalance, copyBalance, balanceLabel } from './balance.js';
import { PLAYER_NAMES } from './players.js';
import { drawSprite, getAssets } from './render.js';

export function createBalanceControls(root, onChange) {
  root.innerHTML = `<legend>Équilibrage</legend>
    <div class="balance-presets" role="group" aria-label="Préréglage d’équilibrage"></div>
    <div class="balance-amounts" role="group" aria-label="Intensité de l’aide" hidden></div>
    <p id="balance-status" role="status"></p>
    <div class="balance-players" role="group" aria-label="Joueur à régler"></div>
    <div class="balance-stats"></div>
    <p class="balance-help">Choisissez Manuel pour ajuster les cinq curseurs de chaque joueur.</p>`;
  const $ = selector => root.querySelector(selector);
  let config = createBalance(), selected = 0, locked = false, lastPortraits = '';
  const presets = BALANCE_PRESETS.map(item => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.balancePreset = item.id; button.textContent = item.label;
    button.addEventListener('click', () => {
      if (locked) return;
      config = createBalance(item.id, config.amount, config.buffs); changed();
    });
    $('.balance-presets').append(button); return button;
  });
  const amounts = AID_AMOUNTS.map((amount, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.balanceAmount = amount;
    button.textContent = `${['Un peu', 'Normal', 'Beaucoup'][index]} · +${amount} %`;
    button.addEventListener('click', () => { if (locked) return; config = createBalance(config.preset, amount, config.buffs); changed(); });
    $('.balance-amounts').append(button); return button;
  });
  const players = [0, 1].map(side => {
    const button = document.createElement('button'); button.type = 'button'; button.className = side ? 'red' : 'blue'; button.dataset.balanceSide = side;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; canvas.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'), name = document.createElement('strong'), summary = document.createElement('small');
    text.append(name, summary); button.append(canvas, text);
    button.addEventListener('click', () => { selected = side; refresh(); });
    $('.balance-players').append(button); return { button, canvas, name, summary };
  });
  const stats = BUFF_STATS.map((stat, index) => {
    const row = document.createElement('div'); row.className = 'balance-stat';
    const label = document.createElement('label'); label.htmlFor = 'buff-' + stat.id; label.textContent = stat.label;
    const output = document.createElement('output'); output.htmlFor = label.htmlFor;
    const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'range'; input.min = '0'; input.max = '50'; input.step = '1'; input.dataset.buffStat = index;
    const detail = document.createElement('small'); detail.id = input.id + '-help'; detail.textContent = stat.detail; input.setAttribute('aria-describedby', detail.id);
    input.addEventListener('input', () => {
      if (locked || config.preset !== 'manual') return;
      const value = +input.value;
      if (!Number.isInteger(value) || value < 0 || value > 50) return;
      config.buffs[selected][index] = value; changed();
    });
    row.append(label, output, input, detail); $('.balance-stats').append(row); return { input, output };
  });
  function changed() { refresh(); onChange(copyBalance(config)); }
  function refresh() {
    root.dataset.side = selected;
    root.dataset.preset = config.preset;
    for (const button of presets) { button.disabled = locked; button.setAttribute('aria-pressed', String(button.dataset.balancePreset === config.preset)); }
    $('.balance-amounts').hidden = !['blue', 'red'].includes(config.preset);
    for (const button of amounts) { button.disabled = locked; button.setAttribute('aria-pressed', String(+button.dataset.balanceAmount === config.amount)); }
    $('#balance-status').textContent = balanceLabel(config);
    for (const [side, player] of players.entries()) {
      player.button.setAttribute('aria-pressed', String(side === selected));
      player.summary.textContent = BUFF_STATS.map((_, index) => `${['Saut', 'Tête', 'But', 'Vitesse', 'Frappe'][index]} +${config.buffs[side][index]} %`).join(' · ');
    }
    for (const [index, stat] of stats.entries()) {
      stat.input.value = config.buffs[selected][index]; stat.output.value = `+${stat.input.value} %`;
      stat.input.disabled = locked || config.preset !== 'manual';
      stat.input.setAttribute('aria-label', `${selected ? 'Rouge' : 'Bleu'} : ${BUFF_STATS[index].label}`);
    }
    $('.balance-help').textContent = locked ? 'Réglages en lecture seule. Touchez un joueur pour consulter ses cinq stats.'
      : config.preset === 'manual' ? 'Touchez un joueur pour régler ses cinq bonus.'
        : 'Choisissez Manuel pour ajuster les cinq curseurs de chaque joueur.';
  }
  return {
    get value() { return copyBalance(config); },
    set value(next) { config = copyBalance(next); refresh(); },
    update({ disabled, skins }) {
      locked = disabled;
      for (const [side, player] of players.entries()) player.name.textContent = `${side ? 'Rouge' : 'Bleu'} · ${PLAYER_NAMES[skins[side] - 1]}`;
      const key = skins.join(':');
      if (getAssets() && key !== lastPortraits) {
        for (const [side, player] of players.entries()) {
          const ctx = player.canvas.getContext('2d'); ctx.clearRect(0, 0, 96, 96);
          drawSprite(ctx, 'modern-heads', skins[side], 48, 48, undefined, undefined, 0, { scale: 1.6, flipX: side === 1 });
        }
        lastPortraits = key;
      }
      refresh();
    },
  };
}
