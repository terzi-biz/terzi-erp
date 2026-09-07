CREATE UNIQUE INDEX IF NOT EXISTS finance_accounts_finmap_id_key ON public.finance_accounts (finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_finmap_id_key ON public.finance_categories (finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_projects_finmap_id_key ON public.finance_projects (finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_counterparties_finmap_key ON public.finance_counterparties (finmap_kind, finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_finmap_id_key ON public.finance_transactions (finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finmap_entity_mappings_key ON public.finmap_entity_mappings (finmap_kind, finmap_id);
CREATE UNIQUE INDEX IF NOT EXISTS finmap_sync_state_entity_key ON public.finmap_sync_state (entity);