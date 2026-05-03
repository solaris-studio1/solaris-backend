require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const paymentRoutes = require('./routes/payments');
const bonusRoutes = require('./routes/bonuses');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, full_name TEXT, phone TEXT, country TEXT DEFAULT 'CR',
      dob TEXT, kyc_status TEXT DEFAULT 'pending', vip_level TEXT DEFAULT 'bronze',
      is_active BOOLEAN DEFAULT TRUE, is_banned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
      balance_usd REAL DEFAULT 0.00, balance_bonus REAL DEFAULT 0.00,
      total_deposited REAL DEFAULT 0.00, total_withdrawn REAL DEFAULT 0.00,
      total_wagered REAL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, method TEXT,
      amount REAL NOT NULL, fee REAL DEFAULT 0, net_amount REAL, currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending', processor_ref TEXT, processor_data TEXT, notes TEXT,
      ip_address TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_bonuses (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, bonus_type TEXT NOT NULL,
      amount REAL NOT NULL, wagering_req REAL DEFAULT 0, wagered_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'active', expires_at
cat > ~/Downloads/solaris-backend/solaris-backend/src/server.js << 'EOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const paymentRoutes = require('./routes/payments');
const bonusRoutes = require('./routes/bonuses');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, full_name TEXT, phone TEXT, country TEXT DEFAULT 'CR',
      dob TEXT, kyc_status TEXT DEFAULT 'pending', vip_level TEXT DEFAULT 'bronze',
      is_active BOOLEAN DEFAULT TRUE, is_banned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
      balance_usd REAL DEFAULT 0.00, balance_bonus REAL DEFAULT 0.00,
      total_deposited REAL DEFAULT 0.00, total_withdrawn REAL DEFAULT 0.00,
      total_wagered REAL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, method TEXT,
      amount REAL NOT NULL, fee REAL DEFAULT 0, net_amount REAL, currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending', processor_ref TEXT, processor_data TEXT, notes TEXT,
      ip_address TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_bonuses (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, bonus_type TEXT NOT NULL,
      amount REAL NOT NULL, wagering_req REAL DEFAULT 0, wagered_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'active', expires_at TIMESTAMP,
      claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
      ip_address TEXT, user_agent TEXT, expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS game_history (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_id TEXT NOT NULL,
      game_name TEXT, bet_amount REAL NOT NULL, win_amount REAL DEFAULT 0,
      result TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Base de datos lista');
}

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use((req, res, next) => {
  if (req.path.includes('/webhook')) { next(); }
  else { express.json()(req, res, next); }
});

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use(generalLimiter);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bonuses', bonusRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Solaris Casino API', version: '1.0.0' });
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Solaris Casino API corriendo en puerto ${PORT}`);
  });
}).catch(err => {
  console.error('Error iniciando DB:', err);
  process.exit(1);
});

module.exports = app;
