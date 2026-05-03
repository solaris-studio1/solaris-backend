// src/middleware/auth.js
// Verifica el JWT en cada request protegido

const jwt = require('jsonwebtoken');
const { getDB } = require('../db');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe y está activo
    const db = getDB();
    const user = db.prepare(
      'SELECT id, email, username, vip_level, kyc_status, is_active, is_banned FROM users WHERE id = ?'
    ).get(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'Cuenta suspendida' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Middleware opcional (no bloquea si no hay token)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const db = getDB();
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    } catch (e) {
      // token inválido, continuar sin usuario
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
