# Contracts and authorization

Backend Zod schemas are the canonical request contracts. Controllers validate
unknown request bodies with zodValidate before calling a service. Frontend
request types mirror those schemas and must be updated in the same change
whenever a request contract changes. Database schema types remain the
canonical response and persistence shapes.

Team access is resolved from the authenticated user. Clients never choose a
team identifier for team-scoped operations.

| Operation | Player | Assistant | Coach |
| --- | --- | --- | --- |
| Player hub reads and RSVP | Own claimed profile | — | — |
| Team roster, event, game-plan reads | — | Allowed | Allowed |
| Live match logging | — | Allowed | Allowed |
| Roster, event, game-plan mutations | — | Denied | Allowed |
| Assistant invite management | — | Denied | Allowed |

Feature controllers use requireTeamId for member reads and
requireCoachTeamId for coach-only mutations. Services still scope every
resource query by the resolved team ID so authorization cannot depend on the
frontend hiding controls.
