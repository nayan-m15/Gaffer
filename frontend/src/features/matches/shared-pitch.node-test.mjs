import assert from "node:assert/strict";
import test from "node:test";
import { sessionTimeline } from "./session-report-model.ts";
import { friendlyLineupPlayers, markerStatsFor, publicOpponentTimeline, placeOppPlayers, effectiveGamePlan } from "./live-match-model.ts";
import { FORMATIONS } from "../team-management/formations.ts";

const squad = FORMATIONS['4-3-3'].positions.map((slot, index) => ({
  id: `private-${index}`, firstName: 'Player', lastName: String(index), squadNumber: index + 1,
  position: slot.label, started: true,
}));
const lineup = {
  available: true, formation: '4-3-3',
  starters: squad.map((athlete, index) => ({ name: `${athlete.firstName} ${athlete.lastName}`, shirtNumber: athlete.squadNumber, slotId: FORMATIONS['4-3-3'].positions[index].id })),
  bench: [],
};
const players = friendlyLineupPlayers(lineup);
const report = { timeline: ['goal', 'yellow_card', 'goalkeeper_save', 'assist'].map((eventType, index) => ({
  id: `event-${index}`, side: 'home', eventType, minute: index + 1,
  createdAt: '2026-10-06T10:00:00.000Z', player: { name: 'Player 0', shirtNumber: 1 },
})) };

test('shared goals/cards/saves/assists attach to both owning and opponent markers', () => {
  const own = sessionTimeline(report, { id: 'own', isHome: true }, squad);
  const peer = publicOpponentTimeline(sessionTimeline(report, { id: 'peer', isHome: false }), players);
  for (const stats of [markerStatsFor(own, squad[0].id), markerStatsFor(peer, undefined, players[0].id)]) {
    assert.equal(stats.goals, 1);
    assert.equal(stats.yellow, true);
    assert.equal(stats.saves, 1);
    assert.equal(stats.assists, 1);
  }
  assert.equal(peer[0].athleteId, null);
  assert.equal(peer[0].opponentPlayerId, players[0].id);
});

test('ambiguous names stay unassigned; matching shirt numbers distinguish teammates', () => {
  const sameName = [{ ...squad[0], id: 'one' }, { ...squad[0], id: 'two', squadNumber: 2 }];
  assert.equal(sessionTimeline(report, { id: 'own', isHome: true }, sameName)[0].athleteId, 'one');
  assert.equal(sessionTimeline(report, { id: 'own', isHome: true }, [squad[0], { ...squad[0], id: 'duplicate' }])[0].athleteId, null);
});

test('peer formation changes move the whole lineup and retain the goalkeeper', () => {
  const before = placeOppPlayers(players, 'right');
  const tactical = { id: 'tactic', team: 'opponent', eventType: 'tactical_change', minute: 20, createdAt: '2026-10-06T10:00:00Z', tacticalChange: { formationId: '4-4-2' } };
  const after = placeOppPlayers(players, 'right', [tactical]);
  assert.equal(after.length, 11);
  assert.notDeepEqual(after.map(({x, y}) => [x, y]), before.map(({x, y}) => [x, y]));
  assert.deepEqual(after.find(({player}) => player.id === players[0].id), before.find(({player}) => player.id === players[0].id));
  assert.deepEqual(placeOppPlayers(players, 'right', [{ ...tactical, lifecycleStatus: 'voided' }]), before);
  assert.deepEqual(placeOppPlayers(players, 'right', [{ ...tactical, tacticalChange: { defensiveWidth: 8 } }]), before);
  assert.equal(effectiveGamePlan({ formationId: '4-3-3' }, [tactical]).formationId, '4-3-3');
});

test('peer custom coordinates update and later changes supersede earlier formations', () => {
  const customPositions = FORMATIONS['custom-11'].positions.map((slot) => ({ ...slot, x: 100 - slot.x, y: Math.max(0, slot.y - 5) }));
  const changes = [{ id: 'tactic', team: 'opponent', eventType: 'tactical_change', minute: 20, createdAt: '2026-10-06T10:00:00Z', tacticalChange: { formationId: 'custom-11', customPositions } }];
  const custom = placeOppPlayers(players, 'right', changes);
  assert.equal(custom.length, 11);
  assert.notDeepEqual(custom, placeOppPlayers(players, 'right'));
  assert.deepEqual(placeOppPlayers(players, 'right', [...changes, { ...changes[0], id:'later', minute:21, tacticalChange: {formationId:'4-4-2'} }]), placeOppPlayers(players, 'right', [{ ...changes[0], tacticalChange: {formationId:'4-4-2'} }]));
});
