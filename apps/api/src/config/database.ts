import knex, { type Knex } from 'knex';
import { env } from './env.js';

class DatabaseManager {
  private masterPool: Knex | null = null;
  private tenantPools: Map<string, Knex> = new Map();

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  getMasterDb(): Knex {
    if (!this.masterPool) {
      this.masterPool = knex({
        client: 'pg',
        connection: {
          host: env.MASTER_DB_HOST,
          port: env.MASTER_DB_PORT,
          database: env.MASTER_DB_NAME,
          user: env.MASTER_DB_USER,
          password: env.MASTER_DB_PASSWORD,
        },
        pool: { min: 2, max: 10 },
      });
    }
    return this.masterPool;
  }

  async getTenantDb(dbName: string): Promise<Knex> {
    const existing = this.tenantPools.get(dbName);
    if (existing) {
      return existing;
    }

    const pool = knex({
      client: 'pg',
      connection: {
        host: env.MASTER_DB_HOST,
        port: env.MASTER_DB_PORT,
        database: dbName,
        user: env.MASTER_DB_USER,
        password: env.MASTER_DB_PASSWORD,
      },
      pool: { min: 2, max: 10 },
    });

    this.tenantPools.set(dbName, pool);
    return pool;
  }

  async createDatabase(dbName: string): Promise<void> {
    const master = this.getMasterDb();
    await master.raw(`CREATE DATABASE "${dbName}"`);
  }

  async closeTenantDb(dbName: string): Promise<void> {
    const pool = this.tenantPools.get(dbName);
    if (!pool) return;
    await pool.destroy();
    this.tenantPools.delete(dbName);
  }

  async databaseExists(dbName: string): Promise<boolean> {
    const master = this.getMasterDb();
    const result = await master.raw('SELECT 1 FROM pg_database WHERE datname = ? LIMIT 1', [dbName]);
    return Array.isArray(result?.rows) && result.rows.length > 0;
  }

  async terminateDatabaseConnections(dbName: string): Promise<void> {
    const master = this.getMasterDb();
    await master.raw(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ?
        AND pid <> pg_backend_pid()
      `,
      [dbName],
    );
  }

  async dropDatabase(dbName: string): Promise<void> {
    const master = this.getMasterDb();
    const quotedDbName = this.quoteIdentifier(dbName);
    await master.raw(`DROP DATABASE IF EXISTS ${quotedDbName}`);
  }

  async destroyAll(): Promise<void> {
    if (this.masterPool) {
      await this.masterPool.destroy();
      this.masterPool = null;
    }
    for (const [name, pool] of this.tenantPools) {
      await pool.destroy();
      this.tenantPools.delete(name);
    }
  }
}

export const db = new DatabaseManager();
