import { classicPivots, priorDay } from "../daily";
import { fail, geometry, isAtr, pass, requireAtr, reliable, valid } from "./util";
import type { StrategyCheck } from "../types";

const TOLERANCE_ATR = 0.1;
const WICK_BODY_RATIO = 2;

/**
 * Spec #5 — classic daily pivots derived from the prior *EAT* day's H/L/C
 * (our defined daily reset, not a library's midnight-UTC default). The tagging
 * bar needs a >2:1 wick:body and must close away from the level.
 */
export const pivotRejection: StrategyCheck = {
  id: "pivot_rejection",
  name: "Pivot Point Rejection",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;
    const prior = priorDay(ctx.daily, c);
    if (!prior) return fail("no prior EAT day available to compute classic pivots");
    const p = classicPivots(prior);
    const tolerance = TOLERANCE_ATR * atrValue;
    const levels: { name: string; value: number }[] = [
      { name: "S2", value: p.s2 },
      { name: "S1", value: p.s1 },
      { name: "PP", value: p.pp },
      { name: "R1", value: p.r1 },
      { name: "R2", value: p.r2 },
    ];
    const { body, upper, lower } = geometry(c);

    for (const level of levels) {
      // Tag uses the wick; rejection uses the close.
      const tagHigh = c.high! >= level.value - tolerance && c.close! < level.value;
      const tagLow = c.low! <= level.value + tolerance && c.close! > level.value;
      if (tagHigh) {
        if (!(upper > WICK_BODY_RATIO * body)) {
          return fail(`upper wick:body below ${WICK_BODY_RATIO}:1 at ${level.name}`);
        }
        const target = levels.filter((l) => l.value < c.close! - tolerance).sort((a, b) => b.value - a.value)[0];
        if (!target) return fail(`no lower pivot level to target from ${level.name}`);
        return pass(
          `rejected ${level.name} at ${level.value.toFixed(3)} (prior EAT day ${prior.day})`,
          "short",
          c.close!,
          c.high! + 0.1 * atrValue,
          target.value,
        );
      }
      if (tagLow) {
        if (!(lower > WICK_BODY_RATIO * body)) {
          return fail(`lower wick:body below ${WICK_BODY_RATIO}:1 at ${level.name}`);
        }
        const target = levels.filter((l) => l.value > c.close! + tolerance).sort((a, b) => a.value - b.value)[0];
        if (!target) return fail(`no higher pivot level to target from ${level.name}`);
        return pass(
          `rejected ${level.name} at ${level.value.toFixed(3)} (prior EAT day ${prior.day})`,
          "long",
          c.close!,
          c.low! - 0.1 * atrValue,
          target.value,
        );
      }
    }
    return fail("no rejection within 0.1xATR of PP, R1, R2, S1 or S2");
  },
};
