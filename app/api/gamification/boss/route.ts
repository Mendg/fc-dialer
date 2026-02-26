import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM boss_battle WHERE status = 'active' LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json({ boss: null });
    }

    return NextResponse.json({ boss: rows[0] });
  } catch (err) {
    console.error("boss GET error:", err);
    return NextResponse.json({ error: "Failed to load boss" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sql = getDb();

    if (body.action === "hit") {
      const rows = await sql`
        UPDATE boss_battle
        SET hp_current = hp_current - 1, updated_at = NOW()
        WHERE status = 'active'
        RETURNING *
      `;

      if (rows.length === 0) {
        return NextResponse.json({ error: "No active boss" }, { status: 404 });
      }

      const boss = rows[0];

      if (boss.hp_current <= 0) {
        await sql`UPDATE boss_battle SET status = 'won' WHERE id = ${boss.id}`;

        const achId = `boss_${boss.id}`;
        await sql`
          INSERT INTO achievements (id, metadata)
          VALUES (${achId}, ${JSON.stringify({ name: `Defeated ${boss.contact_name}`, emoji: "🐉" })})
          ON CONFLICT (id) DO NOTHING
        `;

        await sql`
          INSERT INTO xp_events (action_type, xp_earned, contact_id, description)
          VALUES ('boss_win', 500, ${boss.contact_id}, ${`Defeated boss: ${boss.contact_name}`})
        `;
        await sql`
          UPDATE gamification_state
          SET xp_total = xp_total + 500, xp_this_week = xp_this_week + 500, updated_at = NOW()
          WHERE id = 1
        `;

        return NextResponse.json({ boss: { ...boss, hp_current: 0, status: "won" }, defeated: true });
      }

      return NextResponse.json({ boss, defeated: false });
    }

    if (body.action === "new") {
      const { contact_name, goal, hp_max } = body;

      if (!contact_name || !goal) {
        return NextResponse.json({ error: "contact_name and goal required" }, { status: 400 });
      }

      await sql`UPDATE boss_battle SET status = 'abandoned' WHERE status = 'active'`;

      const rows = await sql`
        INSERT INTO boss_battle (contact_id, contact_name, hp_current, hp_max, goal)
        VALUES (${contact_name}, ${contact_name}, ${hp_max ?? 5}, ${hp_max ?? 5}, ${goal})
        RETURNING *
      `;

      return NextResponse.json({ boss: rows[0] });
    }

    return NextResponse.json({ error: "action must be 'hit' or 'new'" }, { status: 400 });
  } catch (err) {
    console.error("boss POST error:", err);
    return NextResponse.json({ error: "Failed to update boss" }, { status: 500 });
  }
}
