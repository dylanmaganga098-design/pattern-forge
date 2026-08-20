import { eatDay } from "../time";
import { at, consume, fail, isAtr, isConsumed, pass, requireAtr, reliable, valid } from "./util";
import type { StrategyCheck } from "../types";

const ID = "asian_london";

/**
 * Spec #6 — the EAT Asian range is swept during London (wick beyond), then a
 * later London bar *closes* back inside the range, giving a directional bias.
 * The day's range is consumed once used.
 */
export const asianLondon: StrategyCheck = {
  id: ID,
  name: "Asian Sweep + London Reclaim",
  run: (ctx, i) => {
    const c = ctx.candles[i];
    if (!valid(c)) return fail("INVALID: missing core fields");
    if (!reliable(c)) return fail("is_reliable = false");
    if (c.session !== "london")
      return fail(`session = ${c.session} (reclaim must occur in london)`);
    const day = eatDay(c.datetime);
    const range = ctx.asian.get(day);
    if (!range) return fail(`no asian session range recorded for ${day}`);
    const atrValue = requireAtr(ctx, i);
    if (!isAtr(atrValue)) return atrValue;

    const upKey = `${day}:high`;
    const downKey = `${day}:low`;

    let sweptHighAt: number | undefined;
    let sweptLowAt: number | undefined;
    let extremeHigh = -Infinity;
    let extremeLow = Infinity;
    for (let k = range.end + 1; k <= i; k++) {
      const bar = at(ctx, k);
      if (!valid(bar) || bar.session !== "london") continue;
      if (bar.high! > range.high) {
        sweptHighAt = k;
        extremeHigh = Math.max(extremeHigh, bar.high!);
      }
      if (bar.low! < range.low) {
        sweptLowAt = k;
        extremeLow = Math.min(extremeLow, bar.low!);
      }
    }

    const inside = c.close! <= range.high && c.close! >= range.low;
    if (sweptHighAt !== undefined && !isConsumed(ctx, ID, upKey)) {
      if (!inside)
        return fail("asian high swept but this bar has not closed back inside the range");
      consume(ctx, ID, upKey);
      const entry = c.close!;
      const sl = extremeHigh + 0.1 * atrValue;
      const tp = range.low;
      if (!(tp < entry)) return fail("asian low is not below the reclaim close");
      return pass(
        `asian high ${range.high.toFixed(3)} swept in london and reclaimed — bearish bias`,
        "short",
        entry,
        sl,
        tp,
      );
    }
    if (sweptLowAt !== undefined && !isConsumed(ctx, ID, downKey)) {
      if (!inside) return fail("asian low swept but this bar has not closed back inside the range");
      consume(ctx, ID, downKey);
      const entry = c.close!;
      const sl = extremeLow - 0.1 * atrValue;
      const tp = range.high;
      if (!(tp > entry)) return fail("asian high is not above the reclaim close");
      return pass(
        `asian low ${range.low.toFixed(3)} swept in london and reclaimed — bullish bias`,
        "long",
        entry,
        sl,
        tp,
      );
    }

    return fail("no unconsumed asian sweep to reclaim in this london session");
  },
};
