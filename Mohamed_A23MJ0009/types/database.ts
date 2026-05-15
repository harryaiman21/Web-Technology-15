export type UserRole = "editor" | "reviewer" | "admin";
export type ArticleStatus = "draft" | "reviewed" | "published";
export type FileType = "text" | "pdf" | "docx" | "image";
export type LogLevel = "info" | "warn" | "error";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  original_name: string;
  file_type: FileType;
  storage_path: string | null;
  extracted_text: string | null;
  normalized_text: string | null;
  content_hash: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  summary: string | null;
  status: ArticleStatus;
  creator_id: string;
  source_document_id: string | null;
  current_version_number: number;
  duplicate_flag: boolean;
  conflict_flag: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArticleStep {
  id: string;
  article_id: string;
  step_number: number;
  step_text: string;
}

export interface ArticleTag {
  id: string;
  article_id: string;
  tag_name: string;
}

export interface ArticleVersion {
  id: string;
  article_id: string;
  version_number: number;
  title: string;
  summary: string | null;
  status_at_that_time: ArticleStatus;
  edited_by: string;
  change_note: string | null;
  snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

export interface StatusHistory {
  id: string;
  article_id: string;
  old_status: ArticleStatus | null;
  new_status: ArticleStatus;
  changed_by: string;
  changed_at: string;
  note: string | null;
}

export interface ProcessingLog {
  id: string;
  source_document_id: string | null;
  stage: string;
  message: string | null;
  level: LogLevel;
  created_at: string;
}
