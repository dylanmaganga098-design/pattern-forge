import { openingRangeFor } from "../daily";
import { at, closedBeyond, fail, isAtr, pass, requireAtr, reliable, valid } from "./util";
import type { StrategyCheck } from "../types";

const RETEST_TOLERANCE_ATR = 0.15;
const INVALIDATION_ATR = 0.5;

/**
 * Spec #3 — the first M minutes of the EAT session define the range. A close
 * beyond it is the breakout; the entry is a *shallow* retest of the boundary
 * that closes back in the breakout direction.
 */
export const openingRange: StrategyCheck = {
  id: "opening_range",
  name: "Opening Range Breakout + Retest",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const range = openingRangeFor(ctx.openingRanges, c);
    if (!range) return fail("no opening range for this session/day (london or ny only, EAT)");
    if (i < range.afterWindow) return fail("candle is inside the opening window itself");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;
    const tolerance = RETEST_TOLERANCE_ATR * atrValue;
    const invalidation = INVALIDATION_ATR * atrValue;

    // Most recent breakout bar strictly before this one, within the session.
    for (let b = i - 1; b >= range.afterWindow; b--) {
      const bar = at(ctx, b);
      if (!valid(bar)) continue;
      const up = bar.close! > range.high;
      const down = bar.close! < range.low;
      if (!up && !down) continue;
      const boundary = up ? range.high : range.low;

      if (closedBeyond(ctx, b, i - 1, up ? boundary - invalidation : boundary + invalidation, up ? "below" : "above")) {
        return fail(
          `breakout of ${boundary.toFixed(3)} invalidated — a bar closed beyond 0.5xATR back inside the range`,
        );
      }
      // Touch uses the wick.
      const touched = up ? c.low! <= boundary + tolerance : c.high! >= boundary - tolerance;
      if (!touched) return fail(`no shallow retest of ${boundary.toFixed(3)} on this bar`);
      // Confirmation uses the close.
      const reclaimed = up ? c.close! > boundary : c.close! < boundary;
      if (!reclaimed) {
        return fail(`retest bar closed ${c.close} through ${boundary.toFixed(3)} — failed breakout`);
      }
      const entry = c.close!;
      const sl = up
        ? Math.min(c.low!, boundary) - 0.1 * atrValue
        : Math.max(c.high!, boundary) + 0.1 * atrValue;
      const measured = range.high - range.low;
      const tp = up ? entry + measured : entry - measured;
      return pass(
        `${range.session} opening range breakout ${up ? "above" : "below"} ${boundary.toFixed(3)} with shallow retest`,
        up ? "long" : "short",
        entry,
        sl,
        tp,
      );
    }

    return fail("no opening range breakout before this bar");
  },
};
