export type Trend = "bullish" | "bearish" | "ranging";

export type ResultStatus = "PASS" | "FAIL";

export interface Metadata {
  data_age: string;
  spread_convention: string;
  atr_method: string;
  similar_swing_selection_rule: string;
  /** Optional: documents how the generator marks section/day divider lines. */
  section_marker_convention?: string | undefined;
}

export const METADATA_FIELDS = [
  "data_age",
  "spread_convention",
  "atr_method",
  "similar_swing_selection_rule",
] as const;

export interface Candle {
  index: number;
  datetime: string;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  close?: number | undefined;
  direction?: string | undefined;
  body?: number | undefined;
  upperWick?: number | undefined;
  lowerWick?: number | undefined;
  range?: number | undefined;
  bodyPercentOfRange?: number | undefined;
  upperWickPct?: number | undefined;
  lowerWickPct?: number | undefined;
  displacement?: string | undefined;
  isReliable?: boolean | undefined;
  localAvgRange?: number | undefined;
  session?: string | undefined;
  atr30m?: number | undefined;
  similarSwingRetracePct?: number | undefined;
  similarSwingContinuedPct?: number | undefined;
  similarSwingRefs: string[];
  unresolvedRefs: string[];
  swingInvalidated?: boolean | undefined;
  reliableStreakLength?: number | undefined;
  trend: Trend;
  invalid?: string | undefined;
  raw: Record<string, string>;
}

export interface Outcome {
  result: ResultStatus;
  reason: string;
  entry?: number | undefined;
  sl?: number | undefined;
  tp?: number | undefined;
  side?: "long" | "short" | undefined;
}

export interface AnalysisContext {
  meta: Metadata;
  candles: Candle[];
  byDatetime: Map<string, Candle>;
  ema50: (number | undefined)[];
  ema200: (number | undefined)[];
  blocks: import("./indicators").SessionBlock[];
  spread: number;
  /** ATR(14) per bar — every threshold in the specs is ATR-relative. */
  atr: (number | undefined)[];
  /** Fractal pivot highs/lows with no-lookahead confirmation indexes. */
  pivotHighs: import("./pivots").Pivot[];
  pivotLows: import("./pivots").Pivot[];
  /** Daily (EAT) aggregates used for pivot levels. */
  daily: import("./daily").DayAggregate[];
  /** Asian-session range per EAT day. */
  asian: Map<string, import("./daily").RangeWindow>;
  /** Opening range per `${day}|${session}`. */
  openingRanges: Map<string, import("./daily").OpeningRange>;
  /**
   * Levels already used up by a strategy (swept swing, mitigated order block,
   * filled FVG...). Keyed `${strategyId}` -> set of level keys, so the same
   * level never re-triggers the same pattern.
   */
  consumed: Map<string, Set<string>>;
}

export interface StrategyCheck {
  id: string;
  name: string;
  run: (ctx: AnalysisContext, i: number) => Outcome;
}

export type SetupStatus = "PENDING" | "FILLED" | "RESOLVED" | "EXPIRED";

export interface ResultRow {
  strategyId: string;
  strategy: string;
  index: number;
  datetime: string;
  result: ResultStatus;
  reason: string;
  trend: Trend;
  entry?: number | undefined;
  sl?: number | undefined;
  tp?: number | undefined;
  rr?: number | undefined;
  side?: "long" | "short" | undefined;
  setupStatus?: SetupStatus | undefined;
  statusNote?: string | undefined;
  candlesSinceTrigger?: number | undefined;
}

export interface OverlapEntry {
  datetime: string;
  strategies: string[];
}

export interface Analysis {
  meta: Metadata;
  spread: number;
  totalRows: number;
  analyzedRows: number;
  invalidRows: number;
  invalidRowList: { datetime: string; reason: string }[];
  results: ResultRow[];
  passing: ResultRow[];
  perStrategy: {
    strategyId: string;
    strategy: string;
    passCount: number;
    failCount: number;
    failReasons: { reason: string; count: number }[];
  }[];
  overlaps: OverlapEntry[];
  lastRowDatetime: string;
  /** PENDING or FILLED — still tradeable as of the last row. */
  live: ResultRow[];
  /** RESOLVED or EXPIRED — kept for backtesting, not actionable. */
  historical: ResultRow[];
}