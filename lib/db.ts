import { Pool } from "pg";
import { neon } from "@neondatabase/serverless";

export function getDb() {
  return neon(process.env.DATABASE_URL!);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export default pool;

export async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_call_queue (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      contact_id TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      last_gift_amount NUMERIC,
      last_gift_date DATE,
      lifetime_giving NUMERIC DEFAULT 0,
      suggested_ask NUMERIC,
      context_line TEXT,
      position INT,
      called BOOLEAN DEFAULT FALSE,
      outcome TEXT,
      called_at TIMESTAMPTZ,
      skip_count INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dialer_sessions (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      calls_made INT DEFAULT 0,
      xp_earned INT DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      last_active TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gamification_state (
      id SERIAL PRIMARY KEY,
      streak_current INT DEFAULT 0,
      streak_max INT DEFAULT 0,
      streak_last_date DATE,
      xp_total INT DEFAULT 0,
      xp_this_week INT DEFAULT 0,
      level INT DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add skip_count column if missing (migration)
  await pool.query(`
    ALTER TABLE daily_call_queue ADD COLUMN IF NOT EXISTS skip_count INT DEFAULT 0;
  `).catch(() => {});

  // Deduplicate: keep only the lowest-id row per (date, contact_id)
  await pool.query(`
    DELETE FROM daily_call_queue a
    USING daily_call_queue b
    WHERE a.date = b.date
      AND a.contact_id = b.contact_id
      AND a.id > b.id;
  `).catch(() => {});

  // Add unique constraint if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_call_queue_date_contact_id_key'
      ) THEN
        ALTER TABLE daily_call_queue
          ADD CONSTRAINT daily_call_queue_date_contact_id_key
          UNIQUE (date, contact_id);
      END IF;
    END $$;
  `).catch(() => {});
}
