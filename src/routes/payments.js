// src/routes/payments.js
// Integración real con Stripe (tarjeta + Apple Pay + Google Pay)
// y Square (CashApp Pay)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  STRIPE — Tarjeta de crédito / Apple Pay / Google Pay
// ─────────────────────────────────────────────────────────────────────────────

// PASO 1: Crear PaymentIntent
// El frontend usa este client_secret para renderizar el formulario de Stripe
// POST /api/payments/stripe/create-intent
router.post('/stripe/create-intent', authMiddleware, async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { amount, method } = req.body; // amount en USD

    if (!amount || amount < 9.99) {
      return res.status(400).json({ error: 'Monto mínimo: $9.99' });
    }

    const db = getDB();
    const txId = uuidv4();

    // Crear intención de pago en Stripe (amount en centavos)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),   // $29.99 → 2999 centavos
      currency: 'usd',
      payment_method_types: ['card'],     // Stripe activa Apple/Google Pay automáticamente
      metadata: {
        user_id: req.user.id,
        transaction_id: txId,
        platform: 'solaris_casino',
      },
      description: 'Solaris Entertainment - Account Credit',
      statement_descriptor: 'SOLARIS ENT',  // Lo que aparece en el estado de cuenta
    });

    // Guardar transacción pendiente en DB
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, method, amount, status, processor_ref, ip_address)
      VALUES (?, ?, 'deposit', ?, ?, 'pending', ?, ?)
    `).run(txId, req.user.id, method || 'stripe', amount, paymentIntent.id, req.ip);

    res.json({
      client_secret: paymentIntent.client_secret,  // El frontend lo usa con Stripe.js
      transaction_id: txId,
      amount,
    });

  } catch (err) {
    console.error('Stripe create-intent error:', err);
    res.status(500).json({ error: 'Error al crear pago con Stripe' });
  }
});

// PASO 2: Webhook de Stripe (Stripe llama a esto cuando el pago es confirmado)
// POST /api/payments/stripe/webhook
// IMPORTANTE: esta ruta necesita el body RAW (sin JSON.parse)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDB();

  // ── Pago exitoso ──────────────────────────────────────────────────────────
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const { user_id, transaction_id } = pi.metadata;
    const amount = pi.amount / 100; // centavos → dólares

    const creditUser = db.transaction(() => {
      // Marcar transacción como completada
      db.prepare(`
        UPDATE transactions
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(transaction_id);

      // Acreditar saldo al usuario
      db.prepare(`
        UPDATE wallets
        SET balance_usd = balance_usd + ?,
            total_deposited = total_deposited + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(amount, amount, user_id);
    });

    creditUser();
    console.log(`✅ Pago exitoso: $${amount} para usuario ${user_id}`);
  }

  // ── Pago fallido ──────────────────────────────────────────────────────────
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const { transaction_id } = pi.metadata;

    db.prepare(`
      UPDATE transactions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(transaction_id);

    console.log(`❌ Pago fallido: ${transaction_id}`);
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  SQUARE / CASHAPP PAY
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/cashapp/create-order
router.post('/cashapp/create-order', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 9.99) {
      return res.status(400).json({ error: 'Monto mínimo: $9.99' });
    }

    // Square SDK
    const { Client, Environment } = require('square');
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    const db = getDB();
    const txId = uuidv4();
    const idempotencyKey = uuidv4();

    // Crear pago con Square
    const response = await client.paymentsApi.createPayment({
      idempotencyKey,
      amountMoney: {
        amount: BigInt(Math.round(amount * 100)), // en centavos
        currency: 'USD',
      },
      sourceId: 'CASH_APP',  // Square Cash App Pay source
      locationId: process.env.SQUARE_LOCATION_ID,
      note: 'Solaris Entertainment Credit',
    });

    db.prepare(`
      INSERT INTO transactions (id, user_id, type, method, amount, status, processor_ref, ip_address)
      VALUES (?, ?, 'deposit', 'cashapp', ?, 'pending', ?, ?)
    `).run(txId, req.user.id, amount, response.result.payment.id, req.ip);

    res.json({
      transaction_id: txId,
      square_payment_id: response.result.payment.id,
      // URL de deep link para abrir CashApp:
      cashapp_deep_link: `https://cash.app/pay/${process.env.CASHAPP_CASHTAG}/${amount}`,
      // QR data para mostrar al usuario:
      qr_data: `cashapp://pay/${process.env.CASHAPP_CASHTAG}?amount=${amount}&note=entertainment`,
      amount,
    });

  } catch (err) {
    console.error('CashApp order error:', err);
    res.status(500).json({ error: 'Error al crear orden de CashApp' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CRYPTO — Coinbase Commerce (USDT, BTC, ETH)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/crypto/create-charge
router.post('/crypto/create-charge', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 9.99) {
      return res.status(400).json({ error: 'Monto mínimo: $9.99' });
    }

    const db = getDB();
    const txId = uuidv4();

    // Llamada a Coinbase Commerce API
    const response = await fetch('https://api.commerce.coinbase.com/charges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify({
        name: 'Solaris Casino Credit',
        description: `Depósito de $${amount} USD`,
        pricing_type: 'fixed_price',
        local_price: { amount: String(amount), currency: 'USD' },
        metadata: { user_id: req.user.id, transaction_id: txId },
        redirect_url: `${process.env.FRONTEND_URL}/deposit/success`,
        cancel_url:   `${process.env.FRONTEND_URL}/deposit/cancel`,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    db.prepare(`
      INSERT INTO transactions (id, user_id, type, method, amount, status, processor_ref, ip_address)
      VALUES (?, ?, 'deposit', 'crypto', ?, 'pending', ?, ?)
    `).run(txId, req.user.id, amount, data.data.id, req.ip);

    res.json({
      transaction_id: txId,
      coinbase_charge_id: data.data.id,
      hosted_url: data.data.hosted_url,            // URL para pagar en Coinbase
      addresses: data.data.addresses,              // Direcciones crypto (BTC, ETH, USDT)
      expires_at: data.data.expires_at,
      amount,
    });

  } catch (err) {
    console.error('Crypto charge error:', err);
    res.status(500).json({ error: 'Error al crear cargo de crypto' });
  }
});

// Webhook de Coinbase Commerce
// POST /api/payments/crypto/webhook
router.post('/crypto/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString();
  const signature = req.headers['x-cc-webhook-signature'];

  // Verificar firma del webhook
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.COINBASE_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const computedSig = hmac.digest('hex');

  if (computedSig !== signature) {
    return res.status(400).json({ error: 'Firma inválida' });
  }

  const event = JSON.parse(rawBody);
  const db = getDB();

  if (event.event?.type === 'charge:confirmed') {
    const { user_id, transaction_id } = event.event.data.metadata;
    const amount = parseFloat(event.event.data.pricing.local.amount);

    const credit = db.transaction(() => {
      db.prepare(`UPDATE transactions SET status = 'completed' WHERE id = ?`).run(transaction_id);
      db.prepare(`
        UPDATE wallets
        SET balance_usd = balance_usd + ?, total_deposited = total_deposited + ?
        WHERE user_id = ?
      `).run(amount, amount, user_id);
    });

    credit();
    console.log(`₿ Crypto pago confirmado: $${amount} para usuario ${user_id}`);
  }

  res.json({ received: true });
});

module.exports = router;
