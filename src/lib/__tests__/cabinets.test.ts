import { describe, expect, it } from "vitest";
import { cabinetEconomy, leadLevel, resolveCabinet, stageConversion, stageLevelByName } from "@/lib/marketing/cabinets";

describe("UI v2 · кабінети: мапінг джерел лідів (реальні значення Live)", () => {
  it("канонічний канал має пріоритет", () => {
    expect(resolveCabinet({ channelKey: "google_ads", source: "0800" })).toBe("google");
    expect(resolveCabinet({ channelKey: "facebook", source: "Facebook Leads" })).toBe("meta");
    expect(resolveCabinet({ channelKey: "instagram", source: "Instagram" })).toBe("meta");
    expect(resolveCabinet({ channelKey: "olx", source: "OLX.работа" })).toBe("olx");
    expect(resolveCabinet({ channelKey: "site_forms", source: "ЧАТ САЙТ" })).toBe("site");
    expect(resolveCabinet({ channelKey: "tiktok_organic", source: "TikTok" })).toBe("tiktok");
    // Заданий нерекламний канал — «Інше», навіть якщо текст джерела схожий на рекламу
    expect(resolveCabinet({ channelKey: "referrals", source: "Facebook Leads" })).toBe("other");
    expect(resolveCabinet({ channelKey: "binotel", source: "Вхідний дзвінок (холодний)" })).toBe("other");
    expect(resolveCabinet({ channelKey: "adsquiz", source: "Quiz_Pol" })).toBe("other");
  });

  it("без каналу — UTM / click id", () => {
    expect(resolveCabinet({ source: "google", utm: { utm_source: "google", utm_medium: "cpc" } })).toBe("google");
    expect(resolveCabinet({ source: "www.google.com", utm: { utm_source: "www.google.com", utm_medium: "organic" } })).toBe("site");
    expect(resolveCabinet({ source: "(direct)", utm: { utm_source: "(direct)", utm_medium: "(none)" } })).toBe("site");
    expect(resolveCabinet({ source: "Не класифіковано", utm: { gclid: "abc" } })).toBe("google");
    expect(resolveCabinet({ source: null, utm: { utm_source: "facebook", utm_medium: "paid" } })).toBe("meta");
    expect(resolveCabinet({ source: null, utm: { utm_source: "ig" } })).toBe("meta");
  });

  it("без каналу й UTM — текст джерела; невідоме → «Інше»", () => {
    expect(resolveCabinet({ source: "Google Ads (пошук)" })).toBe("google");
    expect(resolveCabinet({ source: "Google Ads (медійна)" })).toBe("google");
    expect(resolveCabinet({ source: "FB Lid" })).toBe("meta");
    expect(resolveCabinet({ source: "Instagram" })).toBe("meta");
    expect(resolveCabinet({ source: "OLX" })).toBe("olx");
    expect(resolveCabinet({ source: "Сайт terzi.biz (форма)" })).toBe("site");
    expect(resolveCabinet({ source: "TikTok" })).toBe("tiktok");
    for (const s of ["Не класифіковано", "Coll back", "0800", "ЗВОНОБОТ", "Холодная база", "Прораб", "Наружная реклама", "Тест", "", null]) {
      expect(resolveCabinet({ source: s })).toBe("other");
    }
  });
});

describe("UI v2 · кабінети: воронка та економіка", () => {
  it("етапи CRM за назвою (keyCRM)", () => {
    expect(stageLevelByName("ЗАМЕР НАЗНАЧЕН")).toBe("measurement");
    expect(stageLevelByName("ЗАМЕР ВЫПОЛНЕН")).toBe("measurement");
    expect(stageLevelByName("ФИНАЛЬНАЯ СМЕТА ОТПРАВЛЕНА/ДУМАЕТ")).toBe("proposal");
    expect(stageLevelByName("ПРЕДВАРИТЕЛЬНАЯ СМЕТА ОТПРАВЛЕНА")).toBeNull();
    expect(stageLevelByName("Новый лид")).toBeNull();
  });

  it("рівень ліда накопичувальний", () => {
    expect(leadLevel({ won: true, hasProposal: false, hasMeasurement: false, stageLevel: null })).toBe(4);
    expect(leadLevel({ won: false, hasProposal: false, hasMeasurement: false, stageLevel: "proposal" })).toBe(3);
    expect(leadLevel({ won: false, hasProposal: false, hasMeasurement: true, stageLevel: null })).toBe(2);
    expect(leadLevel({ won: false, hasProposal: false, hasMeasurement: false, stageLevel: null })).toBe(1);
  });

  it("конверсія й економіка без вигаданих нулів", () => {
    expect(stageConversion(100, 42)).toBe(42);
    expect(stageConversion(0, 5)).toBeNull();
    expect(stageConversion(null, 5)).toBeNull();
    expect(cabinetEconomy({ spend: null, leads: 10, deals: 2, dealValue: 100000 })).toEqual({ cpl: null, costPerDeal: null, romi: null, leadToDeal: 20 });
    expect(cabinetEconomy({ spend: 10000, leads: 20, deals: 2, dealValue: 45000 })).toEqual({ cpl: 500, costPerDeal: 5000, romi: 350, leadToDeal: 10 });
  });
});
