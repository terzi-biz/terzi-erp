import { describe, expect, it } from "vitest";
import { measurementPatchFromEvent } from "@/lib/measurements.server";

describe("календар → замір", () => {
  it("перенесення події переносить дату заміру", () => {
    const p = measurementPatchFromEvent({ starts_at: "2026-10-01T08:00:00Z", current_status: "planned" });
    expect(p['scheduled_at']).toBe("2026-10-01T08:00:00Z");
  });

  it("призначення виконавця переводить у assigned", () => {
    const p = measurementPatchFromEvent({ employee_id: "u-1", status: "planned", current_status: "planned" });
    expect(p['surveyor_id']).toBe("u-1");
    expect(p['status']).toBe("assigned");
  });

  it("завершення події завершує замір", () => {
    const p = measurementPatchFromEvent({ status: "done", current_status: "in_progress" });
    expect(p['status']).toBe("completed");
    expect(p['measured_at']).toBeTruthy();
  });

  it("не відкочує завершений замір назад", () => {
    const p = measurementPatchFromEvent({ status: "planned", current_status: "completed" });
    expect(p['status']).toBeUndefined();
  });

  it("скасування події скасовує замір навіть після завершення", () => {
    const p = measurementPatchFromEvent({ status: "cancelled", current_status: "completed" });
    expect(p['status']).toBe("canceled");
  });

  it("порожня подія не створює патч", () => {
    expect(Object.keys(measurementPatchFromEvent({ current_status: "planned" }))).toHaveLength(0);
  });
});
