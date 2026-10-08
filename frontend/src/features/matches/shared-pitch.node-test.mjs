import assert from "node:assert/strict";
import test from "node:test";
import { sessionTimeline } from "./session-report-model.ts";
import { friendlyLineupPlayers, markerStatsFor, publicOpponentTimeline, placeOppPlayers, effectiveGamePlan } from "./live-match-model.ts";
import { FORMATIONS } from "../team-management/formations.ts";
import { ownPitchState, opponentPitchState, friendlyLineupStarterIds } from "./live-match-model.ts";
import { matchReportSubstitutions, matchReportTimeline } from "./live-match-report-model.ts";

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

test('a shared substitution replaces the marker and names both players in each report', () => {
  const incoming = { ...squad[0], id: 'private-bench', firstName: 'Bench', lastName: 'Player', squadNumber: 12, started: false };
  const fullSquad = [...squad, incoming];
  const fullLineup = { ...lineup, bench: [{ name: 'Bench Player', shirtNumber: 12 }] };
  const publicPlayers = friendlyLineupPlayers(fullLineup);
  for (const side of ['home', 'away']) {
    const shared = { timeline: [{
      id: 'sub', side, eventType: 'substitution', minute: 10,
      lifecycleStatus: 'confirmed', createdAt: '2026-10-07T10:00:00Z',
      player: { name: 'Player 0', shirtNumber: 1 }, incomingPlayerLabel: '#12 Bench Player',
    }] };
    const own = sessionTimeline(shared, { id: 'own', isHome: side === 'home' }, fullSquad);
    const peer = publicOpponentTimeline(sessionTimeline(shared, { id: 'peer', isHome: side !== 'home' }), publicPlayers);
    assert.equal(own[0].detail, incoming.id);
    const ownState = ownPitchState(fullSquad, own);
    const peerState = opponentPitchState(publicPlayers, peer, friendlyLineupStarterIds(fullLineup));
    assert.equal(ownState.onPitch.length, 11);
    assert.equal(peerState.onPitch.length, 11);
    assert.ok(ownState.onPitch.some(player => player.id === incoming.id));
    const placed = placeOppPlayers(peerState.onPitch, 'left', peer);
    assert.equal(placed.length, 11);
    assert.ok(placed.some(marker => marker.player.name === 'Bench Player'));
    for (const [events, ownSquad, opponents] of [[own, fullSquad, []], [peer, [], publicPlayers]]) {
      const data = { events, squad: ownSquad, match: { opponentSquad: opponents } };
      const [sub] = matchReportSubstitutions(data);
      assert.equal(sub.playerOff, '#1 Player 0');
      assert.equal(sub.playerOn, '#12 Bench Player');
      assert.equal(matchReportTimeline(data)[0].detail, 'On: #12 Bench Player');
    }
  }
});

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

test('separate confirmed bookings show a second-yellow red on both teams markers', () => {
  const cards = [2, 1].map(index => ({
    ...report.timeline[1], id: `yellow-${index}`, eventType: 'yellow_card',
    lifecycleStatus: 'confirmed', matchElapsedMs: 600000,
    createdAt: '2026-10-07T19:03:00Z',
  }));
  const resolved = { timeline: cards };
  const own = sessionTimeline(resolved, { id: 'own', isHome: true }, squad);
  const peer = publicOpponentTimeline(sessionTimeline(resolved, { id: 'peer', isHome: false }), players);
  for (const timeline of [own, peer]) {
    assert.equal(timeline.find(event => event.id === 'yellow-1').eventType, 'yellow_card');
    assert.equal(timeline.find(event => event.id === 'yellow-2').eventType, 'red_card');
    assert.equal(timeline.find(event => event.id === 'yellow-2').detail, 'Second yellow card');
  }
  for (const stats of [markerStatsFor(own, squad[0].id), markerStatsFor(peer, undefined, players[0].id)]) {
    assert.equal(stats.yellow, true);
    assert.equal(stats.red, true);
    assert.equal(stats.secondYellow, true);
  }
  assert.equal(cards.every(event => event.eventType === 'yellow_card'), true, 'source observations stay unchanged');
  const merged = sessionTimeline({ timeline: cards.slice(0, 1) }, { id: 'own', isHome: true }, squad);
  assert.equal(markerStatsFor(merged, squad[0].id).red, false, 'merging/removing a booking clears the derived dismissal');
});

test('unresolved, voided, duplicate or unidentified bookings never imply a second-yellow red', () => {
  const card = { ...report.timeline[1], id: 'first', eventType: 'yellow_card', lifecycleStatus: 'confirmed' };
  for (const cards of [
    [card, { ...card, id: 'second', lifecycleStatus: 'needs_review' }],
    [card, { ...card, id: 'second', lifecycleStatus: 'voided' }],
    [card, { ...card }],
    [card, { ...card, id: 'second', side: 'away' }],
    [card, { ...card, id: 'second', player: { name: 'Someone else', shirtNumber: 2 } }],
    [card, { ...card, id: 'second', player: { name: 'Player 0', shirtNumber: 2 } }],
    ['first', 'second'].map(id => ({ ...card, id, player: null })),
  ]) {
    const timeline = sessionTimeline({ timeline: cards }, { id: 'own', isHome: true }, squad);
    assert.equal(timeline.some(event => event.eventType === 'red_card'), false);
  }
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
