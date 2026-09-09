import assert from "node:assert/strict";
import {
  composerKindAfterSubstitutionClick,
  dimEventGridFor,
  isAssistCallout,
  isBenchIncomingCallout,
  isMandatorySubCallout,
  isSubOutCallout,
  isVoluntarySubInCallout,
} from "./live-callouts.ts";

const afterInjury = { kind: "mandatory-sub-in" };
const afterVoluntarySubIn = { kind: "sub-in" };
const afterVoluntarySubOut = { kind: "sub-out" };
const afterGoal = { kind: "assist-pick" };

assert.equal(composerKindAfterSubstitutionClick(true), "sub-in");
assert.equal(composerKindAfterSubstitutionClick(false), "sub-out");

assert.equal(isBenchIncomingCallout(afterInjury.kind), true);
assert.equal(isBenchIncomingCallout(afterVoluntarySubIn.kind), true);
assert.equal(isBenchIncomingCallout(afterVoluntarySubOut.kind), false);

assert.equal(isVoluntarySubInCallout(afterVoluntarySubIn.kind), true);
assert.equal(isMandatorySubCallout(afterVoluntarySubIn.kind), false);

assert.equal(isSubOutCallout(afterVoluntarySubOut.kind), true);
assert.equal(dimEventGridFor(afterVoluntarySubIn.kind), true);
assert.equal(dimEventGridFor(afterVoluntarySubOut.kind), true);
assert.equal(isAssistCallout(afterGoal.kind), true);

console.log("[live-callout:node-test] passed", {
  substitutionButtonPitchSelected: {
    setsKind: composerKindAfterSubstitutionClick(true),
    banner: isBenchIncomingCallout("sub-in"),
    quietOnlyIfBannerIgnoresSubIn: isMandatorySubCallout("sub-in"),
  },
  substitutionButtonBenchSelected: {
    setsKind: composerKindAfterSubstitutionClick(false),
    banner: isSubOutCallout("sub-out"),
  },
  injury: {
    kind: afterInjury.kind,
    banner: isBenchIncomingCallout(afterInjury.kind),
  },
});
