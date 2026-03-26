import knex, { type Knex } from 'knex';
import { env } from './env.js';

class DatabaseManager {
  private pool: Knex | null = null;

  getDb(): Knex {
    if (!this.pool) {
      this.pool = knex({
        client: 'pg',
        connection: {
          host: env.DB_HOST,
          port: env.DB_PORT,
          database: env.DB_NAME,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
        },
        pool: { min: 2, max: 20 },
      });
    }
    return this.pool;
  }

  async destroyAll(): Promise<void> {
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }
  }
}

export const db = new DatabaseManager();
