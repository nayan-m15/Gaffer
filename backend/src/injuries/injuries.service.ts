import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
} from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  events,
  injuries,
  injuryTimelineEntries,
  matchEvents,
  matches,
} from '../database/schema';
import {
  OPEN_INJURY_STATUSES,
  daysOut,
  isOpenInjuryStatus,
  markRecurrences,
  recoveryReadings,
  returnVarianceDays,
  type DerivableInjury,
  type InjuryStatusValue,
  type RecoveryReading,
} from './injury-derivations';
import {
  addDays,
  rehabPhasesFor,
  resolveProtocol,
  returnWindowFor,
  type BodyRegion,
  type InjurySeverityValue,
  type InjuryTypeValue,
  type RehabPhase,
} from './injury-protocols';
import type {
  CloseInjuryDto,
  CreateInjuryDto,
  CreateInjuryTimelineEntryDto,
  InjuryProtocolQueryDto,
  ListInjuriesQueryDto,
  UpdateInjuryDto,
} from './injuries.schemas';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** Today in UTC as `yyyy-mm-dd`, matching the `date` columns' storage format. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formats a stored `yyyy-mm-dd` date the way the UI does, for the prose in
 * seeded timeline entries.
 *
 * Fixed to en-GB and UTC rather than the server's locale: these strings are
 * persisted, so they must not depend on where the process happened to run,
 * and a local-time render would show the previous day west of Greenwich.
 */
function formatStoredDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const athleteSummary = {
  athleteFirstName: athletes.firstName,
  athleteLastName: athletes.lastName,
  athleteSquadNumber: athletes.squadNumber,
  athletePosition: athletes.position,
};

@Injectable()
export class InjuriesService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Creates an injury record, seeds its timeline, and marks the athlete
   * unavailable.
   *
   * Creation is open to any team member, mirroring live-match logging: the
   * assistant running the logger is usually the one who sees the injury
   * happen. Editing and closing records stays coach-only at the controller.
   */
  async create(teamId: string, userId: string, input: CreateInjuryDto) {
    await this.assertAthleteOnTeam(teamId, input.athleteId);
    await this.assertMatchProvenance(teamId, input);

    const protocol = resolveProtocol(
      input.bodyRegion,
      input.injuryType,
      input.severity,
      input.occurredOn,
    );

    // A coach-supplied window wins over the guidance table, and the phase
    // plan is rebuilt against it so the two can never disagree.
    const overridden =
      input.estimatedReturnMinDays !== undefined &&
      input.estimatedReturnMaxDays !== undefined;
    const minDays = input.estimatedReturnMinDays ?? protocol.minDays;
    const maxDays = input.estimatedReturnMaxDays ?? protocol.maxDays;
    const phases: RehabPhase[] = overridden
      ? rehabPhasesFor(input.injuryType, { minDays, maxDays })
      : protocol.phases;

    let injury: typeof injuries.$inferSelect;
    try {
      [injury] = await this.databaseService.database
        .insert(injuries)
        .values({
          teamId,
          athleteId: input.athleteId,
          bodyRegion: input.bodyRegion,
          injuryType: input.injuryType,
          severity: input.severity,
          status: input.status ?? 'reported',
          context: input.context ?? (input.matchId ? 'match' : 'other'),
          occurredOn: input.occurredOn,
          matchId: input.matchId ?? null,
          matchEventId: input.matchEventId ?? null,
          minute: input.minute ?? null,
          estimatedReturnMinDays: minDays,
          estimatedReturnMaxDays: maxDays,
          estimatedReturnFrom: addDays(input.occurredOn, minDays),
          estimatedReturnTo: addDays(input.occurredOn, maxDays),
          diagnosedBy: input.diagnosedBy ?? null,
          description: input.description ?? null,
          notes: input.notes ?? null,
          rehabPhases: phases,
          createdByUserId: userId,
        })
        .returning();
    } catch (error) {
      // The partial unique index on match_event_id turns a double-tap of the
      // Injury button into a conflict rather than a duplicate record.
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An injury record already exists for this match event.',
        );
      }
      throw error;
    }

    try {
      await this.seedTimeline(injury, userId);
    } catch (error) {
      // Compensate for Neon HTTP's lack of interactive transactions: a record
      // with no timeline would render as an empty history, so the whole
      // creation is rolled back and the caller can retry.
      await this.databaseService.database
        .delete(injuries)
        .where(eq(injuries.id, injury.id));
      throw error;
    }

    await this.syncAthleteStatus(teamId, input.athleteId);

    return this.findOne(teamId, injury.id);
  }

  /**
   * Team injury record. Returns newest first with the derived fields the
   * history table shows — days out, estimate variance, and whether the
   * injury recurs a region the athlete had recently recovered from.
   */
  async findAll(teamId: string, query: ListInjuriesQueryDto = {}) {
    const conditions = [eq(injuries.teamId, teamId)];
    if (query.athleteId) {
      conditions.push(eq(injuries.athleteId, query.athleteId));
    }
    if (query.status === 'open') {
      conditions.push(inArray(injuries.status, [...OPEN_INJURY_STATUSES]));
    }
    if (query.status === 'closed') {
      conditions.push(eq(injuries.status, 'returned'));
    }

    const rows = await this.databaseService.database
      .select({ ...getTableColumns(injuries), ...athleteSummary })
      .from(injuries)
      .innerJoin(athletes, eq(injuries.athleteId, athletes.id))
      .where(and(...conditions))
      .orderBy(desc(injuries.occurredOn), desc(injuries.createdAt));

    // Recurrence is judged against the athlete's whole history, so a
    // filtered list still needs the unfiltered set to compare against.
    const history =
      query.status || query.athleteId
        ? await this.databaseService.database
            .select({
              id: injuries.id,
              athleteId: injuries.athleteId,
              bodyRegion: injuries.bodyRegion,
              severity: injuries.severity,
              status: injuries.status,
              occurredOn: injuries.occurredOn,
              estimatedReturnTo: injuries.estimatedReturnTo,
              actualReturnOn: injuries.actualReturnOn,
            })
            .from(injuries)
            .where(eq(injuries.teamId, teamId))
        : rows;

    const recurrenceIds = new Set(
      markRecurrences(history)
        .filter((injury) => injury.isRecurrence)
        .map((injury) => injury.id),
    );

    const today = todayIso();

    return rows.map((row) => ({
      ...row,
      daysOut: daysOut(row, today),
      returnVarianceDays: returnVarianceDays(row),
      isRecurrence: recurrenceIds.has(row.id),
      isOpen: isOpenInjuryStatus(row.status),
    }));
  }

  /** One record with its full timeline, oldest entry first. */
  async findOne(teamId: string, injuryId: string) {
    const [injury] = await this.databaseService.database
      .select({ ...getTableColumns(injuries), ...athleteSummary })
      .from(injuries)
      .innerJoin(athletes, eq(injuries.athleteId, athletes.id))
      .where(and(eq(injuries.teamId, teamId), eq(injuries.id, injuryId)))
      .limit(1);

    if (!injury) {
      throw new NotFoundException('Injury not found.');
    }

    const timeline = await this.databaseService.database
      .select()
      .from(injuryTimelineEntries)
      .where(eq(injuryTimelineEntries.injuryId, injuryId))
      .orderBy(
        asc(injuryTimelineEntries.occurredOn),
        asc(injuryTimelineEntries.createdAt),
      );

    const today = todayIso();

    return {
      ...injury,
      daysOut: daysOut(injury, today),
      returnVarianceDays: returnVarianceDays(injury),
      isOpen: isOpenInjuryStatus(injury.status),
      timeline,
    };
  }

  /**
   * Coach edit. Changing the diagnosis or the injury date re-projects the
   * estimate window unless the coach supplied their own, and a status change
   * is recorded on the timeline so the history stays the single narrative.
   */
  async update(
    teamId: string,
    userId: string,
    injuryId: string,
    input: UpdateInjuryDto,
  ) {
    const existing = await this.requireInjury(teamId, injuryId);

    const bodyRegion = input.bodyRegion ?? existing.bodyRegion;
    const injuryTypeValue = input.injuryType ?? existing.injuryType;
    const severity = input.severity ?? existing.severity;
    const occurredOn = input.occurredOn ?? existing.occurredOn;

    const diagnosisChanged =
      bodyRegion !== existing.bodyRegion ||
      injuryTypeValue !== existing.injuryType ||
      severity !== existing.severity;

    const { minDays, maxDays } = this.resolveEstimate(
      input,
      existing,
      diagnosisChanged,
      bodyRegion,
      injuryTypeValue,
      severity,
    );

    const estimateChanged =
      minDays !== existing.estimatedReturnMinDays ||
      maxDays !== existing.estimatedReturnMaxDays ||
      occurredOn !== existing.occurredOn;

    const [updated] = await this.databaseService.database
      .update(injuries)
      .set({
        bodyRegion,
        injuryType: injuryTypeValue,
        severity,
        occurredOn,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.diagnosedBy !== undefined
          ? { diagnosedBy: input.diagnosedBy }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        estimatedReturnMinDays: minDays,
        estimatedReturnMaxDays: maxDays,
        estimatedReturnFrom: addDays(occurredOn, minDays),
        estimatedReturnTo: addDays(occurredOn, maxDays),
        // Re-snapshot the phase plan only when the diagnosis that shaped it
        // actually moved; an edit to the notes must not reset ticked phases.
        ...(diagnosisChanged
          ? {
              rehabPhases: rehabPhasesFor(injuryTypeValue, {
                minDays,
                maxDays,
              }),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(injuries.teamId, teamId), eq(injuries.id, injuryId)))
      .returning();

    if (input.status && input.status !== existing.status) {
      await this.recordStatusChange(updated, userId);
    } else if (estimateChanged) {
      await this.databaseService.database.insert(injuryTimelineEntries).values({
        injuryId,
        kind: 'estimated_return',
        occurredOn: todayIso(),
        title: 'Estimated return updated',
        detail: `Now projected between ${formatStoredDate(
          updated.estimatedReturnFrom,
        )} and ${formatStoredDate(updated.estimatedReturnTo)}`,
        createdByUserId: userId,
      });
    }

    await this.syncAthleteStatus(teamId, existing.athleteId);

    return this.findOne(teamId, injuryId);
  }

  /**
   * Closes a record with the date the athlete actually returned, which is
   * what makes the guidance windows auditable across a season.
   */
  async close(
    teamId: string,
    userId: string,
    injuryId: string,
    input: CloseInjuryDto,
  ) {
    const existing = await this.requireInjury(teamId, injuryId);
    if (input.actualReturnOn < existing.occurredOn) {
      throw new ConflictException(
        'The return date cannot be before the date of injury.',
      );
    }

    await this.databaseService.database
      .update(injuries)
      .set({
        status: 'returned',
        actualReturnOn: input.actualReturnOn,
        closedAt: new Date(),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(injuries.teamId, teamId), eq(injuries.id, injuryId)));

    const variance = returnVarianceDays({
      ...existing,
      actualReturnOn: input.actualReturnOn,
    });
    const varianceDetail =
      variance === null || variance === 0
        ? 'Returned within the projected window'
        : variance > 0
          ? `${variance} day${variance === 1 ? '' : 's'} later than projected`
          : `${Math.abs(variance)} day${variance === -1 ? '' : 's'} earlier than projected`;

    await this.databaseService.database.insert(injuryTimelineEntries).values({
      injuryId,
      kind: 'returned',
      occurredOn: input.actualReturnOn,
      title: 'Returned to play',
      detail: varianceDetail,
      createdByUserId: userId,
    });

    await this.syncAthleteStatus(teamId, existing.athleteId);

    return this.findOne(teamId, injuryId);
  }

  async addTimelineEntry(
    teamId: string,
    userId: string,
    injuryId: string,
    input: CreateInjuryTimelineEntryDto,
  ) {
    await this.requireInjury(teamId, injuryId);

    const [entry] = await this.databaseService.database
      .insert(injuryTimelineEntries)
      .values({
        injuryId,
        kind: input.kind,
        occurredOn: input.occurredOn,
        title: input.title,
        detail: input.detail ?? null,
        createdByUserId: userId,
      })
      .returning();

    return entry;
  }

  /** Correction path for a mis-logged injury. */
  async remove(teamId: string, injuryId: string) {
    const existing = await this.requireInjury(teamId, injuryId);

    await this.databaseService.database
      .delete(injuries)
      .where(and(eq(injuries.teamId, teamId), eq(injuries.id, injuryId)));

    await this.syncAthleteStatus(teamId, existing.athleteId);

    return { id: injuryId };
  }

  /**
   * Guidance preview for the live-logger wizard. Read-only and derived
   * entirely from the protocol table, so it needs no record to exist.
   */
  protocolPreview(query: InjuryProtocolQueryDto) {
    const occurredOn = query.occurredOn ?? todayIso();
    const protocol = resolveProtocol(
      query.bodyRegion,
      query.injuryType,
      query.severity,
      occurredOn,
    );

    return {
      bodyRegion: query.bodyRegion,
      injuryType: query.injuryType,
      severity: query.severity,
      occurredOn,
      minDays: protocol.minDays,
      maxDays: protocol.maxDays,
      estimatedReturnFrom: protocol.estimatedReturnFrom,
      estimatedReturnTo: protocol.estimatedReturnTo,
      phases: protocol.phases,
    };
  }

  /**
   * Recovery readings for one athlete's body regions, derived from their
   * injury records. Callers must present these as record-derived, not as
   * measured physiological load.
   */
  async recoveryFor(
    teamId: string,
    athleteId: string,
  ): Promise<RecoveryReading[]> {
    await this.assertAthleteOnTeam(teamId, athleteId);

    const rows = await this.databaseService.database
      .select({
        id: injuries.id,
        athleteId: injuries.athleteId,
        bodyRegion: injuries.bodyRegion,
        severity: injuries.severity,
        status: injuries.status,
        occurredOn: injuries.occurredOn,
        estimatedReturnTo: injuries.estimatedReturnTo,
        actualReturnOn: injuries.actualReturnOn,
      })
      .from(injuries)
      .where(
        and(eq(injuries.teamId, teamId), eq(injuries.athleteId, athleteId)),
      );

    return recoveryReadings(rows, todayIso());
  }

  /* ── Internals ────────────────────────────────────────────────────────── */

  private resolveEstimate(
    input: UpdateInjuryDto,
    existing: typeof injuries.$inferSelect,
    diagnosisChanged: boolean,
    bodyRegion: BodyRegion,
    injuryTypeValue: InjuryTypeValue,
    severity: InjurySeverityValue,
  ): { minDays: number; maxDays: number } {
    if (
      input.estimatedReturnMinDays !== undefined &&
      input.estimatedReturnMaxDays !== undefined
    ) {
      return {
        minDays: input.estimatedReturnMinDays,
        maxDays: input.estimatedReturnMaxDays,
      };
    }
    if (diagnosisChanged) {
      return returnWindowFor(bodyRegion, injuryTypeValue, severity);
    }

    return {
      minDays: existing.estimatedReturnMinDays,
      maxDays: existing.estimatedReturnMaxDays,
    };
  }

  /**
   * The two entries every record starts with: what happened, and what is
   * expected. Both are written at creation so the timeline is never empty.
   */
  private async seedTimeline(
    injury: typeof injuries.$inferSelect,
    userId: string,
  ) {
    const context =
      injury.context === 'match'
        ? injury.minute != null
          ? `Occurred during a match (${injury.minute}')`
          : 'Occurred during a match'
        : injury.context === 'training'
          ? 'Occurred during training'
          : 'Reported by the coaching staff';

    await this.databaseService.database.insert(injuryTimelineEntries).values([
      {
        injuryId: injury.id,
        kind: 'sustained' as const,
        occurredOn: injury.occurredOn,
        title: 'Injury sustained',
        detail: context,
        createdByUserId: userId,
      },
      {
        injuryId: injury.id,
        kind: 'estimated_return' as const,
        occurredOn: injury.estimatedReturnFrom,
        title: 'Estimated return',
        detail: `Projected between ${formatStoredDate(
          injury.estimatedReturnFrom,
        )} and ${formatStoredDate(injury.estimatedReturnTo)}`,
        createdByUserId: userId,
      },
    ]);
  }

  private readonly statusEntryTitles: Record<
    InjuryStatusValue,
    { kind: typeof injuryTimelineEntries.$inferInsert.kind; title: string }
  > = {
    reported: { kind: 'note', title: 'Reopened as reported' },
    assessment: { kind: 'assessment', title: 'Medical assessment' },
    rehab: { kind: 'rehab_started', title: 'Rehabilitation started' },
    return_to_training: {
      kind: 'return_to_training',
      title: 'Returned to training',
    },
    returned: { kind: 'returned', title: 'Returned to play' },
    season_ending: { kind: 'setback', title: 'Ruled out for the season' },
  };

  private async recordStatusChange(
    injury: typeof injuries.$inferSelect,
    userId: string,
  ) {
    const entry = this.statusEntryTitles[injury.status];

    await this.databaseService.database.insert(injuryTimelineEntries).values({
      injuryId: injury.id,
      kind: entry.kind,
      occurredOn: todayIso(),
      title: entry.title,
      detail: null,
      createdByUserId: userId,
    });
  }

  /**
   * Keeps `athletes.status` in step with the athlete's open injuries, which
   * is what removes an injured player from squad suggestions and warns on
   * injured starters in a game plan.
   *
   * Only ever moves between `available` and `injured`: a suspended athlete
   * stays suspended, because a suspension outlives the injury that happens
   * to overlap it.
   */
  private async syncAthleteStatus(teamId: string, athleteId: string) {
    const [open] = await this.databaseService.database
      .select({ id: injuries.id })
      .from(injuries)
      .where(
        and(
          eq(injuries.teamId, teamId),
          eq(injuries.athleteId, athleteId),
          inArray(injuries.status, [...OPEN_INJURY_STATUSES]),
          isNull(injuries.actualReturnOn),
        ),
      )
      .limit(1);

    const [athlete] = await this.databaseService.database
      .select({ status: athletes.status })
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), eq(athletes.id, athleteId)))
      .limit(1);

    if (!athlete || athlete.status === 'suspended') {
      return;
    }

    const nextStatus = open ? 'injured' : 'available';
    if (athlete.status === nextStatus) {
      return;
    }

    await this.databaseService.database
      .update(athletes)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(athletes.teamId, teamId), eq(athletes.id, athleteId)));
  }

  private async requireInjury(teamId: string, injuryId: string) {
    const [injury] = await this.databaseService.database
      .select()
      .from(injuries)
      .where(and(eq(injuries.teamId, teamId), eq(injuries.id, injuryId)))
      .limit(1);

    if (!injury) {
      throw new NotFoundException('Injury not found.');
    }

    return injury;
  }

  private async assertAthleteOnTeam(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), eq(athletes.id, athleteId)))
      .limit(1);

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }
  }

  /**
   * Verifies the live-logger provenance a client supplied really belongs to
   * this team, so an injury record can never be attached to another team's
   * match or event.
   */
  private async assertMatchProvenance(teamId: string, input: CreateInjuryDto) {
    if (!input.matchId) {
      if (input.matchEventId) {
        throw new NotFoundException('Match not found.');
      }
      return;
    }

    // Matches are team-scoped through their event, exactly as
    // MatchesService.requireMatch resolves them.
    const [match] = await this.databaseService.database
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(eq(matches.id, input.matchId), eq(events.teamId, teamId)))
      .limit(1);

    if (!match) {
      throw new NotFoundException('Match not found.');
    }

    if (!input.matchEventId) {
      return;
    }

    const [event] = await this.databaseService.database
      .select({ id: matchEvents.id })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.id, input.matchEventId),
          eq(matchEvents.matchId, input.matchId),
        ),
      )
      .limit(1);

    if (!event) {
      throw new NotFoundException('Match event not found.');
    }
  }
}

export type InjuryDetail = Awaited<ReturnType<InjuriesService['findOne']>>;
export type InjuryListItem = Awaited<
  ReturnType<InjuriesService['findAll']>
>[number];
export type { DerivableInjury };
