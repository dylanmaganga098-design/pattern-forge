import { confirmedBefore } from "../pivots";
import {
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
  tradedThrough,
  valid,
} from "./util";
import type { StrategyCheck } from "../types";

const ID = "swing_failure";
/** The swept pivot must have been untouched for at least this many bars. */
const UNTOUCHED_BARS = 20;

/**
 * Spec #2 — strict single-bar SFP: an untested, significant pivot is wicked
 * through and rejected *on the same bar*, with a body in the rejection
 * direction. No multi-bar reclaim window (that is strategy #1).
 */
export const swingFailure: StrategyCheck = {
  id: ID,
  name: "Swing Failure Pattern",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    for (const pivot of [...confirmedBefore(ctx.pivotHighs, i)].reverse()) {
      if (isConsumed(ctx, ID, levelKey("high", pivot.price))) continue;
      if (!(c.high! > pivot.price && c.close! < pivot.price)) continue;
      if (i - pivot.index < UNTOUCHED_BARS) {
        return fail(
          `swing high ${pivot.price.toFixed(3)} only ${i - pivot.index} bars old (needs ${UNTOUCHED_BARS})`,
        );
      }
      if (tradedThrough(ctx, pivot.index, i - 1, pivot.price, "above")) {
        return fail(`swing high ${pivot.price.toFixed(3)} already tested — not a virgin pivot`);
      }
      if (!(c.close! < c.open!)) return fail("rejection candle is not bearish-bodied");
      const entry = c.close!;
      const sl = c.high! + 0.1 * atrValue;
      const tp = targetBelow(ctx, i, entry) ?? entry - 3 * atrValue;
      if (!(tp < entry)) return fail("no structure target below the SFP close");
      consume(ctx, ID, levelKey("high", pivot.price));
      return pass(
        `single-bar swing failure at untested high ${pivot.price.toFixed(3)}`,
        "short",
        entry,
        sl,
        tp,
      );
    }

    for (const pivot of [...confirmedBefore(ctx.pivotLows, i)].reverse()) {
      if (isConsumed(ctx, ID, levelKey("low", pivot.price))) continue;
      if (!(c.low! < pivot.price && c.close! > pivot.price)) continue;
      if (i - pivot.index < UNTOUCHED_BARS) {
        return fail(
          `swing low ${pivot.price.toFixed(3)} only ${i - pivot.index} bars old (needs ${UNTOUCHED_BARS})`,
        );
      }
      if (tradedThrough(ctx, pivot.index, i - 1, pivot.price, "below")) {
        return fail(`swing low ${pivot.price.toFixed(3)} already tested — not a virgin pivot`);
      }
      if (!(c.close! > c.open!)) return fail("rejection candle is not bullish-bodied");
      const entry = c.close!;
      const sl = c.low! - 0.1 * atrValue;
      const tp = targetAbove(ctx, i, entry) ?? entry + 3 * atrValue;
      if (!(tp > entry)) return fail("no structure target above the SFP close");
      consume(ctx, ID, levelKey("low", pivot.price));
      return pass(
        `single-bar swing failure at untested low ${pivot.price.toFixed(3)}`,
        "long",
        entry,
        sl,
        tp,
      );
    }

    return fail("no single-bar failure of an untested swing level");
  },
};
