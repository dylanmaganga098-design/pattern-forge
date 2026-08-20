import { classicPivots, priorDay } from "../daily";
import {
  at,
  engulfingShape,
  fail,
  isAtr,
  keyLevels,
  levelNear,
  pass,
  requireAtr,
  reliable,
  targetAbove,
  targetBelow,
  valid,
} from "./util";
import type { AnalysisContext, Outcome, StrategyCheck } from "../types";

/** Location tolerance X (in ATR) around the S/R level. */
const TOLERANCE_ATR = 0.25;

/**
 * Spec #11 — body-only engulfing containment (never wicks) occurring within
 * 0.25xATR of a defined S/R level: a confirmed fractal pivot or a prior-day
 * classic pivot.
 */
export function engulfingOutcome(ctx: AnalysisContext, i: number): Outcome {
  const c = ctx.candles[i];
  if (!valid(c)) return fail("INVALID: missing core fields");
  const prev = at(ctx, i - 1);
  if (!valid(prev)) return fail("prior candle unavailable or INVALID: missing core fields");
  if (!reliable(c) || !reliable(prev))
    return fail("is_reliable = false on engulfing or prior candle");
  const atrValue = requireAtr(ctx, i);
  if (!isAtr(atrValue)) return atrValue;
  const shape = engulfingShape(prev, c);
  if (!shape)
    return fail("body does not fully engulf the prior candle body in the opposite direction");
  const bullish = shape === "bullish";
  const tolerance = TOLERANCE_ATR * atrValue;
  const anchor = bullish ? Math.min(c.low!, prev.low!) : Math.max(c.high!, prev.high!);

  let levelPrice = levelNear(keyLevels(ctx, i), anchor, tolerance)?.price;
  if (levelPrice === undefined) {
    const prior = priorDay(ctx.daily, c);
    if (prior) {
      const p = classicPivots(prior);
      levelPrice = [p.pp, p.r1, p.r2, p.s1, p.s2]
        .filter((value) => Math.abs(value - anchor) <= tolerance)
        .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0];
    }
  }
  if (levelPrice === undefined) {
    return fail("engulfing pattern is not within 0.25xATR of a support/resistance level");
  }

  const entry = c.close!;
  const sl = bullish ? anchor - 0.1 * atrValue : anchor + 0.1 * atrValue;
  const tp =
    (bullish ? targetAbove(ctx, i, entry) : targetBelow(ctx, i, entry)) ??
    (bullish ? entry + 3 * atrValue : entry - 3 * atrValue);
  if (bullish ? !(tp > entry) : !(tp < entry)) return fail("no structure target beyond the entry");
  return pass(
    `${shape} engulfing at support/resistance ${levelPrice.toFixed(3)}`,
    bullish ? "long" : "short",
    entry,
    sl,
    tp,
  );
}

export const engulfing: StrategyCheck = {
  id: "engulfing",
  name: "Engulfing at Support/Resistance",
  run: engulfingOutcome,
};
