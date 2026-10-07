import type { PowerSyncDatabase } from "@powersync/web";

type SyncDatabase = Pick<PowerSyncDatabase, "connect" | "disconnect">;
type Connector = Parameters<PowerSyncDatabase["connect"]>[0];

/** Local database access is independent of the server-confirmed session. */
export class RemoteSyncLifecycle {
  private db: SyncDatabase | undefined;
  private authenticated = false;
  private generation = 0;
  private connectionStarted = false;
  private request: AbortController | undefined;
  private stopping: Promise<void> = Promise.resolve();
  private readonly connector: (signal: AbortSignal, unauthorized: () => void) => Connector;
  constructor(connector: (signal: AbortSignal, unauthorized: () => void) => Connector) { this.connector = connector; }

  async setAuthenticated(authenticated: boolean) {
    if (this.authenticated === authenticated) { await this.stopping; return; }
    this.authenticated = authenticated;
    if (!authenticated) {
      this.generation++;
      this.connectionStarted = false;
      this.request?.abort();
      const db = this.db;
      this.stopping = this.stopping.then(async () => { await db?.disconnect(); });
      await this.stopping;
    } else {
      const generation = this.generation;
      await this.stopping;
      if (this.authenticated && generation === this.generation) this.start();
    }
  }

  async attach(db: SyncDatabase) {
    if (this.db === db) return;
    await this.stopping;
    this.db = db;
    if (this.authenticated) this.start();
  }

  async detach() {
    await this.setAuthenticated(false);
    this.db = undefined;
  }

  private start() {
    const db = this.db;
    if (!db || !this.authenticated || this.connectionStarted) return;
    this.connectionStarted = true;
    const generation = ++this.generation;
    this.request?.abort();
    const request = this.request = new AbortController();
    const current = () => this.authenticated && this.generation === generation && this.db === db;
    const connector = this.connector(request.signal, () => { void this.setAuthenticated(false); });
    // connect may stay pending offline. Never block local queue access on it.
    void db.connect({
      ...connector,
      fetchCredentials: async () => {
        if (!current()) return null;
        const credentials = await connector.fetchCredentials();
        return current() ? credentials : null;
      },
    }).catch((error: unknown) => {
      if (current()) console.warn("PowerSync connection is unavailable; using local storage.", error);
    });
  }
}
