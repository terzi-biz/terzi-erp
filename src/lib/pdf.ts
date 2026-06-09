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
  const pageW = 210;
  const margin = 10;
  const [hdr, ftr] = await Promise.all([loadImage(headerImg), loadImage(footerImg)]);

  const drawHeader = () => {
    const ratio = hdr.height / hdr.width;
    const h = (pageW - margin * 2) * ratio;
    doc.addImage(hdr, "JPEG", margin, margin, pageW - margin * 2, h);
    return margin + h + 4;
  };

  const drawFooter = () => {
    const ratio = ftr.height / ftr.width;
    const h = (pageW - margin * 2) * ratio;
    doc.addImage(ftr, "PNG", margin, 297 - margin - h, pageW - margin * 2, h);
    return 297 - margin - h - 4;
  };

  let y = drawHeader();
  const footerTop = drawFooter();

  // Title row
  doc.setFont(FONT, "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`${input.lang === "ua" ? "Комерційна пропозиція" : "Коммерческое предложение"} № ${input.number}`, margin, y + 4);
  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(`${input.lang === "ua" ? "Дата" : "Дата"}: ${input.date}`, pageW - margin, y + 4, { align: "right" });
  y += 10;

  // Client block
  doc.setFontSize(9);
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
  left.forEach((l, i) => doc.text(l, margin, y + i * 4));
  right.forEach((l, i) => doc.text(l, 110, y + i * 4));
  y += 16;

  // Table header
  doc.setDrawColor(200);
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, y, pageW - margin * 2, 7, "F");
  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.text(input.lang === "ua" ? "Найменування" : "Наименование", margin + 2, y + 5);
  doc.text(t("unit", input.lang), 120, y + 5);
  doc.text(t("qty", input.lang), 138, y + 5);
  doc.text(t("price", input.lang), 158, y + 5);
  doc.text(t("sum", input.lang), pageW - margin - 2, y + 5, { align: "right" });
  y += 9;

  doc.setFont(FONT, "normal");
  doc.setTextColor(20, 20, 20);

  const blocks: Array<{ title: string; block: "materials" | "works" | "logistics" }> = [
    { title: t("materialsBlock", input.lang), block: "materials" },
    { title: t("worksBlock", input.lang), block: "works" },
    { title: t("logisticsBlock", input.lang), block: "logistics" },
  ];

  for (const b of blocks) {
    const rows = input.result.lines.filter((l) => l.block === b.block && l.showToClient);
    if (!rows.length) continue;

    doc.setFont(FONT, "bold");
    doc.setFillColor(235, 235, 240);
    doc.rect(margin, y, pageW - margin * 2, 5.5, "F");
    doc.setTextColor(15, 23, 42);
    doc.text(b.title, margin + 2, y + 4);
    y += 7;
    doc.setFont(FONT, "normal");
    doc.setTextColor(30, 30, 30);

    for (const r of rows) {
      if (y > footerTop - 15) { doc.addPage(); y = drawHeader(); drawFooter(); }
      const name = t(r.name, input.lang);
      doc.text(name.length > 55 ? name.slice(0, 55) + "…" : name, margin + 2, y);
      doc.text(r.unit, 120, y);
      doc.text(String(Math.round(r.qty * 100) / 100), 138, y);
      doc.text(String(Math.round(r.pricePerUnit)), 158, y);
      doc.text(String(Math.round(r.sum)), pageW - margin - 2, y, { align: "right" });
      y += 5;
    }
    y += 2;
  }

  // Totals
  if (y > footerTop - 30) { doc.addPage(); y = drawHeader(); drawFooter(); }
  doc.setDrawColor(15, 23, 42);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(t("total", input.lang) + ":", margin + 2, y);
  doc.setTextColor(220, 110, 30);
  doc.text(`${Math.round(input.result.totalClient).toLocaleString("uk-UA")} грн`, pageW - margin - 2, y, { align: "right" });
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont(FONT, "normal");
  doc.text(`${t("pricePerM2", input.lang)}: ${Math.round(input.result.pricePerM2)} грн/м²`, margin + 2, y);
  y += 6;

  // Terms
  if (y < footerTop - 20) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    const terms = doc.splitTextToSize(input.branding.paymentTerms, pageW - margin * 2 - 4);
    doc.text(terms, margin + 2, y);
    y += terms.length * 4;
    const warranty = doc.splitTextToSize(input.branding.warrantyText, pageW - margin * 2 - 4);
    doc.text(warranty, margin + 2, y);
  }

  return doc.output("blob");
}
