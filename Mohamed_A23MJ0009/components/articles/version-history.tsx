"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import { Loader2, GitBranch, ArrowRight } from "lucide-react";

interface Version {
  id: string;
  version_number: number;
  title: string;
  summary: string | null;
  status_at_that_time: string;
  change_note: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface StatusChange {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  note: string | null;
  profiles: { full_name: string } | null;
}

export function VersionHistory({ articleId }: { articleId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/articles/${articleId}/versions`);
        const data = await res.json();
        setVersions(data.versions || []);
        setStatusHistory(data.statusHistory || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [articleId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Version History ({versions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No version history yet.
            </p>
          ) : (
            <div className="space-y-4">
              {versions.map((v) => (
                <div key={v.id} className="flex gap-4 relative">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      v{v.version_number}
                    </div>
                    <div className="flex-1 w-px bg-border mt-2" />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{v.title}</p>
                      <StatusBadge status={v.status_at_that_time} />
                    </div>
                    {v.change_note && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {v.change_note}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      by {v.profiles?.full_name || "Unknown"} ·{" "}
                      {new Date(v.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Log */}
      <Card>
        <CardHeader>
          <CardTitle>Status Change Log ({statusHistory.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {statusHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No status changes recorded.
            </p>
          ) : (
            <div className="space-y-3">
              {statusHistory.map((sh) => (
                <div
                  key={sh.id}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  {sh.old_status ? (
                    <>
                      <StatusBadge status={sh.old_status} />
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </>
                  ) : null}
                  <StatusBadge status={sh.new_status} />
                  <span className="text-muted-foreground ml-auto text-xs">
                    {sh.profiles?.full_name || "Unknown"} ·{" "}
                    {new Date(sh.changed_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
