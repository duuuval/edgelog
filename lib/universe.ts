// lib/universe.ts
// Curated universe of small-mid cap names ($200M-$2B market cap target).
//
// This is the v2 starting list (~140 names) for the 52w scanner.
// PEAD scanner uses the Finnhub earnings calendar and filters by universe params
// from playbook.ts, so it doesn't need this list — but it can use it as a
// fast-path watchlist when the calendar surfaces a hit.
//
// Maintenance:
// - Review quarterly. Drop names that have grown past $2B mcap or fallen
//   below quality threshold (going-concern, recent reverse merger, sub-$5).
// - Add names organically as you encounter them.
// - Selection criteria: real revenue, real business, listed NYSE/NASDAQ,
//   diversified across sectors to avoid concentrated theme risk.
//
// NOT a "best stocks" list. A "fishable pond" list. Most names here will
// never trigger a signal. The point is to have a stable universe to scan
// against day after day so signals are comparable over time.
//
// Disclaimer: market caps drift. Some names here may have moved out of band
// since this list was assembled. The scanner re-checks mcap at scan time
// against the playbook's universe filter, so out-of-band names get filtered
// out at the gate even if they're still in this list.

export type UniverseEntry = {
  ticker: string;
  name: string;
  sector: string;
  // Loose tags for filtering / theme grouping. Not used by scanner yet
  // but useful for future analytics ("did my biotech trades work?").
  tags?: string[];
};

export const UNIVERSE_52W: UniverseEntry[] = [
  // ─── Industrials & specialty manufacturing ────────────────────────────
  { ticker: "AGX", name: "Argan", sector: "Industrials", tags: ["power", "infra"] },
  { ticker: "PRIM", name: "Primoris Services", sector: "Industrials", tags: ["infra", "energy"] },
  { ticker: "MYRG", name: "MYR Group", sector: "Industrials", tags: ["power", "infra"] },
  { ticker: "ROCK", name: "Gibraltar Industries", sector: "Industrials" },
  { ticker: "MLI", name: "Mueller Industries", sector: "Industrials", tags: ["copper"] },
  { ticker: "ESE", name: "ESCO Technologies", sector: "Industrials", tags: ["defense", "power"] },
  { ticker: "MRCY", name: "Mercury Systems", sector: "Industrials", tags: ["defense"] },
  { ticker: "KTOS", name: "Kratos Defense", sector: "Industrials", tags: ["defense", "drones"] },
  { ticker: "AVAV", name: "AeroVironment", sector: "Industrials", tags: ["defense", "drones"] },
  { ticker: "POWL", name: "Powell Industries", sector: "Industrials", tags: ["power", "grid"] },
  { ticker: "GVA", name: "Granite Construction", sector: "Industrials", tags: ["infra"] },
  { ticker: "FIX", name: "Comfort Systems USA", sector: "Industrials", tags: ["hvac", "data-centers"] },
  { ticker: "AAON", name: "AAON", sector: "Industrials", tags: ["hvac", "data-centers"] },

  // ─── Energy / utilities / mining / materials ──────────────────────────
  { ticker: "TALO", name: "Talos Energy", sector: "Energy" },
  { ticker: "MTDR", name: "Matador Resources", sector: "Energy" },
  { ticker: "SM", name: "SM Energy", sector: "Energy" },
  { ticker: "CIVI", name: "Civitas Resources", sector: "Energy" },
  { ticker: "VTLE", name: "Vital Energy", sector: "Energy" },
  { ticker: "CDE", name: "Coeur Mining", sector: "Materials", tags: ["silver", "gold"] },
  { ticker: "HL", name: "Hecla Mining", sector: "Materials", tags: ["silver"] },
  { ticker: "MP", name: "MP Materials", sector: "Materials", tags: ["rare-earths"] },
  { ticker: "USAR", name: "USA Rare Earth", sector: "Materials", tags: ["rare-earths"] },
  { ticker: "HBM", name: "Hudbay Minerals", sector: "Materials", tags: ["copper"] },
  { ticker: "ERO", name: "Ero Copper", sector: "Materials", tags: ["copper"] },
  { ticker: "ASM", name: "Avino Silver & Gold", sector: "Materials", tags: ["silver"] },
  { ticker: "URG", name: "Ur-Energy", sector: "Energy", tags: ["uranium"] },
  { ticker: "UEC", name: "Uranium Energy", sector: "Energy", tags: ["uranium"] },
  { ticker: "DNN", name: "Denison Mines", sector: "Energy", tags: ["uranium"] },

  // ─── Healthcare / biotech (small-mid cap, real revenue or near-term catalysts) ─
  { ticker: "HIMS", name: "Hims & Hers Health", sector: "Healthcare", tags: ["telehealth", "glp1"] },
  { ticker: "EVH", name: "Evolent Health", sector: "Healthcare" },
  { ticker: "PRVA", name: "Privia Health", sector: "Healthcare" },
  { ticker: "ADUS", name: "Addus HomeCare", sector: "Healthcare" },
  { ticker: "ENSG", name: "Ensign Group", sector: "Healthcare" },
  { ticker: "AMED", name: "Amedisys", sector: "Healthcare" },
  { ticker: "PGNY", name: "Progyny", sector: "Healthcare" },
  { ticker: "PHR", name: "Phreesia", sector: "Healthcare", tags: ["health-it"] },
  { ticker: "DOCS", name: "Doximity", sector: "Healthcare", tags: ["health-it"] },
  { ticker: "HQY", name: "HealthEquity", sector: "Healthcare", tags: ["health-it"] },
  { ticker: "CRVL", name: "CorVel", sector: "Healthcare" },
  { ticker: "FOLD", name: "Amicus Therapeutics", sector: "Healthcare", tags: ["biotech"] },
  { ticker: "KRYS", name: "Krystal Biotech", sector: "Healthcare", tags: ["biotech"] },
  { ticker: "RNA", name: "Avidity Biosciences", sector: "Healthcare", tags: ["biotech"] },
  { ticker: "MIRM", name: "Mirum Pharmaceuticals", sector: "Healthcare", tags: ["biotech"] },
  { ticker: "DAWN", name: "Day One Biopharmaceuticals", sector: "Healthcare", tags: ["biotech"] },

  // ─── Technology / software ─────────────────────────────────────────────
  { ticker: "INTA", name: "Intapp", sector: "Technology" },
  { ticker: "BRZE", name: "Braze", sector: "Technology" },
  { ticker: "SEMR", name: "Semrush", sector: "Technology" },
  { ticker: "AMPL", name: "Amplitude", sector: "Technology" },
  { ticker: "ASAN", name: "Asana", sector: "Technology" },
  { ticker: "FRSH", name: "Freshworks", sector: "Technology" },
  { ticker: "BL", name: "BlackLine", sector: "Technology" },
  { ticker: "WK", name: "Workiva", sector: "Technology" },
  { ticker: "ALRM", name: "Alarm.com", sector: "Technology" },
  { ticker: "EVCM", name: "EverCommerce", sector: "Technology" },
  { ticker: "DOMO", name: "Domo", sector: "Technology" },
  { ticker: "BAND", name: "Bandwidth", sector: "Technology" },
  { ticker: "NTGR", name: "Netgear", sector: "Technology" },
  { ticker: "EXTR", name: "Extreme Networks", sector: "Technology", tags: ["networking"] },
  { ticker: "CIEN", name: "Ciena", sector: "Technology", tags: ["networking", "ai-infra"] },
  { ticker: "ALGM", name: "Allegro MicroSystems", sector: "Technology", tags: ["semis"] },
  { ticker: "POWI", name: "Power Integrations", sector: "Technology", tags: ["semis"] },
  { ticker: "SITM", name: "SiTime", sector: "Technology", tags: ["semis"] },
  { ticker: "AMBA", name: "Ambarella", sector: "Technology", tags: ["semis", "ai-edge"] },

  // ─── Consumer (discretionary + staples) ─────────────────────────────
  { ticker: "BOOT", name: "Boot Barn", sector: "Consumer Discretionary" },
  { ticker: "DECK", name: "Deckers Outdoor", sector: "Consumer Discretionary" }, // borderline; watch mcap
  { ticker: "BURL", name: "Burlington Stores", sector: "Consumer Discretionary" }, // borderline
  { ticker: "BIRK", name: "Birkenstock", sector: "Consumer Discretionary" },
  { ticker: "ONON", name: "On Holding", sector: "Consumer Discretionary" }, // borderline; watch mcap
  { ticker: "CROX", name: "Crocs", sector: "Consumer Discretionary" }, // borderline
  { ticker: "TPR", name: "Tapestry", sector: "Consumer Discretionary" }, // borderline
  { ticker: "PLNT", name: "Planet Fitness", sector: "Consumer Discretionary" }, // borderline
  { ticker: "TXRH", name: "Texas Roadhouse", sector: "Consumer Discretionary" }, // borderline
  { ticker: "WING", name: "Wingstop", sector: "Consumer Discretionary" }, // borderline
  { ticker: "CAKE", name: "Cheesecake Factory", sector: "Consumer Discretionary" },
  { ticker: "BJRI", name: "BJ's Restaurants", sector: "Consumer Discretionary" },
  { ticker: "BROS", name: "Dutch Bros", sector: "Consumer Discretionary" },
  { ticker: "CAVA", name: "CAVA Group", sector: "Consumer Discretionary" }, // borderline
  { ticker: "SG", name: "Sweetgreen", sector: "Consumer Discretionary" },
  { ticker: "WOLF", name: "Wolfspeed", sector: "Technology", tags: ["semis"] },
  { ticker: "FIGS", name: "FIGS", sector: "Consumer Discretionary" },
  { ticker: "DUOL", name: "Duolingo", sector: "Consumer Discretionary" }, // borderline; watch mcap
  { ticker: "VITL", name: "Vital Farms", sector: "Consumer Staples" },
  { ticker: "SMPL", name: "Simply Good Foods", sector: "Consumer Staples" },
  { ticker: "FRPT", name: "Freshpet", sector: "Consumer Staples" }, // borderline
  { ticker: "BRBR", name: "BellRing Brands", sector: "Consumer Staples" }, // borderline

  // ─── Financials (specialty / regional / fintech) ────────────────────────
  { ticker: "AX", name: "Axos Financial", sector: "Financials" },
  { ticker: "PFSI", name: "PennyMac Financial", sector: "Financials" }, // borderline
  { ticker: "VRTS", name: "Virtus Investment Partners", sector: "Financials" },
  { ticker: "WAL", name: "Western Alliance Bancorporation", sector: "Financials" }, // borderline
  { ticker: "BANC", name: "Banc of California", sector: "Financials" },
  { ticker: "SOFI", name: "SoFi Technologies", sector: "Financials", tags: ["fintech"] }, // borderline
  { ticker: "PAY", name: "Paymentus", sector: "Technology", tags: ["fintech"] },
  { ticker: "MQ", name: "Marqeta", sector: "Technology", tags: ["fintech"] },
  { ticker: "PAYO", name: "Payoneer", sector: "Technology", tags: ["fintech"] },
  { ticker: "MARA", name: "MARA Holdings", sector: "Financials", tags: ["bitcoin", "miner"] },
  { ticker: "CLSK", name: "CleanSpark", sector: "Financials", tags: ["bitcoin", "miner"] },
  { ticker: "RIOT", name: "Riot Platforms", sector: "Financials", tags: ["bitcoin", "miner"] }, // borderline

  // ─── Real estate / specialty ───────────────────────────────────────────
  { ticker: "OPEN", name: "Opendoor Technologies", sector: "Real Estate" },
  { ticker: "Z", name: "Zillow Group", sector: "Real Estate" }, // borderline; watch mcap
  { ticker: "REZI", name: "Resideo Technologies", sector: "Industrials" },
  { ticker: "STAG", name: "STAG Industrial", sector: "Real Estate" }, // borderline

  // ─── Misc industrial-tech / clean energy / mobility ─────────────────────
  { ticker: "VRT", name: "Vertiv Holdings", sector: "Industrials", tags: ["power", "ai-infra"] }, // borderline; watch mcap
  { ticker: "AROC", name: "Archrock", sector: "Energy" },
  { ticker: "CSWI", name: "CSW Industrials", sector: "Industrials" }, // borderline
  { ticker: "ATKR", name: "Atkore", sector: "Industrials", tags: ["power", "infra"] },
  { ticker: "NX", name: "Quanex Building Products", sector: "Industrials" },
  { ticker: "AGCO", name: "AGCO Corporation", sector: "Industrials" }, // borderline; watch mcap
  { ticker: "HEES", name: "H&E Equipment Services", sector: "Industrials" },
  { ticker: "TGLS", name: "Tecnoglass", sector: "Industrials" },
  { ticker: "GBX", name: "Greenbrier Companies", sector: "Industrials" },
  { ticker: "VVX", name: "V2X", sector: "Industrials", tags: ["defense"] },
  { ticker: "HWM", name: "Howmet Aerospace", sector: "Industrials" }, // borderline; watch mcap
  { ticker: "MOG.A", name: "Moog", sector: "Industrials", tags: ["defense"] },
  { ticker: "TDC", name: "Teradata", sector: "Technology" },

  // ─── Niche / fringe (interesting setup potential, watch carefully) ────
  { ticker: "BBAI", name: "BigBear.ai", sector: "Technology", tags: ["ai", "defense"] },
  { ticker: "RKLB", name: "Rocket Lab", sector: "Industrials", tags: ["space", "defense"] }, // borderline
  { ticker: "ASTS", name: "AST SpaceMobile", sector: "Communication", tags: ["space"] }, // borderline
  { ticker: "IRDM", name: "Iridium Communications", sector: "Communication", tags: ["space"] }, // borderline
  { ticker: "JOBY", name: "Joby Aviation", sector: "Industrials", tags: ["evtol"] }, // borderline
  { ticker: "ARCH", name: "Archer Aviation", sector: "Industrials", tags: ["evtol"] },
  { ticker: "VSAT", name: "Viasat", sector: "Communication" },
  { ticker: "DNUT", name: "Krispy Kreme", sector: "Consumer Staples" },
  { ticker: "GO", name: "Grocery Outlet", sector: "Consumer Staples" },
];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

export function getUniverseTickers(): string[] {
  return UNIVERSE_52W.map((u) => u.ticker);
}

export function getUniverseBySector(sector: string): UniverseEntry[] {
  return UNIVERSE_52W.filter((u) => u.sector === sector);
}

export function getUniverseByTag(tag: string): UniverseEntry[] {
  return UNIVERSE_52W.filter((u) => u.tags?.includes(tag));
}

export function isInUniverse(ticker: string): boolean {
  return UNIVERSE_52W.some((u) => u.ticker === ticker);
}
