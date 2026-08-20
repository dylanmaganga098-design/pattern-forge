import { eatDay, minutesIntoSession, sessionOf } from "./time";
import type { Candle } from "./types";

export interface RangeWindow {
  high: number;
  low: number;
  /** First / last candle index that contributed to the window. */
  start: number;
  end: number;
}

export interface DayAggregate extends RangeWindow {
  day: string;
  close: number;
}

export interface OpeningRange extends RangeWindow {
  day: string;
  session: string;
  /** First candle index strictly after the opening window closed. */
  afterWindow: number;
}

function usable(c: Candle | undefined): boolean {
  return !!c && !c.invalid && c.high !== undefined && c.low !== undefined && c.close !== undefined;
}

/** Daily H/L/C aggregated on the EAT calendar day — the pivot reset we define. */
export function dailyAggregates(candles: Candle[]): DayAggregate[] {
  const out: DayAggregate[] = [];
  let current: DayAggregate | undefined;
  for (const c of candles) {
    if (!usable(c)) continue;
    const day = eatDay(c.datetime);
    if (!current || current.day !== day) {
      current = { day, high: c.high!, low: c.low!, close: c.close!, start: c.index, end: c.index };
      out.push(current);
    } else {
      current.high = Math.max(current.high, c.high!);
      current.low = Math.min(current.low, c.low!);
      current.close = c.close!;
      current.end = c.index;
    }
  }
  return out;
}

/** Prior EAT day's aggregate relative to the day containing bar `i`. */
export function priorDay(daily: DayAggregate[], candle: Candle): DayAggregate | undefined {
  const day = eatDay(candle.datetime);
  let previous: DayAggregate | undefined;
  for (const agg of daily) {
    if (agg.day === day) return previous;
    previous = agg;
  }
  return undefined;
}

export interface ClassicPivots {
  pp: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}

/** Classic pivots (the one method used everywhere in this analyzer). */
export function classicPivots(d: DayAggregate): ClassicPivots {
  const pp = (d.high + d.low + d.close) / 3;
  const range = d.high - d.low;
  return {
    pp,
    r1: 2 * pp - d.low,
    s1: 2 * pp - d.high,
    r2: pp + range,
    s2: pp - range,
  };
}

/** Asian-session range (EAT window) keyed by EAT day. */
export function asianRanges(candles: Candle[]): Map<string, RangeWindow> {
  const map = new Map<string, RangeWindow>();
  for (const c of candles) {
    if (!usable(c)) continue;
    if ((c.session ?? sessionOf(c.datetime)) !== "asian") continue;
    const day = eatDay(c.datetime);
    const existing = map.get(day);
    if (!existing) {
      map.set(day, { high: c.high!, low: c.low!, start: c.index, end: c.index });
    } else {
      existing.high = Math.max(existing.high, c.high!);
      existing.low = Math.min(existing.low, c.low!);
      existing.end = c.index;
    }
  }
  return map;
}

export const OPENING_WINDOW_MINUTES = 60;

export function openingRangeKey(day: string, session: string): string {
  return `${day}|${session}`;
}

/**
 * First `M` minutes of the london / ny session on each EAT day. `afterWindow`
 * is the first bar that may legitimately break the range (no lookahead).
 */
export function openingRanges(
  candles: Candle[],
  windowMinutes = OPENING_WINDOW_MINUTES,
): Map<string, OpeningRange> {
  const map = new Map<string, OpeningRange>();
  for (const c of candles) {
    if (!usable(c)) continue;
    const session = c.session ?? sessionOf(c.datetime);
    if (session !== "london" && session !== "ny") continue;
    const elapsed = minutesIntoSession(c.datetime, session);
    if (elapsed === undefined) continue;
    const day = eatDay(c.datetime);
    const key = openingRangeKey(day, session);
    const existing = map.get(key);
    if (elapsed < windowMinutes) {
      if (!existing) {
        map.set(key, {
          day,
          session,
          high: c.high!,
          low: c.low!,
          start: c.index,
          end: c.index,
          afterWindow: c.index + 1,
        });
      } else {
        existing.high = Math.max(existing.high, c.high!);
        existing.low = Math.min(existing.low, c.low!);
        existing.end = c.index;
        existing.afterWindow = c.index + 1;
      }
    }
  }
  return map;
}

export function openingRangeFor(
  ranges: Map<string, OpeningRange>,
  candle: Candle,
): OpeningRange | undefined {
  const session = candle.session ?? sessionOf(candle.datetime);
  if (!session) return undefined;
  return ranges.get(openingRangeKey(eatDay(candle.datetime), session));
}
