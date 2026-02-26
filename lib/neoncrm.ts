const BASE_URL = "https://api.neoncrm.com/v2";

function getAuthHeader(): string {
  const orgId = process.env.NEON_CRM_ORG_ID!;
  const apiKey = process.env.NEON_CRM_API_KEY!;
  return "Basic " + Buffer.from(`${orgId}:${apiKey}`).toString("base64");
}

export interface DonationInfo {
  lastGiftAmount: number | null;
  lastGiftDate: string | null;
  lifetimeGiving: number;
  lastCampaign: string | null;
  lastFund: string | null;
  tributeType: string | null;   // "IN_HONOR_OF" | "IN_MEMORY_OF" | null
  tributeName: string | null;   // who they honored/memorialized
  lastDonationNote: string | null;
  donationCount: number;
  neonAccountId: string | null;
}

export async function getDonationHistory(name: string): Promise<DonationInfo> {
  const empty: DonationInfo = {
    lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0,
    lastCampaign: null, lastFund: null, tributeType: null, tributeName: null,
    lastDonationNote: null, donationCount: 0, neonAccountId: null,
  };

  try {
    const parts = name.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    const searchRes = await fetch(`${BASE_URL}/accounts/search`, {
      method: "POST",
      headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        searchFields: [
          { field: "First Name", operator: "CONTAIN", value: firstName },
          { field: "Last Name", operator: "CONTAIN", value: lastName },
        ],
        outputFields: ["Account ID", "First Name", "Last Name"],
        pagination: { currentPage: 0, pageSize: 5 },
      }),
    });

    if (!searchRes.ok) return empty;
    const searchData = await searchRes.json();
    const accounts = searchData.searchResults || [];
    if (accounts.length === 0) return empty;

    const accountId = accounts[0]["Account ID"];

    const donationsRes = await fetch(
      `${BASE_URL}/accounts/${accountId}/donations?page=0&pageSize=100`,
      { headers: { Authorization: getAuthHeader() } }
    );

    if (!donationsRes.ok) return { ...empty, neonAccountId: accountId };

    const donationsData = await donationsRes.json();
    const donations = donationsData.donations || [];
    if (donations.length === 0) return { ...empty, neonAccountId: accountId };

    let lifetimeGiving = 0;
    let lastGiftAmount: number | null = null;
    let lastGiftDate: string | null = null;
    let lastCampaign: string | null = null;
    let lastFund: string | null = null;
    let tributeType: string | null = null;
    let tributeName: string | null = null;
    let lastDonationNote: string | null = null;

    for (const d of donations) {
      const amount = parseFloat(d.amount || "0");
      lifetimeGiving += amount;

      const date = d.date || d.donationDate;
      if (date && (!lastGiftDate || date > lastGiftDate)) {
        lastGiftDate = date;
        lastGiftAmount = amount;
        // Campaign
        lastCampaign = d.campaign?.name || d.campaignName || null;
        // Fund
        lastFund = d.fund?.name || d.fundName || null;
        // Tribute (in honor/memory of)
        if (d.tribute) {
          tributeType = d.tribute.tributeType || null;
          tributeName = d.tribute.tributeName || d.tribute.name || null;
        }
        // Notes
        lastDonationNote = d.note || d.notes || null;
      }
    }

    return {
      lastGiftAmount, lastGiftDate, lifetimeGiving,
      lastCampaign, lastFund, tributeType, tributeName,
      lastDonationNote, donationCount: donations.length,
      neonAccountId: accountId,
    };
  } catch (err) {
    console.error("Neon CRM error:", err);
    return empty;
  }
}
