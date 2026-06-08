import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_MATERIAL_PRICES, DEFAULT_SETTINGS, DEFAULT_WORK_PRICES,
  type MaterialPrice, type Settings,
} from "./screed-calc";
import { DEFAULT_ROOFING_COEFFS, type RoofingCoefficients } from "./roofing-calc";

export interface EstimateRecord {
  id: string;
  number: string;
  createdAt: number;
  module: "screed" | "roofing" | "insulation" | "demolition";
  clientName: string;
  clientPhone: string;
  address: string;
  manager: string;
  area: number;
  thicknessCm: number;
  totalClient: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  status: "draft" | "sent" | "approved" | "inWork" | "done" | "refused" | "archived";
  payload: unknown;
}

export interface Branding {
  company: string; tagline: string; phones: string[]; website: string; address: string;
  workHours: string; advantages: string[]; warrantyText: string; paymentTerms: string; ctaText: string;
}

interface AppState {
  materialPrices: Record<string, MaterialPrice>;
  workPrices: typeof DEFAULT_WORK_PRICES;
  settings: Settings;
  roofingCoeffs: RoofingCoefficients;
  branding: Branding;
  history: EstimateRecord[];

  setMaterialPrice: (key: string, p: MaterialPrice) => void;
  setWorkPrice: (key: keyof typeof DEFAULT_WORK_PRICES, v: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateRoofingCoeffs: (patch: Partial<RoofingCoefficients>) => void;
  resetDefaults: () => void;
  updateBranding: (b: Partial<Branding>) => void;
  addEstimate: (e: EstimateRecord) => void;
  removeEstimate: (id: string) => void;
}

const defaultBranding: Branding = {
  company: "TERZI",
  tagline: "Точний кошторис. Преміальна реалізація. Якість, перевірена часом.",
  phones: ["0 800 20 75 00", "+38 (063) 858 07 48", "+38 (093) 120 31 69"],
  website: "terzi.ua",
  address: "м. Одеса, площа 10-го квітня 1, офіс 4",
  workHours: "Пн–Пт: 09:00 – 18:00",
  advantages: [
    "З 2004 року на ринку (22+ років досвіду)",
    "3500+ виконаних об'єктів",
    "10 років письмової гарантії",
    "Офіційний договір та прозорі умови",
    "Німецьке обладнання та власні бригади",
    "Зручна оплата: готівка / безготівка / ФОП / з ПДВ",
  ],
  warrantyText: "10 років письмової гарантії на виконані роботи.",
  paymentTerms: "Кошторис актуальний 72 години. Передплата 50% за матеріали.",
  ctaText: "Зателефонуйте сьогодні, щоб закріпити кошторис.",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      materialPrices: { ...DEFAULT_MATERIAL_PRICES },
      workPrices: { ...DEFAULT_WORK_PRICES },
      settings: { ...DEFAULT_SETTINGS },
      roofingCoeffs: { ...DEFAULT_ROOFING_COEFFS },
      branding: defaultBranding,
      history: [],
      setMaterialPrice: (key, p) => set((s) => ({ materialPrices: { ...s.materialPrices, [key]: p } })),
      setWorkPrice: (key, v) => set((s) => ({ workPrices: { ...s.workPrices, [key]: v } })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateRoofingCoeffs: (patch) => set((s) => ({ roofingCoeffs: { ...s.roofingCoeffs, ...patch } })),
      resetDefaults: () => set({
        materialPrices: { ...DEFAULT_MATERIAL_PRICES }, workPrices: { ...DEFAULT_WORK_PRICES },
        settings: { ...DEFAULT_SETTINGS }, roofingCoeffs: { ...DEFAULT_ROOFING_COEFFS },
      }),
      updateBranding: (b) => set((s) => ({ branding: { ...s.branding, ...b } })),
      addEstimate: (e) => set((s) => ({ history: [e, ...s.history] })),
      removeEstimate: (id) => set((s) => ({ history: s.history.filter((x) => x.id !== id) })),
    }),
    { name: "terzi-app-store-v2" },
  ),
);

export const generateEstimateNumber = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `TZ-${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
};

export const useUserRole = create<{ role: "admin" | "director" | "manager" | "finance"; setRole: (r: "admin" | "director" | "manager" | "finance") => void }>()(
  persist((set) => ({ role: "admin", setRole: (role) => set({ role }) }), { name: "terzi-role" }),
);
