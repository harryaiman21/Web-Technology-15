import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const articleIdSchema = z.string().uuid();

const articleUpdateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  summary: z.string().trim().max(2000).optional().nullable(),
  steps: z.array(z.string().trim().min(1).max(1000)).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
  changeNote: z.string().trim().max(500).optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;

    const idResult = articleIdSchema.safeParse(rawId);

    if (!idResult.success) {
      return NextResponse.json(
        { error: "Invalid article id" },
        { status: 400 },
      );
    }

    const id = idResult.data;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: article, error } = await supabase
      .from("knowledge_articles")
      .select(
        "*, article_steps(*, id, step_number, step_text), article_tags(id, tag_name), profiles!knowledge_articles_creator_id_fkey(full_name)",
      )
      .eq("id", id)
      .order("step_number", { referencedTable: "article_steps" })
      .single();

    if (error || !article) {
      return NextResponse.json(
        { error: error?.message || "Article not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(article);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;

    const idResult = articleIdSchema.safeParse(rawId);

    if (!idResult.success) {
      return NextResponse.json(
        { error: "Invalid article id" },
        { status: 400 },
      );
    }

    const id = idResult.data;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsedBody = articleUpdateSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { title, summary, steps, tags, changeNote } = parsedBody.data;

    const cleanTitle = title.trim();
    const cleanSummary = summary?.trim() || null;
    const cleanChangeNote = changeNote?.trim() || "Manual edit";

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const { data: existing, error: existingError } = await supabase
      .from("knowledge_articles")
      .select("id, creator_id, status, current_version_number")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = profile?.role === "admin";
    const canEdit =
      isAdmin ||
      (existing.creator_id === user.id && existing.status === "draft");

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit this article" },
        { status: 403 },
      );
    }

    const newVersion = existing.current_version_number + 1;

    const { error: updateError } = await supabase
      .from("knowledge_articles")
      .update({
        title: cleanTitle,
        summary: cleanSummary,
        current_version_number: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (steps !== undefined) {
      const { error: deleteStepsError } = await supabase
        .from("article_steps")
        .delete()
        .eq("article_id", id);

      if (deleteStepsError) {
        return NextResponse.json(
          { error: deleteStepsError.message },
          { status: 500 },
        );
      }

      if (steps.length > 0) {
        const stepsData = steps.map((text, i) => ({
          article_id: id,
          step_number: i + 1,
          step_text: text.trim(),
        }));

        const { error: insertStepsError } = await supabase
          .from("article_steps")
          .insert(stepsData);

        if (insertStepsError) {
          return NextResponse.json(
            { error: insertStepsError.message },
            { status: 500 },
          );
        }
      }
    }

    if (tags !== undefined) {
      const { error: deleteTagsError } = await supabase
        .from("article_tags")
        .delete()
        .eq("article_id", id);

      if (deleteTagsError) {
        return NextResponse.json(
          { error: deleteTagsError.message },
          { status: 500 },
        );
      }

      if (tags.length > 0) {
        const tagsData = tags.map((tag) => ({
          article_id: id,
          tag_name: tag.trim(),
        }));

        const { error: insertTagsError } = await supabase
          .from("article_tags")
          .insert(tagsData);

        if (insertTagsError) {
          return NextResponse.json(
            { error: insertTagsError.message },
            { status: 500 },
          );
        }
      }
    }

    const { error: versionError } = await supabase
      .from("article_versions")
      .insert({
        article_id: id,
        version_number: newVersion,
        title: cleanTitle,
        summary: cleanSummary,
        status_at_that_time: existing.status,
        edited_by: user.id,
        change_note: cleanChangeNote,
        snapshot_json: {
          title: cleanTitle,
          summary: cleanSummary,
          steps: steps || [],
          tags: tags || [],
        },
      });

    if (versionError) {
      return NextResponse.json(
        { error: versionError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, version: newVersion });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const parsedId = articleIdSchema.safeParse(id);

    if (!parsedId.success) {
      return NextResponse.json(
        { error: "Invalid article ID" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Unable to verify user role" },
        { status: 403 },
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can delete articles" },
        { status: 403 },
      );
    }

    const { data: existingArticle, error: findError } = await supabase
      .from("knowledge_articles")
      .select("id, title")
      .eq("id", parsedId.data)
      .single();

    if (findError || !existingArticle) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("knowledge_articles")
      .delete()
      .eq("id", parsedId.data);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete article", details: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Article deleted successfully",
      deletedArticle: existingArticle,
    });
  } catch (error) {
    console.error("DELETE /api/articles/[id] error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
