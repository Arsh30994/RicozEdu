-- 005 down: Assessment & examination
SET search_path TO ricoz, public;

DROP TRIGGER IF EXISTS trg_revaluation_student_match ON revaluation_requests;
DROP FUNCTION IF EXISTS ricoz.enforce_revaluation_student_match();

DROP TABLE IF EXISTS result_publication_job_items CASCADE;
DROP TABLE IF EXISTS result_publication_jobs CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS transcripts CASCADE;
DROP TABLE IF EXISTS gpa_snapshots CASCADE;
DROP TABLE IF EXISTS assessment_outcome_mappings CASCADE;
DROP TABLE IF EXISTS supplementary_attempts CASCADE;
DROP TABLE IF EXISTS revaluation_requests CASCADE;
DROP TABLE IF EXISTS result_correction_versions CASCADE;
DROP TABLE IF EXISTS published_course_results CASCADE;
DROP TABLE IF EXISTS course_result_calculations CASCADE;
DROP TABLE IF EXISTS invigilation_duties CASCADE;
DROP TABLE IF EXISTS seating_assignments CASCADE;
DROP TABLE IF EXISTS seating_plans CASCADE;
DROP TABLE IF EXISTS hall_tickets CASCADE;
DROP TABLE IF EXISTS exam_eligibility CASCADE;
DROP TABLE IF EXISTS exam_sittings CASCADE;
DROP TABLE IF EXISTS mark_entry_history CASCADE;
DROP TABLE IF EXISTS mark_entries CASCADE;
ALTER TABLE IF EXISTS assessment_instruments DROP CONSTRAINT IF EXISTS assessment_instruments_formula_fk;
DROP TABLE IF EXISTS grade_formula_versions CASCADE;
DROP TABLE IF EXISTS assessment_instruments CASCADE;
DROP TABLE IF EXISTS question_bank_items CASCADE;
DROP TABLE IF EXISTS question_banks CASCADE;
DROP TABLE IF EXISTS rubrics CASCADE;
DROP FUNCTION IF EXISTS ricoz.prevent_published_formula_mutate();
