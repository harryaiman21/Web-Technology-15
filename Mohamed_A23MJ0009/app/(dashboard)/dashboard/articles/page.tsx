"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/articles/status-badge";
import { Search, FileText, AlertTriangle, Copy, Loader2 } from "lucide-react";

interface ArticleRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  duplicate_flag: boolean;
  conflict_flag: boolean;
  current_version_number: number;
  article_tags: Array<{ tag_name: string }>;
  profiles: { full_name: string } | null;
}

const STATUS_OPTIONS = ["all", "draft", "reviewed", "published"];

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [creatorIdFilter, setCreatorIdFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (creatorIdFilter) params.set("creatorId", creatorIdFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const res = await fetch(`/api/articles?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setArticles(data);
        const tags = new Set<string>();
        data.forEach((a: ArticleRow) =>
          a.article_tags?.forEach((t) => tags.add(t.tag_name)),
        );
        setAllTags(Array.from(tags).sort());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, tagFilter, creatorIdFilter, fromDate, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchArticles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchArticles]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge Articles</h1>
        <p className="text-muted-foreground">
          Browse, search, and manage all articles
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by title..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor="creator-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                Creator ID
              </label>
              <Input
                id="creator-filter"
                placeholder="Filter by creator UUID"
                value={creatorIdFilter}
                onChange={(e) => setCreatorIdFilter(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="from-date-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                From Date
              </label>
              <Input
                id="from-date-filter"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="to-date-filter"
                className="text-xs font-medium text-muted-foreground"
              >
                To Date
              </label>
              <Input
                id="to-date-filter"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">
                Tags:
              </span>
              <Badge
                variant={tagFilter === "" ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setTagFilter("")}
              >
                All
              </Badge>
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tagFilter === tag ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Articles ({articles.length})</span>
            <Link href="/dashboard/upload">
              <Button
                size="sm"
                className="bg-[#D40511] hover:bg-[#b5040e] text-white"
              >
                <FileText className="mr-2 h-3 w-3" /> New Article
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : articles.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No articles found. Upload content to create your first article.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Creator
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Tags</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Version
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Flags
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow
                      key={article.id}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell>
                        <Link
                          href={`/dashboard/articles/${article.id}`}
                          className="font-medium hover:underline"
                        >
                          {article.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={article.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {article.profiles?.full_name || "Unknown"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {article.article_tags?.slice(0, 3).map((t) => (
                            <Badge
                              key={t.tag_name}
                              variant="secondary"
                              className="text-xs"
                            >
                              {t.tag_name}
                            </Badge>
                          ))}
                          {(article.article_tags?.length || 0) > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{article.article_tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        v{article.current_version_number}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex gap-1">
                          {article.duplicate_flag && (
                            <span title="Duplicate">
                              <Copy className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                          {article.conflict_flag && (
                            <span title="Conflict">
                              <AlertTriangle className="h-4 w-4 text-orange-500" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {new Date(article.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
