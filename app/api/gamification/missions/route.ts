import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM daily_missions WHERE date = CURRENT_DATE LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        date: new Date().toISOString().slice(0, 10),
        missions: [],
        completed: [false, false, false],
      });
    }

    const row = rows[0];
    return NextResponse.json({
      date: row.date,
      missions: [row.mission_1, row.mission_2, row.mission_3],
      completed: [row.completed_1, row.completed_2, row.completed_3],
    });
  } catch (err) {
    console.error("missions error:", err);
    return NextResponse.json({ error: "Failed to load missions" }, { status: 500 });
  }
}
