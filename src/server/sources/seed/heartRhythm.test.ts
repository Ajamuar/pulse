import { afterAll, describe, expect, it } from "vitest";
import { cleanup, DAY_S, dump, NOW, seeded } from "../../testing";

afterAll(cleanup);

const count = (db: ReturnType<typeof seeded>) => db.$client.prepare("select count(*) from health_records").pluck().get();

describe("seedHeartRhythm", () => {
  it("is deterministic, and a later pull adds no duplicates", () => {
    const a = seeded([NOW], { compute: false });
    expect(dump(a, "health_records")).toBe(dump(seeded([NOW], { compute: false }), "health_records"));
    expect(a.$client.prepare("select kind from health_records order by ts").pluck().all()).toEqual(["ecg", "irn", "ecg", "ecg"]);
    expect(count(seeded([NOW - 40 * DAY_S, NOW], { compute: false }))).toBe(4);
  });
});
