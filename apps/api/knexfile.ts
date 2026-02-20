import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const config: Record<string, Knex.Config> = {
  master: {
    client: 'pg',
    connection: {
      host: process.env.MASTER_DB_HOST || 'localhost',
      port: Number(process.env.MASTER_DB_PORT) || 5431,
      database: process.env.MASTER_DB_NAME || 'omnilert_master',
      user: process.env.MASTER_DB_USER || 'postgres',
      password: process.env.MASTER_DB_PASSWORD || 'postgres',
    },
    migrations: {
      directory: './src/migrations/master',
      extension: 'ts',
    },
    seeds: {
      directory: './src/seeds/master',
      extension: 'ts',
    },
  },
  tenant: {
    client: 'pg',
    connection: {
      host: process.env.MASTER_DB_HOST || 'localhost',
      port: Number(process.env.MASTER_DB_PORT) || 5431,
      database: process.env.TENANT_DB_NAME || 'omnilert_tenant',
      user: process.env.MASTER_DB_USER || 'postgres',
      password: process.env.MASTER_DB_PASSWORD || 'postgres',
    },
    migrations: {
      directory: './src/migrations/tenant',
      extension: 'ts',
    },
  },
};

export default config;
