import { classicPivots, priorDay } from "../daily";
import {
  fail,
  isAtr,
  keyLevels,
  levelNear,
  pass,
  pinBarShape,
  requireAtr,
  reliable,
  targetAbove,
  targetBelow,
  valid,
} from "./util";
import type { AnalysisContext, Outcome, StrategyCheck } from "../types";

const TOLERANCE_ATR = 0.1;

/**
 * Spec #10 — pin bar geometry (rejecting wick > 2x body, small opposite wick)
 * whose extreme wick touches a key level within 0.1xATR. Key levels are
 * confirmed fractal pivots plus the prior EAT day's classic pivots.
 */
export function pinBarOutcome(ctx: AnalysisContext, i: number): Outcome {
  const c = ctx.candles[i];
  if (!valid(c)) return fail("INVALID: missing core fields");
  if (!reliable(c)) return fail("is_reliable = false");
  const atrValue = requireAtr(ctx, i);
  if (!isAtr(atrValue)) return atrValue;
  const shape = pinBarShape(c);
  if (!shape) return fail("candle is not a pin bar (wick <= 2x body or opposite wick too large)");
  const bullish = shape === "bullish";
  const tolerance = TOLERANCE_ATR * atrValue;
  const wickExtreme = bullish ? c.low! : c.high!;

  let levelPrice = levelNear(keyLevels(ctx, i), wickExtreme, tolerance)?.price;
  if (levelPrice === undefined) {
    const prior = priorDay(ctx.daily, c);
    if (prior) {
      const p = classicPivots(prior);
      levelPrice = [p.pp, p.r1, p.r2, p.s1, p.s2]
        .filter((value) => Math.abs(value - wickExtreme) <= tolerance)
        .sort((a, b) => Math.abs(a - wickExtreme) - Math.abs(b - wickExtreme))[0];
    }
  }
  if (levelPrice === undefined) return fail("pin bar wick is not within 0.1xATR of a key level");

  const entry = c.close!;
  const sl = bullish ? c.low! - 0.1 * atrValue : c.high! + 0.1 * atrValue;
  const tp =
    (bullish ? targetAbove(ctx, i, entry) : targetBelow(ctx, i, entry)) ??
    (bullish ? entry + 3 * atrValue : entry - 3 * atrValue);
  if (bullish ? !(tp > entry) : !(tp < entry)) return fail("no structure target beyond the entry");
  return pass(
    `${shape} pin bar rejecting key level ${levelPrice.toFixed(3)}`,
    bullish ? "long" : "short",
    entry,
    sl,
    tp,
  );
}

export const pinBar: StrategyCheck = {
  id: "pin_bar",
  name: "Pin Bar at Key Level",
  run: pinBarOutcome,
};
