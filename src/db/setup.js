const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  console.log('🌟 Configurando base de datos Solaris Casino...\n');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT,
      phone         TEXT,
      country       TEXT DEFAULT 'CR',
      dob           TEXT,
      kyc_status    TEXT DEFAULT 'pending',
      vip_level     TEXT DEFAULT 'bronze',
      is_active     BOOLEAN DEFAULT TRUE,
      is_banned     BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login    TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL UNIQUE,
      balance_usd     REAL DEFAULT 0.00,
      balance_bonus   REAL DEFAULT 0.00,
      total_deposited REAL DEFAULT 0.00,
      total_withdrawn REAL DEFAULT 0.00,
      total_wagered   REAL DEFAULT 0.00,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      type            TEXT NOT NULL,
      method          TEXT,
      amount          REAL NOT NULL,
      fee             REAL DEFAULT 0,
      net_amount      REAL,
      currency        TEXT DEFAULT 'USD',
      status          TEXT DEFAULT 'pending',
      processor_ref   TEXT,
      processor_data  TEXT,
      notes           TEXT,
      ip_address      TEXT,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_bonuses (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      bonus_type      TEXT NOT NULL,
      amount          REAL NOT NULL,
      wagering_req    REAL DEFAULT 0,
      wagered_amount  REAL DEFAULT 0,
      status          TEXT DEFAULT 'active',
      expires_at      TIMESTAMP,
      claimed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at    TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT NOT NULL,
      ip_address  TEXT,
      user_agent  TEXT,
      expires_at  TIMESTAMP NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id            TEXT PRIMARY KEY,
      referrer_id   TEXT NOT NULL,
      referred_id   TEXT NOT NULL,
      bonus_paid    BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS game_history (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      game_id     TEXT NOT NULL,
      game_name   TEXT,
      bet_amount  REAL NOT NULL,
      win_amount  REAL DEFAULT 0,
      result      TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_game_history_user    ON game_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_bonuses_user    ON user_bonuses(user_id);
  `);

  console.log('✅ Tablas creadas exitosamente');
  await pool.end();
}

setup().catch(console.error);
