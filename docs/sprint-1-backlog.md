# Sprint 1 backlog

## Sprint goal

Establish a documented, runnable foundation for a football-team coaching tool and deliver the first usable management flow: a coach can create their team, manage its athlete roster, and create events. Live match logging and statistics are deliberately scheduled after these foundations.

## Definition of done

- The user story meets its acceptance criteria.
- Relevant linting and automated tests pass.
- The related Trello card and Gitea issue are linked, updated, and assigned.
- The change is reviewed and merged according to the team's Git methodology.
- Any AI-generated code is attributed in the commit footer where required.

## Completed foundation

| ID | Story | Evidence |
| --- | --- | --- |
| S1-00 | As a developer, I need a consistent full-stack local development environment so that the team can build and test the product. | React/Vite frontend, NestJS backend, PostgreSQL/Drizzle integration foundation, Swagger, linting, unit/e2e tests, and root scripts are in place. `npm run build`, `npm run lint`, backend unit tests, and backend e2e tests pass. |

## Sprint backlog

| Priority | ID | User story | Acceptance criteria |
| --- | --- | --- | --- |
| P0 | S1-01 | As the team, we need a documentation site so that Jan can review our design, process, backlog, and progress. | Site is version controlled and shared with Jan; it covers the tech stack, architecture, frontend/backend structure, database design, product backlog, Scrum methodology, roadmap, and links to Trello/Gitea. |
| P0 | S1-02 | As a coach, I need to register, sign in, sign out, and create my team so that I can use the tool as its owner. | Authentication is functional; a coach creates exactly one initial team during onboarding; the account is associated with that team; unauthenticated routes are protected. |
| P0 | S1-03 | As a coach, I need to add, view, edit, search, and archive athletes in my team so that the roster stays accurate. | Athlete details use the agreed profile fields; all roster operations are limited to the coach's team; archived athletes are excluded from the active roster by default but can be viewed/restored; search works by name. |
| P0 | S1-04 | As a coach, I need to create, view, edit, cancel, and delete football events so that I can plan matches, training sessions, and team meetings. | Each event has a type, date/time, and location; cancelled events remain visible with their status; the user can see a chronological upcoming-events view. |
| P1 | S1-05 | As a coach, I need a dashboard summary so that I can quickly see my team and immediate schedule after signing in. | Dashboard displays total active athletes, total events, and the next five upcoming events; empty states are clear and usable. |
| P1 | S1-06 | As the team, we need a documented database schema and migrations so that data is reliable and ready for later statistics and live logging. | Schema documents users, teams, memberships/roles, athletes, and events; PostgreSQL migrations can be generated and applied against the configured database. |
| P1 | S1-07 | As the team, we need automated API and UI coverage for the Sprint 1 flows so that regressions are caught before merging. | Core authentication, team isolation, athlete, and event flows have automated tests; test instructions are documented. |

## Deferred backlog

- Assistant/admin role permissions and invitation flow.
- Live match timer and timeline logging for goals, yellow cards, and red cards.
- Derived athlete/team statistics, season/career breakdowns, and charts.
- Calendar UI, RSVPs, notifications, map/weather integrations.
- Offline-first logging, collaborative sync, league standings, public pages, exports, and AI assistance.

## Suggested delivery order

1. S1-01 and S1-06: documentation, decisions, and data model.
2. S1-02: authentication and coach/team onboarding.
3. S1-03: athlete roster.
4. S1-04: event management.
5. S1-05 and S1-07: dashboard and coverage.

## Scrum evidence to collect

- Sprint-planning summary, attendance/recording evidence, and assigned cards.
- Standup updates every three days.
- Sprint review and retrospective notes.
- Stakeholder feedback from Jan and the action taken in response.
