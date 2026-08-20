import { confirmedBefore } from "../pivots";
import { fail, isAtr, pass, requireAtr, reliable, valid } from "./util";
import type { StrategyCheck } from "../types";

const LOOKBACK = 40;
const CLUSTER_ATR = 0.5;
const MIN_TOUCHES = 2;
const TOLERANCE_ATR = 0.15;

function cluster(prices: number[], atr: number): { level: number; touches: number } | undefined {
  if (prices.length < MIN_TOUCHES) return undefined;
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  if ((max - min) / atr >= CLUSTER_ATR) return undefined;
  return { level: prices.reduce((a, b) => a + b, 0) / prices.length, touches: prices.length };
}

/**
 * Spec #8 — a horizontal range needs >=2 clustered touches (within 0.5xATR) on
 * each boundary. A bar whose wick tags a boundary and whose close returns
 * inside the range is the rejection entry.
 */
export const rangeRejection: StrategyCheck = {
  id: "range_rejection",
  name: "Horizontal Range + Boundary Rejection",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    const from = i - LOOKBACK;
    const highs = confirmedBefore(ctx.pivotHighs, i)
      .filter((p) => p.index >= from)
      .map((p) => p.price);
    const lows = confirmedBefore(ctx.pivotLows, i)
      .filter((p) => p.index >= from)
      .map((p) => p.price);
    const top = cluster(highs, atrValue);
    if (!top) return fail(`fewer than ${MIN_TOUCHES} swing highs clustered within 0.5xATR`);
    const bottom = cluster(lows, atrValue);
    if (!bottom) return fail(`fewer than ${MIN_TOUCHES} swing lows clustered within 0.5xATR`);
    if (top.level - bottom.level <= atrValue) return fail("range is narrower than 1xATR — not tradeable");
    const tolerance = TOLERANCE_ATR * atrValue;

    // Tag with the wick, confirm with the close back inside the range.
    if (c.high! >= top.level - tolerance) {
      if (!(c.close! < top.level)) return fail(`close ${c.close} did not return inside the range top`);
      return pass(
        `rejection at range top ${top.level.toFixed(3)} (${top.touches} touches)`,
        "short",
        c.close!,
        c.high! + 0.1 * atrValue,
        bottom.level,
      );
    }
    if (c.low! <= bottom.level + tolerance) {
      if (!(c.close! > bottom.level)) return fail(`close ${c.close} did not return inside the range bottom`);
      return pass(
        `rejection at range bottom ${bottom.level.toFixed(3)} (${bottom.touches} touches)`,
        "long",
        c.close!,
        c.low! - 0.1 * atrValue,
        top.level,
      );
    }
    return fail("candle wick did not tag either range boundary");
  },
};
