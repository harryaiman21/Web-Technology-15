"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, X, Loader2 } from "lucide-react";

interface ArticleEditorProps {
  articleId: string;
  initialTitle: string;
  initialSummary: string;
  initialSteps: Array<{ step_number: number; step_text: string }>;
  initialTags: Array<{ tag_name: string }>;
}

export function ArticleEditor({
  articleId,
  initialTitle,
  initialSummary,
  initialSteps,
  initialTags,
}: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [steps, setSteps] = useState(initialSteps.map((s) => s.step_text));
  const [tags, setTags] = useState(initialTags.map((t) => t.tag_name));
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  function addStep() {
    setSteps([...steps, ""]);
  }

  function updateStep(i: number, text: string) {
    const updated = [...steps];
    updated[i] = text;
    setSteps(updated);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  function addTag() {
    const t = newTag.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setNewTag("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          steps: steps.filter((s) => s.trim()),
          tags,
          changeNote: "Manual edit",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(`Saved as version ${data.version}`);
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Article</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Procedure Steps
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="mr-1 h-3 w-3" /> Add Step
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold mt-1">
                {i + 1}
              </span>
              <Input
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                placeholder={`Step ${i + 1}...`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeStep(i)}
                className="flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No steps yet. Click &quot;Add Step&quot; to begin.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              className="max-w-[200px]"
            />
            <Button variant="outline" size="sm" onClick={addTag}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          className="bg-[#D40511] hover:bg-[#b5040e] text-white"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
