/**
 * Core state management hook for the Team Management tactical board.
 *
 * Manages formation selection, starting XI assignments, substitutes, and
 * all drag-and-drop operations while enforcing the hard team rules:
 *
 * - Maximum 11 players on the pitch
 * - Exactly 1 goalkeeper in a complete XI
 * - No player in both starting XI and substitutes simultaneously
 * - GK position only accepts goalkeepers
 */

import { useCallback, useMemo, useState } from "react";
import type { BackendAthlete } from "@/services/athletes";
import {
  FORMATIONS,
  DEFAULT_FORMATION_ID,
  autoFillFormation,
} from "./formations";
import type { DragItem, PitchAssignments, SavedLineup } from "./types";

/** Check whether a position string represents a goalkeeper. */
function isGoalkeeper(position: string | null): boolean {
  return (position ?? "").toUpperCase() === "GK";
}

/** Build an empty assignments map for a given formation. */
function emptyAssignments(formationId: string): PitchAssignments {
  const formation = FORMATIONS[formationId];
  if (!formation) return {};
  const assignments: PitchAssignments = {};
  for (const pos of formation.positions) {
    assignments[pos.id] = null;
  }
  return assignments;
}

export function useLineupState(athletes: BackendAthlete[]) {
  const [formationId, setFormationIdState] = useState(DEFAULT_FORMATION_ID);
  const [assignments, setAssignments] = useState<PitchAssignments>(
    () => emptyAssignments(DEFAULT_FORMATION_ID),
  );
  const [substituteIds, setSubstituteIds] = useState<string[]>([]);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [autoFillEnabled, setAutoFillEnabled] = useState(false);

  /**
   * Replace the entire board with a saved lineup, or with a blank board
   * (all athletes on the bench, default formation) when passed `null`.
   *
   * Used both to select a different saved lineup and to start a new one.
   * Reconciles the saved assignments/subs against the current roster: a
   * player removed from the squad since the save is dropped, and any player
   * added since the save lands on the bench.
   */
  const loadLineup = useCallback(
    (saved: SavedLineup | null) => {
      const restoredFormation = saved ? FORMATIONS[saved.formationId] : undefined;

      if (!saved || !restoredFormation) {
        setFormationIdState(DEFAULT_FORMATION_ID);
        setAssignments(emptyAssignments(DEFAULT_FORMATION_ID));
        setSubstituteIds(athletes.map((a) => a.id));
        setAutoFillEnabled(false);
        setError(null);
        return;
      }

      const knownIds = new Set(athletes.map((a) => a.id));
      const placed = new Set<string>();

      const restoredAssignments: PitchAssignments = {};
      for (const pos of restoredFormation.positions) {
        const athleteId = saved.assignments[pos.id] ?? null;
        if (athleteId && knownIds.has(athleteId) && !placed.has(athleteId)) {
          restoredAssignments[pos.id] = athleteId;
          placed.add(athleteId);
        } else {
          restoredAssignments[pos.id] = null;
        }
      }

      const restoredSubs: string[] = [];
      for (const athleteId of saved.substituteIds) {
        if (knownIds.has(athleteId) && !placed.has(athleteId)) {
          restoredSubs.push(athleteId);
          placed.add(athleteId);
        }
      }
      // Newly added athletes (not in the saved lineup at all) join the bench.
      for (const athlete of athletes) {
        if (!placed.has(athlete.id)) {
          restoredSubs.push(athlete.id);
          placed.add(athlete.id);
        }
      }

      setFormationIdState(saved.formationId);
      setAssignments(restoredAssignments);
      setSubstituteIds(restoredSubs);
      setAutoFillEnabled(false);
      setError(null);
    },
    [athletes],
  );

  /* ── Derived data ──────────────────────────────────────────────────────── */

  const formation = FORMATIONS[formationId];

  /** Set of athlete IDs currently on the pitch. */
  const pitchAthleteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const athleteId of Object.values(assignments)) {
      if (athleteId) ids.add(athleteId);
    }
    return ids;
  }, [assignments]);

  /** Number of players currently on the pitch. */
  const pitchCount = pitchAthleteIds.size;

  /** Whether the starting XI is complete (exactly 11). */
  const isXiComplete = pitchCount === 11;

  /** Whether exactly one goalkeeper is assigned to the GK position. */
  const hasGoalkeeper = useMemo(() => {
    if (!formation) return false;
    const gkPos = formation.positions.find((p) => p.role === "GK");
    if (!gkPos) return false;
    const gkAthleteId = assignments[gkPos.id];
    if (!gkAthleteId) return false;
    const athlete = athletes.find((a) => a.id === gkAthleteId);
    return isGoalkeeper(athlete?.position ?? null);
  }, [formation, assignments, athletes]);

  const misplacedAthleteIds = useMemo(() => {
    if (!formation) return [];

    const ids: string[] = [];

    for (const pos of formation.positions) {
      const athleteId = assignments[pos.id];

      if (!athleteId) continue;

      const athlete = athletes.find((a) => a.id === athleteId);

      const athletePosition = (athlete?.position ?? "")
        .trim()
        .toUpperCase();

      const slotPosition = pos.label
        .trim()
        .toUpperCase();

      // Player is considered "misplaced" when they are not playing
      // their exact recorded position.
      if (athletePosition && athletePosition !== slotPosition) {
        ids.push(athleteId);
      }
    }

    return ids;
  }, [formation, assignments, athletes]);

  const hasMisplacedPlayers = misplacedAthleteIds.length > 0;

  /** Injured athletes currently occupying a pitch position (for old saved plans). */
  const injuredPitchAthleteIds = useMemo(
    () =>
      [...pitchAthleteIds].filter(
        (id) => athletes.find((a) => a.id === id)?.status === "injured",
      ),
    [pitchAthleteIds, athletes],
  );

  const hasInjuredPitchPlayers = injuredPitchAthleteIds.length > 0;

  /* ── Auto-fill ─────────────────────────────────────────────────────────── */

  /**
   * Auto-fill the formation from the recorded positions.
   *
   * Only available players are auto-assigned: injured and suspended athletes
   * stay on the bench (clearly badged) rather than being placed into the
   * starting XI automatically. Injured athletes also cannot be placed on the
   * pitch manually.
   */
  const runAutoFill = useCallback(
    (targetFormationId: string) => {
      const eligibleIds = athletes
        .filter((a) => a.status === "available")
        .map((a) => a.id);

      const getPosition = (id: string) =>
        athletes.find((a) => a.id === id)?.position ?? null;

      const {
        assignments: newAssignments,
        substituteIds: newSubs,
      } = autoFillFormation(targetFormationId, eligibleIds, getPosition);

      setAssignments(newAssignments);
      // Unavailable players (injured/suspended) remain on the bench.
      const unavailableIds = athletes
        .filter((a) => a.status !== "available")
        .map((a) => a.id);
      setSubstituteIds([...newSubs, ...unavailableIds]);
    },
    [athletes],
  );

  /* ── Formation change ──────────────────────────────────────────────────── */

  const setFormation = useCallback(
    (newFormationId: string) => {
      if (newFormationId === formationId) return;
      if (!FORMATIONS[newFormationId]) return;

      setFormationIdState(newFormationId);

      // Auto-fill ON:
      // Re-run autofill for the newly selected formation.
      if (autoFillEnabled) {
        runAutoFill(newFormationId);
        setError(null);
        return;
      }

      // Auto-fill OFF:
      // Changing formation starts with an empty pitch.
      // Nothing is automatically placed.
      setAssignments(emptyAssignments(newFormationId));
      setSubstituteIds(athletes.map((a) => a.id));
      setError(null);
    },
    [formationId, athletes, autoFillEnabled, runAutoFill],
  );

  /* ── Drag start / end ──────────────────────────────────────────────────── */

  const startDrag = useCallback((item: DragItem) => {
    setDragItem(item);
    setError(null);
  }, []);

  const endDrag = useCallback(() => {
    setDragItem(null);
  }, []);

  /* ── Drop operations ───────────────────────────────────────────────────── */

  /**
   * Move a substitute onto the pitch at a specific position.
   *
   * If the target position is already occupied, the two players swap
   * (the occupant goes to the bench).
   */
  const dropSubOnPitch = useCallback(
    (athleteId: string, targetPositionId: string) => {
      if (!formation) return;

      const athlete = athletes.find((a) => a.id === athleteId);

      // Injured athletes are not eligible for a starting-XI position.
      if (athlete?.status === "injured") {
        setError("Injured players cannot be placed in the starting XI.");
        return;
      }

      // Validate: no duplicates
      if (pitchAthleteIds.has(athleteId)) {
        setError("This player is already on the pitch.");
        return;
      }

      // Validate: max 11 (only if the player is genuinely new to the pitch)
      const targetOccupant = assignments[targetPositionId];
      if (!targetOccupant && pitchCount >= 11) {
        setError("Starting XI is full. Remove a player first.");
        return;
      }

      // Validate: GK position only accepts goalkeepers
      const targetPos = formation.positions.find((p) => p.id === targetPositionId);
      if (targetPos?.role === "GK") {
        if (!isGoalkeeper(athlete?.position ?? null)) {
          setError("Only a goalkeeper can play in the GK position.");
          return;
        }
      }

      setAssignments((prev) => ({
        ...prev,
        [targetPositionId]: athleteId,
      }));

      setSubstituteIds((prev) => {
        // Remove the new player from subs
        const filtered = prev.filter((id) => id !== athleteId);
        // If there was an occupant, they go to subs
        if (targetOccupant && targetOccupant !== athleteId) {
          return [...filtered.filter((id) => id !== targetOccupant), targetOccupant];
        }
        return filtered;
      });

      setError(null);
    },
    [formation, pitchAthleteIds, assignments, pitchCount, athletes],
  );

  /**
   * Move a pitch player to the substitutes bench.
   */
  const dropPitchOnSubs = useCallback(
    (athleteId: string, sourcePositionId: string) => {
      // Remove from pitch
      setAssignments((prev) => ({
        ...prev,
        [sourcePositionId]: null,
      }));

      // Add to subs (avoid duplicates)
      setSubstituteIds((prev) =>
        prev.includes(athleteId) ? prev : [...prev, athleteId],
      );

      setError(null);
    },
    [],
  );

  /**
   * Swap two pitch players between positions.
   */
  const swapPitchPlayers = useCallback(
    (fromPositionId: string, toPositionId: string) => {
      if (!formation) return;
      if (fromPositionId === toPositionId) return;

      const fromAthlete = assignments[fromPositionId];
      const toAthlete = assignments[toPositionId];

      if (!fromAthlete) return;

      // Validate: GK swap rules
      const fromPos = formation.positions.find((p) => p.id === fromPositionId);
      const toPos = formation.positions.find((p) => p.id === toPositionId);

      // If moving to GK position, the incoming player must be a goalkeeper
      if (toPos?.role === "GK" && fromAthlete) {
        const athlete = athletes.find((a) => a.id === fromAthlete);
        if (!isGoalkeeper(athlete?.position ?? null)) {
          setError("Only a goalkeeper can play in the GK position.");
          return;
        }
      }

      // If moving from GK position, the replacement must also be a GK
      // (or the position stays empty)
      if (fromPos?.role === "GK" && toAthlete) {
        const athlete = athletes.find((a) => a.id === toAthlete);
        if (!isGoalkeeper(athlete?.position ?? null)) {
          setError("Only a goalkeeper can play in the GK position.");
          return;
        }
      }

      setAssignments((prev) => ({
        ...prev,
        [fromPositionId]: toAthlete ?? null,
        [toPositionId]: fromAthlete,
      }));

      setError(null);
    },
    [formation, assignments, athletes],
  );

  /**
   * Handle any drop based on the drag payload and target.
   */
  const handleDrop = useCallback(
    (
      source: DragItem,
      target:
        | { type: "pitch"; positionId: string }
        | { type: "subs" },
    ) => {
      if (target.type === "pitch") {
        if (source.source === "subs") {
          dropSubOnPitch(source.athleteId, target.positionId);
        } else if (source.source === "pitch" && source.positionId) {
          // Pitch-to-pitch: swap
          swapPitchPlayers(source.positionId, target.positionId);
        }
      } else if (target.type === "subs") {
        if (source.source === "pitch" && source.positionId) {
          dropPitchOnSubs(source.athleteId, source.positionId);
        }
        // Sub-to-sub is a no-op
      }
    },
    [dropSubOnPitch, swapPitchPlayers, dropPitchOnSubs],
  );

  /* ── Reset & auto-fill ─────────────────────────────────────────────────── */

  const resetLineup = useCallback(() => {
    setAssignments(emptyAssignments(formationId));
    setSubstituteIds(athletes.map((a) => a.id));
    setAutoFillEnabled(false);
    setError(null);
  }, [formationId, athletes]);

  const toggleAutoFill = useCallback(() => {
    // Turning Auto-fill OFF:
    // keep the current lineup exactly as it is.
    if (autoFillEnabled) {
      setAutoFillEnabled(false);
      setError(null);
      return;
    }

    // Turning Auto-fill ON:
    // immediately autofill the current formation.
    runAutoFill(formationId);
    setAutoFillEnabled(true);
    setError(null);
  }, [autoFillEnabled, formationId, runAutoFill]);

  /* ── Public API ────────────────────────────────────────────────────────── */

  return {
    // State
    formationId,
    formation,
    assignments,
    substituteIds,
    dragItem,
    error,
    autoFillEnabled,
    pitchCount,
    isXiComplete,
    hasGoalkeeper,
    misplacedAthleteIds,
    hasMisplacedPlayers,
    injuredPitchAthleteIds,
    hasInjuredPitchPlayers,
    pitchAthleteIds,

    // Derived athlete counts
    totalAthletes: athletes.length,
    hasEnoughForXi: athletes.length >= 11,

    // Actions
    setFormation,
    startDrag,
    endDrag,
    handleDrop,
    resetLineup,
    toggleAutoFill,
    loadLineup,
    clearError: () => setError(null),
  };
}
