/** Підменю розділу «Склад». Перші 4 — Wave 1 must; решта — збережені вкладки. */
export const WAREHOUSE_NAV: { to: string; label: string }[] = [
  { to: "/warehouse", label: "Запаси" },
  { to: "/warehouse/receipts", label: "Приходи" },
  { to: "/warehouse/issues", label: "Видачі" },
  { to: "/warehouse/monthly", label: "Звіт за місяці" },
  { to: "/warehouse/nomenclature", label: "Номенклатура" },
  { to: "/warehouse/reserve", label: "Резерв" },
  { to: "/warehouse/import", label: "Імпорт" },
  { to: "/warehouse/refs", label: "Склади" },
];
