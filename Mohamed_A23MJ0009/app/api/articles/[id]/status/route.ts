import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["reviewed"],
  reviewed: ["published", "draft"],
  published: ["draft"],
};

const statusUpdateSchema = z.object({
  newStatus: z.enum(["draft", "reviewed", "published"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const articleIdSchema = z.string().uuid();

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
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Only admins can change article status
    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can change article status" },
        { status: 403 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsedBody = statusUpdateSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { newStatus, note } = parsedBody.data;
    const cleanNote = note?.trim() ? note.trim() : null;

    const { data: article, error: articleError } = await supabase
      .from("knowledge_articles")
      .select("status")
      .eq("id", id)
      .single();

    if (articleError || !article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[article.status];
    if (!allowed?.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${article.status}" to "${newStatus}"`,
        },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from("knowledge_articles")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: historyError } = await supabase
      .from("status_history")
      .insert({
        article_id: id,
        old_status: article.status,
        new_status: newStatus,
        changed_by: user.id,
        note: cleanNote,
      });

    if (historyError) {
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      oldStatus: article.status,
      newStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
