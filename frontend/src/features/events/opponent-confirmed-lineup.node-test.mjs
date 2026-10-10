import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  friendlyLineupPlayers,
  friendlyLineupStarterIds,
  opponentPitchState,
  placeOppPlayers,
} from "../matches/live-match-model.ts";

// Node strips types from the model tests; transpile JSX for this rendered privacy check.
const source = readFileSync(
  new URL("./OpponentConfirmedLineupCard.tsx", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
const compiled = {};
new Function("exports", "require", outputText)(
  compiled,
  createRequire(import.meta.url),
);
const render = (lineup) =>
  renderToStaticMarkup(
    React.createElement(compiled.OpponentConfirmedLineupCard, {
      lineup,
      opponentName: "Visitors",
    }),
  );

test("confirmed lineup renders only formation, starters, bench, names and shirt numbers without controls", () => {
  const lineup = {
    available: true,
    formation: "4-3-3",
    starters: [
      { name: "Starter One", shirtNumber: 9, notes: "PRIVATE STARTER NOTE" },
    ],
    bench: [{ name: "Bench One", shirtNumber: null, injury: "PRIVATE INJURY" }],
    gamePlan: "PRIVATE TACTICS",
    notes: "PRIVATE NOTE",
    draft: "PRIVATE DRAFT",
  };
  const html = render(lineup);
  for (const visible of [
    "Visitors lineup",
    "4-3-3",
    "Starters",
    "Starter One",
    "9",
    "Bench",
    "Bench One",
    "read only",
  ]) {
    assert.ok(html.includes(visible), visible);
  }
  assert.doesNotMatch(html, /PRIVATE|<button|<input|<select|<textarea/);
  const players = friendlyLineupPlayers(lineup);
  assert.equal(players.length, 2);
  assert.equal(players[1].shirtNumber, null);
  assert.deepEqual([...friendlyLineupStarterIds(lineup)], [players[0].id]);
  assert.doesNotMatch(JSON.stringify(players), /PRIVATE/);
});

test("unconfirmed lineups show a waiting state; legacy confirmed snapshots use the same public adapter", () => {
  const waiting = render({
    available: false,
    formation: null,
    starters: [],
    bench: [],
  });
  assert.match(waiting, /Waiting for Visitors/);
  assert.doesNotMatch(waiting, /<button|<input|<select/);
  const legacy = {
    available: true,
    teamId: "away",
    teamName: "Visitors",
    confirmedAt: "2026-10-05",
    formationId: "4-3-3",
    pitchAssignments: { "433-cm1": "private-athlete" },
    players: [
      {
        id: "private-athlete",
        firstName: "Legacy",
        lastName: "Player",
        squadNumber: 7,
        position: "CM",
        started: true,
      },
    ],
  };
  const modern = {
    available: true,
    source: "confirmed",
    formation: "4-3-3",
    starters: [{ name: "Legacy Player", shirtNumber: 7, slotId: "433-cm1" }],
    bench: [],
  };
  assert.deepEqual(
    friendlyLineupPlayers(legacy),
    friendlyLineupPlayers(modern),
  );
  assert.equal(render(legacy), render(modern));
  assert.doesNotMatch(
    JSON.stringify(friendlyLineupPlayers(legacy)),
    /private-athlete/,
  );
});

test("missing or duplicate shirt numbers retain every player and substitutes never fill missing starters", () => {
  const lineup = {
    available: true,
    formation: "4-3-3",
    starters: [
      { name: "No Number", shirtNumber: null, slotId: "433-gk" },
      { name: "Duplicate One", shirtNumber: 9, slotId: "433-st" },
      { name: "Duplicate Two", shirtNumber: 9, slotId: null },
    ],
    bench: [{ name: "Bench Keeper", shirtNumber: null, slotId: "433-gk" }],
  };
  const players = friendlyLineupPlayers(lineup);
  assert.equal(players.length, 4);
  const state = opponentPitchState(
    players,
    [],
    11,
    friendlyLineupStarterIds(lineup),
  );
  assert.equal(state.onPitch.length, 3);
  assert.deepEqual(
    state.bench.map((p) => p.name),
    ["Bench Keeper"],
  );
  const placed = placeOppPlayers(state.onPitch, "left");
  assert.deepEqual(
    placed.map((p) => p.player.name),
    ["No Number", "Duplicate One"],
  );
  const html = render(lineup);
  assert.match(html, /1 starter position unknown/);
  assert.match(html, /Bench Keeper/);
});

test("confirmed pitch uses public slots and custom coordinates, leaving unknown formations unplaced", () => {
  const lineup = {
    available: true,
    source: "confirmed",
    formation: "custom-5",
    customPositions: [
      {
        id: "custom-5-gk",
        label: "GK",
        x: 23,
        y: 88,
        notes: "PRIVATE COORDINATES NOTE",
      },
    ],
    starters: [{ name: "Keeper", shirtNumber: 42, slotId: "custom-5-gk" }],
    bench: [],
  };
  assert.match(render(lineup), /left:23%;top:88%/);
  assert.doesNotMatch(render(lineup), /PRIVATE/);
  assert.doesNotMatch(JSON.stringify(friendlyLineupPlayers(lineup)), /PRIVATE/);
  assert.equal(
    placeOppPlayers(friendlyLineupPlayers(lineup), "left").length,
    1,
  );
  const missingCoordinates = { ...lineup, customPositions: null };
  assert.equal(
    placeOppPlayers(friendlyLineupPlayers(missingCoordinates), "left").length,
    0,
  );
  assert.doesNotMatch(render(missingCoordinates), /role="img"/);
  const unknown = { ...lineup, formation: "unknown", customPositions: null };
  assert.equal(
    placeOppPlayers(friendlyLineupPlayers(unknown), "left").length,
    0,
  );
  assert.doesNotMatch(render(unknown), /role="img"/);
  assert.match(render(unknown), /position unknown/);
});

test("exact-fixture squad fallback is labelled and formation stays unknown", () => {
  const html = render({
    available: true,
    source: "squad",
    formation: null,
    starters: [{ name: "Fallback Player", shirtNumber: null }],
    bench: [],
  });
  assert.match(html, /Match squad data/);
  assert.match(html, /Formation unknown/);
  assert.doesNotMatch(html, /role="img"/);
});
