import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logCallToOnePage } from "@/lib/onepage";

const BASE_XP: Record<string, number> = {
  pledged: 50,
  good_conversation: 50,
  no_answer: 20,
  left_message: 20,
  bad_timing: 30,
};

const REWARDS = {
  common:    ["☕ Coffee break (5 min)", "🍫 Grab a snack", "📱 5 min scroll time", "🚶 Quick stretch", "💧 Get some water"],
  uncommon:  ["📱 15 min free time", "☕ Fancy coffee — you earned it", "🎵 Blast your favorite song", "🍕 Good lunch today"],
  rare:      ["🎮 30 min gaming / TV tonight", "🍣 Nice lunch out", "🛍️ Small treat — up to $20", "🎬 Movie tonight"],
  epic:      ["🍽️ Nice dinner out", "🛍️ Shopping trip — $50", "🎁 Buy yourself something good"],
  legendary: ["🏆 Take a half day — you crushed it", "✈️ Plan a weekend away", "🛍️ Big splurge — $100+"],
};

type RewardTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

function rollReward(outcome: string): { xpMultiplier: number; tier: RewardTier | null; rewardText: string | null } {
  // 70% hit, 30% nothing
  const hits = Math.random() < 0.70;

  if (!hits) {
    // Legendary override: 5% chance regardless
    if (Math.random() < 0.05) {
      const text = REWARDS.legendary[Math.floor(Math.random() * REWARDS.legendary.length)];
      return { xpMultiplier: 5, tier: "legendary", rewardText: text };
    }
    return { xpMultiplier: 1, tier: null, rewardText: null };
  }

  // XP multiplier roll (independent of reward tier)
  const xpRoll = Math.random();
  let xpMultiplier = 1;
  if (xpRoll < 0.05) xpMultiplier = 5;       // 5% legendary
  else if (xpRoll < 0.15) xpMultiplier = 3;  // 10% epic
  else if (xpRoll < 0.35) xpMultiplier = 2;  // 20% rare
  else xpMultiplier = 1;                      // 65% normal

  // Reward tier roll
  const tierRoll = Math.random();
  let tier: RewardTier;
  if (tierRoll < 0.01) tier = "legendary";
  else if (tierRoll < 0.05) tier = "epic";
  else if (tierRoll < 0.20) tier = "rare";
  else if (tierRoll < 0.50) tier = "uncommon";
  else tier = "common";

  const pool = REWARDS[tier];
  const rewardText = pool[Math.floor(Math.random() * pool.length)];
  return { xpMultiplier, tier, rewardText };
}

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

    const baseXp = BASE_XP[outcome] || 20;
    const { xpMultiplier, tier, rewardText } = rollReward(outcome);
    const xp = Math.round(baseXp * xpMultiplier);
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
      xpMultiplier,
      rewardTier: tier,
      rewardText,
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
