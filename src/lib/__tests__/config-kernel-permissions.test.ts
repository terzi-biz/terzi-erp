import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/lib/access.server", () => ({
  admin: async () => ({}),
  writeAudit: async () => {},
  requirePermission: async (userId: string, module: string, action: string) => {
    calls.push(`${module}:${action}`);
    if (userId !== "owner") throw new Error("Недостатньо прав для цієї дії");
    return { userId, name: null, roleKey: "owner", isOwner: true, canManage: true };
  },
}));

describe("config kernel permissions", () => {
  it("запис вимагає канонічного права settings:manage_settings", async () => {
    const { lifecycleFor } = await import("@/lib/config-kernel/config.server");
    await expect(lifecycleFor("sales-user")).rejects.toThrow("Недостатньо прав");
    await expect(lifecycleFor("owner")).resolves.toBeTruthy();
    expect(calls).toEqual(["settings:manage_settings", "settings:manage_settings"]);
  });
});
