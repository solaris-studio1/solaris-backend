// src/routes/auth.js
// Registro, Login, Logout, Perfil

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── REGISTRO ────────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, full_name, phone, dob, referral_code } = req.body;

    // Validaciones básicas
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username y password son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const db = getDB();

    // Verificar que no exista
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(409).json({ error: 'Email o username ya registrado' });
    }

    // Hash de contraseña
    const password_hash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Transacción: crear usuario + wallet
    const createUser = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, full_name, phone, dob)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, email.toLowerCase(), username, password_hash, full_name || null, phone || null, dob || null);

      // Crear wallet vacío
      db.prepare(`
        INSERT INTO wallets (id, user_id, balance_usd) VALUES (?, ?, 0)
      `).run(uuidv4(), userId);

      // Bonus de bienvenida (50 GC demo)
      db.prepare(`
        INSERT INTO user_bonuses (id, user_id, bonus_type, amount, wagering_req, expires_at)
        VALUES (?, ?, 'welcome', 0, 35, datetime('now', '+30 days'))
      `).run(uuidv4(), userId);

      // Si hay referral, registrar
      if (referral_code) {
        const referrer = db.prepare('SELECT id FROM users WHERE id = ?').get(referral_code);
        if (referrer) {
          db.prepare(`
            INSERT INTO referrals (id, referrer_id, referred_id) VALUES (?, ?, ?)
          `).run(uuidv4(), referrer.id, userId);
        }
      }
    });

    createUser();

    // Generar JWT
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({
      message: 'Cuenta creada exitosamente',
      token,
      user: { id: userId, email, username, full_name, vip_level: 'bronze' }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email o username

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Credenciales requeridas' });
    }

    const db = getDB();
    const user = db.prepare(`
      SELECT * FROM users WHERE email = ? OR username = ?
    `).get(identifier.toLowerCase(), identifier);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'Cuenta suspendida. Contacta soporte.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Actualizar último login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Obtener wallet
    const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        vip_level: user.vip_level,
        kyc_status: user.kyc_status,
        balance: wallet?.balance_usd || 0,
        balance_bonus: wallet?.balance_bonus || 0,
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── PERFIL ───────────────────────────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDB();
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      vip_level: req.user.vip_level,
      kyc_status: req.user.kyc_status,
    },
    wallet: {
      balance_usd: wallet?.balance_usd || 0,
      balance_bonus: wallet?.balance_bonus || 0,
      total_deposited: wallet?.total_deposited || 0,
      total_withdrawn: wallet?.total_withdrawn || 0,
    }
  });
});

// ─── CAMBIAR CONTRASEÑA ───────────────────────────────────────────────────────
// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Contraseñas requeridas' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const db = getDB();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

  const new_hash = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(new_hash, req.user.id);

  res.json({ message: 'Contraseña actualizada exitosamente' });
});

module.exports = router;
