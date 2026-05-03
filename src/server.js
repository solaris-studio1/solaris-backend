// src/server.js
// Punto de entrada del backend de Solaris Casino

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

// Rutas
const authRoutes     = require('./routes/auth');
const walletRoutes   = require('./routes/wallet');
const paymentRoutes  = require('./routes/payments');
const bonusRoutes    = require('./routes/bonuses');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE GLOBAL ────────────────────────────────────────────────────────

// CORS — solo acepta requests del frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Parsear JSON (excepto en webhooks que necesitan raw body)
app.use((req, res, next) => {
  if (req.path.includes('/webhook')) {
    next(); // los webhooks usan express.raw() en su propia ruta
  } else {
    express.json()(req, res, next);
  }
});

// Rate limiting — protección contra ataques de fuerza bruta
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // máximo 10 intentos de login por IP
  message: { error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
});

app.use(generalLimiter);

// ─── RUTAS ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/wallet',   walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bonuses',  bonusRoutes);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Solaris Casino API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── INICIAR ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ☀  SOLARIS CASINO — Backend API
  ─────────────────────────────────
  🚀  Servidor corriendo en http://localhost:${PORT}
  📊  Base de datos: ${process.env.DB_PATH || './solaris.db'}
  🌍  Entorno: ${process.env.NODE_ENV || 'development'}
  ─────────────────────────────────
  Rutas disponibles:
    POST   /api/auth/register
    POST   /api/auth/login
    GET    /api/auth/me
    GET    /api/wallet
    GET    /api/wallet/transactions
    POST   /api/wallet/deposit
    POST   /api/wallet/withdraw
    POST   /api/payments/stripe/create-intent
    POST   /api/payments/cashapp/create-order
    POST   /api/payments/crypto/create-charge
    GET    /api/bonuses
    POST   /api/bonuses/claim/:type
    GET    /health
  `);
});

module.exports = app;
