/**
 * TERZI — генерація PDF кошторису/КП справжньою таблицею (не зображенням).
 * Використовує jsPDF + кириличні шрифти, фірмові колонтитули на всю ширину A4.
 * На вхід подаються ЕФЕКТИВНІ рядки (уже з урахуванням ручних правок у кошторисі),
 * тому PDF завжди збігається з тим, що видно на екрані.
 */
import jsPDF from "jspdf";
import headerImg from "@/assets/terzi-header.jpg";
import footerImg from "@/assets/terzi-footer.png";
import { attachCyrillicFonts } from "./pdfFonts";
import type { Branding } from "./store";

const FONT = "NotoSans";

export interface PdfRow {
  name: string;
  unit: string;
  qty: number;
  costPerUnit?: number;
  pricePerUnit: number;
  cost?: number;
  sum: number;
}
export interface PdfBlock {
  title: string;
  rows: PdfRow[];
}

export interface EstimatePdfInput {
  mode: "internal" | "client";
  number: string;
  date: string;
  clientName: string;
  clientPhone: string;
  address: string;
  manager: string;
  module: string;
  area: number;
  thicknessCm?: number;
  blocks: PdfBlock[];
  totalSell: number;
  totalCost?: number;
  grossProfit?: number;
  marginPercent?: number;
  pricePerM2: number;
  /** Сума ПДВ, уже включена в рядки матеріалів (0 — кошторис без ПДВ). */
  vatAmount?: number;
  /** Підпис ставки, напр. «ПДВ 20%». */
  vatLabel?: string;
  branding: Branding;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

const num = (v: number, d = 0) =>
  (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("uk-UA", { maximumFractionDigits: d });

export async function generateEstimatePdf(input: EstimatePdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await attachCyrillicFonts(doc);

  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const contentW = pageW - margin * 2;
  const [hdr, ftr] = await Promise.all([loadImage(headerImg), loadImage(footerImg)]);
  const hdrH = (hdr.height / hdr.width) * pageW;
  const ftrH = (ftr.height / ftr.width) * pageW;

  const drawFrame = () => {
    doc.addImage(hdr, "JPEG", 0, 0, pageW, hdrH);
    doc.addImage(ftr, "PNG", 0, pageH - ftrH, pageW, ftrH);
  };

  const top = hdrH + 6;
  const bottom = pageH - ftrH - 6;
  const avail = bottom - top;
  const internal = input.mode === "internal";

  const blocks = input.blocks.filter((b) => b.rows.length > 0);
  const rowsCount = blocks.reduce((a, b) => a + b.rows.length, 0);

  const BASE = { title: 10, info: 18, thead: 9, section: 7, row: 5.2, totals: internal ? 26 : 22, terms: internal ? 6 : 14 };
  const needed =
    BASE.title + BASE.info + BASE.thead + BASE.totals + BASE.terms +
    blocks.length * BASE.section + rowsCount * BASE.row;
  const s = Math.min(1, Math.max(0.6, avail / needed));
  const fits = needed * s <= avail + 0.5;
  const fs = (v: number) => Math.max(6, v * (0.55 + 0.45 * s));

  drawFrame();
  let y = top;

  // ---- Шапка документа ----
  doc.setFont(FONT, "bold");
  doc.setFontSize(fs(14));
  doc.setTextColor(15, 23, 42);
  doc.text(`${internal ? "Внутрішній кошторис" : "Комерційна пропозиція"} № ${input.number}`, margin, y + 4 * s);
  doc.setFont(FONT, "normal");
  doc.setFontSize(fs(9));
  doc.text(`Дата: ${input.date}`, pageW - margin, y + 4 * s, { align: "right" });
  y += BASE.title * s;

  doc.setFontSize(fs(9));
  doc.setTextColor(60, 60, 60);
  const left = [
    `Замовник: ${input.clientName || "—"}`,
    `Телефон: ${input.clientPhone || "—"}`,
    `Адреса: ${input.address || "—"}`,
  ];
  const right = [
    `Напрямок: ${input.module}`,
    `Площа: ${input.area} м²${input.thicknessCm ? ` · ${input.thicknessCm} см` : ""}`,
    `Менеджер: ${input.manager || "—"}`,
  ];
  const lineH = 4.4 * s;
  left.forEach((l, i) => doc.text(l, margin, y + i * lineH));
  right.forEach((l, i) => doc.text(l, margin + contentW * 0.55, y + i * lineH));
  y += BASE.info * s;

  // ---- Колонки ----
  const cName = margin + 2;
  const cUnit = margin + contentW * (internal ? 0.42 : 0.60);
  const cQty = margin + contentW * (internal ? 0.53 : 0.71);
  const cBuy = margin + contentW * 0.66;
  const cPrice = margin + contentW * (internal ? 0.78 : 0.84);
  const cCost = margin + contentW * 0.9;
  const cSum = pageW - margin - 2;

  const rowH = BASE.row * s;
  const theadH = BASE.thead * s;
  const sectH = BASE.section * s;

  const drawThead = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, contentW, theadH, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(fs(internal ? 8 : 9));
    doc.setTextColor(255, 255, 255);
    const ty = y + theadH * 0.68;
    doc.text("Найменування", cName, ty);
    doc.text("Од.", cUnit, ty);
    doc.text("К-сть", cQty, ty, { align: "right" });
    if (internal) doc.text("Закуп.", cBuy, ty, { align: "right" });
    doc.text(internal ? "Прод." : "Ціна", cPrice, ty, { align: "right" });
    if (internal) doc.text("Собів.", cCost, ty, { align: "right" });
    doc.text(internal ? "Продаж" : "Сума", cSum, ty, { align: "right" });
    y += theadH;
  };

  drawThead();

  const maxNameW = cUnit - cName - 3;
  doc.setFont(FONT, "normal");
  let zebra = false;

  for (const b of blocks) {
    if (!fits && y + sectH + rowH * 2 > bottom) {
      doc.addPage(); drawFrame(); y = top; drawThead();
    }
    doc.setFillColor(235, 237, 242);
    doc.rect(margin, y, contentW, sectH, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(fs(9));
    doc.setTextColor(15, 23, 42);
    doc.text(b.title, cName, y + sectH * 0.7);
    y += sectH;

    doc.setFont(FONT, "normal");
    for (const r of b.rows) {
      if (!fits && y + rowH > bottom) {
        doc.addPage(); drawFrame(); y = top; drawThead();
      }
      if (zebra) {
        doc.setFillColor(248, 249, 251);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      zebra = !zebra;
      doc.setFontSize(fs(internal ? 8 : 9));
      doc.setTextColor(25, 30, 40);
      let name = r.name;
      while (doc.getTextWidth(name) > maxNameW && name.length > 4) name = name.slice(0, -2);
      if (name !== r.name) name += "…";
      const ty = y + rowH * 0.72;
      doc.text(name, cName, ty);
      doc.text(r.unit, cUnit, ty);
      doc.text(num(r.qty, 2), cQty, ty, { align: "right" });
      if (internal) doc.text(num(r.costPerUnit ?? 0), cBuy, ty, { align: "right" });
      doc.text(num(r.pricePerUnit), cPrice, ty, { align: "right" });
      if (internal) doc.text(num(r.cost ?? 0), cCost, ty, { align: "right" });
      doc.text(num(r.sum), cSum, ty, { align: "right" });
      doc.setDrawColor(226, 229, 236);
      doc.setLineWidth(0.1);
      doc.line(margin, y + rowH, pageW - margin, y + rowH);
      y += rowH;
    }
  }

  // ---- Підсумки ----
  const totalsH = BASE.totals * s;
  if (!fits && y + totalsH + BASE.terms * s > bottom) {
    doc.addPage(); drawFrame(); y = top;
  }
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 1, pageW - margin, y + 1);
  y += totalsH * 0.3;

  doc.setFont(FONT, "bold");
  doc.setFontSize(fs(12));
  doc.setTextColor(15, 23, 42);
  doc.text("РАЗОМ:", cName, y);
  doc.setTextColor(220, 110, 30);
  doc.text(`${num(input.totalSell)} грн`, cSum, y, { align: "right" });
  y += totalsH * 0.25;

  doc.setFont(FONT, "normal");
  doc.setFontSize(fs(9));
  doc.setTextColor(80, 80, 80);
  doc.text(`Ціна за м²: ${num(input.pricePerM2)} грн/м²`, cName, y);
  if ((input.vatAmount ?? 0) > 0) {
    doc.text(
      `У т.ч. ${input.vatLabel ?? "ПДВ"} на матеріали: ${num(input.vatAmount ?? 0)} грн · роботи та логістика — без ПДВ`,
      cSum, y, { align: "right" },
    );
  }
  y += totalsH * 0.22;

  if (internal) {
    doc.setTextColor(60, 60, 60);
    doc.text(`Собівартість: ${num(input.totalCost ?? 0)} грн`, cName, y);
    doc.text(
      `Валовий прибуток: ${num(input.grossProfit ?? 0)} грн · Маржа: ${num(input.marginPercent ?? 0, 1)}%`,
      cSum, y, { align: "right" },
    );
    y += totalsH * 0.22;
    doc.setFontSize(fs(8));
    doc.setTextColor(120, 120, 120);
    doc.text("Документ для внутрішнього використання TERZI. Не передавати клієнту.", cName, y);
  } else {
    doc.setFontSize(fs(8));
    doc.setTextColor(90, 90, 90);
    const termsW = contentW - 4;
    const terms = doc.splitTextToSize(`Умови оплати: ${input.branding.paymentTerms}`, termsW);
    const warranty = doc.splitTextToSize(`Гарантія: ${input.branding.warrantyText}`, termsW);
    const tH = 3.6 * s;
    if (y + (terms.length + warranty.length) * tH < bottom) {
      doc.text(terms, cName, y);
      y += terms.length * tH + tH * 0.5;
      doc.text(warranty, cName, y);
    }
  }

  return doc.output("blob");
}
