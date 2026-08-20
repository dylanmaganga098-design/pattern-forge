import {
  at,
  consume,
  fail,
  isAtr,
  isConsumed,
  levelKey,
  pass,
  requireAtr,
  reliable,
  targetAbove,
  targetBelow,
  valid,
} from "./util";
import type { StrategyCheck } from "../types";

const ID = "fvg_fill";
const LOOKBACK = 60;
const MIN_GAP_ATR = 0.25;
/** Fraction of the gap that must be traded back into to count as a fill. */
const FILL_FRACTION = 0.5;

/**
 * Spec #9 — a 3-candle imbalance (candle3.low > candle1.high, or the mirror).
 * A later bar's wick enters the gap by at least 50%; the close confirms in the
 * gap direction. Filled gaps are consumed and never re-fire.
 */
export const fvgFill: StrategyCheck = {
  id: ID,
  name: "Fair Value Gap Fill",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    for (let j = i - 1; j >= 2 && j >= i - LOOKBACK; j--) {
      const a = at(ctx, j - 2);
      const d = at(ctx, j);
      if (!valid(a) || !valid(d) || !valid(at(ctx, j - 1))) continue;
      const gapUp = d.low! > a.high!;
      const gapDown = d.high! < a.low!;
      if (!gapUp && !gapDown) continue;
      const bottom = gapUp ? a.high! : d.high!;
      const top = gapUp ? d.low! : a.low!;
      const size = top - bottom;
      if (size < MIN_GAP_ATR * atrValue) continue;
      const key = levelKey(gapUp ? "fvg-bull" : "fvg-bear", bottom + top);
      if (isConsumed(ctx, ID, key)) continue;

      // Bullish gap: price drops back into it from above; fill measured with the wick.
      const fillLevel = gapUp ? top - FILL_FRACTION * size : bottom + FILL_FRACTION * size;
      const reached = gapUp ? c.low! <= fillLevel : c.high! >= fillLevel;
      if (!reached) {
        return fail(
          `price has not filled ${(FILL_FRACTION * 100).toFixed(0)}% of the ${gapUp ? "bullish" : "bearish"} gap ${bottom.toFixed(3)}-${top.toFixed(3)}`,
        );
      }
      // Confirmation with the close, in the gap direction.
      if (gapUp ? !(c.close! > c.open!) : !(c.close! < c.open!)) {
        return fail("fill bar did not close in the gap direction");
      }
      const entry = c.close!;
      const sl = gapUp ? bottom - 0.1 * atrValue : top + 0.1 * atrValue;
      const tp =
        (gapUp ? targetAbove(ctx, i, entry) : targetBelow(ctx, i, entry)) ??
        (gapUp ? entry + 3 * size : entry - 3 * size);
      if (gapUp ? !(tp > entry) : !(tp < entry))
        return fail("no structure target beyond the entry");
      consume(ctx, ID, key);
      return pass(
        `filled ${gapUp ? "bullish" : "bearish"} fair value gap from ${d.datetime}`,
        gapUp ? "long" : "short",
        entry,
        sl,
        tp,
      );
    }
    return fail("no unfilled fair value gap of at least 0.25xATR before this bar");
  },
};
