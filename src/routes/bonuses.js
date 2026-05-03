// src/routes/bonuses.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Catálogo de bonos disponibles
const BONUS_CATALOG = [
  { id: 'welcome',  type: 'welcome',  label: 'Bienvenida',  amount_pct: 200, max_amount: 500, wagering: 35, min_deposit: 20, expire_days: 30 },
  { id: 'daily',    type: 'daily',    label: 'Diario',      amount_usd: 1,   wagering: 20, min_deposit: 0, expire_days: 1  },
  { id: 'reload',   type: 'reload',   label: 'Recarga',     amount_pct: 50,  max_amount: 200, wagering: 30, min_deposit: 50, expire_days: 14 },
  { id: 'freespin', type: 'freespin', label: 'Free Spins',  amount_usd: 5,   wagering: 25, min_deposit: 30, expire_days: 7  },
];

// GET /api/bonuses — listar bonos del usuario
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const bonuses = db.prepare(`
    SELECT * FROM user_bonuses WHERE user_id = ? ORDER BY claimed_at DESC
  `).all(req.user.id);

  // También devolver el catálogo para saber qué puede reclamar
  const claimedTypes = bonuses.map(b => b.bonus_type);

  const available = BONUS_CATALOG.map(b => ({
    ...b,
    claimed: claimedTypes.includes(b.type) &&
      (b.type !== 'daily'), // el diario se puede reclamar cada día
    user_bonus: bonuses.find(ub => ub.bonus_type === b.type && ub.status === 'active'),
  }));

  res.json({ bonuses, available });
});

// POST /api/bonuses/claim/:type — reclamar un bono
router.post('/claim/:type', authMiddleware, (req, res) => {
  const { type } = req.params;
  const db = getDB();

  const catalog = BONUS_CATALOG.find(b => b.type === type);
  if (!catalog) return res.status(404).json({ error: 'Bono no encontrado' });

  // Verificar si ya tiene este bono activo
  if (type !== 'daily') {
    const existing = db.prepare(`
      SELECT id FROM user_bonuses
      WHERE user_id = ? AND bonus_type = ? AND status = 'active'
    `).get(req.user.id, type);
    if (existing) return res.status(400).json({ error: 'Ya tienes este bono activo' });
  }

  // Para bono diario: verificar que no lo reclamó hoy
  if (type === 'daily') {
    const today = db.prepare(`
      SELECT id FROM user_bonuses
      WHERE user_id = ? AND bonus_type = 'daily'
        AND date(claimed_at) = date('now')
    `).get(req.user.id);
    if (today) return res.status(400).json({ error: 'Ya reclamaste tu bono diario hoy' });
  }

  // Calcular monto del bono
  let bonusAmount = catalog.amount_usd || 0;
  if (type === 'welcome' || type === 'reload') {
    const wallet = db.prepare('SELECT balance_usd, total_deposited FROM wallets WHERE user_id = ?').get(req.user.id);
    const deposit = wallet?.total_deposited || 0;
    bonusAmount = Math.min(deposit * (catalog.amount_pct / 100), catalog.max_amount);
    if (bonusAmount <= 0) bonusAmount = 0;
  }

  const expireDate = catalog.expire_days > 0
    ? `datetime('now', '+${catalog.expire_days} days')`
    : null;

  const bonusId = uuidv4();

  const claimBonus = db.transaction(() => {
    db.prepare(`
      INSERT INTO user_bonuses (id, user_id, bonus_type, amount, wagering_req, expires_at)
      VALUES (?, ?, ?, ?, ?, ${expireDate ? expireDate : 'NULL'})
    `).run(bonusId, req.user.id, type, bonusAmount, catalog.wagering);

    // Acreditar bono al wallet
    if (bonusAmount > 0) {
      db.prepare(`
        UPDATE wallets SET balance_bonus = balance_bonus + ? WHERE user_id = ?
      `).run(bonusAmount, req.user.id);
    }
  });

  claimBonus();

  res.json({
    message: `Bono "${catalog.label}" reclamado exitosamente`,
    bonus_id: bonusId,
    amount: bonusAmount,
    wagering_requirement: catalog.wagering,
  });
});

// GET /api/bonuses/:id — detalle de un bono
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const bonus = db.prepare(`
    SELECT * FROM user_bonuses WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);

  if (!bonus) return res.status(404).json({ error: 'Bono no encontrado' });

  const progress = bonus.wagering_req > 0
    ? Math.min((bonus.wagered_amount / (bonus.amount * bonus.wagering_req)) * 100, 100)
    : 100;

  res.json({ ...bonus, progress_pct: progress });
});

module.exports = router;
