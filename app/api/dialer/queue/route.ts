import { NextResponse } from "next/server";
import pool, { initTables } from "@/lib/db";
import { fetchDonorContacts, getRecentCallNotes, OnePageContact } from "@/lib/onepage";
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
  lastCampaign: string | null;
  lastFund: string | null;
  tributeType: string | null;
  tributeName: string | null;
  lastDonationNote: string | null;
  donationCount: number;
  lastCallNote: string | null;
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
  lastContacted: string | null | undefined,
  lastCampaign: string | null,
  tributeType: string | null,
  tributeName: string | null,
  donationCount: number,
  lastCallNote: string | null,
): string {
  const parts: string[] = [];

  if (lastGiftAmount && lastGiftDate) {
    let giftLine = `Last gift: $${lastGiftAmount.toLocaleString()} (${monthsSince(lastGiftDate)})`;
    if (lastCampaign) giftLine += ` — ${lastCampaign}`;
    parts.push(giftLine);
  }

  if (tributeType && tributeName) {
    const honorType = tributeType === "IN_MEMORY_OF" ? "In memory of" : "In honor of";
    parts.push(`${honorType} ${tributeName}`);
  }

  if (lifetimeGiving > 0) {
    parts.push(`$${lifetimeGiving.toLocaleString()} lifetime (${donationCount} gift${donationCount !== 1 ? "s" : ""})`);
  }

  if (lastContacted) {
    const days = daysSince(lastContacted);
    if (days > 0) parts.push(`Last contacted ${days} days ago`);
  }

  if (lastCallNote && lastCallNote.length > 0) {
    const truncated = lastCallNote.length > 80 ? lastCallNote.slice(0, 80) + "…" : lastCallNote;
    parts.push(`Last note: "${truncated}"`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No prior history.";
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
      const [donation, callNotes] = await Promise.all([
        getDonationHistory(fullName),
        getRecentCallNotes(contact.id),
      ]);

      const lastCallNote = callNotes.length > 0 ? callNotes[0].text : null;
      const daysSinceContact = daysSince(contact.last_contacted);
      const daysSinceGift = donation.lastGiftDate ? daysSince(donation.lastGiftDate) : 9999;

      let score = 0;

      // Lapsed warm donors (gave >$200, not contacted in 60+ days)
      if (donation.lifetimeGiving > 200 && daysSinceContact > 60) score += 100;
      // Not contacted in 90+ days
      if (daysSinceContact > 90) score += 50;
      // New contacts (last 30 days)
      if (contact.created_at && daysSince(contact.created_at) < 30) score += 30;
      // Tribute donors are high-value — keep them warm
      if (donation.tributeName) score += 40;

      // Bonus scoring
      score += Math.min(daysSinceGift / 10, 30);
      score += Math.min(donation.lifetimeGiving / 100, 20);
      score += Math.min(daysSinceContact / 10, 20);

      const suggestedAsk = calculateSuggestedAsk(donation.lastGiftAmount, donation.lifetimeGiving);
      const contextLine = buildContextLine(
        donation.lastGiftAmount, donation.lastGiftDate, donation.lifetimeGiving,
        contact.last_contacted, donation.lastCampaign, donation.tributeType,
        donation.tributeName, donation.donationCount, lastCallNote,
      );

      scored.push({
        contact, phone, score,
        lastGiftAmount: donation.lastGiftAmount,
        lastGiftDate: donation.lastGiftDate,
        lifetimeGiving: donation.lifetimeGiving,
        suggestedAsk, contextLine,
        lastCampaign: donation.lastCampaign,
        lastFund: donation.lastFund,
        tributeType: donation.tributeType,
        tributeName: donation.tributeName,
        lastDonationNote: donation.lastDonationNote,
        donationCount: donation.donationCount,
        lastCallNote,
      });
    }

    // Sort by score descending, take top 30
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 30);

    // Insert into daily_call_queue
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      const fullName =
        `${s.contact.first_name} ${s.contact.last_name}`.trim();

      await pool.query(
        `INSERT INTO daily_call_queue
         (date, contact_id, contact_name, phone, last_gift_amount, last_gift_date,
          lifetime_giving, suggested_ask, context_line, last_campaign, last_fund,
          tribute_type, tribute_name, last_donation_note, donation_count, last_call_note, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (date, contact_id) DO UPDATE SET
           context_line = EXCLUDED.context_line,
           last_campaign = EXCLUDED.last_campaign,
           last_fund = EXCLUDED.last_fund,
           tribute_type = EXCLUDED.tribute_type,
           tribute_name = EXCLUDED.tribute_name,
           last_call_note = EXCLUDED.last_call_note`,
        [
          today, s.contact.id, fullName, s.phone,
          s.lastGiftAmount, s.lastGiftDate, s.lifetimeGiving,
          s.suggestedAsk, s.contextLine,
          s.lastCampaign, s.lastFund, s.tributeType, s.tributeName,
          s.lastDonationNote, s.donationCount, s.lastCallNote, i + 1,
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
