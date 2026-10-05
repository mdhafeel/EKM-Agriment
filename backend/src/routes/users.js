const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../db/helpers');

// GET /api/users
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, email, full_name, role, permissions, is_active, created_at FROM users ORDER BY id').all();
  res.json(users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '[]') })));
});

// GET /api/users/:id
router.get('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, full_name, role, permissions, is_active, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, permissions: JSON.parse(user.permissions || '[]') });
});

// POST /api/users
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { username, email, password, full_name, role, permissions } = req.body;
  if (!username || !email || !password || !full_name) return res.status(400).json({ error: 'username, email, password, full_name required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) return res.status(409).json({ error: 'Username or email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const perms = permissions ? JSON.stringify(permissions) : '[]';
  const result = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role, permissions) VALUES (?, ?, ?, ?, ?, ?)').run(username, email, hash, full_name, role || 'staff', perms);

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'users', record_id: result.lastInsertRowid, new_value: { username, email, role }, ip_address: req.ip });
  res.status(201).json({ id: result.lastInsertRowid, message: 'User created successfully' });
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { username, email, full_name, role, permissions, is_active } = req.body;
  const old = { username: user.username, email: user.email, role: user.role, is_active: user.is_active };

  db.prepare(`UPDATE users SET username=COALESCE(?,username), email=COALESCE(?,email), full_name=COALESCE(?,full_name),
    role=COALESCE(?,role), permissions=COALESCE(?,permissions), is_active=COALESCE(?,is_active), updated_at=datetime('now') WHERE id=?`).run(
    username, email, full_name, role,
    permissions ? JSON.stringify(permissions) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.id
  );

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'users', record_id: req.params.id, old_value: old, new_value: req.body, ip_address: req.ip });
  res.json({ message: 'User updated successfully' });
});

// DELETE /api/users/:id
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Soft delete - deactivate instead of hard delete
  db.prepare('UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?').run(req.params.id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'users', record_id: req.params.id, old_value: { username: user.username }, ip_address: req.ip });
  res.json({ message: 'User deactivated successfully' });
});

module.exports = router;
