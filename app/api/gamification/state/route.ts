import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();

    let rows = await sql`SELECT * FROM gamification_state WHERE id = 1`;

    if (rows.length === 0) {
      rows = await sql`
        INSERT INTO gamification_state (id, streak_current, streak_max, xp_total, xp_this_week, level)
        VALUES (1, 0, 0, 0, 0, 1)
        RETURNING *
      `;
    }

    const s = rows[0];
    return NextResponse.json({
      streak_current: s.streak_current,
      streak_max: s.streak_max,
      xp_total: s.xp_total,
      xp_this_week: s.xp_this_week,
      level: s.level,
      streak_last_date: s.streak_last_date,
    });
  } catch (err) {
    console.error("gamification state error:", err);
    return NextResponse.json({ error: "Failed to load state" }, { status: 500 });
  }
}
