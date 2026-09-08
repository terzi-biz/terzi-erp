import "./styles.css";

export { AmortizationPanel } from "./components/AmortizationPanel"
export { AppShell } from "./components/AppShell"
export { CatalogPage } from "./components/CatalogPage"
export { EstimateDraftControls } from "./components/EstimateDraftControls"
export { EstimateLinkPicker } from "./components/EstimateLinkPicker"
export { EstimateView } from "./components/EstimateView"
export { ModuleStub } from "./components/ModuleStub"
export { NumberInput } from "./components/NumberInput"
export { PriceImportDialog } from "./components/PriceImportDialog"
export { RoofingNormsAdmin } from "./components/RoofingNormsAdmin"
export { SchedulePanel } from "./components/SchedulePanel"
export { ScreedGradesAdmin } from "./components/ScreedGradesAdmin"
export { TargetMarginPanel } from "./components/TargetMarginPanel"
export { TerziLogo } from "./components/TerziLogo"
export { CalcStepRail } from "./components/calc/CalcStepRail"
export { CalcViewTabs } from "./components/calc/CalcViewTabs"
export { GenericProductionCard } from "./components/calc/GenericProductionCard"
export { UnifiedTimeline } from "./components/crm/UnifiedTimeline"
export { CrmPage, CrmEyebrow, CrmKpi, CrmPanel, crmInput, crmButton, crmButtonOutline } from "./components/crm/CrmUi"
export { LeadCardDialog } from "./components/crm/LeadCardDialog"
export { DrilldownDialog, TasksPanel, LeadMatchDialog } from "./components/dashboard/panels"

export { BinotelCallDialog } from "./components/integrations/BinotelCallDialog"
export { BinotelCallsPanel } from "./components/integrations/BinotelCallsPanel"
export { BinotelPanel } from "./components/integrations/BinotelPanel"
export { ConflictsPanel } from "./components/integrations/ConflictsPanel"
export { ImportPanel } from "./components/integrations/ImportPanel"
export { OneWayPanel } from "./components/integrations/OneWayPanel"
export { SyncPanel } from "./components/integrations/SyncPanel"
export { CrudPanel } from "./components/marketing/CrudPanel"
export { MarketingShell, Panel, EmptyState, KpiCard } from "./components/marketing/MarketingShell"
export { PlanFactPanel } from "./components/roofing/PlanFactPanel"
export { ProductionCard } from "./components/roofing/ProductionCard"
export { PurchaseSheet } from "./components/roofing/PurchaseSheet"
export { MaterialVariantCard } from "./components/warehouse/MaterialVariantCard"
export { WarehouseImportWizard } from "./components/warehouse/WarehouseImportWizard"
export { Constants, type Database } from "./integrations/supabase/types"
export { AuthProvider, useAuth } from "./lib/auth"

export * from "./components/ui/accordion";
export * from "./components/ui/alert-dialog";
export * from "./components/ui/alert";
export * from "./components/ui/aspect-ratio";
export * from "./components/ui/avatar";
export * from "./components/ui/badge";
export * from "./components/ui/breadcrumb";
export * from "./components/ui/button";
export * from "./components/ui/calendar";
export * from "./components/ui/card";
export * from "./components/ui/carousel";
export * from "./components/ui/chart";
export * from "./components/ui/checkbox";
export * from "./components/ui/collapsible";
export * from "./components/ui/command";
export * from "./components/ui/context-menu";
export * from "./components/ui/dialog";
export * from "./components/ui/drawer";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/form";
export * from "./components/ui/hover-card";
export * from "./components/ui/input-otp";
export * from "./components/ui/input";
export * from "./components/ui/label";
export * from "./components/ui/menubar";
export * from "./components/ui/navigation-menu";
export {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/ui/pagination";
export * from "./components/ui/popover";
export * from "./components/ui/progress";
export * from "./components/ui/radio-group";
export * from "./components/ui/resizable";
export * from "./components/ui/scroll-area";
export * from "./components/ui/select";
export * from "./components/ui/separator";
export * from "./components/ui/sheet";
export * from "./components/ui/sidebar";
export * from "./components/ui/skeleton";
export * from "./components/ui/slider";
export * from "./components/ui/sonner";
export * from "./components/ui/switch";
export * from "./components/ui/table";
export * from "./components/ui/tabs";
export * from "./components/ui/textarea";
export * from "./components/ui/toggle-group";
export * from "./components/ui/toggle";
export * from "./components/ui/tooltip";

export { Pagination as DataTablePagination } from "./components/Pagination";
export { usePersistedState } from "./lib/usePersistedState";
export { useI18n, useT, dict } from "./lib/i18n";
