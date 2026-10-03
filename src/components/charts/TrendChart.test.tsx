// The stacked header: the selected day's total and split, or an honest "no breakdown" (spec §11 CAL1).
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendChart, type TrendPoint } from "./TrendChart";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/strain", useSearchParams: () => new URLSearchParams() }));

const STACK = [
  { key: "resting", label: "Resting", color: "var(--energy-resting)" },
  { key: "active", label: "Active", color: "var(--energy-active)" },
];
const chart = (last: TrendPoint) => {
  const points: TrendPoint[] = [{ date: "2026-09-30", value: 2000, parts: { resting: 1600, active: 400 } }, last];
  return render(
    <TrendChart label="Calories burned" unit="kcal" format="grouped" colorBy="single" stack={STACK} headline="day" ranges={["w", "m"]} defaultRange="w" data={{ value: points, reason: null, provisional: false }} />,
  );
};

describe("TrendChart stack", () => {
  it("heads with the last day's total and its split, active first", () => {
    chart({ date: "2026-10-01", value: 2150, parts: { resting: 1700, active: 450 } });
    expect(screen.getByText("2,150")).toBeInTheDocument();
    const legend = screen.getByText("Active").parentElement!;
    expect(legend.textContent).toBe("Active450Resting1,700");
    expect(screen.queryByText("Average")).not.toBeInTheDocument();
  });

  it("says no breakdown for a day with a total but no parts", () => {
    chart({ date: "2026-10-01", value: 2150, parts: null });
    expect(screen.getByText("2,150")).toBeInTheDocument();
    expect(screen.getByText("No breakdown for this day")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});
