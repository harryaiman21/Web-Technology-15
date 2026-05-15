import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/articles/status-badge";
import {
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  Bot,
  Database,
  Eye,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    isAdmin = profile?.role === "admin";
  }

  const [
    { count: totalCount },
    { count: draftCount },
    { count: reviewedCount },
    { count: publishedCount },
    { count: duplicateCount },
    { count: sourceCount },
    { data: recentArticles },
    { data: recentStatus },
  ] = await Promise.all([
    supabase
      .from("knowledge_articles")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("knowledge_articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("knowledge_articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "reviewed"),
    supabase
      .from("knowledge_articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("knowledge_articles")
      .select("*", { count: "exact", head: true })
      .eq("duplicate_flag", true),
    supabase
      .from("source_documents")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("knowledge_articles")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("status_history")
      .select("*, profiles!status_history_changed_by_fkey(full_name)")
      .order("changed_at", { ascending: false })
      .limit(6),
  ]);

  const stats = [
    {
      title: "Total Articles",
      value: totalCount ?? 0,
      icon: Database,
      color: "text-foreground",
    },
    {
      title: "Drafts",
      value: draftCount ?? 0,
      icon: FileText,
      color: "text-orange-500",
    },
    {
      title: "Reviewed",
      value: reviewedCount ?? 0,
      icon: Eye,
      color: "text-blue-500",
    },
    {
      title: "Published",
      value: publishedCount ?? 0,
      icon: CheckCircle,
      color: "text-green-500",
    },
    {
      title: "Duplicates",
      value: duplicateCount ?? 0,
      icon: AlertTriangle,
      color: "text-red-500",
    },
    {
      title: "Sources Processed",
      value: sourceCount ?? 0,
      icon: Upload,
      color: "text-violet-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            AI-Powered Knowledge Base — DHL Logistics Operations
          </p>
        </div>
        <Link href="/dashboard/upload">
          <Button className="bg-[#D40511] hover:bg-[#b5040e] text-white">
            <Upload className="mr-2 h-4 w-4" /> New Upload
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Articles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Articles</CardTitle>
              <CardDescription>
                Latest knowledge articles created
              </CardDescription>
            </div>
            <Link href="/dashboard/articles">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentArticles && recentArticles.length > 0 ? (
              <div className="space-y-3">
                {recentArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/dashboard/articles/${article.id}`}
                    className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {article.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(article.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={article.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No articles yet. Upload content to get started.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest status changes across all articles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentStatus && recentStatus.length > 0 ? (
              <div className="space-y-3">
                {recentStatus.map((entry: Record<string, unknown>) => {
                  const profiles = entry.profiles as {
                    full_name: string;
                  } | null;
                  return (
                    <div
                      key={entry.id as string}
                      className="flex items-center gap-3 text-sm"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.old_status ? (
                            <>
                              <StatusBadge
                                status={entry.old_status as string}
                              />
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </>
                          ) : null}
                          <StatusBadge status={entry.new_status as string} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {profiles?.full_name || "Unknown"} ·{" "}
                          {new Date(
                            entry.changed_at as string,
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No activity yet. Status changes will appear here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/upload"
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <Upload className="h-5 w-5 text-[#D40511]" />
            <div>
              <p className="font-medium text-sm">Upload Content</p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, or text
              </p>
            </div>
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/rpa-results"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <Bot className="h-5 w-5 text-[#D40511]" />
              <div>
                <p className="font-medium text-sm">RPA Results</p>
                <p className="text-xs text-muted-foreground">
                  Review extractions
                </p>
              </div>
            </Link>
          )}
          <Link
            href="/dashboard/articles"
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <FileText className="h-5 w-5 text-[#D40511]" />
            <div>
              <p className="font-medium text-sm">Browse Articles</p>
              <p className="text-xs text-muted-foreground">Search and manage</p>
            </div>
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/articles?status=draft"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <Eye className="h-5 w-5 text-[#D40511]" />
              <div>
                <p className="font-medium text-sm">Review Drafts</p>
                <p className="text-xs text-muted-foreground">Pending review</p>
              </div>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
