require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { initializeDatabase } = require('./db/schema');

const app = express();

// Initialize DB — crash early with clear message if it fails
try {
  initializeDatabase();
  console.log('Database initialized successfully');
} catch (err) {
  console.error('FATAL: Database initialization failed:', err.message);
  process.exit(1);
}

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve built React frontend
// Always resolve relative to this file's directory (__dirname = backend/src)
// so it works regardless of where Node is started from
const FRONTEND_DIST = (() => {
  // If env var set, resolve it relative to __dirname for safety
  if (process.env.FRONTEND_DIST) {
    const p = path.isAbsolute(process.env.FRONTEND_DIST)
      ? process.env.FRONTEND_DIST
      : path.join(__dirname, '..', process.env.FRONTEND_DIST.replace(/^\.\//, ''));
    return p;
  }
  // Default: backend/frontend-dist (copied by Dockerfile)
  return path.join(__dirname, '../frontend-dist');
})();

const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');

console.log(`Frontend dist: ${FRONTEND_DIST}`);
console.log(`Index.html exists: ${fs.existsSync(INDEX_HTML)}`);

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback — serve index.html for all page routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    // Skip static file extensions
    if (/\.\w{2,5}$/.test(req.path)) return res.status(404).send('Not found');
    // Must use absolute path with sendFile
    res.sendFile(INDEX_HTML);
  });
} else {
  console.warn(`WARNING: Frontend dist not found at ${FRONTEND_DIST}`);
  app.get('/', (req, res) => res.json({ status: 'API running', note: 'Frontend not built' }));
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/spare-parts', require('./routes/spareParts'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/daily-tracking', require('./routes/dailyTracking'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/settings', require('./routes/settings'));

// Health check — also shows DB path and env for debugging
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV,
  node: process.version,
}));

// Error handler — log full error in production too
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

module.exports = app;
