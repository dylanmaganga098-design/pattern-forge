import { at, fail, isAtr, pass, requireAtr, reliable, targetAbove, targetBelow, valid } from "./util";
import type { StrategyCheck } from "../types";

/** Small buffer allowed through the EMA on the pullback. */
const PULLBACK_BUFFER_ATR = 0.1;

/**
 * Spec #13 — EMA50/EMA200 trend filter (from the EMA series, not the CSV trend
 * column), a wick pullback to EMA50, and a close back in trend direction.
 * EMA200 must be warmed up before any signal is allowed.
 */
export const emaPullback: StrategyCheck = {
  id: "ema_pullback",
  name: "EMA 50/200 Pullback",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;
    const ema50 = ctx.ema50[i];
    const ema200 = ctx.ema200[i];
    if (ema50 === undefined) return fail("EMA-50 unavailable (fewer than 50 closes before this row)");
    if (ema200 === undefined)
      return fail("EMA-200 not warmed up (fewer than 200 closes before this row)");

    const bullish = ema50 > ema200;
    const bearish = ema50 < ema200;
    if (!bullish && !bearish) return fail("EMA-50 and EMA-200 are equal — no trend");
    const buffer = PULLBACK_BUFFER_ATR * atrValue;

    if (bullish) {
      const prev = at(ctx, i - 1);
      const wasAbove = valid(prev) ? prev.close! > ema50 : true;
      if (!wasAbove) return fail("price was not above EMA-50 before the pullback");
      // Touch uses the wick.
      if (!(c.low! <= ema50 + buffer)) return fail("candle did not pull back to EMA-50");
      // Continuation uses the close.
      if (!(c.close! > ema50)) return fail("candle did not close back above EMA-50");
      const entry = c.close!;
      const sl = c.low! - 0.1 * atrValue;
      const tp = targetAbove(ctx, i, entry) ?? entry + 2 * (entry - sl);
      if (!(tp > entry)) return fail("no structure target above the entry");
      return pass(`pullback to EMA-50 (${ema50.toFixed(3)}) in an uptrend`, "long", entry, sl, tp);
    }

    const prev = at(ctx, i - 1);
    const wasBelow = valid(prev) ? prev.close! < ema50 : true;
    if (!wasBelow) return fail("price was not below EMA-50 before the pullback");
    if (!(c.high! >= ema50 - buffer)) return fail("candle did not pull back to EMA-50");
    if (!(c.close! < ema50)) return fail("candle did not close back below EMA-50");
    const entry = c.close!;
    const sl = c.high! + 0.1 * atrValue;
    const tp = targetBelow(ctx, i, entry) ?? entry - 2 * (sl - entry);
    if (!(tp < entry)) return fail("no structure target below the entry");
    return pass(`pullback to EMA-50 (${ema50.toFixed(3)}) in a downtrend`, "short", entry, sl, tp);
  },
};
