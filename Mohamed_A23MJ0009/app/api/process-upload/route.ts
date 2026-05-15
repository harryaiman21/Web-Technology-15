import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText, validateFile } from "@/lib/files/extract";
import { normalizeText, hashText } from "@/lib/normalize";
import { generateDraft } from "@/lib/ai/processor";
import { checkDuplicate } from "@/lib/duplicate/checker";
import type { FileType } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const textInput = formData.get("text") as string | null;
    const inputType = formData.get("inputType") as string;

    let extractedText: string;
    let fileType: FileType;
    let originalName: string;
    let storagePath: string | null = null;
    let documentUrl: string | null = null;

    if (inputType === "text") {
      if (!textInput || textInput.trim().length === 0) {
        return NextResponse.json(
          { error: "Text input is empty" },
          { status: 400 },
        );
      }
      extractedText = textInput;
      fileType = "text";
      originalName = "text-input";
    } else {
      if (!file) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 },
        );
      }

      const validation = validateFile(file);
      if (validation.error) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      fileType = validation.fileType;
      originalName = file.name;

      // Upload file to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) {
        return NextResponse.json(
          { error: `Storage upload failed: ${uploadError.message}` },
          { status: 500 },
        );
      }
      storagePath = fileName;

      const { data: publicUrlData } = supabase.storage
        .from("uploads")
        .getPublicUrl(fileName);

      documentUrl = publicUrlData.publicUrl;

      // Extract text from file
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log("[process-upload] before extractText", {
        fileType,
        originalName,
        size: file.size,
      });
      extractedText = await extractText(buffer, fileType);
      console.log("[process-upload] after extractText", {
        fileType,
        extractedChars: extractedText.length,
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract any text from the input" },
        { status: 400 },
      );
    }

    // Log extraction
    await supabase.from("processing_logs").insert({
      stage: "extraction",
      message: `Extracted ${extractedText.length} chars from ${fileType}`,
      level: "info",
      document_storage_path: documentUrl,
    });

    // Normalize + hash
    const normalizedText = normalizeText(extractedText);
    const contentHash = hashText(normalizedText);

    // Save source document
    const { data: sourceDoc, error: sourceError } = await supabase
      .from("source_documents")
      .insert({
        original_name: originalName,
        file_type: fileType,
        storage_path: storagePath,
        extracted_text: extractedText,
        normalized_text: normalizedText,
        content_hash: contentHash,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (sourceError) {
      return NextResponse.json(
        { error: `Failed to save source document: ${sourceError.message}` },
        { status: 500 },
      );
    }

    // AI draft generation
    const draft = await generateDraft(normalizedText);

    await supabase.from("processing_logs").insert({
      source_document_id: sourceDoc.id,
      stage: "ai_processing",
      message: `Generated draft: "${draft.title}" with ${draft.steps.length} steps`,
      level: "info",
      document_storage_path: documentUrl,
    });
    // Duplicate check
    const dupResult = await checkDuplicate(supabase, contentHash, draft.title);

    // Save knowledge article
    const { data: article, error: articleError } = await supabase
      .from("knowledge_articles")
      .insert({
        title: draft.title,
        summary: draft.summary,
        status: "draft",
        creator_id: user.id,
        source_document_id: sourceDoc.id,
        current_version_number: 1,
        duplicate_flag:
          dupResult.isDuplicate && dupResult.matchType === "exact",
        conflict_flag:
          dupResult.isDuplicate && dupResult.matchType === "similar",
      })
      .select()
      .single();

    if (articleError) {
      return NextResponse.json(
        { error: `Failed to save article: ${articleError.message}` },
        { status: 500 },
      );
    }

    // Save steps
    if (draft.steps.length > 0) {
      const stepsData = draft.steps.map((text, i) => ({
        article_id: article.id,
        step_number: i + 1,
        step_text: text,
      }));
      await supabase.from("article_steps").insert(stepsData);
    }

    // Save tags
    if (draft.tags.length > 0) {
      const tagsData = draft.tags.map((tag) => ({
        article_id: article.id,
        tag_name: tag,
      }));
      await supabase.from("article_tags").insert(tagsData);
    }

    // Save initial version
    await supabase.from("article_versions").insert({
      article_id: article.id,
      version_number: 1,
      title: draft.title,
      summary: draft.summary,
      status_at_that_time: "draft",
      edited_by: user.id,
      change_note: "Initial draft generated from upload",
      snapshot_json: {
        title: draft.title,
        summary: draft.summary,
        steps: draft.steps,
        tags: draft.tags,
      },
    });

    // Save status history
    await supabase.from("status_history").insert({
      article_id: article.id,
      old_status: null,
      new_status: "draft",
      changed_by: user.id,
      note: "Article created from upload",
    });

    return NextResponse.json({
      success: true,
      articleId: article.id,
      title: draft.title,
      duplicate: dupResult.isDuplicate
        ? {
            matchType: dupResult.matchType,
            matchedArticleId: dupResult.matchedArticleId,
            matchedTitle: dupResult.matchedTitle,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[process-upload] failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
