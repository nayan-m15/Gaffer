# Automatic data refresh

Application pages and open dialogs using the shared React Query client refresh
their data every five seconds while visible. Existing data stays on screen during
background requests. Remote changes appear on the next successful poll; this is
polling, not an app-wide server push connection.

Successful API writes also schedule a refresh of active queries and mark inactive
queries stale. This covers writes made outside React Query mutations, including
assistant actions. A BroadcastChannel signals other tabs on the same origin;
only a change notification is sent, and each tab fetches through its own session.
Without BroadcastChannel, periodic polling still works.

Write-triggered refreshes wait for pending mutations to finish so they do not
interrupt optimistic updates. Disabled queries do not fetch. Feature-specific
polling continues to take precedence, including live match and weather intervals.
Returning to a page, focusing the app, and reconnecting refresh query data.
Normal network-dependent queries pause offline; existing offline match queries
retain their own network policy.

The signed-in session refreshes every fifteen seconds while visible and online,
on focus/reconnection, and after local profile/team changes. Temporary background
session failures retain the current screen. An authoritative 401 clears it.

Event and statistics edit forms initialize when opened and preserve in-progress
drafts during background refresh. Close and reopen an edit form to load the newest
server values. Other views continue to receive current query data.

Validation:

- `npm.cmd --prefix frontend test`
- `npm.cmd --prefix frontend run lint`
- `npm.cmd --prefix frontend run build`

The refresh tests exercise timed polling, hidden-tab suspension, focus/reconnect,
write-triggered page/dialog updates, disabled queries, inactive cache invalidation,
optimistic mutation protection, listener cleanup, and cross-tab notifications.
