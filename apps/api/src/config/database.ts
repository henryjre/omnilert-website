import knex, { type Knex } from 'knex';
import { env } from './env.js';

class DatabaseManager {
  private masterPool: Knex | null = null;
  private tenantPools: Map<string, Knex> = new Map();

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
