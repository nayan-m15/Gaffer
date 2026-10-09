# SEC-010: PowerSync production authentication and operator access

Both `powersync/service.yaml` and `powersync-recovery/service.yaml` explicitly set
`client_auth.allow_temporary_tokens: false`. This prevents either template from
enabling the temporary-token path when deployed or restored. Application clients
must use the authenticated backend's `/sync/token` flow and configured signing
trust. Changing these files does not change a running Cloud instance.

## Live inspection: 9 October 2026

Read-only PowerSync CLI 0.10.1 queries succeeded for the Gaffer project
`6aac1ed66860dd000702696f`, organization `6aac1ea304e93a0007fcb0bf`:

| Instance | ID | Observed configuration |
| --- | --- | --- |
| Development | `6aac1ed7a77ca1231d28f82d` | `allow_temporary_tokens: true`; hosted JWKS URI `https://gaffer-api-ynaf.onrender.com/sync/jwks`; inline local validation key `gaffer-phase25-validation-1`; deployable; sync-config label 20. |
| Production | `6aac4635a77ca1231d29003d` | No `client_auth` block in fetched configuration; reported non-deployable. No explicit temporary-token setting was returned. |

Commands used (read-only; raw output may contain secrets, so inspect locally and
retain only a redacted summary):

```bash
powersync fetch instances --org-id 6aac1ea304e93a0007fcb0bf --project-id 6aac1ed66860dd000702696f --output json
powersync fetch config --instance-id 6aac1ed7a77ca1231d28f82d --directory powersync --output json
powersync fetch config --instance-id 6aac4635a77ca1231d29003d --directory powersync-recovery --output json
```

The project listing and config reads do not identify the production application's
effective endpoint. No Cloud configuration or dashboard permissions were changed.
The absent Production auth block does not establish the active service's security
posture. SEC-010 remains open for deployment and operator-access verification.

## Identify and harden the production target

1. In the production Render backend, inspect the `POWERSYNC_URL` environment
   variable. Compare it with each instance's URL under **Connect** in the
   PowerSync dashboard. Confirm the production client's `/api/sync/token`
   response has that endpoint using an authorized test account. Keep tokens
   private. Do not infer the target from an instance name or local `.env` file.
2. On the confirmed instance, open **Client Auth**, clear **Development tokens**,
   and save/apply the change. Prefer this focused authentication change over
   deploying an entire recovery template: the recovery sync rules and signing
   configuration may be stale. Preserve the production JWKS URI and required
   production signing trust. If Development serves production, treat it as
   production regardless of its name.
3. Production must not trust a local validation signer. If the confirmed target
   contains `gaffer-phase25-validation-1`, remove that key from its Client Auth
   and the corresponding production deployment configuration after confirming
   legitimate clients use the hosted signer. The current main template still
   contains that development key; it is not an approved production trust list.
4. Fetch the target configuration again and record the instance ID, timestamp,
   explicit `allow_temporary_tokens: false`, and applied deployment/status evidence.
   Confirm **Connect** cannot generate a temporary token. Using an authorized
   test account, verify a normal backend-issued JWT can still connect and sync;
   verify an existing temporary token is rejected, if one is available. Do not
   create a new production temporary token for the check.

## Restrict dashboard and token-management access

An organization owner must review **Team**, invitations, and all assigned roles
against an agreed list of named production operators. Application coach/admin
roles do not govern PowerSync dashboard access.

- Keep Owner membership limited to approved organization administrators. The
  Developer system role can configure and deploy instances; do not treat it as
  read-only access.
- Where the plan supports custom roles, scope developers to isolated development
  instances and give production observers only the permissions they need. Review
  all roles assigned to each member: an additional broad role can undo a scoped
  role's restriction. On plans without custom roles, remove unauthorized members
  from the production organization or use a separate development organization.
- Restrict production authentication changes and token-management operations to
  approved operators. Review personal access tokens under account **Access
  Tokens**, revoke unused credentials, and ensure automation belongs to an
  approved operator with appropriate access.
- Test with separate approved-operator and non-operator accounts. Confirm the
  non-operator cannot change production Client Auth or re-enable development
  tokens, and cannot access production token-management functionality through
  either dashboard or CLI. Record the effective roles, scope, and observed
  denial; do not assume a read-only role prevents token generation without
  verifying it. Temporary-token generation must remain disabled for operators
  too in production.

The authorized operator list, current membership/roles, and account-level access
tokens were not available from the instance queries. Their review and negative
access checks remain required before closing the audit finding.

## Isolate development conveniences

Keep the tracked shared/recovery templates disabled. Any temporary-token exception
belongs in an explicitly separate development instance and local configuration,
with a separate non-production database and signing keys. Never connect that
instance to production data or promote its authentication overrides to production.
Local validation signing keys must remain exclusive to the isolated target.
Prefer the ordinary backend JWT flow for local development when practical.

## Validation and references

Local validation parses both affected YAML files, confirms the setting is the
boolean `false`, and checks the diff for unintended configuration changes. There
are no application-code or database-schema changes. Live deployment, actual
temporary-token rejection, normal-client sync, and operator permission tests are
still outstanding; local checks do not establish those outcomes.

- [PowerSync development tokens](https://docs.powersync.com/configuration/auth/development-tokens)
- [PowerSync dashboard and roles](https://docs.powersync.com/tools/powersync-dashboard#roles-and-permissions)

Related finding: SEC-010, Gaffer Security Audit. Implementation and documentation
assisted by Codex (GPT-6).
