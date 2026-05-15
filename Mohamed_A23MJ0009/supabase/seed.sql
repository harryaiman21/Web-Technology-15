-- =========================================================
-- Seed Data
-- DHL Knowledge Base Automation System
-- =========================================================

-- NOTE:
-- This file provides sample data for demonstration purposes.
-- Replace UUID values with real IDs from your Supabase project if needed.

-- Example profile
INSERT INTO profiles (id, full_name, email, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Admin',
  'admin@example.com',
  'admin'
)
ON CONFLICT (id) DO NOTHING;

-- Example source document
INSERT INTO source_documents (
  id,
  original_name,
  file_type,
  storage_path,
  extracted_text,
  normalized_text,
  content_hash,
  uploaded_by
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'DHL SOP Raw Notes.docx',
  'docx',
  'demo/dhl-sop-raw-notes.docx',
  'Raw notes about DHL shipment processing and customer support steps.',
  'Raw notes about DHL shipment processing and customer support steps.',
  'demo-content-hash-001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- Example knowledge article
INSERT INTO knowledge_articles (
  id,
  title,
  summary,
  status,
  creator_id,
  source_document_id,
  current_version_number,
  duplicate_flag,
  conflict_flag
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'DHL Shipment Issue Handling Procedure',
  'This article explains the basic steps for handling shipment-related issues in DHL logistics operations.',
  'draft',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  1,
  false,
  false
)
ON CONFLICT (id) DO NOTHING;

-- Example article steps
INSERT INTO article_steps (
  article_id,
  step_number,
  step_text
)
VALUES
(
  '00000000-0000-0000-0000-000000000003',
  1,
  'Receive the shipment issue details from the customer or internal team.'
),
(
  '00000000-0000-0000-0000-000000000003',
  2,
  'Check the shipment tracking number and verify the latest delivery status.'
),
(
  '00000000-0000-0000-0000-000000000003',
  3,
  'Assign the case to the responsible logistics or support department.'
),
(
  '00000000-0000-0000-0000-000000000003',
  4,
  'Update the knowledge base article status after review.'
);

-- Example tags
INSERT INTO article_tags (
  article_id,
  tag_name
)
VALUES
(
  '00000000-0000-0000-0000-000000000003',
  'shipment'
),
(
  '00000000-0000-0000-0000-000000000003',
  'logistics'
),
(
  '00000000-0000-0000-0000-000000000003',
  'customer-support'
);

-- Example article version
INSERT INTO article_versions (
  article_id,
  version_number,
  title,
  summary,
  status_at_that_time,
  edited_by,
  change_note,
  snapshot_json
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  1,
  'DHL Shipment Issue Handling Procedure',
  'This article explains the basic steps for handling shipment-related issues.',
  'Draft',
  '00000000-0000-0000-0000-000000000001',
  'Initial demo version created for assignment demonstration.',
  '{"source":"seed data","purpose":"demo"}'
);

-- Example status history
INSERT INTO status_history (
  article_id,
  old_status,
  new_status,
  changed_by
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'None',
  'Draft',
  '00000000-0000-0000-0000-000000000001'
);

-- Example processing log
INSERT INTO processing_logs (
  source_document_id,
  stage,
  message,
  level
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'seed',
  'Demo source document and knowledge article inserted successfully.',
  'info'
);