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
}

export async function getDonationHistory(
  name: string
): Promise<DonationInfo> {
  try {
    const searchUrl = `${BASE_URL}/accounts?searchFields=First Name,Last Name&outputFields=Account ID,First Name,Last Name,Donation Amount,Donation Date&userType=INDIVIDUAL&page=0&pageSize=10`;

    const parts = name.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    const url = `${BASE_URL}/accounts/search`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchFields: [
          {
            field: "First Name",
            operator: "CONTAIN",
            value: firstName,
          },
          {
            field: "Last Name",
            operator: "CONTAIN",
            value: lastName,
          },
        ],
        outputFields: [
          "Account ID",
          "First Name",
          "Last Name",
        ],
        pagination: {
          currentPage: 0,
          pageSize: 5,
        },
      }),
    });

    if (!res.ok) {
      return { lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0 };
    }

    const data = await res.json();
    const accounts = data.searchResults || [];

    if (accounts.length === 0) {
      return { lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0 };
    }

    const accountId = accounts[0]["Account ID"];

    const donationsRes = await fetch(
      `${BASE_URL}/accounts/${accountId}/donations?page=0&pageSize=100`,
      {
        headers: { Authorization: getAuthHeader() },
      }
    );

    if (!donationsRes.ok) {
      return { lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0 };
    }

    const donationsData = await donationsRes.json();
    const donations = donationsData.donations || [];

    if (donations.length === 0) {
      return { lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0 };
    }

    let lifetimeGiving = 0;
    let lastGiftAmount: number | null = null;
    let lastGiftDate: string | null = null;

    for (const d of donations) {
      const amount = parseFloat(d.amount || "0");
      lifetimeGiving += amount;

      const date = d.date || d.donationDate;
      if (date && (!lastGiftDate || date > lastGiftDate)) {
        lastGiftDate = date;
        lastGiftAmount = amount;
      }
    }

    return { lastGiftAmount, lastGiftDate, lifetimeGiving };
  } catch (err) {
    console.error("Neon CRM error:", err);
    return { lastGiftAmount: null, lastGiftDate: null, lifetimeGiving: 0 };
  }
}
