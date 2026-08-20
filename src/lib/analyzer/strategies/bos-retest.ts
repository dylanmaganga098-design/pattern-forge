import { confirmedBefore } from "../pivots";
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

const ID = "bos_retest";
const RETEST_WINDOW = 20;
const BUFFER_ATR = 0.15;

/**
 * Spec #7 — a bar *closes* beyond the most recent significant swing (BOS), then
 * a later bar wicks back to the broken level and closes in the breakout
 * direction. Each broken level is consumed after it produces its retest entry.
 */
export const bosRetest: StrategyCheck = {
  id: ID,
  name: "Break of Structure + Retest",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;
    const buffer = BUFFER_ATR * atrValue;

    for (let b = i - 1; b >= 0 && b >= i - RETEST_WINDOW; b--) {
      const bos = at(ctx, b);
      if (!valid(bos)) continue;

      const highs = confirmedBefore(ctx.pivotHighs, b);
      const brokenHigh = [...highs].reverse().find((p) => bos.close! > p.price);
      if (brokenHigh && !isConsumed(ctx, ID, levelKey("bos-high", brokenHigh.price))) {
        const level = brokenHigh.price;
        if (c.low! <= level + buffer) {
          if (!(c.close! > level)) {
            return fail(`retest of ${level.toFixed(3)} closed back below the broken level`);
          }
          const entry = c.close!;
          const sl = Math.min(c.low!, level) - 0.1 * atrValue;
          const tp = targetAbove(ctx, i, entry) ?? entry + 2 * (entry - sl);
          if (!(tp > entry)) return fail("no structure target above the retest close");
          consume(ctx, ID, levelKey("bos-high", level));
          return pass(
            `bullish BOS above ${level.toFixed(3)} (${bos.datetime}) with retest`,
            "long",
            entry,
            sl,
            tp,
          );
        }
      }

      const lows = confirmedBefore(ctx.pivotLows, b);
      const brokenLow = [...lows].reverse().find((p) => bos.close! < p.price);
      if (brokenLow && !isConsumed(ctx, ID, levelKey("bos-low", brokenLow.price))) {
        const level = brokenLow.price;
        if (c.high! >= level - buffer) {
          if (!(c.close! < level)) {
            return fail(`retest of ${level.toFixed(3)} closed back above the broken level`);
          }
          const entry = c.close!;
          const sl = Math.max(c.high!, level) + 0.1 * atrValue;
          const tp = targetBelow(ctx, i, entry) ?? entry - 2 * (sl - entry);
          if (!(tp < entry)) return fail("no structure target below the retest close");
          consume(ctx, ID, levelKey("bos-low", level));
          return pass(
            `bearish BOS below ${level.toFixed(3)} (${bos.datetime}) with retest`,
            "short",
            entry,
            sl,
            tp,
          );
        }
      }
    }

    return fail(`no break of structure with a retest within ${RETEST_WINDOW} bars`);
  },
};
