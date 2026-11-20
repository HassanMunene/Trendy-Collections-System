<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $path = getenv('TRENDY_DB_PATH') ?: dirname(__DIR__) . '/data/trendy.sqlite';
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0770, true);
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier','cutter','tailor')),
 password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS superadmin_users (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fabrics (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
 category TEXT NOT NULL CHECK(category IN ('curtain','shia','pillow_case','other')),
 material_type TEXT NOT NULL, texture TEXT NOT NULL, color TEXT NOT NULL,
 design TEXT NOT NULL DEFAULT '', width_cm INTEGER,
 shade_code TEXT NOT NULL DEFAULT '', opacity TEXT NOT NULL DEFAULT '',
 weight_gsm INTEGER, care_instructions TEXT NOT NULL DEFAULT '',
 retail_price_cents INTEGER,
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rolls (
 id INTEGER PRIMARY KEY, tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
 fabric_id INTEGER NOT NULL REFERENCES fabrics(id), supplier TEXT NOT NULL DEFAULT '',
 stated_cm INTEGER, received_cm INTEGER NOT NULL CHECK(received_cm>0),
 cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_cents>=0),
 location TEXT NOT NULL DEFAULT 'Main shop',
 dye_lot TEXT NOT NULL DEFAULT '', supplier_building TEXT NOT NULL DEFAULT '',
 supplier_stall TEXT NOT NULL DEFAULT '', invoice_ref TEXT NOT NULL DEFAULT '',
 purchase_date TEXT NOT NULL DEFAULT '', supplier_phone TEXT NOT NULL DEFAULT '',
 included_services TEXT NOT NULL DEFAULT '', remnant_alert_cm INTEGER,
 received_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS roll_movements (
 id INTEGER PRIMARY KEY, roll_id INTEGER NOT NULL REFERENCES rolls(id),
 change_cm INTEGER NOT NULL, kind TEXT NOT NULL, ref_type TEXT NOT NULL, ref_id INTEGER NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES users(id), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs (
 id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE COLLATE NOCASE,
 customer TEXT NOT NULL, room TEXT NOT NULL DEFAULT '',
 output_type TEXT NOT NULL CHECK(output_type IN ('set','piece','shia','pillow_case')),
 output_qty INTEGER NOT NULL CHECK(output_qty>0), include_shia INTEGER NOT NULL DEFAULT 0,
 width_cm INTEGER, drop_cm INTEGER,
 assigned_to INTEGER REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','finished')),
 note TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL REFERENCES users(id),
 finished_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TEXT
);
CREATE TABLE IF NOT EXISTS cuts (
 id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
 roll_id INTEGER NOT NULL REFERENCES rolls(id),
 cut_cm INTEGER NOT NULL CHECK(cut_cm>0), used_cm INTEGER NOT NULL CHECK(used_cm>=0),
 offcut_cm INTEGER NOT NULL CHECK(offcut_cm>=0), waste_cm INTEGER NOT NULL CHECK(waste_cm>=0),
 cut_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(cut_cm=used_cm+offcut_cm+waste_cm)
);
CREATE TABLE IF NOT EXISTS remnants (
 id INTEGER PRIMARY KEY, cut_id INTEGER NOT NULL UNIQUE REFERENCES cuts(id),
 initial_cm INTEGER NOT NULL CHECK(initial_cm>0), remaining_cm INTEGER NOT NULL CHECK(remaining_cm>=0),
 location TEXT NOT NULL DEFAULT 'Offcuts'
);
CREATE TABLE IF NOT EXISTS sewing_entries (
 id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
 cut_id INTEGER NOT NULL REFERENCES cuts(id), sewn_cm INTEGER NOT NULL CHECK(sewn_cm>0),
 worker_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS finished_stock (
 id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id),
 output_type TEXT NOT NULL, initial_qty INTEGER NOT NULL CHECK(initial_qty>0),
 remaining_qty INTEGER NOT NULL CHECK(remaining_qty>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sales (
 id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE COLLATE NOCASE,
 customer TEXT NOT NULL DEFAULT 'Walk-in', total_cents INTEGER NOT NULL CHECK(total_cents>=0),
 paid_cents INTEGER NOT NULL CHECK(paid_cents>=0),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','unpaid')),
 sold_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(paid_cents<=total_cents)
);
CREATE TABLE IF NOT EXISTS sale_lines (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
 source_type TEXT NOT NULL CHECK(source_type IN ('roll','remnant','finished')),
 source_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 unit TEXT NOT NULL CHECK(unit IN ('cm','piece')),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL,
 details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock_adjustments (
 id INTEGER PRIMARY KEY,
 source_type TEXT NOT NULL CHECK(source_type IN ('roll','remnant','finished')),
 source_id INTEGER NOT NULL,
 before_qty INTEGER NOT NULL CHECK(before_qty>=0),
 after_qty INTEGER NOT NULL CHECK(after_qty>=0),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(before_qty!=after_qty)
);
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_orders (
 id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE COLLATE NOCASE,
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 due_date TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
 notes TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL REFERENCES users(id),
 confirmed_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS order_openings (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES customer_orders(id),
 room TEXT NOT NULL, width_cm INTEGER NOT NULL CHECK(width_cm>0),
 drop_cm INTEGER NOT NULL CHECK(drop_cm>0),
 measurement_source TEXT NOT NULL CHECK(measurement_source IN ('customer','staff')),
 notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES customer_orders(id),
 opening_id INTEGER NOT NULL REFERENCES order_openings(id),
 item_type TEXT NOT NULL CHECK(item_type IN ('set','piece','shia','pillow_case')),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 piece_count INTEGER NOT NULL DEFAULT 1 CHECK(piece_count>0),
 fabric_id INTEGER NOT NULL REFERENCES fabrics(id),
 shia_fabric_id INTEGER REFERENCES fabrics(id),
 heading TEXT NOT NULL DEFAULT '', fullness_x100 INTEGER,
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0),
 notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_movements_roll ON roll_movements(roll_id);
CREATE INDEX IF NOT EXISTS idx_cuts_job ON cuts(job_id);
CREATE INDEX IF NOT EXISTS idx_sewing_cut ON sewing_entries(cut_id);
CREATE INDEX IF NOT EXISTS idx_openings_order ON order_openings(order_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
SQL);
    $jobColumns=array_column($pdo->query('PRAGMA table_info(jobs)')->fetchAll(),'name');
    if (!in_array('include_shia',$jobColumns,true)) $pdo->exec('ALTER TABLE jobs ADD COLUMN include_shia INTEGER NOT NULL DEFAULT 0');
    $rollColumns=array_column($pdo->query('PRAGMA table_info(rolls)')->fetchAll(),'name');
    foreach (['dye_lot','supplier_building','supplier_stall','invoice_ref','purchase_date'] as $column) {
        if (!in_array($column,$rollColumns,true)) $pdo->exec("ALTER TABLE rolls ADD COLUMN $column TEXT NOT NULL DEFAULT ''");
    }
    foreach (['supplier_phone','included_services'] as $column) {
        if (!in_array($column,$rollColumns,true)) $pdo->exec("ALTER TABLE rolls ADD COLUMN $column TEXT NOT NULL DEFAULT ''");
    }
    if (!in_array('remnant_alert_cm',$rollColumns,true)) $pdo->exec('ALTER TABLE rolls ADD COLUMN remnant_alert_cm INTEGER');
    $fabricColumns=array_column($pdo->query('PRAGMA table_info(fabrics)')->fetchAll(),'name');
    foreach (['shade_code','opacity','care_instructions'] as $column) {
        if (!in_array($column,$fabricColumns,true)) $pdo->exec("ALTER TABLE fabrics ADD COLUMN $column TEXT NOT NULL DEFAULT ''");
    }
    foreach (['weight_gsm','retail_price_cents'] as $column) {
        if (!in_array($column,$fabricColumns,true)) $pdo->exec("ALTER TABLE fabrics ADD COLUMN $column INTEGER");
    }
}

function row(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql); $stmt->execute($params);
    $result = $stmt->fetch(); return $result === false ? null : $result;
}

function rows(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql); $stmt->execute($params); return $stmt->fetchAll();
}

function execute(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql); $stmt->execute($params); return $stmt->rowCount();
}

function insert(string $sql, array $params = []): int
{
    execute($sql, $params); return (int) db()->lastInsertId();
}

function atomic(callable $fn): mixed
{
    $pdo = db(); $pdo->exec('BEGIN IMMEDIATE');
    try { $result = $fn(); $pdo->exec('COMMIT'); return $result; }
    catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
}

function audit(int $actor, string $action, string $entity, int $id, array $details = []): void
{
    execute('INSERT INTO audit_events(actor_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)',
        [$actor,$action,$entity,$id,json_encode($details, JSON_THROW_ON_ERROR)]);
}

function roll_balance(int $id): ?int
{
    $data = row('SELECT r.received_cm+COALESCE(SUM(m.change_cm),0) balance_cm FROM rolls r LEFT JOIN roll_movements m ON m.roll_id=r.id WHERE r.id=? GROUP BY r.id',[$id]);
    return $data === null ? null : (int)$data['balance_cm'];
}
