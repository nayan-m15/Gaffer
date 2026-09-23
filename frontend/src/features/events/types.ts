export type EventType = "training" | "match" | "meeting";
export type EventStatus = "scheduled" | "cancelled" | "completed";

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
  matchId?: string | null;
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
