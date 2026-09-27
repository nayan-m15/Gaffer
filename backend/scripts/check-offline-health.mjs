const endpoint = process.env.OPERATIONS_HEALTH_URL;
const token = process.env.OPERATIONS_HEALTH_TOKEN;

if (!endpoint || !token) {
  throw new Error(
    'OPERATIONS_HEALTH_URL and OPERATIONS_HEALTH_TOKEN are required.',
  );
}

const response = await fetch(endpoint, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`Operations health request failed with HTTP ${response.status}.`);
}

const health = await response.json();
const uploads = Number(health.uploads?.uploads_24h ?? 0);
const rejected = Number(health.uploads?.rejected_24h ?? 0);
const rejectedRate = uploads > 0 ? rejected / uploads : 0;
const oldestPendingAge = Number(
  health.clients?.oldest_pending_age_seconds ?? 0,
);
const p95Processing = Number(health.uploads?.p95_processing_ms ?? 0);
const replicationLag = Number(health.replicationLagBytes ?? 0);
const unresolvedReviews = Number(health.unresolvedReviews ?? 0);
const maximumLagBytes = Number(
  process.env.MAX_REPLICATION_LAG_BYTES ?? 64 * 1024 * 1024,
);
const maximumUnresolvedReviews = Number(
  process.env.MAX_UNRESOLVED_REVIEWS ?? 20,
);
const failures = [];

if (oldestPendingAge > 15 * 60) {
  failures.push(`oldest queued item is ${oldestPendingAge}s old`);
}
if (rejectedRate > 0.01) {
  failures.push(`${(rejectedRate * 100).toFixed(2)}% of uploads were rejected`);
}
if (p95Processing > 2_000) {
  failures.push(`p95 upload processing is ${p95Processing}ms`);
}
if (health.replicationSlotActive === false) {
  failures.push('the PowerSync replication slot is inactive');
}
if (replicationLag > maximumLagBytes) {
  failures.push(`replication lag is ${replicationLag} bytes`);
}
if (unresolvedReviews > maximumUnresolvedReviews) {
  failures.push(`${unresolvedReviews} event reviews are unresolved`);
}

console.log(
  JSON.stringify(
    {
      checkedAt: health.checkedAt,
      uploads,
      rejectedRate,
      oldestPendingAge,
      p95Processing,
      replicationLag,
      replicationSlotActive: health.replicationSlotActive,
      unresolvedReviews,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  throw new Error(`Offline sync health thresholds failed: ${failures.join('; ')}`);
}
