import { NextResponse } from "next/server";
import pool, { initTables } from "@/lib/db";
import { fetchDonorContacts, OnePageContact } from "@/lib/onepage";
import { getDonationHistory } from "@/lib/neoncrm";

interface ScoredContact {
  contact: OnePageContact;
  phone: string;
  score: number;
  lastGiftAmount: number | null;
  lastGiftDate: string | null;
  lifetimeGiving: number;
  suggestedAsk: number;
  contextLine: string;
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function monthsSince(dateStr: string | null): string {
  if (!dateStr) return "";
  const months = Math.floor(daysSince(dateStr) / 30);
  if (months === 0) return "this month";
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function calculateSuggestedAsk(
  lastGiftAmount: number | null,
  lifetimeGiving: number
): number {
  if (lastGiftAmount && lastGiftAmount > 0) {
    return Math.round(lastGiftAmount * 1.15 / 10) * 10;
  }
  if (lifetimeGiving > 0) {
    return Math.round((lifetimeGiving / 2) / 10) * 10;
  }
  return 180;
}

function buildContextLine(
  lastGiftAmount: number | null,
  lastGiftDate: string | null,
  lifetimeGiving: number,
  lastContacted: string | null | undefined
): string {
  const parts: string[] = [];

  if (lastGiftAmount && lastGiftDate) {
    parts.push(
      `Gave $${lastGiftAmount.toLocaleString()} ${monthsSince(lastGiftDate)}`
    );
  }

  if (lifetimeGiving > 0) {
    parts.push(`$${lifetimeGiving.toLocaleString()} lifetime`);
  }

  if (lastContacted) {
    const days = daysSince(lastContacted);
    if (days > 0) {
      parts.push(`Last contacted ${days} days ago`);
    }
  }

  return parts.join(". ") + (parts.length > 0 ? "." : "No prior history.");
}

export async function GET() {
  try {
    await initTables();

    const today = new Date().toISOString().split("T")[0];

    // Check if we already have today's queue
    const existing = await pool.query(
      "SELECT * FROM daily_call_queue WHERE date = $1 ORDER BY position",
      [today]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json({ queue: existing.rows });
    }

    // Build fresh queue from OnePage CRM
    const contacts = await fetchDonorContacts();

    if (contacts.length === 0) {
      return NextResponse.json({ queue: [] });
    }

    // Score each contact
    const scored: ScoredContact[] = [];

    for (const contact of contacts) {
      const phone =
        contact.phones && contact.phones.length > 0
          ? contact.phones[0].value
          : null;

      if (!phone) continue;

      const fullName = `${contact.first_name} ${contact.last_name}`.trim();
      const donation = await getDonationHistory(fullName);

      const daysSinceContact = daysSince(contact.last_contacted);
      const daysSinceGift = donation.lastGiftDate
        ? daysSince(donation.lastGiftDate)
        : 9999;

      let score = 0;

      // Priority 1: Lapsed warm donors (gave >$200, not contacted in 60+ days)
      if (
        donation.lifetimeGiving > 200 &&
        daysSinceContact > 60
      ) {
        score += 100;
      }

      // Priority 3: Not contacted in 90+ days
      if (daysSinceContact > 90) {
        score += 50;
      }

      // Priority 4: New contacts (last 30 days)
      if (contact.created_at && daysSince(contact.created_at) < 30) {
        score += 30;
      }

      // Bonus scoring
      score += Math.min(daysSinceGift / 10, 30);
      score += Math.min(donation.lifetimeGiving / 100, 20);
      score += Math.min(daysSinceContact / 10, 20);

      const suggestedAsk = calculateSuggestedAsk(
        donation.lastGiftAmount,
        donation.lifetimeGiving
      );

      const contextLine = buildContextLine(
        donation.lastGiftAmount,
        donation.lastGiftDate,
        donation.lifetimeGiving,
        contact.last_contacted
      );

      scored.push({
        contact,
        phone,
        score,
        lastGiftAmount: donation.lastGiftAmount,
        lastGiftDate: donation.lastGiftDate,
        lifetimeGiving: donation.lifetimeGiving,
        suggestedAsk,
        contextLine,
      });
    }

    // Sort by score descending, take top 8
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8);

    // Insert into daily_call_queue
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      const fullName =
        `${s.contact.first_name} ${s.contact.last_name}`.trim();

      await pool.query(
        `INSERT INTO daily_call_queue
         (date, contact_id, contact_name, phone, last_gift_amount, last_gift_date,
          lifetime_giving, suggested_ask, context_line, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          today,
          s.contact.id,
          fullName,
          s.phone,
          s.lastGiftAmount,
          s.lastGiftDate,
          s.lifetimeGiving,
          s.suggestedAsk,
          s.contextLine,
          i + 1,
        ]
      );
    }

    // Ensure session exists
    const sessionCheck = await pool.query(
      "SELECT id FROM dialer_sessions WHERE date = $1",
      [today]
    );
    if (sessionCheck.rows.length === 0) {
      await pool.query("INSERT INTO dialer_sessions (date) VALUES ($1)", [
        today,
      ]);
    }

    const result = await pool.query(
      "SELECT * FROM daily_call_queue WHERE date = $1 ORDER BY position",
      [today]
    );

    return NextResponse.json({ queue: result.rows });
  } catch (err) {
    console.error("Queue error:", err);
    return NextResponse.json(
      { error: "Failed to load queue" },
      { status: 500 }
    );
  }
}
