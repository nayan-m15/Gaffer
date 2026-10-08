# Self-hosted Gitea Actions runner

`.gitea/workflows/test.yml` runs on whichever runner the Gitea instance offers
for the `ubuntu-latest` label. When those runners are busy with other
repositories, a run sits queued before it starts. Registering a runner of our
own, scoped to this repository, removes that wait: it only ever serves this
repository, and it runs the three UI jobs in parallel.

The files here are the whole setup:

| File | Purpose |
| --- | --- |
| `Dockerfile` | The image jobs run in: Node 22 in the tool cache and Playwright's Chromium pre-installed. |
| `compose.yaml` | The runner itself, as a container. |
| `config.yaml` | Runner settings: concurrency, labels, cache. |

## Requirements

- Docker (Docker Desktop with the WSL 2 backend on Windows, or Docker Engine on
  Linux). Give it at least 8 CPUs and 12 GB of memory for `capacity: 3`;
  on Windows that is set in `%UserProfile%\.wslconfig`.
- Admin rights on the repository in Gitea, to read a registration token.
- Network access from this machine to `https://sdp.ms.wits.ac.za`,
  `github.com` (the workflow's actions are fetched from there), the npm
  registry, the Playwright CDN and the Neon test database.
- The machine must be awake with Docker running for the runner to pick up jobs.
  When it is offline the instance's shared runners take the job instead, so
  nothing is blocked by switching it off.

## Setup

### 1. Build the job image

```sh
docker build -t sct-ci:latest .gitea/runner
```

This takes a few minutes once. Rebuild it when the `@playwright/test` version
in the root `package-lock.json` changes, passing the new version:

```sh
docker build --build-arg PLAYWRIGHT_VERSION=1.62.1 -t sct-ci:latest .gitea/runner
```

### 2. Get a registration token

Open
`https://sdp.ms.wits.ac.za/sdp-interlude/SportCoachingTool/settings/actions/runners`
and press **Create new runner**. Copy the token it shows. It is single-use and
registers a runner that serves only this repository.

(An organisation-wide runner is registered the same way from
`https://sdp.ms.wits.ac.za/org/sdp-interlude/settings/actions/runners`.)

### 3. Write the local environment file

`.gitea/runner/.env` is ignored by git. Create it with:

```sh
cat > .gitea/runner/.env <<'VARS'
GITEA_INSTANCE_URL=https://sdp.ms.wits.ac.za
GITEA_RUNNER_REGISTRATION_TOKEN=<token from step 2>
GITEA_RUNNER_NAME=sct-<your-name>
VARS
```

The token is only read on the first start, while the runner has no registration
in its `sct-runner_runner-data` volume yet.

### 4. Start the runner

```sh
docker compose -f .gitea/runner/compose.yaml up -d
docker compose -f .gitea/runner/compose.yaml logs -f
```

The log ends with `Runner registered successfully` and then
`Successfully pinged the Gitea instance server`. The runner appears as **Idle**
on the repository's Runners page with the label `ubuntu-latest`.

### 5. Check it takes a job

Push a branch, or re-run a job from the Actions tab, and confirm the run's jobs
name this runner. Nothing in the workflow has to change: the labels in
`config.yaml` answer the existing `runs-on: ubuntu-latest`.

Repository secrets (`TEST_DATABASE_URL`, `SONAR_TOKEN`, `SONAR_HOST_URL`) are
sent to the runner by Gitea, so there is nothing to copy into this machine. The
`sonarqube` job additionally needs `SONAR_HOST_URL` to be reachable from here,
which for the self-hosted instance may mean being on the campus network; that
job only runs on pushes to `main`/`develop`.

## Day to day

```sh
docker compose -f .gitea/runner/compose.yaml stop     # stop taking jobs
docker compose -f .gitea/runner/compose.yaml start
docker compose -f .gitea/runner/compose.yaml logs -f
docker compose -f .gitea/runner/compose.yaml down     # keeps the volume, so no re-registration
```

To register again from scratch, delete the runner in the Gitea UI *and* the
volume (`docker compose -f .gitea/runner/compose.yaml down -v`); removing one
without the other leaves a stale entry on one side.

## Tuning

- **`runner.capacity`** in `config.yaml` is how many jobs run at once. Three
  covers the UI fan-out. Raise it only with CPUs to spare: the comment in
  `test.yml` records that two Chromium instances sharing one runner's CPU turned
  normal assertions into timeouts, and the same applies to two jobs sharing a
  host.
- **The cache** lives in the `sct-runner_runner-data` volume and backs `actions/setup-node`'s
  `cache: npm`, so repeat `npm ci` steps restore from disk. It is capped at
  20 GB per repository and entries expire after a week.
- **Cancelling superseded runs** is the other large saving and is a workflow
  change rather than a runner one: a `concurrency` block with
  `cancel-in-progress: true` keyed on the branch stops a new push queueing
  behind the previous commit's full suite.

## If it does not pick up jobs

- The run's job says *waiting for runner*: compare the labels on the Runners
  page with `runs-on` in the workflow. They must both be `ubuntu-latest`.
- `docker: no such image: sct-ci:latest` in a job log: step 1 was skipped, or
  the image was built on a different Docker context from the one the socket in
  `compose.yaml` points at.
- Registration fails with a 404 or 401: the token was already used, or the URL
  is missing `https://`.
- Jobs fail to reach the database with `fetch failed`: this machine cannot
  reach Neon. The workflow already allows for slow IPv4/IPv6 selection through
  `NODE_OPTIONS`; a corporate or campus proxy needs `http_proxy`/`https_proxy`
  added to the `environment:` block in `compose.yaml`.
