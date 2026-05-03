// src/routes/wallet.js
// Saldo, depósitos, retiros, historial

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── GET SALDO ────────────────────────────────────────────────────────────────
// GET /api/wallet
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
  if (!wallet) return res.status(404).json({ error: 'Wallet no encontrado' });

  res.json({
    balance_usd:     wallet.balance_usd,
    balance_bonus:   wallet.balance_bonus,
    total_deposited: wallet.total_deposited,
    total_withdrawn: wallet.total_withdrawn,
    total_wagered:   wallet.total_wagered,
  });
});

// ─── HISTORIAL DE TRANSACCIONES ───────────────────────────────────────────────
// GET /api/wallet/transactions?page=1&limit=20&type=deposit
router.get('/transactions', authMiddleware, (req, res) => {
  const { page = 1, limit = 20, type, status } = req.query;
  const offset = (page - 1) * limit;
  const db = getDB();

  let query = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [req.user.id];

  if (type)   { query += ' AND type = ?';   params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const transactions = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(req.user.id).count;

  res.json({ transactions, total, page: Number(page), limit: Number(limit) });
});

// ─── CREAR DEPÓSITO (manual / pendiente) ─────────────────────────────────────
// POST /api/wallet/deposit
// El pago real lo procesa el webhook del procesador, esto crea la orden pendiente
router.post('/deposit', authMiddleware, (req, res) => {
  const { amount, method } = req.body;

  if (!amount || amount < 9.99) {
    return res.status(400).json({ error: 'Monto mínimo de depósito: $9.99' });
  }
  if (!method) {
    return res.status(400).json({ error: 'Método de pago requerido' });
  }

  const validMethods = ['cashapp', 'stripe', 'applepay', 'googlepay', 'paypal', 'crypto', 'card'];
  if (!validMethods.includes(method)) {
    return res.status(400).json({ error: 'Método de pago inválido' });
  }

  // Monto mínimo por método
  if (method === 'card' && amount < 30) {
    return res.status(400).json({ error: 'Monto mínimo con tarjeta: $30' });
  }

  const db = getDB();
  const txId = uuidv4();

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, method, amount, net_amount, status, ip_address)
    VALUES (?, ?, 'deposit', ?, ?, ?, 'pending', ?)
  `).run(txId, req.user.id, method, amount, amount, req.ip);

  res.status(201).json({
    transaction_id: txId,
    amount,
    method,
    status: 'pending',
    message: 'Depósito iniciado. Completa el pago para acreditar tu saldo.',
  });
});

// ─── CONFIRMAR DEPÓSITO MANUAL (CashApp) ─────────────────────────────────────
// POST /api/wallet/deposit/:txId/confirm
// El admin confirma manualmente cuando ve el pago en CashApp
router.post('/deposit/:txId/confirm', authMiddleware, (req, res) => {
  const { txId } = req.params;
  const db = getDB();

  const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, req.user.id);
  if (!tx) return res.status(404).json({ error: 'Transacción no encontrada' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Esta transacción ya fue procesada' });

  // En producción esto lo haría solo el webhook del procesador o un admin
  // Por ahora lo dejamos para pruebas
  const creditWallet = db.transaction(() => {
    db.prepare(`
      UPDATE transactions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(txId);

    db.prepare(`
      UPDATE wallets
      SET balance_usd = balance_usd + ?,
          total_deposited = total_deposited + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(tx.amount, tx.amount, req.user.id);
  });

  creditWallet();

  const wallet = db.prepare('SELECT balance_usd FROM wallets WHERE user_id = ?').get(req.user.id);

  res.json({
    message: `$${tx.amount.toFixed(2)} acreditados a tu cuenta`,
    new_balance: wallet.balance_usd,
  });
});

// ─── SOLICITAR RETIRO ─────────────────────────────────────────────────────────
// POST /api/wallet/withdraw
router.post('/withdraw', authMiddleware, (req, res) => {
  const { amount, method, destination } = req.body;

  if (!amount || amount < 10) {
    return res.status(400).json({ error: 'Monto mínimo de retiro: $10' });
  }
  if (!method || !destination) {
    return res.status(400).json({ error: 'Método y destino requeridos' });
  }

  const db = getDB();
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);

  if (!wallet || wallet.balance_usd < amount) {
    return res.status(400).json({ error: 'Saldo insuficiente' });
  }

  const fee = amount * 0.02; // 2% de comisión
  const net_amount = amount - fee;
  const txId = uuidv4();

  const processWithdrawal = db.transaction(() => {
    // Descontar del saldo inmediatamente
    db.prepare(`
      UPDATE wallets
      SET balance_usd = balance_usd - ?,
          total_withdrawn = total_withdrawn + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(amount, amount, req.user.id);

    // Crear transacción pendiente de aprobación
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, method, amount, fee, net_amount, status, notes, ip_address)
      VALUES (?, ?, 'withdrawal', ?, ?, ?, ?, 'pending', ?, ?)
    `).run(txId, req.user.id, method, amount, fee, net_amount, destination, req.ip);
  });

  processWithdrawal();

  res.status(201).json({
    transaction_id: txId,
    amount,
    fee,
    net_amount,
    method,
    destination,
    status: 'pending',
    message: 'Retiro solicitado. Procesaremos tu pago en 24-48 horas hábiles.',
  });
});

module.exports = router;
