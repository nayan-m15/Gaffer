import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { friendlyLineupPlayers, friendlyLineupStarterIds } from "../matches/live-match-model.ts";

// Node strips types from the model tests; transpile JSX for this rendered privacy check.
const source = readFileSync(new URL("./OpponentConfirmedLineupCard.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
const compiled = {};
new Function("exports", "require", outputText)(compiled, createRequire(import.meta.url));
const render = (lineup) => renderToStaticMarkup(
  React.createElement(compiled.OpponentConfirmedLineupCard, { lineup, opponentName: "Visitors" }),
);

test("confirmed lineup renders only formation, starters, bench, names and shirt numbers without controls", () => {
  const lineup = {
    available: true,
    formation: "4-3-3",
    starters: [{ name: "Starter One", shirtNumber: 9, notes: "PRIVATE STARTER NOTE" }],
    bench: [{ name: "Bench One", shirtNumber: null, injury: "PRIVATE INJURY" }],
    gamePlan: "PRIVATE TACTICS",
    notes: "PRIVATE NOTE",
    draft: "PRIVATE DRAFT",
  };
  const html = render(lineup);
  for (const visible of ["Visitors lineup", "4-3-3", "Starters", "Starter One", "9", "Bench", "Bench One", "read only"]) {
    assert.ok(html.includes(visible), visible);
  }
  assert.doesNotMatch(html, /PRIVATE|<button|<input|<select|<textarea/);
  assert.deepEqual(friendlyLineupPlayers(lineup), []);
  assert.equal(friendlyLineupStarterIds(lineup).size, 0);
});

test("unconfirmed lineups render nothing and the flag-off legacy roster keeps its existing model", () => {
  assert.equal(render({ available: false, formation: null, starters: [], bench: [] }), "");
  const legacy = { available: true, teamId: "away", teamName: "Visitors", players: [
    { id: "player-1", firstName: "Legacy", lastName: "Player", squadNumber: 7, position: "CM", started: true },
  ] };
  assert.equal(render(legacy), "");
  assert.deepEqual(friendlyLineupPlayers(legacy), [{ id: "player-1", shirtNumber: 7, name: "Legacy Player", position: null }]);
  assert.deepEqual([...friendlyLineupStarterIds(legacy)], ["player-1"]);
});
