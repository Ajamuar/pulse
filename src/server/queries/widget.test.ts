import { beforeAll, describe, expect, it } from "vitest";
import { type Db } from "../db";
import { addUser, ctxFor, NOW, seeded } from "../testing";
import { todayOf } from "./common";
import { getHome } from "./home";
import { getWidget } from "./widget";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getWidget", () => {
  it("matches today's Home dials", async () => {
    const ctx = ctxFor(db);
    const home = await getHome(todayOf(ctx), ctx);
    const widget = await getWidget(ctx);
    expect(widget.sleep.value).toBe(home.dials.sleep.value);
    expect(widget.recovery.value).toBe(home.dials.recovery.value);
    expect(widget.strain.value).toBe(home.dials.strain.value);
    expect(widget.strain.target).toEqual(home.dials.strainTarget);
  });

  it("returns nulls when today has no scores", async () => {
    const widget = await getWidget(ctxFor(db, NOW, await addUser(db)));
    expect(widget).toEqual({
      sleep: { value: null },
      recovery: { value: null },
      strain: { value: null, target: null },
    });
  });
});
