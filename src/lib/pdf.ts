import jsPDF from "jspdf";
import headerImg from "@/assets/terzi-header.jpg";
import footerImg from "@/assets/terzi-footer.png";
import type { CalcResult } from "./screed-calc";
import type { Branding } from "./store";
import { dict, type Lang } from "./i18n";
import { attachCyrillicFonts } from "./pdfFonts";

const FONT = "NotoSans";
const t = (key: string, lang: Lang) => (dict[key as keyof typeof dict]?.[lang] ?? key);


export interface PdfInput {
  number: string;
  date: string;
  clientName: string;
  clientPhone: string;
  address: string;
  manager: string;
  area: number;
  thicknessCm: number;
  result: CalcResult;
  branding: Branding;
  lang: Lang;
  module: string; // "Стяжка" etc.
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

export async function generateClientPdf(input: PdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await attachCyrillicFonts(doc);
  const pageW = 210;
  const pageH = 297;
  const margin = 12; // бокові поля для контенту (колонтитули — на всю ширину)
  const contentW = pageW - margin * 2;
  const [hdr, ftr] = await Promise.all([loadImage(headerImg), loadImage(footerImg)]);

  const hdrH = (hdr.height / hdr.width) * pageW;
  const ftrH = (ftr.height / ftr.width) * pageW;

  const drawFrame = () => {
    // Колонтитули — на всю ширину A4, без білих полів
    doc.addImage(hdr, "JPEG", 0, 0, pageW, hdrH);
    doc.addImage(ftr, "PNG", 0, pageH - ftrH, pageW, ftrH);
  };

  const top = hdrH + 6;
  const bottom = pageH - ftrH - 6;
  const avail = bottom - top;

  type Row = { name: string; unit: string; qty: string; price: string; sum: string };
  const blocks: Array<{ title: string; rows: Row[] }> = (
    [
      { title: t("materialsBlock", input.lang), block: "materials" as const },
      { title: t("worksBlock", input.lang), block: "works" as const },
      { title: t("logisticsBlock", input.lang), block: "logistics" as const },
    ]
  )
    .map((b) => ({
      title: b.title,
      rows: input.result.lines
        .filter((l) => l.block === b.block && l.showToClient)
        .map((r) => ({
          name: t(r.name, input.lang),
          unit: r.unit,
          qty: String(Math.round(r.qty * 100) / 100),
          price: String(Math.round(r.pricePerUnit)),
          sum: Math.round(r.sum).toLocaleString("uk-UA"),
        })),
    }))
    .filter((b) => b.rows.length > 0);

  const rowsCount = blocks.reduce((a, b) => a + b.rows.length, 0);

  // ---- Вимірювання при масштабі 1 ----
  const BASE = {
    title: 10, // блок заголовка КП
    info: 16, // блок клієнта
    thead: 9,
    section: 7,
    row: 5.2,
    totals: 22,
    terms: 12,
  };
  const needed =
    BASE.title + BASE.info + BASE.thead + BASE.totals + BASE.terms +
    blocks.length * BASE.section + rowsCount * BASE.row;

  // Масштабуємо, щоб вмістити на одну сторінку (до 0.6), інакше пагінація
  const s = Math.min(1, Math.max(0.6, avail / needed));
  const fits = needed * s <= avail + 0.5;

  const fs = (v: number) => Math.max(6, v * (0.55 + 0.45 * s));

  drawFrame();
  let y = top;

  // ---- Шапка документа ----
  doc.setFont(FONT, "bold");
  doc.setFontSize(fs(14));
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${input.lang === "ua" ? "Комерційна пропозиція" : "Коммерческое предложение"} № ${input.number}`,
    margin,
    y + 4 * s,
  );
  doc.setFont(FONT, "normal");
  doc.setFontSize(fs(9));
  doc.text(`Дата: ${input.date}`, pageW - margin, y + 4 * s, { align: "right" });
  y += BASE.title * s;

  doc.setFontSize(fs(9));
  doc.setTextColor(60, 60, 60);
  const left = [
    `${t("clientName", input.lang)}: ${input.clientName || "—"}`,
    `${t("clientPhone", input.lang)}: ${input.clientPhone || "—"}`,
    `${t("address", input.lang)}: ${input.address || "—"}`,
  ];
  const right = [
    `${input.lang === "ua" ? "Напрямок" : "Направление"}: ${input.module}`,
    `${t("area", input.lang)}: ${input.area} м²`,
    `${t("thickness", input.lang)}: ${input.thicknessCm} см`,
  ];
  const lineH = 4.4 * s;
  left.forEach((l, i) => doc.text(l, margin, y + i * lineH));
  right.forEach((l, i) => doc.text(l, margin + contentW * 0.55, y + i * lineH));
  y += BASE.info * s;

  // ---- Колонки таблиці ----
  const cName = margin + 2;
  const cUnit = margin + contentW * 0.60;
  const cQty = margin + contentW * 0.71;
  const cPrice = margin + contentW * 0.84;
  const cSum = pageW - margin - 2;

  const rowH = BASE.row * s;
  const theadH = BASE.thead * s;
  const sectH = BASE.section * s;

  const drawThead = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, contentW, theadH, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(fs(9));
    doc.setTextColor(255, 255, 255);
    const ty = y + theadH * 0.68;
    doc.text(input.lang === "ua" ? "Найменування" : "Наименование", cName, ty);
    doc.text(t("unit", input.lang), cUnit, ty);
    doc.text(t("qty", input.lang), cQty, ty, { align: "right" });
    doc.text(t("price", input.lang), cPrice, ty, { align: "right" });
    doc.text(t("sum", input.lang), cSum, ty, { align: "right" });
    y += theadH;
  };

  drawThead();

  const maxNameW = cUnit - cName - 3;
  doc.setFont(FONT, "normal");

  let zebra = false;
  for (const b of blocks) {
    // не залишаємо заголовок секції без рядків унизу сторінки
    if (!fits && y + sectH + rowH * 2 > bottom) {
      doc.addPage();
      drawFrame();
      y = top;
      drawThead();
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
        doc.addPage();
        drawFrame();
        y = top;
        drawThead();
      }
      if (zebra) {
        doc.setFillColor(248, 249, 251);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      zebra = !zebra;
      doc.setFontSize(fs(9));
      doc.setTextColor(25, 30, 40);
      let name = r.name;
      while (doc.getTextWidth(name) > maxNameW && name.length > 4) name = name.slice(0, -2);
      if (name !== r.name) name += "…";
      const ty = y + rowH * 0.72;
      doc.text(name, cName, ty);
      doc.text(r.unit, cUnit, ty);
      doc.text(r.qty, cQty, ty, { align: "right" });
      doc.text(r.price, cPrice, ty, { align: "right" });
      doc.text(r.sum, cSum, ty, { align: "right" });
      doc.setDrawColor(226, 229, 236);
      doc.setLineWidth(0.1);
      doc.line(margin, y + rowH, pageW - margin, y + rowH);
      y += rowH;
    }
  }

  // ---- Підсумки ----
  const totalsH = BASE.totals * s;
  if (!fits && y + totalsH + BASE.terms * s > bottom) {
    doc.addPage();
    drawFrame();
    y = top;
  }
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 1, pageW - margin, y + 1);
  y += totalsH * 0.35;
  doc.setFont(FONT, "bold");
  doc.setFontSize(fs(12));
  doc.setTextColor(15, 23, 42);
  doc.text(t("total", input.lang) + ":", cName, y);
  doc.setTextColor(220, 110, 30);
  doc.text(`${Math.round(input.result.totalClient).toLocaleString("uk-UA")} грн`, cSum, y, { align: "right" });
  y += totalsH * 0.3;
  doc.setFont(FONT, "normal");
  doc.setFontSize(fs(9));
  doc.setTextColor(80, 80, 80);
  doc.text(`${t("pricePerM2", input.lang)}: ${Math.round(input.result.pricePerM2)} грн/м²`, cName, y);
  y += totalsH * 0.35;

  // ---- Умови ----
  doc.setFontSize(fs(8));
  doc.setTextColor(90, 90, 90);
  const termsW = contentW - 4;
  const terms = doc.splitTextToSize(input.branding.paymentTerms, termsW);
  const warranty = doc.splitTextToSize(input.branding.warrantyText, termsW);
  const tH = 3.6 * s;
  if (y + (terms.length + warranty.length) * tH < bottom) {
    doc.text(terms, cName, y);
    y += terms.length * tH + tH * 0.5;
    doc.text(warranty, cName, y);
  }

  return doc.output("blob");
}

