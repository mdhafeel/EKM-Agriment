const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

// DB path priority:
// 1. DB_PATH env var (explicit override)
// 2. /var/data/workshop.db (Render persistent disk — only if it exists/is mounted)
// 3. /tmp/workshop.db (fallback if disk not mounted — data resets on redeploy)
// 4. Local dev path
function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.RENDER) {
    const renderDisk = '/var/data';
    // Check if the disk is actually mounted
    if (fs.existsSync(renderDisk)) {
      return path.join(renderDisk, 'workshop.db');
    }
    // Disk not mounted — use /tmp as fallback so app still starts
    console.warn('WARNING: /var/data not found. Using /tmp — add a disk in Render dashboard for persistence!');
    return '/tmp/workshop.db';
  }
  return path.join(__dirname, '../../workshop.db');
}

const DB_PATH = resolveDbPath();

// Ensure the directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

console.log(`Database path: ${DB_PATH}`);

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  db.exec(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
      permissions TEXT DEFAULT '[]',      -- JSON array of module keys
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SETTINGS
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- CUSTOMERS
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      vehicle_number TEXT,
      vehicle_model TEXT,
      vehicle_brand TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SUPPLIERS
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_code TEXT UNIQUE,
      name TEXT NOT NULL,
      contact_number TEXT,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ACCOUNTS (Cash, Bank, UPI, Other)
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'cash' | 'bank' | 'upi' | 'other'
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      bank_name TEXT,
      account_number TEXT,
      ifsc_code TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- INVESTMENTS
    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_no TEXT UNIQUE,
      date TEXT NOT NULL,
      investor_name TEXT NOT NULL,
      amount REAL NOT NULL,              -- total = sum of all splits
      payment_method TEXT NOT NULL DEFAULT 'cash', -- kept for backward compat (first split method)
      account_id INTEGER REFERENCES accounts(id),  -- kept for backward compat (first split account)
      purpose TEXT,
      description TEXT,
      attachment_path TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- INVESTMENT SPLITS (one row per payment method per investment)
    CREATE TABLE IF NOT EXISTS investment_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      notes TEXT
    );

    -- EXPENSE CATEGORIES
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- EXPENSES
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_no TEXT UNIQUE,
      date TEXT NOT NULL,
      category_id INTEGER REFERENCES expense_categories(id),
      category_name TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      account_id INTEGER REFERENCES accounts(id),
      paid_to TEXT,
      description TEXT,
      receipt_path TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SPARE PARTS CATEGORIES
    CREATE TABLE IF NOT EXISTS parts_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- SPARE PARTS SUB-CATEGORIES
    CREATE TABLE IF NOT EXISTS parts_subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES parts_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(category_id, name)
    );

    -- SPARE PARTS
    CREATE TABLE IF NOT EXISTS spare_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_code TEXT UNIQUE,
      part_name TEXT NOT NULL,
      part_number TEXT,
      brand TEXT,
      category_id INTEGER REFERENCES parts_categories(id),
      category_name TEXT,
      subcategory_id INTEGER REFERENCES parts_subcategories(id),
      subcategory_name TEXT,
      vehicle_brand TEXT,
      vehicle_model TEXT,
      compatible_vehicles TEXT,
      supplier_id INTEGER REFERENCES suppliers(id),
      purchase_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      opening_stock INTEGER NOT NULL DEFAULT 0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      min_stock_level INTEGER NOT NULL DEFAULT 5,
      max_stock_level INTEGER NOT NULL DEFAULT 100,
      unit TEXT DEFAULT 'pcs',
      location TEXT,
      gst_percent REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      barcode TEXT,
      image_path TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- STOCK MOVEMENTS
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL REFERENCES spare_parts(id),
      movement_type TEXT NOT NULL, -- 'purchase'|'sale'|'adjustment'|'return'|'opening'
      reference_type TEXT,         -- 'purchase'|'sale'|'manual'
      reference_id INTEGER,
      quantity INTEGER NOT NULL,   -- positive=in, negative=out
      unit_price REAL,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- PURCHASES (from supplier)
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT UNIQUE,
      date TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      invoice_number TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      pending_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending', -- paid|partial|pending
      payment_method TEXT,
      account_id INTEGER REFERENCES accounts(id),
      notes TEXT,
      attachment_path TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- PURCHASE ITEMS
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      part_id INTEGER REFERENCES spare_parts(id),
      part_name TEXT NOT NULL,
      part_number TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      gst_percent REAL DEFAULT 0,
      total_amount REAL NOT NULL
    );

    -- SALES
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_no TEXT UNIQUE,
      date TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      vehicle_number TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      pending_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      account_id INTEGER REFERENCES accounts(id),
      cost_of_goods REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SALE ITEMS
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      part_id INTEGER REFERENCES spare_parts(id),
      part_name TEXT NOT NULL,
      part_number TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      gst_percent REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      profit REAL DEFAULT 0
    );

    -- PAYMENTS (General payment tracking)
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_no TEXT UNIQUE,
      date TEXT NOT NULL,
      type TEXT NOT NULL, -- 'received' | 'paid'
      party_type TEXT,    -- 'customer' | 'supplier' | 'other'
      party_id INTEGER,
      party_name TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      account_id INTEGER REFERENCES accounts(id),
      reference_number TEXT,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'paid', -- paid|partial|pending|overdue
      pending_amount REAL NOT NULL DEFAULT 0,
      attachment_path TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- LEDGER
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      transaction_no TEXT UNIQUE,
      transaction_type TEXT NOT NULL, -- investment|income|expense|purchase|sale|payment|transfer
      reference_type TEXT,
      reference_id INTEGER,
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      account_id INTEGER REFERENCES accounts(id),
      payment_method TEXT,
      party_name TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ACCOUNT TRANSFERS
    CREATE TABLE IF NOT EXISTS account_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_no TEXT UNIQUE,
      date TEXT NOT NULL,
      from_account_id INTEGER NOT NULL REFERENCES accounts(id),
      to_account_id INTEGER NOT NULL REFERENCES accounts(id),
      amount REAL NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- DAILY CLOSING
    CREATE TABLE IF NOT EXISTS daily_closing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      opening_cash REAL DEFAULT 0,
      cash_received REAL DEFAULT 0,
      cash_paid REAL DEFAULT 0,
      upi_received REAL DEFAULT 0,
      bank_received REAL DEFAULT 0,
      parts_purchase REAL DEFAULT 0,
      parts_sales REAL DEFAULT 0,
      workshop_income REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_expenses REAL DEFAULT 0,
      investment_added REAL DEFAULT 0,
      customer_payments REAL DEFAULT 0,
      supplier_payments REAL DEFAULT 0,
      closing_cash REAL DEFAULT 0,
      closing_bank REAL DEFAULT 0,
      daily_profit REAL DEFAULT 0,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- INVOICES
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      date TEXT NOT NULL,
      due_date TEXT,
      type TEXT NOT NULL DEFAULT 'sale', -- sale | purchase | service
      customer_id INTEGER REFERENCES customers(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      sale_id INTEGER REFERENCES sales(id),
      purchase_id INTEGER REFERENCES purchases(id),
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      vehicle_number TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      balance_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- NOTIFICATIONS
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- low_stock|overdue_payment|due_reminder|large_expense|system
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AUDIT LOGS
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT NOT NULL,    -- create|update|delete|login|logout
      module TEXT NOT NULL,
      record_id INTEGER,
      old_value TEXT,          -- JSON
      new_value TEXT,          -- JSON
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- INDEXES
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_id, party_type);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger(date);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON stock_movements(part_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_spare_parts_code ON spare_parts(part_code);
  `);

  // Seed default data
  seedDefaults(db);

  // Run migrations for existing databases (idempotent)
  runMigrations(db);

  return db;
}

function runMigrations(db) {
  // Add subcategory columns to spare_parts if they don't exist yet
  const cols = db.prepare("PRAGMA table_info(spare_parts)").all().map(c => c.name);
  if (!cols.includes('subcategory_id')) {
    db.exec(`ALTER TABLE spare_parts ADD COLUMN subcategory_id INTEGER REFERENCES parts_subcategories(id)`);
  }
  if (!cols.includes('subcategory_name')) {
    db.exec(`ALTER TABLE spare_parts ADD COLUMN subcategory_name TEXT`);
  }

  // Create investment_splits table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS investment_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      notes TEXT
    );
  `);

  // Add pending_amount to payments if missing (older DB versions)
  const paymentCols = db.prepare("PRAGMA table_info(payments)").all().map(c => c.name);
  if (!paymentCols.includes('pending_amount')) {
    db.exec(`ALTER TABLE payments ADD COLUMN pending_amount REAL NOT NULL DEFAULT 0`);
  }

  // Replace old auto parts categories with new product-specific categories
  const newCats = [
    'Bc43 52cc','Bc143r','Cs45 52cc','Sprayer 139f','Sprayer tu26','Sprayer 768',
    'Battery Sprayer Manual','Battery Sprayer 2 in 1','HTP Power Sprayer','HTP Pump',
    'Water Pump','Power Weeder','Power Tools','Stihl FS','Stihl MS',
    'Bearing Grease Oil','Generator','Gardening Hand Tools','Car Wash',
    'Hand Tools and Accessories','Carbon Fibre Pole','Taparia','Cut Off Cutter',
    'Cut Off Saw','Earthauger','Fogging Machine','Hedge Trimmer','Mini Power Tiller',
    'Petrol Blower','Safety','Sprinkler and Irrigation Gun','Welding Equipment',
    'Tea Harvester','Greaves Engine Lambani','Bajrangi Pump','Kirloskar','K7 Pump',
  ];
  const oldCats = ['Engine Parts','Brake System','Electrical','Filters','Tyres & Wheels','Body Parts','Suspension','Cooling System','Transmission','Accessories','Consumables','Other'];
  // Only replace if the DB still has the old auto-workshop categories (not the user's custom ones)
  const existingCats = db.prepare('SELECT name FROM parts_categories ORDER BY id').all().map(c => c.name);
  const hasOldCats = oldCats.some(oc => existingCats.includes(oc));
  const hasNewCats = newCats.some(nc => existingCats.includes(nc));
  if (hasOldCats && !hasNewCats) {
    // Remove old categories and their subcategories (no spare parts assigned since DB was reset)
    db.exec(`DELETE FROM parts_subcategories`);
    db.exec(`DELETE FROM parts_categories`);
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('parts_categories','parts_subcategories')`);
    const insertCat = db.prepare('INSERT INTO parts_categories (name) VALUES (?)');
    for (const c of newCats) insertCat.run(c);
    console.log(`Replaced ${oldCats.length} old categories with ${newCats.length} new product categories.`);
  }

  // Seed subcategories into live DB if none exist yet
  const subCatLiveCount = db.prepare('SELECT COUNT(*) as cnt FROM parts_subcategories').get().cnt;
  if (subCatLiveCount === 0) {
    const liveCats = db.prepare('SELECT id, name FROM parts_categories').all();
    const subCatMap = {
      'Bc43 52cc':                  ['Piston Kit','Cylinder Kit','Carburettor','Air Filter','Fuel Filter','Spark Plug','Clutch Shoe','Pull Start','Gear Box','Chain Sprocket','Handle Bar','Throttle Cable','Ignition Coil','Primer Bulb','Muffler'],
      'Bc143r':                     ['Piston Kit','Cylinder Kit','Carburettor','Crank Shaft','Gear Box','Clutch Assembly','Pull Start','Air Filter','Fuel Filter','Spark Plug','Handle Bar','Blade Holder','Throttle Cable','Ignition Coil','Muffler'],
      'Cs45 52cc':                  ['Piston Kit','Cylinder Kit','Carburettor','Chain','Guide Bar','Sprocket','Oil Pump','Pull Start','Air Filter','Fuel Filter','Spark Plug','Chain Brake','Clutch Assembly','Handle Bar','Muffler'],
      'Sprayer 139f':               ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Sprayer tu26':               ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Sprayer 768':                ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Battery Sprayer Manual':     ['Pump Motor','Battery 12V','Battery 8V','Nozzle Set','Pressure Hose','Lance Pipe','Tank Lid','Carrying Strap','Filter Screen','On/Off Switch','Wand Assembly','Connector Joint','O-Ring Kit','Spray Gun','Sealing Kit'],
      'Battery Sprayer 2 in 1':     ['Pump Motor','Battery Pack','Nozzle Set','Pressure Hose','Lance Pipe','Tank Lid','Carrying Strap','Filter Screen','Switch Assembly','Wand Assembly','Connector Joint','O-Ring Kit','Spray Gun','Charger','Controller Board'],
      'HTP Power Sprayer':          ['Piston Pump','Pressure Gauge','Hose Pipe','Spray Gun','Nozzle Set','Oil Seal Kit','Valve Assembly','Suction Filter','Delivery Filter','Pressure Regulator','Crankcase','Connecting Rod','Piston Seal','Engine Mount','Frame'],
      'HTP Pump':                   ['Piston Assembly','Cylinder Head','Valve Set','Oil Seal Kit','Pressure Gauge','Suction Hose','Delivery Hose','Spray Gun','Nozzle','Filter','Pressure Regulator','Crankcase','Bearing','Gasket Set','Coupling'],
      'Water Pump':                 ['Impeller','Seal Kit','Bearing','Casing','Back Plate','Suction Strainer','Delivery Valve','Motor Winding','Capacitor','Shaft','Coupling','O-Ring','Gasket','Foot Valve','Pressure Switch'],
      'Power Weeder':               ['Blade Set','Tine Assembly','Gear Box','Belt','Pulley','Handle Bar','Throttle Cable','Engine Mount','Chain Case','Clutch','Drive Shaft','Wheel Set','Tilling Depth Rod','Cover Guard','Bearing Set'],
      'Power Tools':                ['Grinding Disc','Cutting Disc','Carbon Brush','Armature','Field Coil','Chuck','Drill Bit Set','Switch','Bearing','Gear Set','Handle','Guard','Cable','Trigger','Gear Housing'],
      'Stihl FS':                   ['Piston Kit','Cylinder','Carburettor','Air Filter','Fuel Filter','Spark Plug','Clutch','Pull Start','Drive Shaft','Gear Head','Blade','Handle','Throttle Trigger','Ignition Module','Muffler'],
      'Stihl MS':                   ['Piston Kit','Cylinder','Carburettor','Chain','Guide Bar','Sprocket','Oil Pump','Chain Brake','Pull Start','Air Filter','Fuel Filter','Spark Plug','Clutch','Handle','Muffler'],
      'Bearing Grease Oil':         ['Engine Oil 2T','Engine Oil 4T','Gear Oil','Grease Cartridge','Chain Oil','Hydraulic Oil','Bearing Grease','Multi Purpose Grease','White Grease','Penetrating Oil','Foam Air Filter Oil','Bar & Chain Oil','Fuel Stabilizer','Rust Preventive Oil','Carburetor Cleaner'],
      'Generator':                  ['Rotor','Stator Winding','AVR Board','Capacitor','Carbon Brush','Air Filter','Fuel Filter','Spark Plug','Oil Filter','Pull Start','Fuel Pump','Carburetor','Engine Gasket','Voltage Regulator','Control Panel'],
      'Gardening Hand Tools':       ['Pruning Shears','Garden Trowel','Hand Cultivator','Weeder','Garden Fork','Hand Rake','Transplanting Spade','Bulb Planter','Soil Knife','Grafting Knife','Garden Scissors','Dibber','Seed Spreader','Hand Hoe','Gloves'],
      'Car Wash':                   ['Foam Lance','Pressure Washer Nozzle','Wash Mitt','Microfiber Cloth','Car Shampoo','Wheel Brush','Tyre Dressing','Interior Cleaner','Glass Cleaner','Wax Polish','Clay Bar','Spray Bottle','Sponge Pad','Bucket','Hose Connector'],
      'Hand Tools and Accessories': ['Spanner Set','Socket Set','Screwdriver Set','Plier Set','Hammer','Chisel Set','File Set','Hacksaw','Measuring Tape','Spirit Level','Allen Key Set','Torque Wrench','Snap Ring Plier','Pick & Hook Set','Tool Bag'],
      'Carbon Fibre Pole':          ['2 Section Pole','3 Section Pole','4 Section Pole','5 Section Pole','Pole Connector','End Cap','Hand Grip','Clamp Ring','Pole Bag','Brush Head Adapter','Extension Tube','Locking Collar','Flow Through Brush','Window Mop Head','Squeegee Head'],
      'Taparia':                    ['Combination Plier','Long Nose Plier','Diagonal Cutter','Insulated Screwdriver','Ring Spanner','Adjustable Spanner','Pipe Wrench','Ball Pein Hammer','Chipping Hammer','Hacksaw Frame','File Set','Punch Set','Chisel','Allen Key','Try Square'],
      'Cut Off Cutter':             ['Cutting Disc 14"','Cutting Disc 12"','Flange Set','Arbor Washer','Spindle','Bearing','Arm Assembly','Belt','Pulley','Guard','Clamp','Motor Brush','Switch','Capacitor','Handle'],
      'Cut Off Saw':                ['Diamond Blade','Abrasive Blade','Water Kit','Belt','Pulley','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Handle','Anti Vibration Mount','Muffler','Ignition Coil'],
      'Earthauger':                 ['Drill Bit 4"','Drill Bit 6"','Drill Bit 8"','Drill Bit 10"','Drill Bit 12"','Universal Joint','Safety Shear Bolt','Handle Bar','Extension Rod','Fuel Filter','Air Filter','Spark Plug','Carburettor','Clutch Drum','Pull Start'],
      'Fogging Machine':            ['Pump Assembly','Nozzle Jet','Heating Coil','Fuel Tank','Solution Tank','Ignition Unit','Fan Blade','Air Filter','Fuel Filter','Hose Pipe','Strap','Flow Control Valve','Check Valve','Gasket Kit','Handle'],
      'Hedge Trimmer':              ['Blade Assembly','Blade Bolt Set','Gear Box','Handle Bar','Throttle Trigger','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Ignition Coil','Muffler','Anti Vibration','Blade Guard'],
      'Mini Power Tiller':          ['Tine Blade Set','Gear Box','Drive Belt','Pulley','Handle Bar','Throttle Cable','Depth Rod','Side Shield','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Engine Mount'],
      'Petrol Blower':              ['Fan Housing','Impeller','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Throttle Trigger','Ignition Coil','Muffler','Handle','Fuel Tank','Blower Tube','Vacuum Bag','Clutch Drum'],
      'Safety':                     ['Safety Helmet','Face Shield','Safety Goggles','Ear Muff','Gloves Cut Resistant','Gloves Anti Vibration','Safety Boots','Knee Guard','Safety Vest','Chainsaw Chaps','Face Mask','Back Support Belt','Safety Harness','First Aid Kit','Safety Sign'],
      'Sprinkler and Irrigation Gun':['Impact Sprinkler','Micro Sprinkler','Pop Up Sprinkler','Drip Emitter','Irrigation Gun','Rain Gun','Soaker Hose','Drip Tape','End Cap','Connector Elbow','Ball Valve','Pressure Regulator','Filter','Stake','Timer'],
      'Welding Equipment':          ['Welding Rod 2.5mm','Welding Rod 3.15mm','Welding Wire MIG','Welding Mask','Welding Gloves','Earth Clamp','Electrode Holder','Chipping Hammer','Wire Brush','Nozzle','Contact Tip','Gas Regulator','Welding Flux','Anti Spatter','Welding Blanket'],
      'Tea Harvester':              ['Blade Assembly','Blade Bolt','Gear Box','Handle Bar','Bag Frame','Harvest Bag','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Ignition Coil','Muffler','Throttle Cable'],
      'Greaves Engine Lambani':     ['Piston Kit','Cylinder Liner','Connecting Rod','Crankshaft','Cylinder Head','Valve Set','Fuel Pump','Injector','Gasket Set','Oil Filter','Air Filter','Fuel Filter','Starter Motor','Alternator','Governor Assembly'],
      'Bajrangi Pump':              ['Impeller','Pump Casing','Seal Kit','Bearing','Back Plate','Shaft','Coupling','Suction Strainer','Delivery Valve','Foot Valve','Gasket','O-Ring Set','Pressure Switch','Motor Winding','Capacitor'],
      'Kirloskar':                  ['Impeller','Pump Casing','Mechanical Seal','Bearing','Motor Winding','Capacitor','Shaft','Back Cover','Foot Valve','Suction Strainer','Delivery Valve','O-Ring','Gasket Set','Coupling','Control Panel'],
      'K7 Pump':                    ['Impeller','Pump Casing','Seal Kit','Bearing Set','Motor Winding','Capacitor','Shaft','Back Plate','Suction Strainer','Delivery Valve','Foot Valve','Gasket Kit','O-Ring Set','Coupling','Pressure Switch'],
    };
    const insertSubLive = db.prepare('INSERT OR IGNORE INTO parts_subcategories (category_id, name) VALUES (?, ?)');
    for (const cat of liveCats) {
      // Try exact match first, then case-insensitive match
      const subs = subCatMap[cat.name]
        || subCatMap[Object.keys(subCatMap).find(k => k.toLowerCase() === cat.name.toLowerCase())]
        || [];
      if (subs.length) for (const sub of subs) insertSubLive.run(cat.id, sub);
    }
    const totalSeeded = db.prepare('SELECT COUNT(*) as cnt FROM parts_subcategories').get().cnt;
    console.log(`Seeded ${totalSeeded} subcategories across ${liveCats.length} categories.`);
  }

  // Create expense_splits table if not exists
  db.exec(`    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      notes TEXT
    );
  `);

  // Migrate existing expenses: create one split per expense if no splits exist yet
  const existingExpenses = db.prepare('SELECT * FROM expenses').all();
  const insertExpSplit = db.prepare(
    'INSERT OR IGNORE INTO expense_splits (expense_id, payment_method, amount, account_id) VALUES (?, ?, ?, ?)'
  );
  const hasExpSplit = db.prepare('SELECT COUNT(*) as cnt FROM expense_splits WHERE expense_id = ?');
  for (const exp of existingExpenses) {
    if (hasExpSplit.get(exp.id).cnt === 0) {
      insertExpSplit.run(exp.id, exp.payment_method || 'cash', exp.amount, exp.account_id || null);
    }
  }

  // Migrate existing investments: create one split per investment if no splits exist yet
  const existingInvestments = db.prepare('SELECT * FROM investments').all();
  const insertSplit = db.prepare(
    'INSERT OR IGNORE INTO investment_splits (investment_id, payment_method, amount, account_id) VALUES (?, ?, ?, ?)'
  );
  const hasSplit = db.prepare('SELECT COUNT(*) as cnt FROM investment_splits WHERE investment_id = ?');
  for (const inv of existingInvestments) {
    if (hasSplit.get(inv.id).cnt === 0) {
      insertSplit.run(inv.id, inv.payment_method || 'cash', inv.amount, inv.account_id || null);
    }
  }
}

function seedDefaults(db) {
  const bcrypt = require('bcryptjs');

  // Default admin user
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (username, email, password_hash, full_name, role, permissions)
                VALUES (?, ?, ?, ?, ?, ?)`).run(
      'admin', 'admin@workshop.com', hash, 'Administrator', 'admin', JSON.stringify(['*'])
    );
  }

  // Default accounts
  const accountCount = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get();
  if (accountCount.cnt === 0) {
    const accounts = [
      { name: 'Cash', type: 'cash', opening_balance: 0 },
      { name: 'Main Bank Account', type: 'bank', opening_balance: 0 },
      { name: 'UPI', type: 'upi', opening_balance: 0 },
    ];
    const stmt = db.prepare('INSERT INTO accounts (name, type, opening_balance, current_balance) VALUES (?, ?, ?, ?)');
    for (const a of accounts) {
      stmt.run(a.name, a.type, a.opening_balance, a.opening_balance);
    }
  }

  // Default expense categories
  const catCount = db.prepare('SELECT COUNT(*) as cnt FROM expense_categories').get();
  if (catCount.cnt === 0) {
    const cats = ['Spare Parts','Salary','Rent','Electricity','Water','Transport','Fuel','Tools','Machinery','Maintenance','Office Expenses','Marketing','Food','Other'];
    const stmt = db.prepare('INSERT INTO expense_categories (name) VALUES (?)');
    for (const c of cats) stmt.run(c);
  }

  // Default parts categories
  const pCatCount = db.prepare('SELECT COUNT(*) as cnt FROM parts_categories').get();
  if (pCatCount.cnt === 0) {
    const cats = [
      'Bc43 52cc','Bc143r','Cs45 52cc','Sprayer 139f','Sprayer tu26','Sprayer 768',
      'Battery Sprayer Manual','Battery Sprayer 2 in 1','HTP Power Sprayer','HTP Pump',
      'Water Pump','Power Weeder','Power Tools','Stihl FS','Stihl MS',
      'Bearing Grease Oil','Generator','Gardening Hand Tools','Car Wash',
      'Hand Tools and Accessories','Carbon Fibre Pole','Taparia','Cut Off Cutter',
      'Cut Off Saw','Earthauger','Fogging Machine','Hedge Trimmer','Mini Power Tiller',
      'Petrol Blower','Safety','Sprinkler and Irrigation Gun','Welding Equipment',
      'Tea Harvester','Greaves Engine Lambani','Bajrangi Pump','Kirloskar','K7 Pump',
    ];
    const stmt = db.prepare('INSERT INTO parts_categories (name) VALUES (?)');
    for (const c of cats) stmt.run(c);
  }

  // Default parts sub-categories
  const pSubCatCount = db.prepare('SELECT COUNT(*) as cnt FROM parts_subcategories').get();
  if (pSubCatCount.cnt === 0) {
    const subCatMap = {
      'Bc43 52cc':                  ['Piston Kit','Cylinder Kit','Carburettor','Air Filter','Fuel Filter','Spark Plug','Clutch Shoe','Pull Start','Gear Box','Chain Sprocket','Handle Bar','Throttle Cable','Ignition Coil','Primer Bulb','Muffler'],
      'Bc143r':                     ['Piston Kit','Cylinder Kit','Carburettor','Crank Shaft','Gear Box','Clutch Assembly','Pull Start','Air Filter','Fuel Filter','Spark Plug','Handle Bar','Blade Holder','Throttle Cable','Ignition Coil','Muffler'],
      'Cs45 52cc':                  ['Piston Kit','Cylinder Kit','Carburettor','Chain','Guide Bar','Sprocket','Oil Pump','Pull Start','Air Filter','Fuel Filter','Spark Plug','Chain Brake','Clutch Assembly','Handle Bar','Muffler'],
      'Sprayer 139f':               ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Sprayer tu26':               ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Sprayer 768':                ['Piston Kit','Cylinder Kit','Carburettor','Pull Start','Air Filter','Fuel Filter','Spark Plug','Pump Assembly','Pressure Hose','Nozzle Set','Handle Bar','Throttle Cable','Ignition Coil','Muffler','Fuel Tank'],
      'Battery Sprayer Manual':     ['Pump Motor','Battery 12V','Battery 8V','Nozzle Set','Pressure Hose','Lance Pipe','Tank Lid','Carrying Strap','Filter Screen','On/Off Switch','Wand Assembly','Connector Joint','O-Ring Kit','Spray Gun','Sealing Kit'],
      'Battery Sprayer 2 in 1':     ['Pump Motor','Battery Pack','Nozzle Set','Pressure Hose','Lance Pipe','Tank Lid','Carrying Strap','Filter Screen','Switch Assembly','Wand Assembly','Connector Joint','O-Ring Kit','Spray Gun','Charger','Controller Board'],
      'HTP Power Sprayer':          ['Piston Pump','Pressure Gauge','Hose Pipe','Spray Gun','Nozzle Set','Oil Seal Kit','Valve Assembly','Suction Filter','Delivery Filter','Pressure Regulator','Crankcase','Connecting Rod','Piston Seal','Engine Mount','Frame'],
      'HTP Pump':                   ['Piston Assembly','Cylinder Head','Valve Set','Oil Seal Kit','Pressure Gauge','Suction Hose','Delivery Hose','Spray Gun','Nozzle','Filter','Pressure Regulator','Crankcase','Bearing','Gasket Set','Coupling'],
      'Water Pump':                 ['Impeller','Seal Kit','Bearing','Casing','Back Plate','Suction Strainer','Delivery Valve','Motor Winding','Capacitor','Shaft','Coupling','O-Ring','Gasket','Foot Valve','Pressure Switch'],
      'Power Weeder':               ['Blade Set','Tine Assembly','Gear Box','Belt','Pulley','Handle Bar','Throttle Cable','Engine Mount','Chain Case','Clutch','Drive Shaft','Wheel Set','Tilling Depth Rod','Cover Guard','Bearing Set'],
      'Power Tools':                ['Grinding Disc','Cutting Disc','Carbon Brush','Armature','Field Coil','Chuck','Drill Bit Set','Switch','Bearing','Gear Set','Handle','Guard','Cable','Trigger','Gear Housing'],
      'Stihl FS':                   ['Piston Kit','Cylinder','Carburettor','Air Filter','Fuel Filter','Spark Plug','Clutch','Pull Start','Drive Shaft','Gear Head','Blade','Handle','Throttle Trigger','Ignition Module','Muffler'],
      'Stihl MS':                   ['Piston Kit','Cylinder','Carburettor','Chain','Guide Bar','Sprocket','Oil Pump','Chain Brake','Pull Start','Air Filter','Fuel Filter','Spark Plug','Clutch','Handle','Muffler'],
      'Bearing Grease Oil':         ['Engine Oil 2T','Engine Oil 4T','Gear Oil','Grease Cartridge','Chain Oil','Hydraulic Oil','Bearing Grease','Multi Purpose Grease','White Grease','Penetrating Oil','Foam Air Filter Oil','Bar & Chain Oil','Fuel Stabilizer','Rust Preventive Oil','Carburetor Cleaner'],
      'Generator':                  ['Rotor','Stator Winding','AVR Board','Capacitor','Carbon Brush','Air Filter','Fuel Filter','Spark Plug','Oil Filter','Pull Start','Fuel Pump','Carburetor','Engine Gasket','Voltage Regulator','Control Panel'],
      'Gardening Hand Tools':       ['Pruning Shears','Garden Trowel','Hand Cultivator','Weeder','Garden Fork','Hand Rake','Transplanting Spade','Bulb Planter','Soil Knife','Grafting Knife','Garden Scissors','Dibber','Seed Spreader','Hand Hoe','Gloves'],
      'Car Wash':                   ['Foam Lance','Pressure Washer Nozzle','Wash Mitt','Microfiber Cloth','Car Shampoo','Wheel Brush','Tyre Dressing','Interior Cleaner','Glass Cleaner','Wax Polish','Clay Bar','Spray Bottle','Sponge Pad','Bucket','Hose Connector'],
      'Hand Tools and Accessories': ['Spanner Set','Socket Set','Screwdriver Set','Plier Set','Hammer','Chisel Set','File Set','Hacksaw','Measuring Tape','Spirit Level','Allen Key Set','Torque Wrench','Snap Ring Plier','Pick & Hook Set','Tool Bag'],
      'Carbon Fibre Pole':          ['2 Section Pole','3 Section Pole','4 Section Pole','5 Section Pole','Pole Connector','End Cap','Hand Grip','Clamp Ring','Pole Bag','Brush Head Adapter','Extension Tube','Locking Collar','Flow Through Brush','Window Mop Head','Squeegee Head'],
      'Taparia':                    ['Combination Plier','Long Nose Plier','Diagonal Cutter','Insulated Screwdriver','Ring Spanner','Adjustable Spanner','Pipe Wrench','Ball Pein Hammer','Chipping Hammer','Hacksaw Frame','File Set','Punch Set','Chisel','Allen Key','Try Square'],
      'Cut Off Cutter':             ['Cutting Disc 14"','Cutting Disc 12"','Flange Set','Arbor Washer','Spindle','Bearing','Arm Assembly','Belt','Pulley','Guard','Clamp','Motor Brush','Switch','Capacitor','Handle'],
      'Cut Off Saw':                ['Diamond Blade','Abrasive Blade','Water Kit','Belt','Pulley','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Handle','Anti Vibration Mount','Muffler','Ignition Coil'],
      'Earthauger':                 ['Drill Bit 4"','Drill Bit 6"','Drill Bit 8"','Drill Bit 10"','Drill Bit 12"','Universal Joint','Safety Shear Bolt','Handle Bar','Extension Rod','Fuel Filter','Air Filter','Spark Plug','Carburettor','Clutch Drum','Pull Start'],
      'Fogging Machine':            ['Pump Assembly','Nozzle Jet','Heating Coil','Fuel Tank','Solution Tank','Ignition Unit','Fan Blade','Air Filter','Fuel Filter','Hose Pipe','Strap','Flow Control Valve','Check Valve','Gasket Kit','Handle'],
      'Hedge Trimmer':              ['Blade Assembly','Blade Bolt Set','Gear Box','Handle Bar','Throttle Trigger','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Ignition Coil','Muffler','Anti Vibration','Blade Guard'],
      'Mini Power Tiller':          ['Tine Blade Set','Gear Box','Drive Belt','Pulley','Handle Bar','Throttle Cable','Depth Rod','Side Shield','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Engine Mount'],
      'Petrol Blower':              ['Fan Housing','Impeller','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Throttle Trigger','Ignition Coil','Muffler','Handle','Fuel Tank','Blower Tube','Vacuum Bag','Clutch Drum'],
      'Safety':                     ['Safety Helmet','Face Shield','Safety Goggles','Ear Muff','Gloves Cut Resistant','Gloves Anti Vibration','Safety Boots','Knee Guard','Safety Vest','Chainsaw Chaps','Face Mask','Back Support Belt','Safety Harness','First Aid Kit','Safety Sign'],
      'Sprinkler and Irrigation Gun':['Impact Sprinkler','Micro Sprinkler','Pop Up Sprinkler','Drip Emitter','Irrigation Gun','Rain Gun','Soaker Hose','Drip Tape','End Cap','Connector Elbow','Ball Valve','Pressure Regulator','Filter','Stake','Timer'],
      'Welding Equipment':          ['Welding Rod 2.5mm','Welding Rod 3.15mm','Welding Wire MIG','Welding Mask','Welding Gloves','Earth Clamp','Electrode Holder','Chipping Hammer','Wire Brush','Nozzle','Contact Tip','Gas Regulator','Welding Flux','Anti Spatter','Welding Blanket'],
      'Tea Harvester':              ['Blade Assembly','Blade Bolt','Gear Box','Handle Bar','Bag Frame','Harvest Bag','Air Filter','Fuel Filter','Spark Plug','Carburettor','Pull Start','Clutch','Ignition Coil','Muffler','Throttle Cable'],
      'Greaves Engine Lambani':     ['Piston Kit','Cylinder Liner','Connecting Rod','Crankshaft','Cylinder Head','Valve Set','Fuel Pump','Injector','Gasket Set','Oil Filter','Air Filter','Fuel Filter','Starter Motor','Alternator','Governor Assembly'],
      'Bajrangi Pump':              ['Impeller','Pump Casing','Seal Kit','Bearing','Back Plate','Shaft','Coupling','Suction Strainer','Delivery Valve','Foot Valve','Gasket','O-Ring Set','Pressure Switch','Motor Winding','Capacitor'],
      'Kirloskar':                  ['Impeller','Pump Casing','Mechanical Seal','Bearing','Motor Winding','Capacitor','Shaft','Back Cover','Foot Valve','Suction Strainer','Delivery Valve','O-Ring','Gasket Set','Coupling','Control Panel'],
      'K7 Pump':                    ['Impeller','Pump Casing','Seal Kit','Bearing Set','Motor Winding','Capacitor','Shaft','Back Plate','Suction Strainer','Delivery Valve','Foot Valve','Gasket Kit','O-Ring Set','Coupling','Pressure Switch'],
    };
    const getCatId = db.prepare('SELECT id FROM parts_categories WHERE name = ?');
    const insertSub = db.prepare('INSERT OR IGNORE INTO parts_subcategories (category_id, name) VALUES (?, ?)');
    for (const [catName, subs] of Object.entries(subCatMap)) {
      const cat = getCatId.get(catName);
      if (cat) for (const sub of subs) insertSub.run(cat.id, sub);
    }
  }

  // Default settings
  const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM settings').get();
  if (settingsCount.cnt === 0) {
    const defaults = [
      ['business_name', 'My Auto Workshop'],
      ['business_address', '123 Workshop Street, City'],
      ['business_phone', '+91 9999999999'],
      ['business_email', 'info@workshop.com'],
      ['business_gst', ''],
      ['currency', '₹'],
      ['invoice_prefix', 'INV'],
      ['purchase_prefix', 'PUR'],
      ['sale_prefix', 'SAL'],
      ['investment_prefix', 'INV'],
      ['payment_prefix', 'PAY'],
      ['expense_prefix', 'EXP'],
      ['allow_negative_stock', '0'],
      ['low_stock_notify', '1'],
      ['overdue_notify', '1'],
    ];
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of defaults) stmt.run(k, v);
  }
}

module.exports = { getDb, initializeDatabase };
