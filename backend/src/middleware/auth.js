const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'workshop_secret_key_2024_change_in_prod';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, username, email, full_name, role, permissions, is_active FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.is_active) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = { ...user, permissions: JSON.parse(user.permissions || '[]') };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requirePermission(module) {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    const perms = req.user?.permissions || [];
    if (perms.includes('*') || perms.includes(module)) return next();
    return res.status(403).json({ error: `Permission denied for module: ${module}` });
  };
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authenticateToken, requireAdmin, requirePermission, generateToken, JWT_SECRET };
