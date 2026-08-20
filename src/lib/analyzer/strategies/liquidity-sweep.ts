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

const ID = "liquidity_sweep";
/** Bars allowed between the sweep bar and the reclaim confirmation. */
const MAX_RECLAIM_BARS = 3;
const RECLAIM_BUFFER_ATR = 0.1;

/**
 * Spec #1 — price wicks through a prior swing (high/low), then *closes* back
 * inside the range beyond a 0.1xATR buffer. Multi-bar reclaim window; the
 * stricter one-bar version lives in swing-failure.ts.
 */
export const liquiditySweep: StrategyCheck = {
  id: ID,
  name: "Liquidity Sweep + Reclaim",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;
    const buffer = RECLAIM_BUFFER_ATR * atrValue;

    for (let s = i; s >= i - MAX_RECLAIM_BARS && s >= 0; s--) {
      const sweep = at(ctx, s);
      if (!valid(sweep)) continue;

      // Bearish reversal: wick above a confirmed swing high, close back below.
      const highs = confirmedBefore(ctx.pivotHighs, s);
      for (const pivot of [...highs].reverse()) {
        if (isConsumed(ctx, ID, levelKey("high", pivot.price))) continue;
        if (!(sweep.high! > pivot.price && sweep.close! < pivot.price)) continue;
        if (!(c.close! < pivot.price - buffer)) {
          if (s === i - MAX_RECLAIM_BARS) {
            return fail(
              `swept ${pivot.price.toFixed(3)} but no close below the 0.1xATR reclaim buffer within ${MAX_RECLAIM_BARS} bars`,
            );
          }
          continue;
        }
        let extreme = sweep.high!;
        for (let k = s; k <= i; k++) {
          const bar = at(ctx, k);
          if (valid(bar)) extreme = Math.max(extreme, bar.high!);
        }
        const entry = c.close!;
        const sl = extreme + 0.1 * atrValue;
        const tp = targetBelow(ctx, i, entry) ?? entry - 3 * atrValue;
        if (!(tp < entry)) return fail("no structure target below the reclaim close");
        consume(ctx, ID, levelKey("high", pivot.price));
        return pass(
          `swept swing high ${pivot.price.toFixed(3)} (${sweep.datetime}) and reclaimed below it`,
          "short",
          entry,
          sl,
          tp,
        );
      }

      // Bullish mirror: wick below a confirmed swing low, close back above.
      const lows = confirmedBefore(ctx.pivotLows, s);
      for (const pivot of [...lows].reverse()) {
        if (isConsumed(ctx, ID, levelKey("low", pivot.price))) continue;
        if (!(sweep.low! < pivot.price && sweep.close! > pivot.price)) continue;
        if (!(c.close! > pivot.price + buffer)) {
          if (s === i - MAX_RECLAIM_BARS) {
            return fail(
              `swept ${pivot.price.toFixed(3)} but no close above the 0.1xATR reclaim buffer within ${MAX_RECLAIM_BARS} bars`,
            );
          }
          continue;
        }
        let extreme = sweep.low!;
        for (let k = s; k <= i; k++) {
          const bar = at(ctx, k);
          if (valid(bar)) extreme = Math.min(extreme, bar.low!);
        }
        const entry = c.close!;
        const sl = extreme - 0.1 * atrValue;
        const tp = targetAbove(ctx, i, entry) ?? entry + 3 * atrValue;
        if (!(tp > entry)) return fail("no structure target above the reclaim close");
        consume(ctx, ID, levelKey("low", pivot.price));
        return pass(
          `swept swing low ${pivot.price.toFixed(3)} (${sweep.datetime}) and reclaimed above it`,
          "long",
          entry,
          sl,
          tp,
        );
      }
    }

    return fail("no unconsumed swing level swept and reclaimed");
  },
};
