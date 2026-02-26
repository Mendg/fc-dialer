import { NextResponse } from "next/server";

export async function GET() {
  try {
    const orgId = process.env.NEON_CRM_ORG_ID ?? "friendshipcircle";
    const apiKey = process.env.NEON_CRM_API_KEY ?? "415cb83667cb9c70fce4d3b4d9a693c0";
    const auth = "Basic " + Buffer.from(`${orgId}:${apiKey}`).toString("base64");

    const res = await fetch("https://api.neoncrm.com/v2/donations", {
      headers: { Authorization: auth },
    });

    let raised = 0;

    if (res.ok) {
      const data = await res.json();
      const donations = data?.donations ?? [];
      for (const d of donations) {
        const donationDate = d.donationDate ?? d.date ?? "";
        if (donationDate >= "2026-01-01" && donationDate <= "2026-04-30") {
          raised += parseFloat(d.donationAmount ?? d.amount ?? "0");
        }
      }
    } else {
      const searchRes = await fetch("https://api.neoncrm.com/v2/donations/search", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          searchFields: [
            { field: "Donation Date", operator: "GREATER_AND_EQUAL", value: "2026-01-01" },
            { field: "Donation Date", operator: "LESS_AND_EQUAL", value: "2026-04-30" },
          ],
          outputFields: ["Donation Amount", "Donation Date"],
          pagination: { currentPage: 1, pageSize: 200 },
        }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results = searchData?.searchResults ?? [];
        for (const r of results) {
          raised += parseFloat(r["Donation Amount"] ?? "0");
        }
      }
    }

    const goal = 40000;
    const percent = Math.round((raised / goal) * 100);

    const jan1 = new Date("2026-01-01");
    const now = new Date();
    const weeks_elapsed = Math.max(1, Math.ceil((now.getTime() - jan1.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const total_weeks = 17;
    const pace_per_week = goal / total_weeks;
    const expected = pace_per_week * weeks_elapsed;
    const on_pace = raised >= expected;

    return NextResponse.json({ goal, raised, percent, weeks_elapsed, total_weeks, on_pace });
  } catch (err) {
    console.error("season error:", err);
    return NextResponse.json({ error: "Failed to load season data" }, { status: 500 });
  }
}
