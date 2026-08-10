import type { AnyD1Database } from "drizzle-orm/d1";
import { DatabaseSync } from "node:sqlite";

/**
 * node:sqlite-backed D1 adapter.
 *
 * Covers exactly the D1 subset ROOM uses: `prepare` with
 * `bind/run/all/first/raw` and `batch` over mixed SELECT/mutation statements.
 * It lets the D1 metadata store be verified against real SQL (the checked-in
 * migration) in tests, and can back a local persistent store without
 * provisioning Cloudflare resources. `raw()` row-array mode relies on the
 * same column-order assumption as drizzle's own `d1ToRawMapping`.
 */

type D1ResultMeta = {
  duration: number;
  changes: number;
  last_row_id: number;
};

type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  success: boolean;
  meta: D1ResultMeta;
};

function normalizeParams(params: unknown[]) {
  return params.map((value) => value === undefined ? null : value) as never[];
}

class NodeSqliteStatement {
  private readonly db: DatabaseSync;
  readonly sql: string;
  private readonly params: unknown[];

  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values: unknown[]) {
    return new NodeSqliteStatement(this.db, this.sql, values);
  }

  async run(): Promise<D1Result> {
    const info = this.db.prepare(this.sql).run(...normalizeParams(this.params));
    return {
      success: true,
      meta: {
        duration: 0,
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  async all(): Promise<D1Result> {
    const rows = this.db.prepare(this.sql).all(...normalizeParams(this.params)) as Record<string, unknown>[];
    return {
      results: rows,
      success: true,
      meta: { duration: 0, changes: 0, last_row_id: 0 },
    };
  }

  async first(): Promise<Record<string, unknown> | null> {
    const row = this.db.prepare(this.sql).get(...normalizeParams(this.params));
    return (row as Record<string, unknown> | undefined) ?? null;
  }

  async raw(): Promise<unknown[][]> {
    // drizzle maps raw rows positionally onto its explicit SELECT list. Its
    // own `d1ToRawMapping` relies on the same assumption: row objects iterate
    // in column order, which is how node:sqlite builds them.
    const rows = this.db.prepare(this.sql).all(...normalizeParams(this.params)) as Record<string, unknown>[];
    return rows.map((row) => Object.values(row));
  }
}

/** Creates a D1-compatible database backed by a node:sqlite database. */
export function createNodeSqliteD1(db: DatabaseSync): AnyD1Database {
  return {
    prepare: (sql: string) => new NodeSqliteStatement(db, sql),
    batch: async (statements: NodeSqliteStatement[]) => {
      const results: D1Result[] = [];
      for (const statement of statements) {
        const isQuery = /^\s*(select|with|pragma)/i.test(statement.sql);
        results.push(isQuery ? await statement.all() : await statement.run());
      }
      return results;
    },
  } as unknown as AnyD1Database;
}

/** Loads a node:sqlite database with the checked-in D1 migration applied. */
export function createMigratedNodeSqliteD1(migrationSql: string): AnyD1Database {
  const db = new DatabaseSync(":memory:");
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) db.exec(statement);
  return createNodeSqliteD1(db);
}
