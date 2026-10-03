import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditDashboard } from "./EditDashboard"

const h = vi.hoisted(() => ({ save: vi.fn<(input: { keys: string[] }) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })) }))
vi.mock("@/server/actions/dashboard", () => ({ saveDashboard: h.save }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const labels = () => within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent)
const open = () => fireEvent.click(screen.getByRole("button", { name: "Edit My Dashboard" }))

beforeEach(() => h.save.mockClear())

describe("EditDashboard", () => {
  it("lists the chosen metrics first, then the rest switched off", async () => {
    render(<EditDashboard keys={["steps", "hrv"]} />)
    open()
    await screen.findByRole("list")
    expect(labels().slice(0, 3)).toEqual(["Steps", "Heart rate variability", "Resting heart rate"])
    expect(screen.getByRole("switch", { name: "Show Steps on Home" })).toBeChecked()
    expect(screen.getByRole("switch", { name: "Show Resting heart rate on Home" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Move Steps up" })).toBeDisabled()
  })

  it("toggles and reorders, then saves the shown metrics in order", async () => {
    render(<EditDashboard keys={["hrv", "rhr", "resp"]} />)
    open()
    fireEvent.click(await screen.findByRole("button", { name: "Move Respiratory rate up" }))
    expect(labels().slice(0, 3)).toEqual(["Heart rate variability", "Respiratory rate", "Resting heart rate"])
    expect(screen.getByRole("status")).toHaveTextContent("Respiratory rate moved to position 2 of 8")
    fireEvent.click(screen.getByRole("switch", { name: "Show Heart rate variability on Home" }))
    fireEvent.click(screen.getByRole("switch", { name: "Show Steps on Home" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ keys: ["resp", "rhr", "steps"] }))
  })

  it("can't save with nothing shown; Reset to default restores every metric in order", async () => {
    render(<EditDashboard keys={["sleep"]} />)
    open()
    expect(await screen.findByRole("button", { name: "Reset to default" })).toBeEnabled()
    fireEvent.click(screen.getByRole("switch", { name: "Show Sleep performance on Home" }))
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("Turn on at least one metric")
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }))
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled()
    expect(screen.getAllByRole("switch").every((s) => s.getAttribute("aria-checked") === "true")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ keys: ["hrv", "rhr", "resp", "sleep", "calories", "steps", "spo2", "skin"] }))
  })
})
