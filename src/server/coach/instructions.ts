// The coach's instructions for one request: the admin dashboard's current wording (else the default in texts.ts),
// with today's date and the user's time zone filled in, so "today" is their local day.
import { todayOf, type QueryCtx } from "../queries/common";
import { defaultTexts, fillInstructions, type Texts } from "./texts";

export function coachInstructions(ctx: QueryCtx, t: Texts = defaultTexts): string {
  return fillInstructions(t("instructions"), { today: todayOf(ctx), timeZone: ctx.timeZone });
}
