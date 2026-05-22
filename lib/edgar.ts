// lib/edgar.ts
//
// Minimal SEC EDGAR client for fetching the most recent earnings-related 8-K
// press release exhibit for a given ticker. Used by the diagnostic page (and
// future production brief endpoint) to feed real filing text into the AI.
//
// Returns lightly-cleaned HTML preserving structural tags (tables, headers,
// paragraphs, lists) — models read structure better than flattened text.
//
// EDGAR is free, no API key, ~10 req/sec rate limit.
// MUST send a User-Agent header with contact info or SEC returns 403.
//
// Filing selection: prefers 8-Ks that report Item 2.02 (Results of Operations
// and Financial Condition) — the SEC-standard tag for earnings releases.
// Falls back to most recent 8-K if no 2.02 filing found in the recent set.

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
  primaryDocument: string; // e.g. "ex991.htm"
  filingUrl: string; // human-browseable URL
  items: string; // raw items string from EDGAR e.g. "2.02,9.01"
  isEarningsFiling: boolean; // true if items includes 2.02
};

export type Edgar8K = {
  ticker: string;
  cik: string;
  companyName: string;
  filing: EdgarFiling;
  pressReleaseHtml: string;
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
      items: string[]; // 8-K Item codes, comma-separated; "" for non-8-K
    };
  };
};

function isEarnings(items: string): boolean {
  if (!items) return false;
  // Item codes look like "2.02" or "2.02,9.01" — check token boundary so
  // "12.02" wouldn't match "2.02" (no such item exists today, but be safe).
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

  // First pass: look for an earnings 8-K (Item 2.02)
  // Second pass (fallback): any 8-K
  // recent[] is newest-first.

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

  // Pass 1: earnings 8-K
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

// ---------- Step 3: fetch the press release exhibit ----------
//
// Exhibit 99.x is the universal SEC convention for press release attachments
// on 8-Ks. Filenames vary considerably across filers — common patterns:
//   ex99.htm, ex991.htm, ex99-1.htm, ex_99.htm, ex-99-1.htm
//   exhibit99.htm, exhibit991.htm, exhibit-99-1.htm
//   tm262345d1_ex99-1.htm  (lots of filers prefix with a doc ID)
//   a991.htm, a99-1.htm
//   pressrelease.htm, prelease.htm, earningsrelease.htm (rare but seen)
//
// Strategy: try a series of regex matchers in order from most-specific to
// least-specific. First match wins.

type FilingIndex = {
  directory: {
    item: Array<{ name: string; type: string }>;
  };
};

function findPressReleaseFilename(items: Array<{ name: string }>): string | null {
  const names = items.map((it) => ({ orig: it.name, lower: it.name.toLowerCase() }));

  // Skip files that are clearly not exhibits (the form itself, signed docs, etc.)
  const isForm8K = (n: string) =>
    /^(form)?8-?k/.test(n) || n.startsWith("8k") || /^d\d+d?8k/.test(n);

  // Skip image, css, xml, txt files
  const isHtml = (n: string) => n.endsWith(".htm") || n.endsWith(".html");

  const candidates = names.filter(
    (n) => isHtml(n.lower) && !isForm8K(n.lower)
  );

  // Tier 1: explicit ex99 / exhibit99 / a99 patterns (covers the vast majority)
  const ex99Patterns = [
    /(?:^|[^a-z0-9])ex[-_]?99/i, // ex99, ex_99, ex-99
    /(?:^|[^a-z0-9])exhibit[-_]?99/i, // exhibit99, exhibit-99, exhibit_99
    /(?:^|[^a-z0-9])a99(?:[-_]?\d)?\b/i, // a99, a991, a99-1
  ];

  for (const pat of ex99Patterns) {
    const match = candidates.find((n) => pat.test(n.lower));
    if (match) return match.orig;
  }

  // Tier 2: descriptive filenames (rare, mostly old filings)
  const descriptivePatterns = [
    /pressrelease/i,
    /press[-_]release/i,
    /earningsrelease/i,
    /earnings[-_]release/i,
    /prelease/i,
  ];

  for (const pat of descriptivePatterns) {
    const match = candidates.find((n) => pat.test(n.lower));
    if (match) return match.orig;
  }

  return null;
}

async function fetchPressReleaseExhibit(
  cik: string,
  accessionRaw: string
): Promise<{ html: string; url: string } | null> {
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

  const exhibitName = findPressReleaseFilename(items);
  if (!exhibitName) return null;

  const exhibitUrl = `${SEC_BASE}/Archives/edgar/data/${parseInt(cik, 10)}/${accessionNoDashes}/${exhibitName}`;

  const exRes = await fetch(exhibitUrl, {
    headers: SEC_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!exRes.ok) {
    throw new Error(`EDGAR exhibit fetch failed: ${exRes.status}`);
  }

  const rawHtml = await exRes.text();
  return { html: cleanHtml(rawHtml), url: exhibitUrl };
}

// ---------- HTML light cleanup ----------
//
// Drop styling/markup noise; keep structural information (tables, headers,
// lists, emphasis).
//
// Stripped: <script>, <style>, <link>, <meta>, HTML comments, XBRL inline
// tagging wrappers (keep content), all attributes except <a href>, <font>
// tags (keep content), embedded base64 images, <html>/<head>/<body>/<form>
// wrappers.

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

  const exhibit = await fetchPressReleaseExhibit(entry.cik, filing.accessionNumber);
  if (!exhibit) {
    return {
      ticker: upper,
      cik: entry.cik,
      companyName: entry.name,
      filing,
      pressReleaseHtml: "",
      pressReleaseUrl: "",
    };
  }

  return {
    ticker: upper,
    cik: entry.cik,
    companyName: entry.name,
    filing,
    pressReleaseHtml: exhibit.html,
    pressReleaseUrl: exhibit.url,
  };
}
