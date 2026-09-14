import { describe, expect, it } from "vitest";
import {
  buildDuplicateGroups,
  canonicalLeadStatus,
  mapCustomFields,
  matchManager,
  mergeUtm,
  preservePatch,
} from "../keycrm/mapping";

describe("канонічний статус етапу keyCRM", () => {
  it("активний етап → open", () => {
    expect(canonicalLeadStatus({ title: "КВАЛИФИЦИРОВАННАЯ ЗАЯВКА", alias: "kvalificirovannaya", is_final: false }).status).toBe("open");
  });
  it("успішний етап → won", () => {
    expect(canonicalLeadStatus({ title: "Успешно / создать заказ", alias: "successful", is_final: true }).status).toBe("won");
  });
  it("фінальна відмова → lost, а назва етапу лишається причиною", () => {
    const r = canonicalLeadStatus({ title: "Дорого", alias: "dorogo", is_final: true });
    expect(r.status).toBe("lost");
    expect(r.lostReason).toBe("Дорого");
  });
  it("відкладено не стає втраченим", () => {
    expect(canonicalLeadStatus({ title: "ОТЛОЖЕНО", alias: "otlozeno", is_final: true }).status).toBe("postponed");
  });
});

describe("додаткові поля keyCRM", () => {
  it("зчитує UTM, GCLID, площу й адресу", () => {
    const m = mapCustomFields([
      { uuid: "LD_1077", name: "UTM Source", type: "text", value: "google" },
      { uuid: "LD_1082", name: "GCLID", type: "text", value: "CjwA" },
      { uuid: "LD_1006", name: "Площадь объекта в м²", type: "float", value: "120,5" },
      { uuid: "LD_1027", name: "Адрес объекта", type: "text", value: "вул. Тестова, 1" },
      { uuid: "LD_1001", name: "Тип услуги", type: "select", value: ["Напівсуха стяжка підлоги"] },
    ]);
    expect(m.utm.utm_source).toBe("google");
    expect(m.utm.gclid).toBe("CjwA");
    expect(m.area).toBe(120.5);
    expect(m.address).toBe("вул. Тестова, 1");
    expect(m.fields.service_type).toBe("Напівсуха стяжка підлоги");
    expect(Object.keys(m.raw).length).toBe(5);
  });
});

describe("порожні дані keyCRM не затирають ERP", () => {
  it("порожнє значення не пишеться, чужі поля лишаються", () => {
    const patch = preservePatch({ source: "Meta Ads", notes: "важливо" }, { source: null, notes: "", address: "Одеса" });
    expect(patch).toEqual({ address: "Одеса" });
  });
  it("поля, якими володіє keyCRM, оновлюються", () => {
    const patch = preservePatch({ status: "open", source: "Meta Ads" }, { status: "won", source: "keyCRM" }, ["status"]);
    expect(patch).toEqual({ status: "won" });
  });
  it("UTM доповнюється, наявна атрибуція зберігається", () => {
    const utm = mergeUtm({ utm_source: "meta", utm_campaign: "" }, { utm_source: "google", utm_campaign: "krovlya", gclid: "x" });
    expect(utm).toEqual({ utm_source: "meta", utm_campaign: "krovlya", gclid: "x" });
  });
});

describe("мапінг відповідальних", () => {
  const erp = [
    { id: "u1", email: "kolya432112@outlook.com", phone: "+380976026340", name: "Микола" },
    { id: "u2", email: "other@example.com", phone: "+380500000000", name: "Микола" },
  ];
  it("за e-mail", () => {
    expect(matchManager({ id: 6, email: "kolya432112@outlook.com", full_name: "Николай" }, erp)).toEqual({ userId: "u1", by: "email" });
  });
  it("лише за іменем не зіставляє", () => {
    expect(matchManager({ id: 9, full_name: "Микола" }, erp).userId).toBeNull();
  });
});

describe("детерміновані дублі клієнтів", () => {
  const base = { createdAt: "2026-01-01T00:00:00Z", status: "active" };
  it("однаковий E.164 → SAFE, виживає запис із найбільшою кількістю звʼязків", () => {
    const groups = buildDuplicateGroups([
      { id: "a", ...base, phoneE164: "+380501112233", relations: 1, completeness: 2 },
      { id: "b", ...base, phoneE164: "+380501112233", relations: 7, completeness: 3 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.safe).toBe(true);
    expect(groups[0]!.survivor.id).toBe("b");
    expect(groups[0]!.losers.map((l) => l.id)).toEqual(["a"]);
  });
  it("різні точні e-mail на одному номері → не SAFE", () => {
    const groups = buildDuplicateGroups([
      { id: "a", ...base, phoneE164: "+380501112233", email: "one@x.com" },
      { id: "b", ...base, phoneE164: "+380501112233", email: "two@x.com" },
    ]);
    expect(groups[0]!.safe).toBe(false);
    expect(groups[0]!.reason).toBeTruthy();
  });
  it("різні люди без спільних ознак не групуються", () => {
    const groups = buildDuplicateGroups([
      { id: "a", ...base, phoneE164: "+380501112233", name: "Іван" },
      { id: "b", ...base, phoneE164: "+380507778899", name: "Іван" },
    ]);
    expect(groups).toHaveLength(0);
  });
  it("архівні записи не потрапляють у групи", () => {
    const groups = buildDuplicateGroups([
      { id: "a", ...base, phoneE164: "+380501112233" },
      { id: "b", ...base, phoneE164: "+380501112233", status: "archived" },
    ]);
    expect(groups).toHaveLength(0);
  });
});
