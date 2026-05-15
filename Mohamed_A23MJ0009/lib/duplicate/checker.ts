import type { SupabaseClient } from "@supabase/supabase-js";

interface DuplicateResult {
  isDuplicate: boolean;
  matchType: "exact" | "similar" | null;
  matchedArticleId: string | null;
  matchedTitle: string | null;
}

export async function checkDuplicate(
  supabase: SupabaseClient,
  contentHash: string,
  title: string,
): Promise<DuplicateResult> {
  // 1. Exact match by content hash
  const { data: exactMatch } = await supabase
    .from("source_documents")
    .select(
      "id, knowledge_articles!knowledge_articles_source_document_id_fkey(id, title)",
    )
    .eq("content_hash", contentHash)
    .limit(1)
    .single();

  if (exactMatch) {
    const articles = exactMatch.knowledge_articles as unknown as Array<{
      id: string;
      title: string;
    }>;
    if (articles && articles.length > 0) {
      return {
        isDuplicate: true,
        matchType: "exact",
        matchedArticleId: articles[0].id,
        matchedTitle: articles[0].title,
      };
    }
  }

  // 2. Soft similarity check by title keywords
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (titleWords.length > 0) {
    const searchTerm = titleWords.slice(0, 3).join(" & ");
    const { data: similar } = await supabase
      .from("knowledge_articles")
      .select("id, title")
      .textSearch("title", searchTerm, { type: "websearch" })
      .limit(1);

    if (similar && similar.length > 0) {
      return {
        isDuplicate: true,
        matchType: "similar",
        matchedArticleId: similar[0].id,
        matchedTitle: similar[0].title,
      };
    }
  }

  return {
    isDuplicate: false,
    matchType: null,
    matchedArticleId: null,
    matchedTitle: null,
  };
}
