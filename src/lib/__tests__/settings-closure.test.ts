import { describe, expect, it } from "vitest";
import { scopedEntries } from "@/lib/config-kernel/admin-view";
import { requisiteArchiveError } from "@/lib/reference.schema";

const C = { type: "company", id: "terzi" };
const R = { type: "role", id: "manager" };
const row = (key: string, scope: typeof C, status: string) => ({ key, scope_type: scope.type, scope_id: scope.id, status });

describe("role-scope dictionary inheritance", () => {
  const rows = [row("a", C, "published"), row("b", C, "draft"), row("a", R, "draft"), row("c", R, "published")];
  it("роль бачить опубліковані довідники компанії як успадковані, без дублів", () => {
    const e = scopedEntries(rows, R, C);
    expect(e.map((x) => x.key)).toEqual(["a", "c"]);
    expect(e[0].inherited?.status).toBe("published");
    expect(e[0].own?.draft).toBeTruthy();
    expect(e[1].inherited).toBeUndefined();
  });
  it("компанія бачить лише свої записи", () => {
    expect(scopedEntries(rows, C, C).map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("requisite archive guard", () => {
  const rows = [
    { id: "1", code: "fop1", is_default: true, archived_at: null },
    { id: "2", code: "fop2", is_default: false, archived_at: null },
  ];
  it("не можна архівувати єдину основну компанію", () => {
    expect(requisiteArchiveError("1", true, rows)).toMatch(/Спершу призначте/);
  });
  it("можна архівувати не основну, повернути будь-яку, або основну при іншій основній", () => {
    expect(requisiteArchiveError("2", true, rows)).toBeNull();
    expect(requisiteArchiveError("1", false, rows)).toBeNull();
    expect(requisiteArchiveError("1", true, [...rows, { id: "3", code: "fop3", is_default: true, archived_at: null }])).toBeNull();
  });
});
