// lib/edgar.ts
//
// Minimal SEC EDGAR client for fetching the most recent earnings-related 8-K
// for a given ticker. Used by the diagnostic page (and future production
// brief endpoint) to feed real filing text into the AI.
//
// Returns the primary 8-K document (the form itself) as lightly-cleaned HTML.
// Under Item 2.02, the form is required to disclose results of operations,
// which means the key earnings information is reliably present in the primary
// document — separate Exhibit 99 press releases are common but their filenames
// vary too much across filers to detect reliably.
//
// Filing selection: prefers 8-Ks that report Item 2.02 (Results of Operations
// and Financial Condition). Falls back to most recent 8-K if no 2.02 filing
// found in the recent set.
//
// EDGAR is free, no API key, ~10 req/sec rate limit.
// MUST send a User-Agent header with contact info or SEC returns 403.

const SEC_BASE = "https://www.sec.gov";
const SEC_DATA = "https://data.sec.gov";

const USER_AGENT =
  process.env.EDGAR_USER_AGENT || "Edgelog research@edgelog.local";

const SEC_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json,text/html",
};

export type EdgarFiling = {
  filingDate: string; // YYYY-MM-DD
  accessionNumber: string; // e.g. "0001193125-26-123456"
  primaryDocument: string; // filename of the primary 8-K form document
  filingUrl: string; // human-browseable URL to the primary document
  items: string; // raw items string from EDGAR e.g. "2.02,9.01"
  isEarningsFiling: boolean; // true if items includes 2.02
};

export type Edgar8K = {
  ticker: string;
  cik: string;
  companyName: string;
  filing: EdgarFiling;
  documentHtml: string; // cleaned HTML of the primary 8-K document
  documentUrl: string;
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
    next: { revalidate: 86400 },
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

// ---------- Step 2: CIK → most recent EARNINGS 8-K ----------
//
// SEC submissions JSON includes per-filing `items` listing the 8-K Item codes
// reported (e.g. "2.02,9.01"). We prefer filings with Item 2.02 ("Results of
// Operations and Financial Condition") — these are earnings releases. If none
// found in the recent batch, fall back to the most recent 8-K of any kind.

type SubmissionsResponse = {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      items: string[];
    };
  };
};

function isEarnings(items: string): boolean {
  if (!items) return false;
  // Item codes look like "2.02" or "2.02,9.01" — check token boundary
  return /\b2\.02\b/.test(items);
}

async function fetchLatest8KFiling(cik: string): Promise<EdgarFiling | null> {
  const res = await fetch(`${SEC_DATA}/submissions/CIK${cik}.json`, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`EDGAR submissions fetch failed for CIK${cik}: ${res.status}`);
  }

  const data = (await res.json()) as SubmissionsResponse;
  const recent = data.filings?.recent;

  if (!recent || !Array.isArray(recent.form)) return null;

  const buildFiling = (i: number, isEarningsFiling: boolean): EdgarFiling => {
    const accessionRaw = recent.accessionNumber[i];
    const accessionNoDashes = accessionRaw.replace(/-/g, "");
    const primaryDoc = recent.primaryDocument[i];
    return {
      filingDate: recent.filingDate[i],
      accessionNumber: accessionRaw,
      primaryDocument: primaryDoc,
      filingUrl: `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/${primaryDoc}`,
      items: recent.items?.[i] || "",
      isEarningsFiling,
    };
  };

  // Pass 1: earnings 8-K (Item 2.02)
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K" && isEarnings(recent.items?.[i] || "")) {
      return buildFiling(i, true);
    }
  }

  // Pass 2: any 8-K (fallback)
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "8-K") {
      return buildFiling(i, false);
    }
  }

  return null;
}

// ---------- Step 3: fetch the primary 8-K document ----------
//
// Just fetch whatever the submissions JSON says is the primary document for
// this filing. No regex guessing, no exhibit hunting. The 8-K form itself is
// required to disclose results under Item 2.02, so the key information is
// reliably present here even when separate exhibits exist.

async function fetchPrimaryDocument(
  cik: string,
  accessionRaw: string,
  primaryDocument: string
): Promise<{ html: string; url: string } | null> {
  const accessionNoDashes = accessionRaw.replace(/-/g, "");
  const url = `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/${primaryDocument}`;

  const res = await fetch(url, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`EDGAR document fetch failed (${res.status}): ${url}`);
  }

  const rawHtml = await res.text();
  return { html: cleanHtml(rawHtml), url };
}

// ---------- HTML light cleanup ----------
//
// Drop styling/markup noise; keep structural information (tables, headers,
// lists, emphasis).

function cleanHtml(html: string): string {
  let out = html;

  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<link\b[^>]*\/?>/gi, "");
  out = out.replace(/<meta\b[^>]*\/?>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\/?ix:[a-z]+[^>]*>/gi, "");
  out = out.replace(/<\/?xbrli:[a-z]+[^>]*>/gi, "");
  out = out.replace(/<img\b[^>]*src=["']data:[^"']*["'][^>]*\/?>/gi, "");
  out = out.replace(/<\/?font\b[^>]*>/gi, "");

  out = out.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, (_match, tag, attrs) => {
    const t = tag.toLowerCase();
    if (t === "html" || t === "head" || t === "body" || t === "form") return "";
    if (t === "a") {
      const hrefMatch = attrs.match(/\bhref=["']([^"']*)["']/i);
      return hrefMatch ? `<a href="${hrefMatch[1]}">` : `<a>`;
    }
    return `<${t}>`;
  });

  out = out.replace(/<\/(html|head|body|form)>/gi, "");

  out = out
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
    .replace(/&#8212;/g, "—");

  out = out.replace(/>\s+</g, "><");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

// ---------- Public API ----------

export async function fetchLatest8K(ticker: string): Promise<Edgar8K | null> {
  const upper = ticker.toUpperCase();

  const tickerMap = await loadTickerMap();
  const entry = tickerMap.get(upper);
  if (!entry) return null;

  const filing = await fetchLatest8KFiling(entry.cik);
  if (!filing) return null;

  const doc = await fetchPrimaryDocument(
    entry.cik,
    filing.accessionNumber,
    filing.primaryDocument
  );

  if (!doc) {
    return {
      ticker: upper,
      cik: entry.cik,
      companyName: entry.name,
      filing,
      documentHtml: "",
      documentUrl: "",
    };
  }

  return {
    ticker: upper,
    cik: entry.cik,
    companyName: entry.name,
    filing,
    documentHtml: doc.html,
    documentUrl: doc.url,
  };
}
