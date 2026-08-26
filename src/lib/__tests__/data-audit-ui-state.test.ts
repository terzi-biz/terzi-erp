import { describe, expect, it } from "vitest";
import {
  auditErrorMessage,
  auditStatusText,
  exportButtonState,
  rowActionState,
  rowApplyDisabled,
  runButtonState,
} from "@/lib/data-audit/ui-state";

const base = { running: false, applying: false, hasReport: false, error: null };

describe("UI стани аудиту даних", () => {
  it("лоадер і блокування кнопки звіту під час запиту", () => {
    expect(runButtonState({ ...base, running: true })).toEqual({ disabled: true, loading: true });
    expect(runButtonState(base)).toEqual({ disabled: false, loading: false });
  });

  it("кнопка звіту заблокована під час застосування дії", () => {
    expect(runButtonState({ ...base, applying: true })).toEqual({ disabled: true, loading: false });
  });

  it("експорт доступний лише за наявності звіту", () => {
    expect(exportButtonState(base).disabled).toBe(true);
    expect(exportButtonState({ ...base, hasReport: true }).disabled).toBe(false);
    expect(exportButtonState({ ...base, hasReport: true, applying: true }).disabled).toBe(true);
  });

  it("рядок без applyKey — тільки ручне виправлення", () => {
    expect(rowActionState({ applyKey: null, applying: false })).toBe("manual");
    expect(rowApplyDisabled({ applyKey: null, applying: false })).toBe(true);
  });

  it("рядок після застосування показує результат і не дає повторити дію", () => {
    const r = { applyKey: "lead:1:2", appliedMessage: "Лід привʼязано до клієнта", applying: false };
    expect(rowActionState(r)).toBe("applied");
    expect(rowApplyDisabled(r)).toBe(true);
  });

  it("під час застосування всі кнопки рядків заблоковані", () => {
    const r = { applyKey: "lead:1:2", applying: true };
    expect(rowActionState(r)).toBe("busy");
    expect(rowApplyDisabled(r)).toBe(true);
  });

  it("повідомлення про помилку нормалізується", () => {
    expect(auditErrorMessage(new Error("Немає прав"))).toBe("Немає прав");
    expect(auditErrorMessage({ message: "   " }, "Помилка")).toBe("Помилка");
    expect(auditErrorMessage(null, "Помилка")).toBe("Помилка");
    expect(auditErrorMessage("Збій мережі")).toBe("Збій мережі");
  });

  it("текстовий статус відповідає стану", () => {
    expect(auditStatusText(base)).toBe("Звіт ще не сформовано.");
    expect(auditStatusText({ ...base, running: true })).toBe("Формуємо звіт…");
    expect(auditStatusText({ ...base, hasReport: true, applying: true })).toBe("Застосовуємо зміну…");
    expect(auditStatusText({ ...base, hasReport: true })).toBe("Готово.");
    expect(auditStatusText({ ...base, error: "Немає прав" })).toBe("Немає прав");
  });
});
