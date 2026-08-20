import type { Candle } from "./types";

/**
 * ATR(n) per bar. The generator already ships `atr_30m`; we trust it when
 * present and fall back to a locally computed Wilder ATR so every strategy can
 * use ATR-relative thresholds instead of fixed pip/dollar buffers.
 */
export function atrSeries(candles: Candle[], period = 14): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(candles.length).fill(undefined);
  const tr: number[] = [];
  let prevClose: number | undefined;
  let smoothed: number | undefined;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (c.high === undefined || c.low === undefined || c.close === undefined) {
      out[i] = c.atr30m ?? smoothed;
      continue;
    }
    const range = c.high - c.low;
    const trueRange =
      prevClose === undefined
        ? range
        : Math.max(range, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    prevClose = c.close;
    tr.push(trueRange);
    if (smoothed === undefined) {
      if (tr.length === period) smoothed = tr.reduce((a, b) => a + b, 0) / period;
    } else {
      smoothed = (smoothed * (period - 1) + trueRange) / period;
    }
    out[i] = c.atr30m ?? smoothed;
  }
  return out;
}

export interface Pivot {
  index: number;
  datetime: string;
  price: number;
  kind: "high" | "low";
  /** Index at which the pivot is confirmed (k bars after it printed). */
  confirmedAt: number;
}

/**
 * Fractal pivots: a bar whose high (low) is strictly greater (less) than the
 * `k` bars on either side. `confirmedAt` enforces the no-lookahead rule —
 * a pivot only exists once its right-hand bars have closed.
 */
export function findPivots(candles: Candle[], k = 2): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = k; i < candles.length - k; i++) {
    const c = candles[i]!;
    if (c.high === undefined || c.low === undefined) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      const n = candles[j]!;
      if (n.high === undefined || n.low === undefined) {
        isHigh = false;
        isLow = false;
        break;
      }
      if (n.high >= c.high) isHigh = false;
      if (n.low <= c.low) isLow = false;
    }
    if (isHigh)
      highs.push({
        index: i,
        datetime: c.datetime,
        price: c.high,
        kind: "high",
        confirmedAt: i + k,
      });
    if (isLow)
      lows.push({ index: i, datetime: c.datetime, price: c.low, kind: "low", confirmedAt: i + k });
  }
  return { highs, lows };
}

/** Pivots already confirmed at (strictly before) bar `i`. */
export function confirmedBefore(pivots: Pivot[], i: number): Pivot[] {
  return pivots.filter((p) => p.confirmedAt < i);
}

export function lastConfirmed(pivots: Pivot[], i: number): Pivot | undefined {
  const list = confirmedBefore(pivots, i);
  return list[list.length - 1];
}

/** Nearest confirmed pivot level strictly above `price`. */
export function nearestAbove(pivots: Pivot[], i: number, price: number): Pivot | undefined {
  return confirmedBefore(pivots, i)
    .filter((p) => p.price > price)
    .sort((a, b) => a.price - b.price)[0];
}

export function nearestBelow(pivots: Pivot[], i: number, price: number): Pivot | undefined {
  return confirmedBefore(pivots, i)
    .filter((p) => p.price < price)
    .sort((a, b) => b.price - a.price)[0];
}
