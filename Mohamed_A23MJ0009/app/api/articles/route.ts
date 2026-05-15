import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const articleFiltersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["draft", "reviewed", "published", "all", ""]).default(""),
  tag: z.string().trim().max(50).default(""),
  creatorId: z
    .string()
    .trim()
    .default("")
    .refine(
      (value) => value === "" || z.string().uuid().safeParse(value).success,
      "Invalid creator ID",
    ),
  from: z
    .string()
    .trim()
    .default("")
    .refine(
      (value) => value === "" || !Number.isNaN(Date.parse(value)),
      "Invalid from date",
    ),
  to: z
    .string()
    .trim()
    .default("")
    .refine(
      (value) => value === "" || !Number.isNaN(Date.parse(value)),
      "Invalid to date",
    ),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const filterResult = articleFiltersSchema.safeParse({
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "",
      tag: searchParams.get("tag") || "",
      creatorId: searchParams.get("creatorId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    });

    if (!filterResult.success) {
      return NextResponse.json(
        {
          error: "Invalid article filters",
          details: filterResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { search, status, tag, creatorId, from, to } = filterResult.data;

    let query = supabase
      .from("knowledge_articles")
      .select(
        "*, article_tags(tag_name), profiles!knowledge_articles_creator_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    if (creatorId) {
      query = query.eq("creator_id", creatorId);
    }
    if (from) {
      query = query.gte("created_at", from);
    }

    if (to) {
      query = query.lte("created_at", `${to}T23:59:59.999Z`);
    }

    const { data: articles, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let filtered = articles || [];
    if (tag) {
      filtered = filtered.filter((a: Record<string, unknown>) => {
        const tags = a.article_tags as Array<{ tag_name: string }>;
        return tags?.some(
          (t) => t.tag_name.toLowerCase() === tag.toLowerCase(),
        );
      });
    }

    return NextResponse.json(filtered);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
