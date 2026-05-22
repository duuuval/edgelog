// lib/edgar.ts
//
// Minimal SEC EDGAR client for fetching the most recent 8-K press release
// exhibit text for a given ticker. Used by the diagnostic page to test
// whether better input data (real 8-K vs Finnhub news summaries) improves
// AI brief quality.
//
// EDGAR is free, no API key, ~10 req/sec rate limit.
// MUST send a User-Agent header with contact info or SEC returns 403.

const SEC_BASE = "https://www.sec.gov";
const SEC_DATA = "https://data.sec.gov";

// SEC requires identifying contact info in User-Agent.
// Override via EDGAR_USER_AGENT env var.
const USER_AGENT =
  process.env.EDGAR_USER_AGENT || "Edgelog research@edgelog.local";

const SEC_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json,text/html",
};

export type EdgarFiling = {
  filingDate: string; // YYYY-MM-DD
  accessionNumber: string; // e.g. "0001193125-26-123456"
  primaryDocument: string; // e.g. "ex991.htm"
  filingUrl: string; // human-browseable URL
};

export type Edgar8K = {
  ticker: string;
  cik: string; // 10-digit zero-padded
  companyName: string;
  filing: EdgarFiling;
  pressReleaseText: string; // plain text, HTML stripped
  pressReleaseUrl: string;
};

// ---------- Step 1: ticker → CIK ----------

type TickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

let cikCache: Map<string, { cik: string; name: string }> | null = null;

async function loadTickerMap(): Promise<Map<string, { cik: string; name: string }>> {
  if (cikCache) return cikCache;

  const res = await fetch(`${SEC_BASE}/files/company_tickers.json`, {
    headers: SEC_HEADERS,
    next: { revalidate: 86400 }, // 24h — ticker list rarely changes
  });

  if (!res.ok) {
    throw new Error(`EDGAR ticker map fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, TickerEntry>;
  const map = new Map<string, { cik: string; name: string }>();

  for (const entry of Object.values(data)) {
    map.set(entry.ticker.toUpperCase(), {
      cik: String(entry.cik_str).padStart(10, "0"),
      name: entry.title,
    });
  }

  cikCache = map;
  return map;
}

// ---------- Step 2: CIK → most recent 8-K filing ----------

type SubmissionsResponse = {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
};

async function fetchLatest8KFiling(cik: string): Promise<EdgarFiling | null> {
  const res = await fetch(`${SEC_DATA}/submissions/CIK${cik}.json`, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 }, // 1h — new filings appear during the day
  });

  if (!res.ok) {
    throw new Error(`EDGAR submissions fetch failed for CIK${cik}: ${res.status}`);
  }

  const data = (await res.json()) as SubmissionsResponse;
  const recent = data.filings?.recent;

  if (!recent || !Array.isArray(recent.form)) return null;

  // Walk in order — recent[] is newest-first
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K") {
      const accessionRaw = recent.accessionNumber[i]; // "0001193125-26-123456"
      const accessionNoDashes = accessionRaw.replace(/-/g, "");
      const primaryDoc = recent.primaryDocument[i];

      return {
        filingDate: recent.filingDate[i],
        accessionNumber: accessionRaw,
        primaryDocument: primaryDoc,
        filingUrl: `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/${primaryDoc}`,
      };
    }
  }

  return null;
}

// ---------- Step 3: fetch the press release exhibit text ----------

// 8-K filings contain the form itself (8-k.htm) plus exhibits.
// The press release is almost always Exhibit 99.1, filed as ex99*.htm or ex-99*.htm.
// Strategy: fetch the filing index, find the ex99 exhibit, fetch its HTML.

type FilingIndex = {
  directory: {
    item: Array<{ name: string; type: string }>;
  };
};

async function fetchPressReleaseExhibit(
  cik: string,
  accessionRaw: string
): Promise<{ text: string; url: string } | null> {
  const accessionNoDashes = accessionRaw.replace(/-/g, "");
  const indexUrl = `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/index.json`;

  const indexRes = await fetch(indexUrl, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!indexRes.ok) {
    throw new Error(`EDGAR filing index fetch failed: ${indexRes.status}`);
  }

  const index = (await indexRes.json()) as FilingIndex;
  const items = index.directory?.item || [];

  // Look for ex99 / ex-99 / exhibit99 .htm files (Exhibit 99.x = press release)
  // Skip the main 8-k.htm form document.
  const ex99Match = items.find((item) => {
    const n = item.name.toLowerCase();
    return (
      (n.startsWith("ex99") || n.startsWith("ex-99") || n.includes("exhibit99")) &&
      (n.endsWith(".htm") || n.endsWith(".html"))
    );
  });

  if (!ex99Match) return null;

  const exhibitUrl = `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/${ex99Match.name}`;

  const exRes = await fetch(exhibitUrl, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!exRes.ok) {
    throw new Error(`EDGAR exhibit fetch failed: ${exRes.status}`);
  }

  const html = await exRes.text();
  return { text: stripHtml(html), url: exhibitUrl };
}

// ---------- HTML → plain text ----------

function stripHtml(html: string): string {
  return (
    html
      // Drop scripts/styles entirely
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Convert common block elements to newlines so we don't lose paragraph structure
      .replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Strip all remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, "-")
      .replace(/&#8212;/g, "—")
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// ---------- Public API ----------

export async function fetchLatest8K(ticker: string): Promise<Edgar8K | null> {
  const upper = ticker.toUpperCase();

  const tickerMap = await loadTickerMap();
  const entry = tickerMap.get(upper);
  if (!entry) return null;

  const filing = await fetchLatest8KFiling(entry.cik);
  if (!filing) return null;

  const exhibit = await fetchPressReleaseExhibit(entry.cik, filing.accessionNumber);
  if (!exhibit) {
    // 8-K exists but no Exhibit 99 press release — return what we have with empty text
    return {
      ticker: upper,
      cik: entry.cik,
      companyName: entry.name,
      filing,
      pressReleaseText: "",
      pressReleaseUrl: "",
    };
  }

  return {
    ticker: upper,
    cik: entry.cik,
    companyName: entry.name,
    filing,
    pressReleaseText: exhibit.text,
    pressReleaseUrl: exhibit.url,
  };
}

