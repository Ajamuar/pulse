# Google's numbers vs Pulse's own algorithms

Rule (owner, 2026-10-03): where the Google Health API already gives a value, Pulse uses it instead of computing its own. Pulse computes only what Google does not expose. This audit maps every number Pulse computes against the API ([data types](https://developers.google.com/health/data-types), [data points](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints), [daily roll-ups](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp)), read 2026-10-03.

## Not in the API (Pulse must compute these)

The Fitbit / Google Health app shows several scores that the API does not expose as data types. None of the 44 data types, and none of the roll-up values, carry them:

| Fitbit app score | Pulse's own | Why Pulse computes it |
|---|---|---|
| Cardio Load, Target Load | Strain, Strain Target, Training load (ACWR) | No `cardio-load` type. Pulse derives load from heart-rate samples |
| Daily Readiness | Recovery | No readiness type |
| Sleep Score | Sleep performance, sleep need, Sleep Planner | `sleep` gives sessions and stages, not a score |
| Stress Management Score (EDA) | Stress Monitor | No stress or EDA type; Pulse's stress is HR-based |
| (none) | Energy Bank, Pulse Age, Sleep regularity (SRI), HR recovery, Behaviour Insights, Fitness level percentile | No Google equivalent |

## Google gives it: switch to Google's

| Pulse computes | Google provides | Change |
|---|---|---|
| HR zones from % of an estimated max HR (Tanaka 208 − 0.7 × age), `src/core/scoring/zones.ts` | `daily-heart-rate-zones`: the user's Karvonen zones per day (LIGHT, MODERATE, VIGOROUS, PEAK, each min/max bpm) | Use Google's zone bounds per day for time-in-zone, zone charts and per-activity zones; fall back to Pulse's only on days without a Google record |
| Max HR estimate when the user set none | PEAK zone's upper bound in `daily-heart-rate-zones` | Use it as max HR when the profile has none (user's own still wins) |
| Zones 1–3 and 4–5 minutes for Pulse Age, from HR samples | `time-in-heart-rate-zone` roll-up (duration per zone type per day) | Zones 1–3 = LIGHT + MODERATE, 4–5 = VIGOROUS + PEAK, from Google's roll-up |
| Skin-temperature deviation against Pulse's own causal baseline | `daily-sleep-temperature-derivations.baselineTemperatureCelsius` (30-day median) and `relativeNightlyStddev30dCelsius` | Deviation = nightly − Google's baseline; the Health Monitor range from Google's 30-day SD |
| Health Monitor ranges for resting HR and HRV (own baseline ± 2 SD over 60 nights) | Daily roll-up `restingHeartRatePersonalRange` and `heartRateVariabilityPersonalRange` (min/max) | Use Google's personal ranges for those two vitals; respiratory rate and SpO2 keep Pulse's (no Google range) |
| Recovery's resting HR from Pulse's sleep-session estimate (`sessionRestingHR`), daily RHR as fallback | `daily-resting-heart-rate` | Daily RHR first, the session estimate only on days Google has none |
| Calories, steps, distance, active minutes, AZM, VO2max, HRV, respiratory rate, SpO2, sleep stages | Already Google's | No change |

Recovery, Strain, Sleep performance and the other scores stay Pulse's own, but their inputs come from Google wherever a row above applies. Each switch changes stored scores, so it bumps `SCORING_VERSION`.

## Open points

- Google's Karvonen zones need the user's resting HR and max HR that Fitbit holds. A user who sets max HR in Pulse Settings may disagree with Fitbit's. Rule: the Pulse profile's explicit max HR wins over Google's; otherwise Google's.
- `time-in-heart-rate-zone` covers all day. Pulse's per-activity zone time still needs HR samples, but uses Google's zone bounds.
- The personal-range roll-ups appear in `DailyRollupDataPoint`, but the data types table lists only `list` for `daily-resting-heart-rate` and `daily-heart-rate-variability`. Which `dataType` path returns them is unconfirmed: try a roll-up on `heart-rate` first, and keep Pulse's ranges if neither answers.
- Strain itself (a TRIMP-style sum over HR reserve) stays Pulse's; only its zone bounds and max HR come from Google.
