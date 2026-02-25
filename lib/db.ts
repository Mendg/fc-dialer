import { Pool } from "pg";

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
      called_at TIMESTAMPTZ
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
}
