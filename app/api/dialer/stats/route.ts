import { NextResponse } from "next/server";
import pool, { initTables } from "@/lib/db";

export async function GET() {
  try {
    await initTables();

    const today = new Date().toISOString().split("T")[0];

    const session = await pool.query(
      "SELECT calls_made, xp_earned FROM dialer_sessions WHERE date = $1",
      [today]
    );

    const gState = await pool.query(
      "SELECT * FROM gamification_state ORDER BY id LIMIT 1"
    );

    return NextResponse.json({
      callsToday: session.rows[0]?.calls_made || 0,
      xpToday: session.rows[0]?.xp_earned || 0,
      streak: gState.rows[0]?.streak_current || 0,
      xpThisWeek: gState.rows[0]?.xp_this_week || 0,
      xpTotal: gState.rows[0]?.xp_total || 0,
      level: gState.rows[0]?.level || 1,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
