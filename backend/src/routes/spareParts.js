const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, checkLowStock } = require('../db/helpers');
const upload = require('../middleware/upload');

// ─── CATEGORY MANAGEMENT ────────────────────────────────────────────────────

// GET /api/spare-parts/categories  — all categories with their subcategories
router.get('/categories', authenticateToken, (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM parts_categories WHERE is_active=1 ORDER BY name').all();
  const subcategories = db.prepare('SELECT * FROM parts_subcategories WHERE is_active=1 ORDER BY name').all();
  // Attach subcategories array to each category
  const result = categories.map(cat => ({
    ...cat,
    subcategories: subcategories.filter(s => s.category_id === cat.id),
  }));
  res.json(result);
});

// GET /api/spare-parts/subcategories?category_id=  — subcategories for one category
router.get('/subcategories', authenticateToken, (req, res) => {
  const db = getDb();
  const { category_id } = req.query;
  if (!category_id) return res.json([]);
  res.json(db.prepare('SELECT * FROM parts_subcategories WHERE category_id=? AND is_active=1 ORDER BY name').all(category_id));
});

// POST /api/spare-parts/categories  — create category
router.post('/categories', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Category name required' });
  try {
    const result = db.prepare('INSERT INTO parts_categories (name) VALUES (?)').run(name.trim());
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), subcategories: [] });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Category already exists' });
    throw e;
  }
});

// PUT /api/spare-parts/categories/:id — rename category
router.put('/categories/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Category name required' });
  db.prepare('UPDATE parts_categories SET name=? WHERE id=?').run(name.trim(), req.params.id);
  res.json({ message: 'Category updated' });
});

// DELETE /api/spare-parts/categories/:id — soft delete
router.delete('/categories/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const inUse = db.prepare('SELECT COUNT(*) as cnt FROM spare_parts WHERE category_id=? AND is_active=1').get(req.params.id).cnt;
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} parts use this category` });
  db.prepare('UPDATE parts_categories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Category deleted' });
});

// POST /api/spare-parts/subcategories — create subcategory
router.post('/subcategories', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const { category_id, name } = req.body;
  if (!category_id || !name?.trim()) return res.status(400).json({ error: 'category_id and name required' });
  try {
    const result = db.prepare('INSERT INTO parts_subcategories (category_id, name) VALUES (?, ?)').run(category_id, name.trim());
    res.status(201).json({ id: result.lastInsertRowid, category_id, name: name.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Subcategory already exists in this category' });
    throw e;
  }
});

// PUT /api/spare-parts/subcategories/:id — rename subcategory
router.put('/subcategories/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE parts_subcategories SET name=? WHERE id=?').run(name.trim(), req.params.id);
  res.json({ message: 'Subcategory updated' });
});

// DELETE /api/spare-parts/subcategories/:id — soft delete
router.delete('/subcategories/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const inUse = db.prepare('SELECT COUNT(*) as cnt FROM spare_parts WHERE subcategory_id=? AND is_active=1').get(req.params.id).cnt;
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} parts use this subcategory` });
  db.prepare('UPDATE parts_subcategories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Subcategory deleted' });
});

// ─── SPARE PARTS CRUD ───────────────────────────────────────────────────────

// GET /api/spare-parts
router.get('/', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const { search, category_id, subcategory_id, supplier_id, stock_status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = 'sp.is_active = 1';
  const params = [];
  if (search) {
    where += ` AND (sp.part_name LIKE ? OR sp.part_number LIKE ? OR sp.part_code LIKE ? OR sp.brand LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category_id)    { where += ` AND sp.category_id = ?`;    params.push(category_id); }
  if (subcategory_id) { where += ` AND sp.subcategory_id = ?`; params.push(subcategory_id); }
  if (supplier_id)    { where += ` AND sp.supplier_id = ?`;    params.push(supplier_id); }
  if (stock_status === 'low')  where += ` AND sp.current_stock <= sp.min_stock_level AND sp.current_stock > 0`;
  else if (stock_status === 'out')  where += ` AND sp.current_stock = 0`;
  else if (stock_status === 'over') where += ` AND sp.current_stock > sp.max_stock_level`;

  const parts = db.prepare(`
    SELECT sp.*,
      pc.name  AS category_name_resolved,
      psc.name AS subcategory_name_resolved,
      s.name   AS supplier_name,
      (sp.current_stock * sp.purchase_price) AS stock_value
    FROM spare_parts sp
    LEFT JOIN parts_categories    pc  ON pc.id  = sp.category_id
    LEFT JOIN parts_subcategories psc ON psc.id = sp.subcategory_id
    LEFT JOIN suppliers           s   ON s.id   = sp.supplier_id
    WHERE ${where}
    ORDER BY sp.part_name
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total         = db.prepare(`SELECT COUNT(*) as cnt FROM spare_parts sp WHERE ${where}`).get(...params).cnt;
  const totalValue    = db.prepare(`SELECT COALESCE(SUM(current_stock * purchase_price),0) as v FROM spare_parts WHERE is_active=1`).get().v;
  const lowStockCount = db.prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE is_active=1 AND current_stock <= min_stock_level AND current_stock > 0`).get().cnt;
  const outOfStockCount = db.prepare(`SELECT COUNT(*) as cnt FROM spare_parts WHERE is_active=1 AND current_stock = 0`).get().cnt;

  res.json({ parts, total, totalValue, lowStockCount, outOfStockCount, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/spare-parts/:id
router.get('/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const part = db.prepare(`
    SELECT sp.*,
      pc.name  AS category_name_resolved,
      psc.name AS subcategory_name_resolved,
      s.name   AS supplier_name
    FROM spare_parts sp
    LEFT JOIN parts_categories    pc  ON pc.id  = sp.category_id
    LEFT JOIN parts_subcategories psc ON psc.id = sp.subcategory_id
    LEFT JOIN suppliers           s   ON s.id   = sp.supplier_id
    WHERE sp.id = ?
  `).get(req.params.id);
  if (!part) return res.status(404).json({ error: 'Part not found' });

  const movements = db.prepare(`
    SELECT sm.*, u.full_name as created_by_name
    FROM stock_movements sm
    LEFT JOIN users u ON u.id = sm.created_by
    WHERE sm.part_id = ?
    ORDER BY sm.created_at DESC LIMIT 50
  `).all(req.params.id);

  res.json({ part, movements });
});

// POST /api/spare-parts
router.post('/', authenticateToken, requirePermission('spare_parts'), upload.single('image'), (req, res) => {
  const db = getDb();
  const {
    part_name, part_number, brand,
    category_id, subcategory_id,
    vehicle_brand, vehicle_model, compatible_vehicles,
    supplier_id, purchase_price, selling_price, opening_stock,
    min_stock_level, max_stock_level, unit, location,
    gst_percent, discount_percent, barcode, notes,
  } = req.body;

  if (!part_name?.trim()) return res.status(400).json({ error: 'Part name required' });

  // Resolve display names for denormalised columns
  const catName = category_id
    ? db.prepare('SELECT name FROM parts_categories WHERE id=?').get(category_id)?.name || null
    : null;
  const subCatName = subcategory_id
    ? db.prepare('SELECT name FROM parts_subcategories WHERE id=?').get(subcategory_id)?.name || null
    : null;

  const part_code = generateCode('PRT', 'spare_parts', 'part_code');
  const stock = parseInt(opening_stock) || 0;

  const id = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO spare_parts (
        part_code, part_name, part_number, brand,
        category_id, category_name, subcategory_id, subcategory_name,
        vehicle_brand, vehicle_model, compatible_vehicles,
        supplier_id, purchase_price, selling_price,
        opening_stock, current_stock, min_stock_level, max_stock_level,
        unit, location, gst_percent, discount_percent,
        barcode, image_path, notes, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      part_code, part_name.trim(), part_number || null, brand || null,
      category_id    || null, catName,
      subcategory_id || null, subCatName,
      vehicle_brand || null, vehicle_model || null, compatible_vehicles || null,
      supplier_id   || null,
      parseFloat(purchase_price) || 0,
      parseFloat(selling_price)  || 0,
      stock, stock,
      parseInt(min_stock_level) || 5,
      parseInt(max_stock_level) || 100,
      unit || 'pcs', location || null,
      parseFloat(gst_percent)      || 0,
      parseFloat(discount_percent) || 0,
      barcode || null,
      req.file ? `/uploads/${req.file.filename}` : null,
      notes || null,
      req.user.id,
    );

    if (stock > 0) {
      db.prepare(`INSERT INTO stock_movements (part_id,movement_type,reference_type,quantity,unit_price,notes,created_by)
        VALUES (?,?,?,?,?,?,?)`).run(
        result.lastInsertRowid, 'opening', 'manual',
        stock, parseFloat(purchase_price) || 0, 'Opening stock', req.user.id
      );
    }
    return result.lastInsertRowid;
  })();

  checkLowStock();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'spare_parts', record_id: id, new_value: { part_name, part_code }, ip_address: req.ip });
  res.status(201).json({ id, part_code, message: 'Spare part created' });
});

// PUT /api/spare-parts/:id
router.put('/:id', authenticateToken, requirePermission('spare_parts'), upload.single('image'), (req, res) => {
  const db = getDb();
  const part = db.prepare('SELECT * FROM spare_parts WHERE id=?').get(req.params.id);
  if (!part) return res.status(404).json({ error: 'Part not found' });

  const {
    part_name, part_number, brand,
    category_id, subcategory_id,
    vehicle_brand, vehicle_model, compatible_vehicles,
    supplier_id, purchase_price, selling_price,
    min_stock_level, max_stock_level, unit, location,
    gst_percent, discount_percent, barcode, notes,
  } = req.body;

  // Resolve names for denormalised columns
  const newCatId    = category_id    !== undefined ? (category_id    || null) : part.category_id;
  const newSubCatId = subcategory_id !== undefined ? (subcategory_id || null) : part.subcategory_id;
  const catName    = newCatId    ? db.prepare('SELECT name FROM parts_categories WHERE id=?').get(newCatId)?.name    || part.category_name    : null;
  const subCatName = newSubCatId ? db.prepare('SELECT name FROM parts_subcategories WHERE id=?').get(newSubCatId)?.name || part.subcategory_name : null;

  const imagePath = req.file ? `/uploads/${req.file.filename}` : part.image_path;

  db.prepare(`
    UPDATE spare_parts SET
      part_name       = COALESCE(?, part_name),
      part_number     = COALESCE(?, part_number),
      brand           = COALESCE(?, brand),
      category_id     = ?,  category_name    = ?,
      subcategory_id  = ?,  subcategory_name = ?,
      vehicle_brand   = COALESCE(?, vehicle_brand),
      vehicle_model   = COALESCE(?, vehicle_model),
      compatible_vehicles = COALESCE(?, compatible_vehicles),
      supplier_id     = COALESCE(?, supplier_id),
      purchase_price  = COALESCE(?, purchase_price),
      selling_price   = COALESCE(?, selling_price),
      min_stock_level = COALESCE(?, min_stock_level),
      max_stock_level = COALESCE(?, max_stock_level),
      unit            = COALESCE(?, unit),
      location        = COALESCE(?, location),
      gst_percent     = COALESCE(?, gst_percent),
      discount_percent = COALESCE(?, discount_percent),
      barcode         = COALESCE(?, barcode),
      image_path      = ?,
      notes           = COALESCE(?, notes),
      updated_at      = strftime('%Y-%m-%d %H:%M:%S','now')
    WHERE id = ?
  `).run(
    part_name || null, part_number || null, brand || null,
    newCatId, catName,
    newSubCatId, subCatName,
    vehicle_brand || null, vehicle_model || null, compatible_vehicles || null,
    supplier_id   || null,
    purchase_price  ? parseFloat(purchase_price)  : null,
    selling_price   ? parseFloat(selling_price)   : null,
    min_stock_level ? parseInt(min_stock_level)   : null,
    max_stock_level ? parseInt(max_stock_level)   : null,
    unit || null, location || null,
    gst_percent      ? parseFloat(gst_percent)      : null,
    discount_percent ? parseFloat(discount_percent) : null,
    barcode || null,
    imagePath,
    notes || null,
    req.params.id,
  );

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'spare_parts', record_id: req.params.id, old_value: { part_name: part.part_name }, new_value: { part_name }, ip_address: req.ip });
  res.json({ message: 'Spare part updated' });
});

// POST /api/spare-parts/:id/adjust-stock
router.post('/:id/adjust-stock', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  const part = db.prepare('SELECT * FROM spare_parts WHERE id=?').get(req.params.id);
  if (!part) return res.status(404).json({ error: 'Part not found' });

  const qty = parseInt(req.body.quantity);
  if (isNaN(qty)) return res.status(400).json({ error: 'Valid quantity required' });

  const newStock = part.current_stock + qty;
  const allowNeg = db.prepare(`SELECT value FROM settings WHERE key='allow_negative_stock'`).get()?.value === '1';
  if (newStock < 0 && !allowNeg) return res.status(400).json({ error: 'Adjustment would result in negative stock' });

  db.prepare("UPDATE spare_parts SET current_stock=?, updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?").run(newStock, req.params.id);
  db.prepare(`INSERT INTO stock_movements (part_id,movement_type,reference_type,quantity,notes,created_by) VALUES (?,?,?,?,?,?)`).run(req.params.id, 'adjustment', 'manual', qty, req.body.notes || 'Manual adjustment', req.user.id);

  checkLowStock();
  res.json({ message: 'Stock adjusted', new_stock: newStock });
});

// DELETE /api/spare-parts/:id
router.delete('/:id', authenticateToken, requirePermission('spare_parts'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE spare_parts SET is_active=0, updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?").run(req.params.id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'spare_parts', record_id: req.params.id, ip_address: req.ip });
  res.json({ message: 'Spare part deleted' });
});

module.exports = router;
