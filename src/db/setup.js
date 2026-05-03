// src/db/setup.js
// Corre con: node src/db/setup.js
// Crea todas las tablas de la base de datos

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './solaris.db';
const db = new Database(path.resolve(DB_PATH));

// Habilitar WAL mode para mejor performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🌟 Configurando base de datos Solaris Casino...\n');

// ─── CREAR TABLAS ─────────────────────────────────────────────────────────────

db.exec(`
  -- ── USUARIOS ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT,
    phone         TEXT,
    country       TEXT DEFAULT 'CR',
    dob           TEXT,                        -- Fecha de nacimiento (KYC)
    kyc_status    TEXT DEFAULT 'pending',      -- pending | verified | rejected
    vip_level     TEXT DEFAULT 'bronze',       -- bronze | silver | gold | platinum
    is_active     BOOLEAN DEFAULT 1,
    is_banned     BOOLEAN DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login    DATETIME
  );

  -- ── WALLET (saldo por usuario) ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS wallets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE,
    balance_usd     REAL DEFAULT 0.00,          -- Saldo en USD
    balance_bonus   REAL DEFAULT 0.00,          -- Saldo de bonos
    total_deposited REAL DEFAULT 0.00,
    total_withdrawn REAL DEFAULT 0.00,
    total_wagered   REAL DEFAULT 0.00,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- ── TRANSACCIONES ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    type            TEXT NOT NULL,    -- deposit | withdrawal | bet | win | bonus
    method          TEXT,             -- cashapp | stripe | crypto | paypal | manual
    amount          REAL NOT NULL,
    fee             REAL DEFAULT 0,
    net_amount      REAL,             -- amount - fee
    currency        TEXT DEFAULT 'USD',
    status          TEXT DEFAULT 'pending', -- pending | completed | failed | cancelled
    processor_ref   TEXT,             -- ID de la transacción en Stripe/Square/etc.
    processor_data  TEXT,             -- JSON con datos del procesador
    notes           TEXT,
    ip_address      TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- ── BONOS ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_bonuses (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    bonus_type      TEXT NOT NULL,    -- welcome | daily | reload | referral | freespin
    amount          REAL NOT NULL,
    wagering_req    REAL DEFAULT 0,   -- x veces que hay que apostar
    wagered_amount  REAL DEFAULT 0,   -- cuánto lleva apostado
    status          TEXT DEFAULT 'active', -- active | completed | expired | cancelled
    expires_at      DATETIME,
    claimed_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- ── SESIONES ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    expires_at  DATETIME NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- ── REFERIDOS ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS referrals (
    id            TEXT PRIMARY KEY,
    referrer_id   TEXT NOT NULL,    -- quien refirió
    referred_id   TEXT NOT NULL,    -- quien fue referido
    bonus_paid    BOOLEAN DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
  );

  -- ── HISTORIAL DE JUEGOS ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS game_history (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    game_id     TEXT NOT NULL,
    game_name   TEXT,
    bet_amount  REAL NOT NULL,
    win_amount  REAL DEFAULT 0,
    result      TEXT,               -- win | loss | push
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- ── ÍNDICES para performance ──────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
  CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
  CREATE INDEX IF NOT EXISTS idx_game_history_user    ON game_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_bonuses_user    ON user_bonuses(user_id);
`);

console.log('✅ Tablas creadas:\n  - users\n  - wallets\n  - transactions\n  - user_bonuses\n  - sessions\n  - referrals\n  - game_history\n');
console.log('🎉 Base de datos lista en:', path.resolve(DB_PATH));

db.close();
