# Product decisions and open questions

## Confirmed decisions

| Area | Decision |
| --- | --- |
| Sport | Football only for the initial release. |
| Product boundary | A coach manages their own team; opponent-team data is out of scope. |
| Primary role | Coach owns and manages a team. |
| Database | PostgreSQL. |
| Delivery process | Agile using Scrum; formal standups every three days. |
| Work tracking | Trello for product/sprint work and Gitea issues for bugs. |
| Version control | Short-lived trunk-based branches, reviewed squash merges, scoped conventional commits, and CalVer tags. |

## Decisions requiring team/client confirmation

| ID | Decision | Proposed default | Why it matters |
| --- | --- | --- | --- |
| D1 | Scrum masters | Name two co-scrum-masters and notify Jan. | Establishes ownership of ceremonies and methodology evidence. |
| D2 | Coach/team onboarding | A registering coach creates their first team during onboarding. | Determines the first account-to-team relationship and authorization flow. |
| D3 | Assistant permissions | Assistants may log live match events but cannot change team ownership, roles, or roster details unless explicitly granted. | Keeps the initial role model safe while supporting future live logging. |
| D4 | Athlete profile | Name, date of birth or age, playing position, squad number, contact/guardian details only where appropriate, and active/archive status. | Defines the first athlete table and required UI fields. Avoid storing sensitive data unless it is genuinely needed. |
| D5 | Archive versus delete | Archive athletes with historical event/statistics records; allow hard deletion only for erroneous, unreferenced records. | Preserves the historical record and prevents broken statistics. |
| D6 | Statistics placement | Show a concise summary on the athlete profile first; add a dedicated statistics page in the next sprint. | Delivers basic usefulness without delaying foundational flows. |
| D7 | Event grouping | Include event type now and add an optional season field after the team/season model is agreed. | Keeps the Sprint 1 event model small while leaving a path for season statistics. |
| D8 | Milestone count | Confirm whether the team will plan three or four implementation sprints. | Affects roadmap and scope commitments. |

## Client questions to send to Jan

1. Please confirm the proposed coach onboarding and assistant permission boundaries.
2. Please confirm the athlete profile fields and the archive/delete rule.
3. Please confirm whether season grouping is required in the first event release.
4. Please confirm whether markers will meet with the team or assess the documentation independently.
5. Please confirm the expected number of sprints and any unclear or conflicting requirements to raise with Brendan.
