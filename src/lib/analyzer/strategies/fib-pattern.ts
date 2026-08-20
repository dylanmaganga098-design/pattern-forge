import { confirmedBefore } from "../pivots";
import {
  engulfingShape,
  fail,
  isAtr,
  pass,
  pinBarShape,
  requireAtr,
  reliable,
  targetAbove,
  targetBelow,
  valid,
  at,
} from "./util";
import type { StrategyCheck } from "../types";

const TOLERANCE_ATR = 0.1;

/**
 * Spec #12 — the most recent completed swing leg (last two confirmed pivots of
 * opposite kind) defines the 61.8% retracement. A pin bar (#10) or engulfing
 * (#11) within 0.1xATR of that level is the entry.
 */
export const fibPattern: StrategyCheck = {
  id: "fib_pattern",
  name: "Pin Bar/Engulfing at 61.8% Fib",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    const lastHigh = confirmedBefore(ctx.pivotHighs, i).slice(-1)[0];
    const lastLow = confirmedBefore(ctx.pivotLows, i).slice(-1)[0];
    if (!lastHigh || !lastLow) return fail("no completed swing leg available to anchor the fib");
    // Up-leg when the high printed after the low; mirror otherwise.
    const upLeg = lastHigh.index > lastLow.index;
    const swingHigh = lastHigh.price;
    const swingLow = lastLow.price;
    if (!(swingHigh > swingLow)) return fail("degenerate swing leg (high not above low)");
    const fib618 = upLeg
      ? swingHigh - 0.618 * (swingHigh - swingLow)
      : swingLow + 0.618 * (swingHigh - swingLow);
    const tolerance = TOLERANCE_ATR * atrValue;
    const touch = upLeg ? c.low! : c.high!;
    if (Math.abs(touch - fib618) > tolerance) {
      return fail(`price ${touch} not within 0.1xATR of the 61.8% level ${fib618.toFixed(3)}`);
    }

    const prev = at(ctx, i - 1);
    const pin = pinBarShape(c);
    const eng = valid(prev) ? engulfingShape(prev, c) : undefined;
    const wanted = upLeg ? "bullish" : "bearish";
    const kind = pin === wanted ? "pin bar" : eng === wanted ? "engulfing" : undefined;
    if (!kind) return fail(`no ${wanted} pin bar or engulfing pattern at the 61.8% level`);

    const entry = c.close!;
    const sl = upLeg ? c.low! - 0.1 * atrValue : c.high! + 0.1 * atrValue;
    const tp =
      (upLeg ? targetAbove(ctx, i, entry) : targetBelow(ctx, i, entry)) ??
      (upLeg ? swingHigh : swingLow);
    if (upLeg ? !(tp > entry) : !(tp < entry)) return fail("no structure target beyond the entry");
    return pass(
      `${kind} at 61.8% retracement ${fib618.toFixed(3)} of the ${upLeg ? "up" : "down"}-leg`,
      upLeg ? "long" : "short",
      entry,
      sl,
      tp,
    );
  },
};
