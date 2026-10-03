// Display heart-rate zones and time-in-zone. Four zones, named as Google names them (LIGHT, MODERATE,
// VIGOROUS, PEAK): Google's own bounds for a day when `daily-heart-rate-zones` has that day, else Pulse's
// fallback on % of max HR, cut so Light + Moderate = the old zones 1-3 (50-80%) and Vigorous + Peak = the
// old zones 4-5 (80%+). Independent of Strain's Edwards %HRR zones. Time-in-zone ports noop's HrZones.kt.
import type { HrSample } from "./types";

export const ZONE_NAMES = ["Light", "Moderate", "Vigorous", "Peak"] as const;

export interface HrZone {
  /** 1..4: Light, Moderate, Vigorous, Peak. */
  number: number;
  /** Inclusive, bpm. */
  lower: number;
  /** Exclusive except for the top zone. */
  upper: number;
}

export interface HrZoneSet {
  zones: HrZone[];
  maxHR: number;
  /** "google": the day's own bounds from Google; "max_hr": Pulse's % of max HR fallback. */
  source: "google" | "max_hr";
}

export interface TimeInZone {
  /** Seconds per zone (seconds[0] is Light). */
  seconds: number[];
  belowZone1: number;
}

/** Fallback lower edges as a share of max HR, then the top. */
export const zoneEdges = [0.5, 0.7, 0.8, 0.9, 1.0];

/** Zones from four lower bounds (bpm) and the top of the last zone. */
function fromBounds(lower: number[], maxHR: number, source: HrZoneSet["source"]): HrZoneSet {
  return {
    zones: lower.map((l, i) => ({ number: i + 1, lower: l, upper: i < lower.length - 1 ? lower[i + 1] : Math.max(maxHR, l) })),
    maxHR,
    source,
  };
}

/** Pulse's fallback: % of max HR. */
export const zones = (maxHR: number): HrZoneSet =>
  fromBounds(
    zoneEdges.slice(0, 4).map((e) => e * maxHR),
    maxHR,
    "max_hr",
  );

/**
 * Google's zones for a day: `[light, moderate, vigorous, peak]` minimum bpm plus the peak maximum, as the
 * Google mapper stores them. Null unless the four minimums are positive and strictly increasing.
 */
export function googleZones(bounds: number[] | null | undefined): HrZoneSet | null {
  if (!bounds || bounds.length !== 5 || !bounds.every((v) => Number.isFinite(v) && v > 0)) return null;
  for (let i = 1; i < 4; i++) if (bounds[i] <= bounds[i - 1]) return null;
  return fromBounds(bounds.slice(0, 4), bounds[4], "google");
}

/** Zone 1..4 for a bpm, or 0 below zone 1. The top zone is open-ended. */
export function zoneNumber(set: HrZoneSet, bpm: number): number {
  for (let i = set.zones.length - 1; i >= 0; i--) if (bpm >= set.zones[i].lower) return set.zones[i].number;
  return 0;
}

/**
 * Seconds per zone. Each sample holds until the next, capped at the median interval; the last sample gets
 * the median interval.
 */
export function timeInZone(hr: HrSample[], zoneSet: HrZoneSet): TimeInZone {
  const sorted = [...hr].sort((a, b) => a.ts - b.ts);
  const seconds = zoneSet.zones.map(() => 0);
  let below = 0.0;
  if (sorted.length === 0) return { seconds, belowZone1: 0.0 };
  const tail = medianInterval(sorted);
  for (let i = 0; i < sorted.length; i++) {
    let dur = tail;
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].ts - sorted[i].ts;
      dur = gap > 0 ? Math.min(gap, tail) : tail;
    }
    const z = zoneNumber(zoneSet, sorted[i].bpm);
    if (z >= 1) seconds[z - 1] += dur;
    else below += dur;
  }
  return { seconds, belowZone1: below };
}

/** Median gap among plausible (0, 300 s) gaps; 1 s when there are none. */
export function medianInterval(sorted: HrSample[]): number {
  if (sorted.length < 2) return 1.0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i].ts - sorted[i - 1].ts;
    if (g > 0 && g < 300) gaps.push(g);
  }
  if (gaps.length === 0) return 1.0;
  gaps.sort((a, b) => a - b);
  return Math.max(gaps[Math.floor(gaps.length / 2)], 1.0);
}

export const totalSeconds = (t: TimeInZone): number => t.seconds.reduce((a, b) => a + b, 0) + t.belowZone1;

export const secondsInZone = (t: TimeInZone, zone: number): number => (zone < 1 || zone > t.seconds.length ? 0.0 : t.seconds[zone - 1]);
