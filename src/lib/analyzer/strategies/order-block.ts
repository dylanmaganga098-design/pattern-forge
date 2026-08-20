import { nearestAbove, nearestBelow } from "../pivots";
import {
  at,
  closedBeyond,
  consume,
  fail,
  geometry,
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
import type { Candle, StrategyCheck } from "../types";

const ID = "order_block";
const IMPULSE_ATR = 1.5;
const LOOKBACK = 60;

function isBull(c: Candle): boolean {
  return c.close! > c.open!;
}

/**
 * Spec #4 — the last opposite-coloured candle before a >1.5xATR impulse that
 * broke structure is the order block. A later bar overlapping that zone and
 * closing in the impulse direction is the entry. Zone convention: full range.
 * A block whose zone has been closed fully through is mitigated and consumed.
 */
export const orderBlock: StrategyCheck = {
  id: ID,
  name: "Order Block Return",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    for (let j = i - 1; j >= 1 && j >= i - LOOKBACK; j--) {
      const impulse = at(ctx, j);
      if (!valid(impulse)) continue;
      const impulseAtr = ctx.atr[j];
      if (impulseAtr === undefined || impulseAtr <= 0) continue;
      const { range } = geometry(impulse);
      if (range <= IMPULSE_ATR * impulseAtr) continue;
      const up = isBull(impulse);
      // The impulse must close beyond a prior structure level.
      const broke = up
        ? nearestBelow(ctx.pivotHighs, j, impulse.close!) !== undefined
        : nearestAbove(ctx.pivotLows, j, impulse.close!) !== undefined;
      if (!broke) continue;

      let ob: Candle | undefined;
      for (let k = j - 1; k >= 0 && k >= j - 10; k--) {
        const candidate = at(ctx, k);
        if (!valid(candidate)) continue;
        if (isBull(candidate) !== up) {
          ob = candidate;
          break;
        }
      }
      if (!ob) continue;
      const key = levelKey(up ? "ob-bull" : "ob-bear", ob.low! + ob.high!);
      if (isConsumed(ctx, ID, key)) continue;

      // Mitigated once price closed fully through the zone.
      if (closedBeyond(ctx, j, i - 1, up ? ob.low! : ob.high!, up ? "below" : "above")) {
        consume(ctx, ID, key);
        continue;
      }

      // Touch uses the wick range overlap.
      const returned = c.low! <= ob.high! && c.high! >= ob.low!;
      if (!returned) return fail(`price has not returned to order block ${ob.low}-${ob.high}`);
      // Confirmation uses the close, in the impulse direction.
      if (up ? c.close! <= c.open! : c.close! >= c.open!) {
        return fail("return bar did not close in the impulse direction");
      }
      const entry = c.close!;
      const sl = up ? ob.low! - 0.1 * atrValue : ob.high! + 0.1 * atrValue;
      const tp =
        (up ? targetAbove(ctx, i, entry) : targetBelow(ctx, i, entry)) ??
        (up ? entry + range : entry - range);
      if (up ? !(tp > entry) : !(tp < entry)) return fail("no structure target beyond the entry");
      consume(ctx, ID, key);
      return pass(
        `returned to ${up ? "bullish" : "bearish"} order block at ${ob.datetime} (impulse ${(range / impulseAtr).toFixed(1)}xATR)`,
        up ? "long" : "short",
        entry,
        sl,
        tp,
      );
    }
    return fail("no unmitigated order block from a >1.5xATR impulse");
  },
};
