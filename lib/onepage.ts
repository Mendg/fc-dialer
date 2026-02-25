const BASE_URL = "https://app.onepagecrm.com/api/v3";

function getAuthHeader(): string {
  const userId = process.env.ONEPAGE_USER_ID!;
  const apiKey = process.env.ONEPAGE_API_KEY!;
  return "Basic " + Buffer.from(`${userId}:${apiKey}`).toString("base64");
}

export interface OnePageContact {
  id: string;
  first_name: string;
  last_name: string;
  phones: { type: string; value: string }[];
  tags: string[];
  last_contacted?: string;
  created_at?: string;
}

export async function fetchDonorContacts(): Promise<OnePageContact[]> {
  const allContacts: OnePageContact[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${BASE_URL}/contacts?tag_names[]=FCI+Donor&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!res.ok) {
      console.error("OnePage API error:", res.status, await res.text());
      break;
    }

    const json = await res.json();
    const contacts = json.data?.contacts;

    if (!contacts || contacts.length === 0) break;

    for (const item of contacts) {
      const c = item.contact;
      allContacts.push({
        id: c.id,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        phones: c.phones || [],
        tags: c.tags || [],
        last_contacted: c.last_contacted,
        created_at: c.created_at,
      });
    }

    if (contacts.length < perPage) break;
    page++;
  }

  return allContacts;
}

export async function logCallToOnePage(
  contactId: string,
  text: string,
  callResult: string
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/calls`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contact_id: contactId,
      text,
      call_result: callResult,
      date: new Date().toISOString().split("T")[0],
    }),
  });

  return res.ok;
}
