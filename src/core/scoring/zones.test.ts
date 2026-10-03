import { describe, expect, it } from "vitest";
import { googleZones, secondsInZone, timeInZone, totalSeconds, zoneNumber, zones } from "./zones";

describe("HrZonesTest", () => {
  it("a huge positive gap is capped at the median interval", () => {
    const tiz = timeInZone(
      [
        { ts: 0, bpm: 110 },
        { ts: 1, bpm: 110 },
        { ts: 2, bpm: 110 },
        { ts: 3602, bpm: 110 },
      ],
      zones(200),
    );
    expect(totalSeconds(tiz)).toBeLessThan(10);
    expect(secondsInZone(tiz, 1)).toBeCloseTo(totalSeconds(tiz), 9);
  });
});

describe("zones", () => {
  it("fallback: four zones on % of max HR, top zone open", () => {
    const zs = zones(200);
    expect(zs.source).toBe("max_hr");
    expect(zs.zones.map((z) => z.lower)).toEqual([100, 140, 160, 180]);
    expect([99, 100, 139, 140, 160, 180, 200, 210].map((b) => zoneNumber(zs, b))).toEqual([0, 1, 1, 2, 3, 4, 4, 4]);
    const hr = [...Array(60)].map((_, i) => ({ ts: i * 2, bpm: i < 30 ? 90 : 150 }));
    const tiz = timeInZone(hr, zs);
    expect(tiz.seconds).toHaveLength(4);
    expect(tiz.belowZone1).toBe(60);
    expect(secondsInZone(tiz, 2)).toBe(60); // 150 / 200 = 75%
    expect(totalSeconds(tiz)).toBe(120);
    expect(secondsInZone(tiz, 9)).toBe(0);
  });

  it("Google's bounds: minimums are the lower edges, the peak maximum the top", () => {
    const zs = googleZones([98, 118, 137, 157, 186])!;
    expect(zs).toMatchObject({ source: "google", maxHR: 186 });
    expect(zs.zones.map((z) => [z.lower, z.upper])).toEqual([
      [98, 118],
      [118, 137],
      [137, 157],
      [157, 186],
    ]);
    expect([97, 98, 117, 118, 156, 157, 200].map((b) => zoneNumber(zs, b))).toEqual([0, 1, 1, 2, 3, 4, 4]);
  });

  it("unreadable Google bounds are no zones", () => {
    expect(googleZones(null)).toBeNull();
    expect(googleZones([98, 118, 137, 157])).toBeNull();
    expect(googleZones([98, 118, 118, 157, 186])).toBeNull();
    expect(googleZones([0, 118, 137, 157, 186])).toBeNull();
  });
});
