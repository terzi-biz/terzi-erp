import { createFileRoute, Link } from "@tanstack/react-router";
import { NumberInput } from "@/components/NumberInput";
import { useState, useEffect, useMemo } from "react";
import { Layers, Home as RoofIcon, Snowflake, Hammer, Sliders, Save, Undo2, RotateCcw, Upload, RefreshCw, Cable, Grid3x3, Building2, ListX, ShieldCheck, Settings2, Calculator, Wallet, Palette, Compass, ArrowLeftRight, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PriceImportDialog } from "@/components/PriceImportDialog";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resyncCatalogPrices } from "@/lib/catalog.functions";
import { getSettingsAccess, saveCalcSettings } from "@/lib/config-kernel/settings-center.functions";
import { useCalcSettings, CALC_SETTINGS_QUERY_KEY } from "@/lib/useCalcSettings";
import { DEFAULT_SETTINGS } from "@/lib/screed-calc";
import { DEFAULT_ROOFING_COEFFS } from "@/lib/roofing-calc";
import { DEFAULT_INSULATION_COEFFS } from "@/lib/insulation-calc";
import { DEFAULT_DEMOLITION_COEFFS } from "@/lib/demolition-calc";
import { ScreedGradesAdmin } from "@/components/ScreedGradesAdmin";
import { RoofingNormsAdmin } from "@/components/RoofingNormsAdmin";
import { CloseReasonsAdmin, CompanyRequisitesAdmin } from "@/components/settings/ReferenceAdmin";
import { FinanceRulesAdmin } from "@/components/settings/FinanceRulesAdmin";
import { ControlCenterAdmin } from "@/components/settings/ControlCenterAdmin";
import { PayrollBridgePanel } from "@/components/settings/PayrollBridgePanel";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [
    { title: "Налаштування TERZI ERP" },
    { name: "description", content: "Центр налаштувань TERZI ERP: конфігурація, калькулятори, фінанси, компанія, доступи й інтеграції." },
    { property: "og:title", content: "Налаштування TERZI ERP" },
    { property: "og:description", content: "Єдиний центр налаштувань TERZI ERP з company-wide параметрами калькуляторів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

type Tab = "screed" | "grades" | "roofing" | "roofing_norms" | "insulation" | "demolition" | "common" | "requisites" | "reasons" | "finance_rules" | "payroll_bridge" | "control_center";
type Section = "system" | "calculators" | "finance" | "company" | "access" | "integrations";

/** Вкладки з числовими налаштуваннями калькулятора (мають панель збереження). */
const CALC_TABS: Tab[] = ["screed", "roofing", "insulation", "demolition", "common"];

const SCREED_GROUPS = [
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади (до 100 м²), грн" },
    { key: "brigadePerM2", label: "Бригада понад 100 м², грн/м²" },
    { key: "brigadeMeshCost", label: "Бригада: сітка, грн/м²" },
    { key: "brigadeSlopeCost", label: "Бригада: розуклонка, грн/м²" },
    { key: "brigadeUnloadCost", label: "Вивантаження цементу: бригада, грн/міш." },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const ROOFING_GROUPS = [
  { title: "Рубемаст / євроруберойд — коефіцієнти", fields: [
    { key: "rubemastOverlapCoef", label: "Коеф. перевитрати (нахльост 10 см)", step: "0.01" },
    { key: "rubemastRollAreaM2", label: "Площа рулону, м²" },
    { key: "rubemastPrimerLPerM2", label: "Праймер, л/м²", step: "0.01" },
    { key: "rubemastGasKgPerLayerM2", label: "Газ, кг/м²/шар", step: "0.01" },
    { key: "rubemastGasCylinderKg", label: "Балон газу, кг" },
  ]},
  { title: "ПВХ-мембрана — коефіцієнти", fields: [
    { key: "pvcOverlapCoef", label: "Нахльост мембрани", step: "0.01" },
    { key: "pvcGeoCoef", label: "Геотекстиль (коеф.)", step: "0.01" },
    { key: "pvcFastenersPerM2", label: "Кріплення, шт/м²", step: "0.5" },
  ]},
  { title: "Геометрія", fields: [
    { key: "parapetHeightCmDefault", label: "Висота парапету за замовч., см" },
  ]},
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2Rubemast", label: "Бригада: рубемаст, грн/м²" },
    { key: "brigadePerM2Pvc", label: "Бригада: ПВХ, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const INSULATION_GROUPS = [
  { title: "Норми витрат матеріалів", fields: [
    { key: "cutoffCoef", label: "Коеф. перевитрати плит (обрізки)", step: "0.01" },
    { key: "glueBagsPer10M2", label: "Клей: мішків на 10 м²", step: "0.1" },
    { key: "dowelsPerM2", label: "Дюбелі, шт/м²" },
    { key: "meshCoef", label: "Склосітка (коеф. з нахльостом)", step: "0.01" },
    { key: "polystyrcreteWastePercent", label: "Полістиролбетон: втрати, %" },
  ]},
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2", label: "Бригада, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const DEMOLITION_GROUPS = [
  { title: "Об'єм сміття (норми)", fields: [
    { key: "wasteM3PerM2Screed", label: "Стяжка, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Tile", label: "Плитка, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Roof", label: "Покрівля, м³/м²", step: "0.01" },
    { key: "wasteM3PerM2Walls", label: "Перегородки, м³/м²", step: "0.01" },
    { key: "wasteLooseCoef", label: "Коеф. розпушення", step: "0.05" },
    { key: "bagsPerM3", label: "Мішків на 1 м³" },
    { key: "floorAddPercent", label: "Надбавка за поверх, %" },
  ]},
  { title: "Норми витрат бригади", fields: [
    { key: "brigadeMin", label: "Мін. оплата бригади, грн" },
    { key: "brigadePerM2", label: "Бригада, грн/м²" },
  ]},
  { title: "Амортизація", fields: [
    { key: "amortEquipPerM2", label: "Амортизація обладнання, грн/м²" },
    { key: "amortTransportPerM2", label: "Амортизація транспорту, грн/м²" },
  ]},
];

const COMMON_FIELDS = [
  { key: "minCheck", label: "Мінімальний чек, грн" },
  { key: "marginThreshold", label: "Мінімальний маржинальний %, %" },
  { key: "roundStep", label: "Округлення суми, грн" },
  { key: "fopRate", label: "Ставка при ФОП (наприклад 0.06)", step: "0.01" },
  { key: "vatRate", label: "Ставка ПДВ (наприклад 0.20)", step: "0.01" },
  { key: "materialMarkupPercent", label: "Націнка на матеріали, % (для ресинку каталогу)", step: "1" },
];

