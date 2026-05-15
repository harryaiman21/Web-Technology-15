"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, Eye, RotateCcw, Loader2, ShieldAlert } from "lucide-react";

interface StatusActionsProps {
  articleId: string;
  currentStatus: string;
  userRole: string;
}

const TRANSITIONS: Record<string, Array<{ to: string; label: string; icon: React.ElementType; color: string }>> = {
  draft: [
    { to: "reviewed", label: "Mark as Reviewed", icon: Eye, color: "bg-blue-600 hover:bg-blue-700 text-white" },
  ],
  reviewed: [
    { to: "published", label: "Publish", icon: CheckCircle, color: "bg-green-600 hover:bg-green-700 text-white" },
    { to: "draft", label: "Revert to Draft", icon: RotateCcw, color: "" },
  ],
  published: [
    { to: "draft", label: "Unpublish", icon: RotateCcw, color: "" },
  ],
};

export function StatusActions({ articleId, currentStatus, userRole }: StatusActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const isAdmin = userRole === "admin";
  const actions = TRANSITIONS[currentStatus] || [];

  async function handleStatusChange(newStatus: string) {
    setLoading(newStatus);
    try {
      const res = await fetch(`/api/articles/${articleId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(`Status changed to "${newStatus}"`);
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setLoading(null);
    }
  }

  if (actions.length === 0) return null;

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-muted px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
        Admin only: status changes
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.to}
            variant={action.color ? "default" : "outline"}
            size="sm"
            className={action.color}
            disabled={loading !== null}
            onClick={() => handleStatusChange(action.to)}
          >
            {loading === action.to ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <Icon className="mr-2 h-3 w-3" />
            )}
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
