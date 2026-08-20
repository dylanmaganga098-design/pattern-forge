import { resolveSwings, type SwingSet } from "../structure";
import { confirmedBefore, nearestAbove, nearestBelow, type Pivot } from "../pivots";
import type { AnalysisContext, Candle, Outcome } from "../types";

export const FIELD_LABELS: Record<string, string> = {
  displacement: "displacement",
  isReliable: "is_reliable",
  swingInvalidated: "swing_invalidated",
  upperWickPct: "upper_wick_pct",
  lowerWickPct: "lower_wick_pct",
  bodyPercentOfRange: "body_percent_of_range",
  similarSwingRetracePct: "similar_swing_retrace_pct",
  session: "session",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
};

export function fail(reason: string): Outcome {
  return { result: "FAIL", reason };
}

export function pass(
  reason: string,
  side: "long" | "short",
  entry: number,
  sl: number,
  tp: number,
): Outcome {
  return { result: "PASS", reason, side, entry, sl, tp };
}

/** Returns a `missing field: x` outcome when any required field is absent on the candle. */
export function requireFields(candle: Candle, keys: (keyof Candle)[]): Outcome | undefined {
  for (const key of keys) {
    const value = candle[key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      return fail(`missing field: ${FIELD_LABELS[key as string] ?? String(key)}`);
    }
  }
  return undefined;
}

/** Unresolved swing refs are distinct from empty fields. */
export function requireSwings(
  ctx: AnalysisContext,
  candle: Candle,
  minimum = 2,
): { swings: SwingSet } | { outcome: Outcome } {
  if (candle.similarSwingRefs.length === 0) {
    return { outcome: fail("missing field: similar_swing_refs") };
  }
  const swings = resolveSwings(candle, ctx.byDatetime);
  if (swings.unresolved.length > 0) {
    return { outcome: fail(`INVALID: unresolved swing reference [${swings.unresolved[0]}]`) };
  }
  if (swings.candles.length < minimum) {
    return { outcome: fail(`insufficient resolved swings (${swings.candles.length} of ${minimum})`) };
  }
  return { swings };
}

export function isDisplacement(candle: Candle): boolean {
  return /^(yes|true|1)$/i.test(String(candle.displacement ?? ""));
}

export function valid(candle: Candle | undefined): candle is Candle {
  return (
    !!candle &&
    !candle.invalid &&
    candle.open !== undefined &&
    candle.high !== undefined &&
    candle.low !== undefined &&
    candle.close !== undefined
  );
}

export function at(ctx: AnalysisContext, index: number): Candle | undefined {
  return ctx.candles[index];
}

/** ATR(14) at bar i — every threshold in the specs is ATR-relative. */
export function atrAt(ctx: AnalysisContext, i: number): number | undefined {
  const value = ctx.atr[i];
  return value !== undefined && value > 0 ? value : undefined;
}

export function requireAtr(ctx: AnalysisContext, i: number): number | Outcome {
  const atr = atrAt(ctx, i);
  return atr ?? fail("ATR(14) unavailable — not enough warm-up bars before this row");
}

export function isAtr(value: number | Outcome): value is number {
  return typeof value === "number";
}

/** Candle body / wick geometry, computed from OHLC (never from wick % columns). */
export function geometry(c: Candle) {
  const body = Math.abs(c.close! - c.open!);
  const upper = c.high! - Math.max(c.open!, c.close!);
  const lower = Math.min(c.open!, c.close!) - c.low!;
  return { body, upper, lower, range: c.high! - c.low! };
}

export function reliable(c: Candle): boolean {
  return c.isReliable !== false;
}

/** All confirmed pivot levels (both kinds) usable as key levels at bar i. */
export function keyLevels(ctx: AnalysisContext, i: number): Pivot[] {
  return [...confirmedBefore(ctx.pivotHighs, i), ...confirmedBefore(ctx.pivotLows, i)].sort(
    (a, b) => a.index - b.index,
  );
}

/** Nearest structure target strictly beyond the entry, in trade direction. */
export function targetAbove(ctx: AnalysisContext, i: number, price: number): number | undefined {
  return (
    nearestAbove(ctx.pivotHighs, i, price)?.price ?? nearestAbove(ctx.pivotLows, i, price)?.price
  );
}

export function targetBelow(ctx: AnalysisContext, i: number, price: number): number | undefined {
  return (
    nearestBelow(ctx.pivotLows, i, price)?.price ?? nearestBelow(ctx.pivotHighs, i, price)?.price
  );
}

/** Nearest key level to `price` within `tolerance` (absolute, ATR-derived). */
export function levelNear(
  levels: Pivot[],
  price: number,
  tolerance: number,
): Pivot | undefined {
  let best: Pivot | undefined;
  let bestDistance = Infinity;
  for (const level of levels) {
    const distance = Math.abs(price - level.price);
    if (distance <= tolerance && distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/** Nearest swing level (high or low) to a price, within tolerance percent. */
export function nearestLevel(
  swings: SwingSet,
  price: number,
  tolerancePct: number,
): { level: number; kind: "high" | "low" } | undefined {
  const levels: { level: number; kind: "high" | "low" }[] = [
    ...swings.highs.map((level) => ({ level, kind: "high" as const })),
    ...swings.lows.map((level) => ({ level, kind: "low" as const })),
  ];
  let best: { level: number; kind: "high" | "low" } | undefined;
  let bestDistance = Infinity;
  for (const entry of levels) {
    const distance = Math.abs(price - entry.level);
    const tolerance = (Math.abs(entry.level) * tolerancePct) / 100;
    if (distance <= tolerance && distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

/** Lowest swing high strictly above `price`, taken from a real row. */
export function structureAbove(swings: SwingSet, price: number): number | undefined {
  const above = swings.highs.filter((h) => h > price).sort((a, b) => a - b);
  return above[0];
}

export function structureBelow(swings: SwingSet, price: number): number | undefined {
  const below = swings.lows.filter((l) => l < price).sort((a, b) => b - a);
  return below[0];
}

export function wickPct(candle: Candle, kind: "upper" | "lower"): number | undefined {
  return kind === "upper" ? candle.upperWickPct : candle.lowerWickPct;
}

/* ------------------------------------------------------------------ *
 * Consumed / mitigated level tracking
 * ------------------------------------------------------------------ */

/**
 * Bars are analysed oldest -> newest, so a strategy can mark a level as used up
 * (swept swing, mitigated order block, filled FVG) and never re-trigger on it.
 */
export function isConsumed(ctx: AnalysisContext, strategyId: string, key: string): boolean {
  return ctx.consumed.get(strategyId)?.has(key) ?? false;
}

export function consume(ctx: AnalysisContext, strategyId: string, key: string): void {
  const set = ctx.consumed.get(strategyId) ?? new Set<string>();
  set.add(key);
  ctx.consumed.set(strategyId, set);
}

export function levelKey(prefix: string, value: number): string {
  return `${prefix}:${value.toFixed(6)}`;
}

/* ------------------------------------------------------------------ *
 * Shared candle-shape detectors (OHLC only)
 * ------------------------------------------------------------------ */

export type PinDirection = "bullish" | "bearish";

/**
 * Pin bar geometry: rejecting wick > 2x body and the opposite wick small.
 * The opposite-wick cap has a range-relative floor so a doji body cannot make
 * the test mathematically impossible.
 */
export function pinBarShape(c: Candle): PinDirection | undefined {
  const { body, upper, lower, range } = geometry(c);
  if (range <= 0) return undefined;
  const cap = Math.max(0.5 * body, 0.15 * range);
  if (lower > 2 * body && lower >= 0.5 * range && upper <= cap) return "bullish";
  if (upper > 2 * body && upper >= 0.5 * range && lower <= cap) return "bearish";
  return undefined;
}

/** Engulfing geometry across bar i-1 -> i (bodies only, no wick tolerance). */
export function engulfingShape(prev: Candle, c: Candle): PinDirection | undefined {
  const prevTop = Math.max(prev.open!, prev.close!);
  const prevBottom = Math.min(prev.open!, prev.close!);
  const top = Math.max(c.open!, c.close!);
  const bottom = Math.min(c.open!, c.close!);
  const engulfs = top >= prevTop && bottom <= prevBottom;
  if (!engulfs) return undefined;
  const prevBody = prevTop - prevBottom;
  const body = top - bottom;
  if (body <= prevBody) return undefined;
  if (c.close! > c.open! && prev.close! < prev.open!) return "bullish";
  if (c.close! < c.open! && prev.close! > prev.open!) return "bearish";
  return undefined;
}

/** True when any bar in (from, to] closed beyond `level` in the given direction. */
export function closedBeyond(
  ctx: AnalysisContext,
  from: number,
  to: number,
  level: number,
  direction: "above" | "below",
): boolean {
  for (let k = from + 1; k <= to; k++) {
    const bar = at(ctx, k);
    if (!valid(bar)) continue;
    if (direction === "above" ? bar.close! > level : bar.close! < level) return true;
  }
  return false;
}

/** True when any bar in (from, to] traded through `level` with its wick. */
export function tradedThrough(
  ctx: AnalysisContext,
  from: number,
  to: number,
  level: number,
  direction: "above" | "below",
): boolean {
  for (let k = from + 1; k <= to; k++) {
    const bar = at(ctx, k);
    if (!valid(bar)) continue;
    if (direction === "above" ? bar.high! >= level : bar.low! <= level) return true;
  }
  return false;
}
