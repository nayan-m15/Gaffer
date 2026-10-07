import { createHash } from 'node:crypto';

export function migrationContentHashes(source) {
  return new Set(
    [
      source,
      source.replace(/\r\n/g, '\n'),
      source.replace(/\r?\n/g, '\r\n'),
    ].map((body) => createHash('sha256').update(body).digest('hex')),
  );
}

export function planMigrations(migrations, recorded) {
  const latestTimestamp = recorded.reduce(
    (latest, row) => Math.max(latest, Number(row.created_at)),
    -1,
  );
  const hashes = new Set(recorded.map((row) => row.hash));
  const pending = [];
  const alreadyRecorded = [];
  for (const migration of migrations) {
    // Preserve the existing timestamp boundary for historical entries whose
    // hashes may have changed. This does not repair or replay that history.
    if (migration.folderMillis <= latestTimestamp) continue;
    const contentHashes = new Set([
      migration.hash,
      ...migrationContentHashes(migration.source),
    ]);
    if ([...contentHashes].some((hash) => hashes.has(hash))) {
      alreadyRecorded.push(migration);
    } else {
      pending.push(migration);
    }
  }
  return { pending, alreadyRecorded, latestTimestamp };
}
