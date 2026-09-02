# TERZI ERP system  — Guidelines

## Components

The design system exports these components — import them from `@ws-hoz2m0djtsah5idxd0aa/66607c05-a230-4d05-9f46-cf1edb45a91e` and compose them before building anything from scratch:

`AmortizationPanel`, `AppShell`, `AuthProvider`, `BinotelCallDialog`, `BinotelCallsPanel`, `BinotelError`, `BinotelPanel`, `CalcStepRail`, `CalcViewTabs`, `CatalogPage`, `ConflictsPanel`, `Constants`, `CrudPanel`, `EmptyState`, `EstimateDraftControls`, `EstimateLinkPicker`, `EstimateView`, `GenericProductionCard`, `ImportPanel`, `KeyCrmError`, `KpiCard`, `MarketingShell`, `ModuleStub`, `NumberInput`, `OneWayPanel`, `Panel`, `PlanFactPanel`, `PriceImportDialog`, `ProductionCard`, `PurchaseSheet`, `RoofingNormsAdmin`, `SchedulePanel`, `ScreedGradesAdmin`, `SyncPanel`, `TargetMarginPanel`, `TerziLogo`, `UnifiedTimeline`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-hoz2m0djtsah5idxd0aa/66607c05-a230-4d05-9f46-cf1edb45a91e/styles.css` (source — preferred import)
- `@ws-hoz2m0djtsah5idxd0aa/66607c05-a230-4d05-9f46-cf1edb45a91e/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

