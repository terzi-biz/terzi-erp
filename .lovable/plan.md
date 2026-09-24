# Wave 2 — Offline conversions to Google Ads and Meta (plan only)

## Summary for the owner
The code that prepares conversion data already exists, but nothing sends it yet. There is also nothing to send today: across all leads there are 0 Google and 0 Meta click IDs, 0 Meta form leads, and 0 rows in the ERP payments table. The build work is worth doing now so that events are recorded correctly as soon as real click IDs start arriving through the Wave 1 intake. Sending itself stays switched off until you approve it and the missing credentials are in place.

## Evidence (read-only, 24.09.2026)
- `integrations` has rows only for `binotel` and `keycrm`. There are no `google_ads` / `meta_ads` rows.
- `integration_events` has 4 rows. Its `integration_id`, `idempotency_key`, `entity_type`, `entity_id` and `result` columns already exist (nullable).
- Touchpoints with gclid/gbraid/wbraid: 0; with fbclid: 0. Leads whose `utm` has a click ID: 0. `lead_intake_events` from `meta_lead_ads`: 0. `payments`: 0 rows. Actual cash lives in Finmap `finance_transactions`.

## 1. Reusable queue / helpers (no parallel queue)
- `integration_events` + RPC `claim_integration_event` (atomic dedupe, replay window, idempotency key).
- `enqueueEvent` / `processEvent` / `completeEvent` / `runQueue` / `logAttempt` in `src/lib/integrations/core.server.ts`: retry backoff, stale lock, masked results.
- `/api/public/integrations/worker` (queue tick, `INTEGRATIONS_WORKER_SECRET`).
- Adapter registry `registerAdapter` / `getAdapter` (`adapter.server.ts`). `googleAdsAdapter` and `metaAdsAdapter` currently exist only as base contracts (`foundation/adapters.server.ts`) with no send action.
- `src/lib/integrations/conversions.ts` → `prepareOfflineConversion()`: a pure builder, with no I/O. Its stage map (lead, qualified, measurement, estimate, order, payment) and "value only from actual payments" rule are reused.

## 2. Google Ads offline conversions — current state
- There is no upload code; `uploadClickConversions` / `events:ingest` are not called anywhere.
- Auth paths already present in `foundation/google-ads.server.ts`:
  - Lovable connector: `LOVABLE_API_KEY` + `GOOGLE_ADS_API_KEY` + `GOOGLE_ADS_CUSTOMER_ID`, used for reporting via gateway v25. This is the preferred path; it needs no developer token.
  - Own OAuth: `GOOGLE_OAUTH_CLIENT_ID/SECRET` + `GOOGLE_ADS_REFRESH_TOKEN` + `GOOGLE_ADS_DEVELOPER_TOKEN` + `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. The refresh token, developer token and login customer ID are not set as secrets.
- Still needed:
  - one `UPLOAD_CLICKS` conversion action per stage (numeric ID from its resource name), kept in `integrations.config` for a new `google_ads` row, not hardcoded;
  - account auto-tagging on;
  - the upload OAuth scope on the connector (to verify with a harmless read first).
- Click IDs: `prepareOfflineConversion` keeps gclid/gbraid/wbraid as separate fields but picks one as the "click id". Uploads must send exactly one identifier. Priority is gclid, then gbraid, then wbraid; if more than one is present, only the chosen one is sent and the decision is logged.

## 3. Meta Conversions API (CAPI) — current state
- There is no send code. `prepareOfflineConversion` only builds a draft payload: `event_name`, `event_time`, `action_source: "phone_call"`, `user_data.fbc` from fbclid, `ph`/`em` hashes passed in from outside, and value only for payment.
- Missing, to be added in the builder:
  - `event_id` for deduplication;
  - `action_source` choice: `system_generated` for CRM stages, `website` only when the event originated on the site;
  - `test_event_code` support (from `integrations.config`, used only in test mode);
  - SHA-256 with E.164 phone normalization via `src/lib/phone.ts`, and lowercase email;
  - `lead_id` in `user_data` for Meta Lead Ads leads (`external_id` `meta_lead:<id>`).
- Prerequisites:
  - a `META_PIXEL_ID` / dataset ID (not set);
  - the existing `META_ADS_ACCESS_TOKEN` must have the `ads_management` permission (or a separate system-user CAPI token);
  - a recorded advertising consent for sending hashed phone/email. Without consent, no `ph`/`em` and only fbc/lead_id are sent.

## 4. Server-side hook points (one call per action, no DB triggers)
| Event | Canonical hook |
|---|---|
| lead_created | `handleLeadIntake` (new lead branch), `upsertLead` (create), `convertRequestToLead` |
| lead_qualified | `moveLeadStage`, when the target stage is flagged "qualified" in `crm_stages` config. If no such flag is configured, the event is not emitted (blocker, not a guess) |
| lead_lost | `moveLeadStage` when `stage.is_lost` |
| measurement_scheduled / completed | `scheduleMeasurement`, `setMeasurementStatus` (`completed`) |
| estimate_created | `approveEstimate` / `updateEstimateStatus` → sent (first time per order only; drafts ignored) |
| order_created | `convertLeadToOrder`, `saveOrder` (insert) |
| payment_received | Finmap income matched to an order (`finance_transactions` + `finance_transaction_links`, match status confirmed/manual). Not the empty `payments` table |

keyCRM-synced stage changes go through the same helper later, as a separate wave.

## 5. Canonical event and idempotency
- One helper, `emitConversionEvent(db, { kind, leadId, orderId?, sourceEntity, sourceId, occurredAt, value? })`, in `src/lib/marketing/conversion-events.server.ts`.
- It resolves attribution from the lead's first touchpoint (click IDs) and contact (phone/email), then calls `enqueueEvent` once per enabled provider:
  - `eventType: "conversion.<kind>"`
  - `entityType`/`entityId` set to the source record
  - `idempotencyKey: conv:<provider>:<kind>:<lead_id|order_id>:<source_id>`
- Once per lead: lead_created, qualified, measurement_completed, estimate_created and order_created fire once per lead/order. payment_received fires once per Finmap transaction ID. Meta `event_id` = the same key (hashed); Google `transactionId`/order ID = the same key.
- A "no click ID and no hashed identity" check runs before enqueueing. If it fails, the event is recorded as `blocked` with a reason, so the data is visible and can be audited.
- Retries use the existing backoff and `dead` status. Permanent provider errors (invalid click ID, expired click, >90 days) go straight to `dead` with the reason.
- Kill switch: `integrations.enabled` + `config.send_mode` ∈ {`off`, `dry_run`, `test`, `live`}. The default is `dry_run`: the payload is built and stored but not sent.

## 6. Value and currency truthfulness
- **payment_received:** value = the actual Finmap income amount linked to the order, UAH. Foreign-currency rows use the stored NBU-converted amount.
- **order_created:** no value (a contract is not cash). Optionally a `contract_value` custom field for Meta only, marked non-revenue. It is off by default and needs your approval.
- **lead, qualified, measurement, estimate, lost:** no value. Estimate totals are never sent.
- **lead_lost:** not uploaded to Google (no negative conversions). For Meta it is only a custom event, if you approve.

## 7. Historical backfill
- `dryRunConversionBackfill({ from, to, provider })` is read-only. It lists candidate events only for leads with a real click ID in touchpoints/`utm` or a Meta `lead_id`. It returns counts per stage, blocked reasons and the 90-day Google window.
- Current expected result: 0 candidates, because 0 click IDs exist. A real backfill runs only after your review, through the same `emitConversionEvent` and its idempotency key.

## 8. Implementation waves
**W2.1 (first build turn, ≤7 credits) — pipeline in dry-run, nothing sent**
- `conversion-events.server.ts` (`emitConversionEvent`, attribution resolver).
- Extend `prepareOfflineConversion`: single Google click ID, Meta `event_id`, `action_source`, hashing, `lead_id`.
- Hooks in `handleLeadIntake`, `moveLeadStage` (lost / qualified-if-flagged), `setMeasurementStatus`, `convertLeadToOrder`.
- Dry-run backfill function.
- Tests: idempotency key stability; no click ID/identity means blocked; value only on payment; single-click-ID selection; hook failures don't break the user action.
- Acceptance:
  - typecheck and build pass;
  - no outbound HTTP;
  - events are visible as dry-run in `integration_events`.

**W2.2 — provider adapters in test mode**
- Google upload via connector `events:ingest` (with `adUserData` consent). Meta CAPI with `test_event_code`.
- One harmless test event per provider after your approval.
- Acceptance: the provider confirms test receipt.

**W2.3 — payment_received from Finmap links + remaining hooks** (estimate, measurement scheduled, `saveOrder`, keyCRM).

**W2.4 — live mode per provider** (your explicit approval), Integration Overview readiness counters.

## 9. Database migration
None is required for W2.1 and W2.2. The `integration_events` columns already exist. The provider rows (`google_ads`, `meta_ads`) and conversion action IDs are data in `integrations`, created by an authorized user in Settings, not a schema change. The only possible future migration is a "qualified" flag on `crm_stages`, if no existing field can mark it (to check in W2.1).

## 10. Blockers
- No click IDs in data yet. This depends on real traffic through the Wave 1 intake and on Google auto-tagging being on.
- No `google_ads` / `meta_ads` rows in `integrations`.
- Google: `UPLOAD_CLICKS` conversion actions not created; connector upload scope unverified.
- Meta: `META_PIXEL_ID` / dataset missing; CAPI permission on the token unverified; Lead Ads webhook not yet subscribed.
- Consent: no stored advertising-consent record for hashed phone/email. Until one exists, hashed identifiers are not sent.
- The definition of a "qualified" stage must come from you or the stage settings.
