-- =========================================================
-- Supabase Row Level Security Policies
-- DHL Knowledge Base Automation System
-- =========================================================

-- Enable RLS on all main tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PROFILES
-- =========================================================

CREATE POLICY "Users can view profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- =========================================================
-- SOURCE DOCUMENTS
-- =========================================================

CREATE POLICY "Authenticated users can view source documents"
ON source_documents
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert source documents"
ON source_documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- =========================================================
-- KNOWLEDGE ARTICLES
-- =========================================================

CREATE POLICY "Authenticated users can view knowledge articles"
ON knowledge_articles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create knowledge articles"
ON knowledge_articles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Article creators can update their own articles"
ON knowledge_articles
FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

-- Optional admin policy
CREATE POLICY "Admins can update all articles"
ON knowledge_articles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- =========================================================
-- ARTICLE STEPS
-- =========================================================

CREATE POLICY "Authenticated users can view article steps"
ON article_steps
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert article steps"
ON article_steps
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update article steps"
ON article_steps
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- =========================================================
-- ARTICLE TAGS
-- =========================================================

CREATE POLICY "Authenticated users can view article tags"
ON article_tags
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert article tags"
ON article_tags
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update article tags"
ON article_tags
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- =========================================================
-- ARTICLE VERSIONS
-- =========================================================

CREATE POLICY "Authenticated users can view article versions"
ON article_versions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert article versions"
ON article_versions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- =========================================================
-- STATUS HISTORY
-- =========================================================

CREATE POLICY "Authenticated users can view status history"
ON status_history
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert status history"
ON status_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = changed_by);

-- =========================================================
-- PROCESSING LOGS
-- =========================================================

CREATE POLICY "Authenticated users can view processing logs"
ON processing_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert processing logs"
ON processing_logs
FOR INSERT
TO authenticated
WITH CHECK (true);