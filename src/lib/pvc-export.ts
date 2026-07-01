/**
 * Експорт кошторису ПВХ-мембрани у PDF (jsPDF з кирилицею) та Excel (xlsx).
 * Дві версії: клієнтська (без собівартості) і внутрішня (з собівартістю + маржа).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { registerCyrillicFont } from "./pdfFonts";
import type { DirectionManifest, EstimateResult } from "./engines/direction-engine";

type Client = { name: string; phone: string; address: string; manager: string };
type Mode = "client" | "internal";

const money = (n: number) => n.toLocaleString("uk-UA", { maximumFractionDigits: 2 }) + " ₴";
const blockLabel: Record<string, string> = {
  materials: "Матеріали", works: "Роботи", logistics: "Транспорт та логістика", additional: "Додаткові послуги",
};

export function exportPvcPdf(
  m: DirectionManifest, _inputs: Record<string, number>, result: EstimateResult, client: Client, mode: Mode,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  registerCyrillicFont(doc);
  doc.setFont("Roboto", "normal");

  doc.setFontSize(16); doc.text("TERZI — кошторис", 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(m.direction.name, 14, 24);
  doc.setTextColor(20);
  doc.text(`Клієнт: ${client.name || "—"}   Телефон: ${client.phone || "—"}`, 14, 32);
  doc.text(`Об'єкт: ${client.address || "—"}   Менеджер: ${client.manager || "—"}`, 14, 38);
  doc.text(mode === "internal" ? "Версія: внутрішня (з собівартістю)" : "Версія: для клієнта", 14, 44);

  let y = 52;
  const lines = mode === "client" ? result.lines.filter((l) => l.clientVisible) : result.lines;
  for (const block of ["materials", "works", "logistics", "additional"] as const) {
    const arr = lines.filter((l) => l.block === block);
    if (!arr.length) continue;
    doc.setFontSize(11); doc.text(blockLabel[block], 14, y); y += 2;
    const head = mode === "internal"
      ? [["Позиція", "К-сть", "Од", "Собів.", "Ціна", "Сума"]]
      : [["Позиція", "К-сть", "Од", "Ціна", "Сума"]];
    const body = arr.map((l) => mode === "internal"
      ? [l.name, String(l.qty), l.unit, money(l.cost), money(l.pricePerUnit), money(l.sum)]
      : [l.name, String(l.qty), l.unit, money(l.pricePerUnit), money(l.sum)]);
    autoTable(doc, {
      startY: y + 2, head, body, styles: { font: "Roboto", fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255 },
      columnStyles: mode === "internal"
        ? { 1: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } }
        : { 1: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    // @ts-expect-error autoTable adds lastAutoTable
    y = doc.lastAutoTable.finalY + 6;
  }

  doc.setFontSize(11);
  doc.text(`Резерв 5%: ${money(result.totals.reserveAmount)}`, 14, y); y += 6;
  doc.setFontSize(13);
  doc.text(`РАЗОМ КЛІЄНТУ: ${money(result.totals.totalClient)}`, 14, y); y += 8;
  if (mode === "internal") {
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`Собівартість: ${money(result.totals.totalCost)}`, 14, y); y += 5;
    doc.text(`Маржа: ${money(result.totals.grossProfit)} (${result.totals.marginPercent}%)`, 14, y);
  }

  doc.save(`TERZI_${m.direction.id}_${mode}_${Date.now()}.pdf`);
}

export function exportPvcExcel(
  m: DirectionManifest, inputs: Record<string, number>, result: EstimateResult, client: Client, mode: Mode,
) {
  const wb = XLSX.utils.book_new();
  const meta: (string | number)[][] = [
    ["TERZI — кошторис"],
    ["Напрям", m.direction.name],
    ["Версія", mode === "internal" ? "внутрішня" : "клієнтська"],
    ["Клієнт", client.name || ""],
    ["Телефон", client.phone || ""],
    ["Об'єкт", client.address || ""],
    ["Менеджер", client.manager || ""],
    [],
    ["Вводні параметри"],
    ...m.inputs.map((f) => [f.label, inputs[f.field_key] ?? 0, f.unit || ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Загальне");

  const lines = mode === "client" ? result.lines.filter((l) => l.clientVisible) : result.lines;
  const head = mode === "internal"
    ? ["Блок", "Код", "Позиція", "К-сть", "Од", "Собівартість/од", "Собів. всього", "Коеф.", "Ціна/од", "Сума"]
    : ["Блок", "Позиція", "К-сть", "Од", "Ціна/од", "Сума"];
  const rows = lines.map((l) => mode === "internal"
    ? [blockLabel[l.block], l.code ?? "", l.name, l.qty, l.unit, l.costPerUnit, l.cost, l.saleCoef, l.pricePerUnit, l.sum]
    : [blockLabel[l.block], l.name, l.qty, l.unit, l.pricePerUnit, l.sum]);
  const totals: (string | number)[][] = [
    [],
    ["Резерв (K_reserve)", "", "", "", "", "", "", "", "", result.totals.reserveAmount],
    ["РАЗОМ КЛІЄНТУ", "", "", "", "", "", "", "", "", result.totals.totalClient],
  ];
  if (mode === "internal") {
    totals.push(["Собівартість", "", "", "", "", "", "", "", "", result.totals.totalCost]);
    totals.push([`Маржа (${result.totals.marginPercent}%)`, "", "", "", "", "", "", "", "", result.totals.grossProfit]);
  }
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows, ...totals]);
  XLSX.utils.book_append_sheet(wb, ws, "Кошторис");

  XLSX.writeFile(wb, `TERZI_${m.direction.id}_${mode}_${Date.now()}.xlsx`);
}
