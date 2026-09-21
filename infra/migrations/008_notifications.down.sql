-- 008 down: Notifications
SET search_path TO ricoz, public;

DROP TABLE IF EXISTS in_app_notifications CASCADE;
DROP TABLE IF EXISTS notification_deliveries CASCADE;
DROP TABLE IF EXISTS notification_messages CASCADE;
DROP TABLE IF EXISTS notification_audiences CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS device_push_tokens CASCADE;
DROP TABLE IF EXISTS notification_templates CASCADE;
DROP TABLE IF EXISTS notification_provider_configs CASCADE;

DELETE FROM permissions WHERE code IN (
  'notification.read','notification.send','notification.manage',
  'finance.read','finance.manage','finance.refund.approve','finance.concession.approve',
  'media.read','media.manage','media.upload'
);
