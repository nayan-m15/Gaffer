# Job image for `runs-on: ubuntu-latest` on the self-hosted runner.
#
# Everything baked in here is work the jobs in .gitea/workflows/test.yml would
# otherwise redo on every run: the Node 22 download of `actions/setup-node`, and
# the ~170 MB Chromium plus its apt dependencies from
# `npx playwright install --with-deps chromium`. Those steps stay in the
# workflow and still work on the shared runners; here they find their work done.
FROM docker.gitea.com/runner-images:ubuntu-latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
  && rm -rf /var/lib/apt/lists/*

# `actions/setup-node` looks in RUNNER_TOOL_CACHE (/opt/hostedtoolcache) before
# downloading. The layout is <tool>/<version>/<arch> next to an empty
# <arch>.complete marker; a request for "22" resolves to the newest 22.x there,
# so a patch release in a rebuilt image still hits the cache.
RUN set -eux; \
  version="$(curl -fsSL https://nodejs.org/dist/index.json \
    | grep -o '"version":"v22\.[0-9][0-9.]*"' | head -1 | cut -d'"' -f4)"; \
  dir="/opt/hostedtoolcache/node/${version#v}/x64"; \
  mkdir -p "$dir"; \
  curl -fsSL "https://nodejs.org/dist/${version}/node-${version}-linux-x64.tar.xz" \
    | tar -xJ -C "$dir" --strip-components=1; \
  touch "${dir}.complete"

# Keep this in step with @playwright/test in the root package-lock.json: the
# browser build is version-specific, and a mismatch makes the workflow's
# `playwright install` download Chromium again.
ARG PLAYWRIGHT_VERSION=1.62.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
  && chmod -R 0755 /ms-playwright
