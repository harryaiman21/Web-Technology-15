import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, AlertTriangle, Clock, Eye, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/articles/status-badge";
import { StatusActions } from "@/components/articles/status-actions";
import { ArticleEditor } from "@/components/articles/article-editor";
import { VersionHistory } from "@/components/articles/version-history";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: article } = await supabase
    .from("knowledge_articles")
    .select("*")
    .eq("id", id)
    .single();

  if (!article) notFound();

  const [{ data: steps }, { data: tags }, sourceDocResult] =
    await Promise.all([
      supabase
        .from("article_steps")
        .select("*")
        .eq("article_id", id)
        .order("step_number"),
      supabase.from("article_tags").select("*").eq("article_id", id),
      article.source_document_id
        ? supabase
            .from("source_documents")
            .select("original_name, file_type, extracted_text")
            .eq("id", article.source_document_id)
            .single()
        : null,
    ]);

  const sourceDoc = sourceDocResult?.data ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard/articles">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{article.title}</h1>
            <StatusBadge status={article.status} />
            {article.duplicate_flag && (
              <Badge variant="destructive" className="text-xs">Duplicate</Badge>
            )}
            {article.conflict_flag && (
              <Badge className="bg-orange-100 text-orange-700 text-xs">Conflict</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Version {article.current_version_number} · Created{" "}
            {new Date(article.created_at).toLocaleDateString()} · Updated{" "}
            {new Date(article.updated_at).toLocaleDateString()}
          </p>
        </div>
        <StatusActions
          articleId={id}
          currentStatus={article.status}
          userRole={profile?.role || "editor"}
        />
      </div>

      {(article.duplicate_flag || article.conflict_flag) && (
        <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {article.duplicate_flag
            ? "This article was flagged as an exact duplicate of existing content."
            : "This article may conflict with or overlap with an existing article."}
        </div>
      )}

      {/* Tabs: View / Edit / History */}
      <Tabs defaultValue="view">
        <TabsList>
          <TabsTrigger value="view" className="gap-2">
            <Eye className="h-3 w-3" /> View
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-2">
            <Pencil className="h-3 w-3" /> Edit
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-3 w-3" /> History
          </TabsTrigger>
        </TabsList>

        {/* ── VIEW TAB ── */}
        <TabsContent value="view" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {article.summary || "No summary."}
              </p>
            </CardContent>
          </Card>

          {steps && steps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Procedure Steps</CardTitle>
                <CardDescription>
                  {steps.length} step{steps.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {steps.map((step) => (
                    <li key={step.id} className="flex gap-3">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {step.step_number}
                      </span>
                      <p className="pt-0.5 leading-relaxed">{step.step_text}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {tags && tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.tag_name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {sourceDoc && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Source Document
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">File:</span>
                  <span className="font-medium">{sourceDoc.original_name}</span>
                  <Badge variant="outline" className="uppercase text-xs">
                    {sourceDoc.file_type}
                  </Badge>
                </div>
                <Separator />
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Show extracted text
                  </summary>
                  <pre className="mt-3 max-h-64 overflow-y-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap">
                    {sourceDoc.extracted_text}
                  </pre>
                </details>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── EDIT TAB ── */}
        <TabsContent value="edit" className="mt-6">
          <ArticleEditor
            articleId={id}
            initialTitle={article.title}
            initialSummary={article.summary || ""}
            initialSteps={steps || []}
            initialTags={tags || []}
          />
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="mt-6">
          <VersionHistory articleId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
