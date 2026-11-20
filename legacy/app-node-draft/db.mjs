import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDb(path = process.env.TRENDY_DB_PATH || resolve('data/trendy.sqlite')) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier','cutter','tailor')),
      password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fabrics (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      category TEXT NOT NULL CHECK(category IN ('curtain','shia','pillow_case','other')),
      material_type TEXT NOT NULL, texture TEXT NOT NULL, color TEXT NOT NULL,
      design TEXT NOT NULL DEFAULT '', width_cm INTEGER,
      created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id INTEGER PRIMARY KEY, tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
      fabric_id INTEGER NOT NULL REFERENCES fabrics(id), supplier TEXT NOT NULL DEFAULT '',
      stated_cm INTEGER, received_cm INTEGER NOT NULL CHECK(received_cm > 0),
      cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_cents >= 0),
      location TEXT NOT NULL DEFAULT 'Main shop',
      received_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS roll_movements (
      id INTEGER PRIMARY KEY, roll_id INTEGER NOT NULL REFERENCES rolls(id),
      change_cm INTEGER NOT NULL, kind TEXT NOT NULL,
      ref_type TEXT NOT NULL, ref_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL REFERENCES users(id), note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE COLLATE NOCASE,
      customer TEXT NOT NULL, room TEXT NOT NULL DEFAULT '',
      output_type TEXT NOT NULL CHECK(output_type IN ('set','piece','shia','pillow_case')),
      output_qty INTEGER NOT NULL CHECK(output_qty > 0),
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
      cut_cm INTEGER NOT NULL CHECK(cut_cm > 0),
      used_cm INTEGER NOT NULL CHECK(used_cm >= 0),
      offcut_cm INTEGER NOT NULL CHECK(offcut_cm >= 0),
      waste_cm INTEGER NOT NULL CHECK(waste_cm >= 0),
      cut_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(cut_cm = used_cm + offcut_cm + waste_cm)
    );
    CREATE TABLE IF NOT EXISTS sewing_entries (
      id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
      cut_id INTEGER NOT NULL REFERENCES cuts(id),
      sewn_cm INTEGER NOT NULL CHECK(sewn_cm > 0),
      worker_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS finished_stock (
      id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id),
      output_type TEXT NOT NULL, initial_qty INTEGER NOT NULL CHECK(initial_qty > 0),
      remaining_qty INTEGER NOT NULL CHECK(remaining_qty >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE COLLATE NOCASE,
      customer TEXT NOT NULL DEFAULT 'Walk-in',
      total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
      paid_cents INTEGER NOT NULL CHECK(paid_cents >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','unpaid')),
      sold_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(paid_cents <= total_cents)
    );
    CREATE TABLE IF NOT EXISTS sale_lines (
      id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
      source_type TEXT NOT NULL CHECK(source_type IN ('roll','finished')),
      source_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL CHECK(unit IN ('cm','piece')),
      unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
      line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL,
      details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_roll_movements_roll ON roll_movements(roll_id);
    CREATE INDEX IF NOT EXISTS idx_cuts_job ON cuts(job_id);
    CREATE INDEX IF NOT EXISTS idx_sewing_cut ON sewing_entries(cut_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function audit(db, actor, action, entity, entityId, details = {}) {
  db.prepare('INSERT INTO audit_events(actor_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)')
    .run(actor, action, entity, entityId, JSON.stringify(details));
}
