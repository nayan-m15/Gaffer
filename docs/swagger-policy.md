# Swagger exposure policy (HARD-002)

Production Swagger is not required. External API consumers use
[the public API contract](public-api.md) and
[the PDF reference](Gaffer-Public-API-Reference.pdf). The application does not
use Swagger at runtime.

`backend/src/swagger-config.ts` generates and registers Swagger only when
`NODE_ENV` is exactly `development`. Production, staging, test, missing, and
unrecognised environment values leave documentation unregistered. This covers
the UI, its assets, `/api/docs-json`, and `/api/docs-yaml`; hiding only the UI
would leave the schemas exposed. Public API endpoints continue to work.

## Local development

Set `NODE_ENV=development` in the uncommitted root `.env`, as shown in
`.env.example`, then run `npm run dev`. Developers with an existing `.env`
must add this setting to enable Swagger. Open `http://localhost:3000/api/docs`.
Swagger is intended for trusted local development; do not expose a development
server to the public internet.

## Production deployment

Set `NODE_ENV=production` in the hosting environment and restart/redeploy the
backend. `npm --prefix backend run start:prod` also forces this value before
loading the application, even if a copied local `.env` says `development`.
Deployments using another startup command must set the hosting value explicitly.
There is no production Swagger enablement override. Any future requirement
needs a reviewed policy change with authentication or network restrictions
covering both the UI and raw schemas.

After deployment, verify unauthenticated GET requests to `/api/docs`,
`/api/docs/`, `/api/docs/swagger-ui-init.js`, `/api/docs-json`, and
`/api/docs-yaml` return `404` from the backend. Confirm `/v1/formations`
continues to return `200`. Local regression tests cover these routes without
a database: `npm --prefix backend test -- --runInBand swagger-config.spec.ts`.
Local verification does not establish that production has been redeployed.

## Sensitive information review

The Swagger builder uses static title, description, version, and tag metadata.
Existing decorators in `backend/src/public-api/` and
`backend/src/events/events.schemas.ts` contain generic coaching examples and
schema fields, with no embedded credentials or secrets found in this review.
Document generation does not query the database or add environment values.
Keep credentials, tokens, connection strings, live user data, and internal
deployment details out of examples, descriptions, defaults, and server URLs.
Review these fields whenever adding or changing Swagger decorators.
