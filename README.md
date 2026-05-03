# ☀ SOLARIS CASINO — Guía de instalación y despliegue

## Estructura del proyecto

```
solaris-backend/
├── src/
│   ├── server.js              ← Punto de entrada
│   ├── db/
│   │   ├── index.js           ← Conexión SQLite
│   │   └── setup.js           ← Crear tablas
│   ├── middleware/
│   │   └── auth.js            ← Verificación JWT
│   └── routes/
│       ├── auth.js            ← Login / Registro
│       ├── wallet.js          ← Saldo / Depósitos / Retiros
│       ├── payments.js        ← Stripe / CashApp / Crypto
│       └── bonuses.js         ← Bonos del casino
├── .env.example               ← Variables de entorno (copia a .env)
└── package.json
```

---

## Paso 1 — Instalar en tu servidor

```bash
# Clonar / subir los archivos al servidor
cd solaris-backend

# Instalar dependencias
npm install

# Copiar el archivo de variables de entorno
cp .env.example .env

# Editar con tus claves reales
nano .env
```

---

## Paso 2 — Configurar la base de datos

```bash
# Crear todas las tablas
node src/db/setup.js

# Verás: ✅ Tablas creadas: users, wallets, transactions...
```

---

## Paso 3 — Configurar Stripe (tarjeta + Apple Pay + Google Pay)

1. Ve a https://dashboard.stripe.com/register y crea una cuenta
2. En el Dashboard ve a **Developers → API Keys**
3. Copia tu `Secret key` (sk_test_...) y `Publishable key` (pk_test_...)
4. Pégalas en tu `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxx
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
   ```
5. Para webhooks locales usa **Stripe CLI**:
   ```bash
   stripe listen --forward-to localhost:3001/api/payments/stripe/webhook
   ```
6. Copia el `webhook signing secret` (whsec_...) a tu `.env`

**Apple Pay con Stripe:**
- Stripe activa Apple Pay automáticamente cuando usas Payment Element
- Solo necesitas verificar tu dominio en el Dashboard de Stripe
- En producción: `stripe.com/docs/apple-pay`

---

## Paso 4 — Configurar CashApp (Square)

1. Ve a https://developer.squareup.com y crea una cuenta
2. Crea una aplicación nueva
3. Ve a **Credentials** y copia tu `Access Token` y `Location ID`
4. Pégalos en tu `.env`:
   ```
   SQUARE_ACCESS_TOKEN=EAAAl...
   SQUARE_LOCATION_ID=L...
   SQUARE_ENVIRONMENT=sandbox
   ```
5. Cuando estés listo para producción cambia a `SQUARE_ENVIRONMENT=production`

---

## Paso 5 — Configurar Crypto (Coinbase Commerce)

1. Ve a https://commerce.coinbase.com y crea una cuenta
2. Ve a **Settings → Security → API Keys**
3. Crea una API key y cópiala a tu `.env`:
   ```
   COINBASE_COMMERCE_API_KEY=xxxxx
   COINBASE_WEBHOOK_SECRET=xxxxx
   ```
4. En Coinbase Commerce agrega el webhook:
   `https://tu-dominio.com/api/payments/crypto/webhook`

---

## Paso 6 — Iniciar el servidor

```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

---

## Paso 7 — Despliegue en la nube (opciones)

### Opción A: Railway.app (más fácil, $5/mes)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Opción B: DigitalOcean Droplet ($6/mes)
```bash
# En tu Droplet Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Subir archivos y arrancar
pm2 start src/server.js --name solaris-casino
pm2 startup
pm2 save
```

### Opción C: AWS EC2 / Google Cloud Run
- Mismos pasos que DigitalOcean

---

## Paso 8 — Conectar el frontend

En tu frontend React, usa estas llamadas:

```javascript
const API = 'https://tu-backend.com/api';

// Login
const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: email, password }),
});
const { token, user } = await res.json();
localStorage.setItem('solaris_token', token);

// Llamadas autenticadas
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('solaris_token')}`,
};

// Crear depósito con Stripe
const { client_secret } = await fetch(`${API}/payments/stripe/create-intent`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ amount: 49.99, method: 'card' }),
}).then(r => r.json());

// Usar client_secret con Stripe.js para mostrar el formulario de pago
```

---

## API Reference completa

| Método | Ruta                                    | Auth | Descripción                  |
|--------|-----------------------------------------|------|------------------------------|
| POST   | /api/auth/register                      | ❌   | Crear cuenta                 |
| POST   | /api/auth/login                         | ❌   | Iniciar sesión               |
| GET    | /api/auth/me                            | ✅   | Datos del usuario            |
| PUT    | /api/auth/change-password               | ✅   | Cambiar contraseña           |
| GET    | /api/wallet                             | ✅   | Saldo y estadísticas         |
| GET    | /api/wallet/transactions                | ✅   | Historial de transacciones   |
| POST   | /api/wallet/deposit                     | ✅   | Crear orden de depósito      |
| POST   | /api/wallet/deposit/:txId/confirm       | ✅   | Confirmar depósito manual    |
| POST   | /api/wallet/withdraw                    | ✅   | Solicitar retiro             |
| POST   | /api/payments/stripe/create-intent      | ✅   | PaymentIntent (Stripe)       |
| POST   | /api/payments/stripe/webhook            | ❌   | Webhook de Stripe            |
| POST   | /api/payments/cashapp/create-order      | ✅   | Orden CashApp (Square)       |
| POST   | /api/payments/crypto/create-charge      | ✅   | Cargo crypto (Coinbase)      |
| POST   | /api/payments/crypto/webhook            | ❌   | Webhook de Coinbase          |
| GET    | /api/bonuses                            | ✅   | Listar bonos                 |
| POST   | /api/bonuses/claim/:type                | ✅   | Reclamar bono                |
| GET    | /health                                 | ❌   | Estado del servidor          |

---

## Seguridad importante en producción

- [ ] Cambiar `JWT_SECRET` por una clave de 64+ caracteres aleatoria
- [ ] Usar HTTPS (SSL/TLS) — Railway y DigitalOcean lo dan automático
- [ ] Activar Stripe en modo Live (no test)
- [ ] Configurar CORS solo para tu dominio real
- [ ] Hacer backups diarios de la base de datos SQLite
- [ ] Agregar logs de auditoría para todas las transacciones

---

*Solaris Casino Backend v1.0 — Desarrollado con Node.js + Express + SQLite*
