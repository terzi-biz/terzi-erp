import { describe, it, expect } from "vitest";
import { isProtectedFromAutoMatch, splitReconciliationBacklog } from "../finance/match-status";
import { linkTransactionInput, periodFilter } from "../finance/finance.schema";

const id = "11111111-1111-4111-8111-111111111111";

describe("ignored match status", () => {
  it("ignored survives auto-match; manual protected; unmatched not", () => {
    expect(isProtectedFromAutoMatch({ id, match_status: "ignored" }, new Set())).toBe(true);
    expect(isProtectedFromAutoMatch({ id, match_status: "unmatched" }, new Set([id]))).toBe(true);
    expect(isProtectedFromAutoMatch({ id, match_status: "unmatched" }, new Set())).toBe(false);
  });
  it("ignored manual action needs no entity but requires reason", () => {
    const ok = linkTransactionInput.parse({ transaction_id: id, status: "ignored", reason: "Податки" });
    expect(ok.order_id ?? ok.client_id ?? ok.counterparty_id ?? null).toBeNull();
    expect(() => linkTransactionInput.parse({ transaction_id: id, status: "ignored" })).toThrow();
    expect(() => linkTransactionInput.parse({ transaction_id: id, status: "ignored", reason: "ab" })).toThrow();
    expect(linkTransactionInput.parse({ transaction_id: id, order_id: id, status: "matched" }).status).toBe("matched");
  });
  it("filter accepts ignored", () => {
    expect(periodFilter.parse({ from: "2026-01-01", to: "2026-01-31", match_status: "ignored" }).match_status).toBe("ignored");
  });
  it("backlog excludes ignored; totals keep it", () => {
    const rows = [
      { kind: "expense", match_status: "ignored", amount: 100 },
      { kind: "expense", match_status: "unmatched", amount: 50 },
      { kind: "transfer", match_status: "unmatched", amount: 999 },
    ];
    const { nonTransfer, ignored, backlog } = splitReconciliationBacklog(rows);
    expect(backlog).toHaveLength(1);
    expect(ignored).toHaveLength(1);
    expect(nonTransfer.reduce((s, r) => s + r.amount, 0)).toBe(150);
  });
});
