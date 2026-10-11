import { getTableColumns, getTableName, is } from 'drizzle-orm';
import {
  getTableConfig,
  IndexedColumn,
  PgDialect,
  PgTable,
} from 'drizzle-orm/pg-core';
import * as schema from './index';

const tables = Object.values(schema).filter((value): value is PgTable =>
  is(value, PgTable),
);
const dialect = new PgDialect();

describe('database schema integrity', () => {
  it.each(tables.map((table) => [getTableName(table), table] as const))(
    '%s has resolvable foreign keys and uniquely named indexes',
    (_name, table) => {
      const config = getTableConfig(table);
      const indexNames = config.indexes.map((index) => index.config.name);
      expect(new Set(indexNames).size).toBe(indexNames.length);
      expect(
        config.columns.some((column) => column.primary) ||
          config.primaryKeys.length > 0,
      ).toBe(true);

      for (const foreignKey of config.foreignKeys) {
        const reference = foreignKey.reference();
        expect(tables).toContain(reference.foreignTable);
        expect(reference.columns.length).toBe(reference.foreignColumns.length);
        reference.columns.forEach((column, position) => {
          expect(column.table).toBe(table);
          expect(reference.foreignColumns[position].table).toBe(
            reference.foreignTable,
          );
          const localColumn = config.columns.find(
            (candidate) => candidate.name === column.name,
          )!;
          const foreignColumn = Object.values(
            getTableColumns(reference.foreignTable),
          ).find(
            (candidate) =>
              candidate.name === reference.foreignColumns[position].name,
          )!;
          expect(localColumn.getSQLType()).toBe(foreignColumn.getSQLType());
        });
      }
    },
  );

  it('does not reuse index names across tables in the PostgreSQL schema', () => {
    const names = tables.flatMap((table) =>
      getTableConfig(table).indexes.map((index) => index.config.name),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  function uniqueColumns(table: PgTable, name: string) {
    const index = getTableConfig(table).indexes.find(
      (candidate) => candidate.config.name === name,
    );
    expect(index).toBeDefined();
    expect(index!.config.unique).toBe(true);
    return index!.config.columns.map((column) => {
      expect(is(column, IndexedColumn)).toBe(true);
      return (column as IndexedColumn).name;
    });
  }

  it('prevents an account joining multiple teams and duplicate membership in one team', () => {
    expect(
      uniqueColumns(schema.teamMembers, 'team_members_user_unique'),
    ).toEqual(['user_id']);
    expect(
      uniqueColumns(schema.teamMembers, 'team_members_team_user_unique'),
    ).toEqual(['team_id', 'user_id']);
  });

  it('allows one private calendar event per team and shared fixture', () => {
    expect(
      uniqueColumns(schema.events, 'events_team_competition_fixture_unique'),
    ).toEqual(['team_id', 'competition_fixture_id']);
    expect(
      uniqueColumns(schema.events, 'events_team_friendly_fixture_unique'),
    ).toEqual(['team_id', 'friendly_fixture_id']);
    const friendlyIndex = getTableConfig(schema.events).indexes.find(
      (index) => index.config.name === 'events_team_friendly_fixture_unique',
    )!;
    expect(dialect.sqlToQuery(friendlyIndex.config.where!).sql).toContain(
      'is not null',
    );
  });

  it('permits one participant per shared-session side and requires a team identity', () => {
    expect(
      uniqueColumns(
        schema.matchSessionParticipants,
        'match_session_participants_session_side_unique',
      ),
    ).toEqual(['session_id', 'side']);
    const check = getTableConfig(schema.matchSessionParticipants).checks.find(
      (constraint) =>
        constraint.name === 'match_session_participants_identity_check',
    )!;
    const query = dialect.sqlToQuery(check.value).sql;
    expect(query).toContain('"team_id" is not null or');
    expect(query).toContain('"competition_team_id" is not null');
  });

  it.each([
    ['observations', schema.matchEventObservations],
    ['clock operations', schema.matchClockOperations],
    ['upload receipts', schema.syncUploadReceipts],
  ] as const)(
    'uses the client-supplied ID and payload hash to support retry-safe %s',
    (_name, table) => {
      const config = getTableConfig(table);
      const id = config.columns.find((column) => column.name === 'id')!;
      expect(id.primary).toBe(true);
      expect(id.hasDefault).toBe(false);
      expect(
        config.columns.find((column) => column.name === 'payload_hash')
          ?.notNull,
      ).toBe(true);
    },
  );

  it('preserves clinical injuries when their match evidence is removed', () => {
    const evidenceKeys = getTableConfig(schema.injuries).foreignKeys.filter(
      (foreignKey) =>
        foreignKey
          .reference()
          .columns.some((column) =>
            ['match_id', 'match_event_id'].includes(column.name),
          ),
    );
    expect(evidenceKeys).toHaveLength(2);
    for (const foreignKey of evidenceKeys) {
      expect(foreignKey.onDelete).toBe('set null');
      expect(foreignKey.reference().columns[0].notNull).toBe(false);
    }
    expect(
      uniqueColumns(schema.injuries, 'injuries_match_event_unique'),
    ).toEqual(['match_event_id']);
  });
});
