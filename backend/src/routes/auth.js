const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../db/schema');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../db/helpers');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1').get(username, username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken(user.id);
  logAudit({ user_id: user.id, username: user.username, action: 'login', module: 'auth', ip_address: req.ip });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      permissions: JSON.parse(user.permissions || '[]')
    }
  });
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'logout', module: 'auth', ip_address: req.ip });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(hash, req.user.id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'change_password', module: 'auth', ip_address: req.ip });
  res.json({ message: 'Password changed successfully' });
});

// POST /api/auth/reset-password (admin resets another user)
router.post('/reset-password', authenticateToken, (req, res) => {
  const { user_id, new_password } = req.body;
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = getDb();
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(hash, user_id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'reset_password', module: 'auth', record_id: user_id, ip_address: req.ip });
  res.json({ message: 'Password reset successfully' });
});

module.exports = router;
