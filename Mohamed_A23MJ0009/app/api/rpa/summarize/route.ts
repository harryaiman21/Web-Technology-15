import { z } from "zod";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const serviceSupabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const summarizeRequestSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const authSupabase = await createServerClient();

    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await authSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsedBody = summarizeRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { id } = parsedBody.data;

    const { data: document, error: fetchError } = await serviceSupabase
      .from("rpa_extracted_documents")
      .select("id, file_name, extracted_text, extraction_status")
      .eq("id", id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    if (document.extraction_status !== "success") {
      return NextResponse.json(
        { error: "Cannot summarize failed extraction" },
        { status: 400 },
      );
    }

    if (
      !document.extracted_text ||
      document.extracted_text.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "No extracted text found" },
        { status: 400 },
      );
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
Summarize this extracted document text.

Return the answer in this format:

Suggested Title:
...

Short Summary:
...

Key Points:
- ...
- ...
- ...
- ...
- ...

Document text:
${document.extracted_text}
      `,
    });

    const summary = response.text || "";

    const { error: updateError } = await serviceSupabase
      .from("rpa_extracted_documents")
      .update({
        ai_summary: summary,
        ai_summary_status: "completed",
        summarized_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("RPA SUMMARIZE ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
