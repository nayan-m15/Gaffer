# Public Swagger policy

External developers and assessors need public, interactive documentation for
Gaffer's anonymous read API. `/api/docs`, its UI assets, `/api/docs-json` and
`/api/docs-yaml` are available without a session, API key or token in every
environment, including production.

This supersedes the development-only HARD-002 policy introduced by commit
`ac16ef6b08e686558c4d2a0f7f2d3c6e32e588ce`, which removed the production docs.
Production still runs with `NODE_ENV=production`; enabling docs does not require
changing the runtime environment.

## Public contract

`backend/src/swagger-config.ts` generates a schema scoped to `PublicApiModule`.
It includes exactly these hand-written GET endpoints:

- `/v1/formations`
- `/v1/tactics`
- `/v1/public-dashboard/filters`
- `/v1/public-dashboard/matches`
- `/v1/public-dashboard/players`
- `/v1/public-dashboard/team-statistics`

Query parameters, response shapes and expected validation errors are described
by decorators and schemas in `backend/src/public-api/`. Runtime validation stays
in `public-api.schemas.ts`. Swagger generates documentation, not API endpoints.
The UI uses the same backend origin for "Try it out".

Protected application routes are excluded from the public schema. Their guards,
session requirements, team permissions and credentialed CORS policy remain in
place. The six public API endpoints retain wildcard CORS without credentials.

## Local and deployment verification

Open `http://localhost:3000/api/docs` locally. After deployment, open
`https://gaffer-api-ynaf.onrender.com/api/docs` in a signed-out browser.
Verify the UI, `/api/docs/swagger-ui-init.js`, `/api/docs-json` and
`/api/docs-yaml` return 200, and that the schema contains only the six paths
above. Execute public requests through "Try it out" without credentials.
Verify invalid filters return 400 and unknown catalog IDs return 404.

Run the database-free HTTP regression tests:

```sh
npm --prefix backend test -- --runInBand swagger-config.spec.ts cors-config.spec.ts
```

These tests use the real public controllers and static catalog service, with a
stubbed dashboard service. They verify production and other environment values,
UI/assets/schemas, anonymous requests, public CORS and query validation.
Local verification does not establish that production has been redeployed.
Record the deployed revision, date and live responses separately.

## Documentation content

Keep secrets, credentials, connection strings and real user data out of schema
metadata and examples. Schema generation does not query the database. New
controllers added to `PublicApiModule` must be intentionally anonymous and
reviewed as part of this public contract; regression tests check its route list.
