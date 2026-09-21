-- 006 down: Student fees & payments
SET search_path TO ricoz, public;

DROP FUNCTION IF EXISTS ricoz.assign_payment_webhook_tenant(uuid, text);
DROP FUNCTION IF EXISTS ricoz.ingest_payment_webhook(text, text, boolean, text, jsonb);

DROP TABLE IF EXISTS accounting_export_batches CASCADE;
DROP TABLE IF EXISTS financial_holds CASCADE;
DROP TABLE IF EXISTS reconciliation_items CASCADE;
DROP TABLE IF EXISTS reconciliation_runs CASCADE;
DROP TABLE IF EXISTS payment_webhook_inbox CASCADE;
DROP TABLE IF EXISTS refund_requests CASCADE;
DROP TABLE IF EXISTS payment_receipts CASCADE;
DROP TABLE IF EXISTS fee_credits CASCADE;
DROP TABLE IF EXISTS payment_allocations CASCADE;
DROP TABLE IF EXISTS payment_transactions CASCADE;
DROP TABLE IF EXISTS payment_intents CASCADE;
DROP TABLE IF EXISTS fee_adjustments CASCADE;
DROP TABLE IF EXISTS fee_charges CASCADE;
DROP TABLE IF EXISTS student_fee_accounts CASCADE;
DROP TABLE IF EXISTS late_fee_rules CASCADE;
DROP TABLE IF EXISTS installment_plans CASCADE;
DROP TABLE IF EXISTS fee_structure_components CASCADE;
DROP TABLE IF EXISTS fee_structures CASCADE;
DROP TABLE IF EXISTS payment_provider_configs CASCADE;
