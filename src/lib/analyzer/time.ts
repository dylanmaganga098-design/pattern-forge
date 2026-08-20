/**
 * Every datetime in the generator's CSV is East Africa Time (EAT, UTC+03:00)
 * wall-clock. All session, day-reset and opening-range logic in the analyzer
 * reads time through these helpers so no library default (UTC/local) can
 * silently shift a session boundary.
 */

export const EAT_OFFSET = "+03:00";

export interface EatParts {
  day: string; // yyyy-mm-dd in EAT
  hour: number;
  minute: number;
  minutesOfDay: number;
  ms: number; // absolute epoch ms
}

export function eatParts(datetime: string): EatParts | undefined {
  const match = String(datetime)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return undefined;
  const day = match[1]!;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const ms = Date.parse(`${day}T${match[2]}:${match[3]}:00${EAT_OFFSET}`);
  return { day, hour, minute, minutesOfDay: hour * 60 + minute, ms };
}

/** Calendar day in EAT — the daily reset used for pivot levels. */
export function eatDay(datetime: string): string {
  return eatParts(datetime)?.day ?? String(datetime).trim().split(/[ T]/)[0] ?? "";
}

export function eatMinutes(datetime: string): number | undefined {
  return eatParts(datetime)?.minutesOfDay;
}

/**
 * Session windows in EAT. These mirror the generator's labels
 * (asian / london / ny) so both sides of the pipeline agree.
 */
export const SESSION_WINDOWS_EAT: Record<string, { start: number; end: number }> = {
  // 01:00-10:59 EAT (22:00-07:59 UTC)
  asian: { start: 1 * 60, end: 10 * 60 + 59 },
  // 11:00-15:59 EAT (08:00-12:59 UTC)
  london: { start: 11 * 60, end: 15 * 60 + 59 },
  // 16:00-00:59 EAT (13:00-21:59 UTC)
  ny: { start: 16 * 60, end: 24 * 60 + 59 },
};

export function sessionOf(datetime: string): "asian" | "london" | "ny" | undefined {
  const parts = eatParts(datetime);
  if (!parts) return undefined;
  const m = parts.minutesOfDay;
  if (m >= SESSION_WINDOWS_EAT["asian"]!.start && m <= SESSION_WINDOWS_EAT["asian"]!.end)
    return "asian";
  if (m >= SESSION_WINDOWS_EAT["london"]!.start && m <= SESSION_WINDOWS_EAT["london"]!.end)
    return "london";
  return "ny";
}

/** Minutes elapsed since the session opened, in EAT. */
export function minutesIntoSession(datetime: string, session: string): number | undefined {
  const parts = eatParts(datetime);
  const window = SESSION_WINDOWS_EAT[session];
  if (!parts || !window) return undefined;
  let m = parts.minutesOfDay;
  if (m < window.start) m += 24 * 60; // ny rolls past midnight
  return m - window.start;
}
