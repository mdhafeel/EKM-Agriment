const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');
const { checkLowStock } = require('../db/helpers');

// GET /api/notifications
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { unread_only, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Auto-check low stock
  checkLowStock();

  // Auto-mark overdue payments
  const today = new Date().toISOString().split('T')[0];
  const overduePayments = db.prepare(`SELECT * FROM payments WHERE status IN ('pending','partial') AND due_date IS NOT NULL AND due_date < ?`).all(today);
  for (const p of overduePayments) {
    db.prepare(`UPDATE payments SET status='overdue' WHERE id=?`).run(p.id);
    const existing = db.prepare(`SELECT id FROM notifications WHERE reference_type='payment' AND reference_id=? AND type='overdue_payment' AND is_read=0`).get(p.id);
    if (!existing) {
      db.prepare(`INSERT INTO notifications (type,title,message,reference_type,reference_id) VALUES (?,?,?,?,?)`).run(
        'overdue_payment', 'Payment Overdue', `Payment of ₹${p.amount} from ${p.party_name} is overdue`, 'payment', p.id
      );
    }
  }

  let where = '1=1';
  if (unread_only === 'true') where += ' AND is_read=0';

  const notifications = db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(parseInt(limit), offset);
  const unreadCount = db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read=0').get().cnt;

  res.json({ notifications, unreadCount, total: notifications.length });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(req.params.id);
  res.json({ message: 'Marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all/all', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read=1').run();
  res.json({ message: 'All notifications marked as read' });
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM notifications WHERE id=?').run(req.params.id);
  res.json({ message: 'Notification deleted' });
});

module.exports = router;
