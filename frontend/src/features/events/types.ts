export type EventType = "training" | "match" | "meeting";
export type EventStatus = "scheduled" | "cancelled" | "completed";

/**
 * Lifecycle of a friendly fixture between two Gaffer teams. Only 'accepted'
 * means the match is confirmed for both sides; a pending request must not be
 * treated as a real fixture by the opponent.
 */
export type FriendlyFixtureStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";

/** A team event returned by the backend events API. */
export interface TeamEvent {
  id: string;
  teamId: string;
  title: string;
  type: EventType;
  status: EventStatus;
  scheduledAt: string;
  location: string;
  venueAddress: string | null;
  weatherLocation: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: string | null;
  notes: string | null;
  competitionId: string | null;
  competitionFixtureId: string | null;
  fixtureScheduleConfirmedAt: string | null;
  /** Present on the single-event response for generated competition fixtures. */
  fixtureOpponentCompetitionTeamId?: string | null;
  fixtureOpponentName?: string | null;
  /**
   * Friendly-fixture link. `friendlyFixtureId` is the raw column value;
   * the status and opponent team fields are resolved per side, so each
   * calendar sees the *other* team as the opponent.
   */
  friendlyFixtureId?: string | null;
  friendlyFixtureStatus?: FriendlyFixtureStatus | null;
  friendlyOpponentTeamId?: string | null;
  friendlyOpponentTeamName?: string | null;
  /**
   * The team that created the friendly-fixture request. Compare with `teamId`
   * to tell whether this calendar belongs to the requester or the recipient
   * side of the fixture.
   */
  friendlyRequesterTeamId?: string | null;
  friendlyRequesterTeamName?: string | null;
  matchId?: string | null;
  /** Set once a pre-match lineup is confirmed for this event. */
  lineupConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  title: string;
  type: EventType;
  scheduledAt: string;
  location: string;
  venueAddress?: string | null;
  weatherLocation?: string | null;
  weatherLatitude?: number | null;
  weatherLongitude?: number | null;
  weatherTimezone?: string | null;
  notes?: string;
  competitionId?: string | null;
  /**
   * Manual match events only: request a friendly fixture against this
   * Gaffer team. Omitted or null keeps free-text (non-Gaffer) opponents.
   */
  friendlyOpponentTeamId?: string | null;
}

export interface UpdateEventInput {
  title?: string;
  type?: EventType;
  status?: EventStatus;
  scheduledAt?: string;
  location?: string;
  venueAddress?: string | null;
  weatherLocation?: string | null;
  weatherLatitude?: number | null;
  weatherLongitude?: number | null;
  weatherTimezone?: string | null;
  notes?: string | null;
  competitionId?: string | null;
  friendlyOpponentTeamId?: string | null;
}

export interface LocationSearchResult {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export type WeatherStatus =
  | "available"
  | "missing_location"
  | "outside_forecast_range"
  | "unavailable"
  | "not_applicable";

export interface EventWeather {
  status: WeatherStatus;
  rangeReason?: "too_old" | "too_far";
  forecastAt?: string;
  fetchedAt?: string;
  temperatureC?: number;
  precipitationProbability?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  condition?: string;
  stale?: boolean;
  attribution?: string;
}

export type OpponentSquadVisibility = "none" | "numbers" | "full";

export interface OpponentMatchPlayer {
  id?: string;
  shirtNumber: number;
  name?: string | null;
  position?: string | null;
}

export interface StartMatchInput {
  opponentName: string;
  opponentCompetitionTeamId?: string | null;
  isHome: boolean;
  startingAthleteIds: string[];
  benchAthleteIds?: string[];
  gamePlanId?: string;
  opponentSquadVisibility?: OpponentSquadVisibility;
  opponentSquad?: OpponentMatchPlayer[];
  teamColor?: string;
  opponentColor?: string;
}

/** A match row returned by POST /events/:eventId/start-match. */
export interface MatchRecord {
  id: string;
  eventId: string;
  competitionId: string | null;
  opponentCompetitionTeamId: string | null;
  opponentName: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  gamePlanId: string | null;
  opponentSquadVisibility: OpponentSquadVisibility;
  teamColor: string | null;
  opponentColor: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The team's confirmed pre-match lineup for one event (GET/PUT
 * /events/:eventId/lineup). It exists only before kick-off: starting the
 * match retires it in favour of the live squad.
 */
export interface EventLineup {
  startingAthleteIds: string[];
  benchAthleteIds: string[];
  confirmedAt: string;
}

export interface ConfirmLineupInput {
  startingAthleteIds: string[];
  benchAthleteIds?: string[];
}
