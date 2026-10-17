import { PLAYER_NAMES } from './selection.js';
import { createTournament, currentMatch } from './tournament.js';

let fieldCount = 0, lastRender = '';
export function prepareEntrants(count) {
  if (fieldCount === count) return;
  const previous = [...document.querySelectorAll('#entrant-fields label')].map(label => ({ name: label.querySelector('input').value, skin: label.querySelector('select').value }));
  const fields = document.querySelector('#entrant-fields'); fields.replaceChildren(); fieldCount = count;
  for (let i = 0; i < count; i++) {
    const label = document.createElement('label');
    const name = document.createElement('input'); name.type = 'text'; name.maxLength = 24; name.value = previous[i]?.name || `Joueur ${i + 1}`; name.setAttribute('aria-label', `Nom du joueur ${i + 1}`);
    const skin = document.createElement('select'); skin.setAttribute('aria-label', `Personnage du joueur ${i + 1}`);
    PLAYER_NAMES.forEach((name, index) => skin.add(new Option(name, index + 1)));
    skin.value = previous[i]?.skin || String(i + 1);
    label.append(name, skin); fields.append(label);
  }
}
export function createFromSetup(format, skins, bestOf) {
  const entrants = format === 'series' ? [{ name: 'Bleu', skin: skins[0] }, { name: 'Rouge', skin: skins[1] }]
    : [...document.querySelectorAll('#entrant-fields label')].map(label => ({ name: label.querySelector('input').value, skin: +label.querySelector('select').value }));
  return createTournament(format === 'series' ? { format: 'series', entrants, bestOf } : { format: 'bracket', entrants });
}
export function playingEntrants(tournament, matchId) {
  if (!tournament) return null;
  return (tournament.records.find(record => record.id === matchId)?.players || currentMatch(tournament).players)?.map(index => tournament.entrants[index]) || null;
}
export function renderTournament(tournament, matchId, authority) {
  const panel = document.querySelector('#tournament-panel'); panel.hidden = !tournament;
  if (!tournament) { lastRender = ''; return; }
  const key = JSON.stringify([tournament, matchId, authority]); if (lastRender === key) return; lastRender = key;
  const match = currentMatch(tournament), title = document.querySelector('#tournament-title'), status = document.querySelector('#tournament-status');
  title.textContent = tournament.format === 'series' ? 'Coupe à deux' : `Tournoi à ${tournament.entrants.length}`;
  status.textContent = match.finished ? `${tournament.entrants[match.champion].name} remporte ${tournament.format === 'series' ? 'la coupe' : 'le tournoi'} !`
    : tournament.format === 'series' ? `Première équipe à ${(tournament.bestOf + 1) / 2} victoires · ${match.wins[0]} — ${match.wins[1]}`
      : `${match.roundLabel} : ${match.players.map(index => tournament.entrants[index].name).join(' contre ')}`;
  document.querySelector('#cancel-tournament').hidden = !authority;
  document.querySelector('#cancel-tournament').textContent = match.finished ? 'Retour aux réglages' : 'Quitter le tournoi';
  const list = document.querySelector('#tournament-results'); list.replaceChildren();
  function item(number, label, names, record) {
    const li = document.createElement('li'), strong = document.createElement('strong'), detail = document.createElement('span');
    strong.textContent = `${label} · ${names.join(' / ')}`;
    detail.textContent = record ? `${record.scores[0]} — ${record.scores[1]}` : number === tournament.records.length && !match.finished ? 'Prochain match' : 'À venir';
    li.classList.toggle('current', number === tournament.records.length && !match.finished);
    li.append(strong, detail); list.append(li);
  }
  if (tournament.format === 'series') {
    const names = tournament.entrants.map(entrant => entrant.name);
    for (let i = 0; i < tournament.records.length + (match.finished ? 0 : 1); i++) item(i, `Manche ${i + 1}`, names, tournament.records[i]);
  } else {
    let players = tournament.entrants.map((entrant, index) => ({ name: entrant.name, index })), number = 0;
    while (players.length > 1) {
      const next = [], round = players.length === 8 ? 'Quart de finale' : players.length === 4 ? 'Demi-finale' : 'Finale';
      for (let i = 0; i < players.length; i += 2) {
        const record = tournament.records[number];
        item(number, round, [players[i].name, players[i + 1].name], record);
        next.push(record ? players[i + (record.scores[0] > record.scores[1] ? 0 : 1)] : { name: `Vainqueur du match ${number + 1}`, index: null });
        number++;
      }
      players = next;
    }
  }
}
