import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logCallToOnePage } from "@/lib/onepage";

const XP_MAP: Record<string, number> = {
  pledged: 50,
  good_conversation: 50,
  no_answer: 20,
  left_message: 20,
  bad_timing: 30,
};

const ONEPAGE_RESULT_MAP: Record<string, string> = {
  pledged: "interested",
  good_conversation: "interested",
  no_answer: "no_answer",
  left_message: "left_message",
  bad_timing: "bad_timing",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queueId, outcome, pledgeAmount } = body;

    if (!queueId || !outcome) {
      return NextResponse.json(
        { error: "queueId and outcome required" },
        { status: 400 }
      );
    }

    const xp = XP_MAP[outcome] || 20;
    const today = new Date().toISOString().split("T")[0];

    // Mark as called in queue
    await pool.query(
      "UPDATE daily_call_queue SET called = TRUE, outcome = $1, called_at = NOW() WHERE id = $2",
      [outcome, queueId]
    );

    // Get contact info for OnePage logging
    const queueItem = await pool.query(
      "SELECT contact_id, contact_name FROM daily_call_queue WHERE id = $1",
      [queueId]
    );

    if (queueItem.rows.length > 0) {
      const { contact_id, contact_name } = queueItem.rows[0];
      const text =
        outcome === "pledged"
          ? `Pledged $${pledgeAmount || "unknown"}. Logged via FC Dialer.`
          : `Call outcome: ${outcome}. Logged via FC Dialer.`;

      const onePageResult = ONEPAGE_RESULT_MAP[outcome] || "no_answer";

      // Fire and forget — don't block the UX
      logCallToOnePage(contact_id, text, onePageResult).catch((err) =>
        console.error("OnePage log failed:", err)
      );
    }

    // Update session
    await pool.query(
      `UPDATE dialer_sessions
       SET calls_made = calls_made + 1, xp_earned = xp_earned + $1, last_active = NOW()
       WHERE date = $2`,
      [xp, today]
    );

    // Update gamification state
    const gState = await pool.query(
      "SELECT * FROM gamification_state ORDER BY id LIMIT 1"
    );

    if (gState.rows.length === 0) {
      await pool.query(
        `INSERT INTO gamification_state
         (streak_current, streak_max, streak_last_date, xp_total, xp_this_week, level)
         VALUES (1, 1, $1, $2, $2, 1)`,
        [today, xp]
      );
    } else {
      const g = gState.rows[0];
      const lastDate = g.streak_last_date
        ? new Date(g.streak_last_date).toISOString().split("T")[0]
        : null;

      let newStreak = g.streak_current;
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];

      if (lastDate === today) {
        // Already called today, streak stays
      } else if (lastDate === yesterday) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }

      const newMax = Math.max(newStreak, g.streak_max);
      const newXpTotal = g.xp_total + xp;

      // Reset weekly XP on Monday
      const dayOfWeek = new Date().getDay();
      let newXpWeek = g.xp_this_week + xp;
      if (dayOfWeek === 1 && lastDate !== today) {
        newXpWeek = xp;
      }

      const newLevel = Math.floor(newXpTotal / 500) + 1;

      await pool.query(
        `UPDATE gamification_state
         SET streak_current = $1, streak_max = $2, streak_last_date = $3,
             xp_total = $4, xp_this_week = $5, level = $6, updated_at = NOW()
         WHERE id = $7`,
        [newStreak, newMax, today, newXpTotal, newXpWeek, newLevel, g.id]
      );
    }

    // Get updated stats
    const session = await pool.query(
      "SELECT calls_made, xp_earned FROM dialer_sessions WHERE date = $1",
      [today]
    );

    const updatedGState = await pool.query(
      "SELECT * FROM gamification_state ORDER BY id LIMIT 1"
    );

    return NextResponse.json({
      success: true,
      xpAwarded: xp,
      callsToday: session.rows[0]?.calls_made || 0,
      xpToday: session.rows[0]?.xp_earned || 0,
      streak: updatedGState.rows[0]?.streak_current || 0,
      xpThisWeek: updatedGState.rows[0]?.xp_this_week || 0,
      level: updatedGState.rows[0]?.level || 1,
    });
  } catch (err) {
    console.error("Log error:", err);
    return NextResponse.json({ error: "Failed to log call" }, { status: 500 });
  }
}
