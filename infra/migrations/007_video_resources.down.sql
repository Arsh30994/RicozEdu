-- 007 down: Provider-neutral video resources
SET search_path TO ricoz, public;

DROP TABLE IF EXISTS video_access_grants CASCADE;
DROP TABLE IF EXISTS video_offline_sync_batches CASCADE;
DROP TABLE IF EXISTS video_completion_rules CASCADE;
DROP TABLE IF EXISTS video_progress_snapshots CASCADE;
DROP TABLE IF EXISTS video_watched_ranges CASCADE;
DROP TABLE IF EXISTS video_watch_sessions CASCADE;
DROP TABLE IF EXISTS video_transcripts CASCADE;
DROP TABLE IF EXISTS video_captions CASCADE;
DROP TABLE IF EXISTS video_pipeline_jobs CASCADE;
DROP TABLE IF EXISTS video_resources CASCADE;
DROP TABLE IF EXISTS media_upload_sessions CASCADE;
DROP TABLE IF EXISTS media_objects CASCADE;
DROP TABLE IF EXISTS youtube_channel_connections CASCADE;
