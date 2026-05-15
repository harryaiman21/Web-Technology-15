"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Type, Loader2, CheckCircle, X } from "lucide-react";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
];

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(selected: File | null) {
    if (!selected) return;
    if (!ALLOWED_TYPES.includes(selected.type)) {
      toast.error(
        "Only TXT, PDF, DOCX, PNG, JPG, JPEG, WEBP, GIF, and BMP files are supported",
      );
      return;
    }
    if (selected.size > MAX_SIZE) {
      toast.error("File must be under 10 MB");
      return;
    }
    setFile(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    handleFileSelect(dropped);
  }

  async function handleSubmit(inputType: "file" | "text") {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("inputType", inputType);

      if (inputType === "file") {
        if (!file) {
          toast.error("Please select a file first");
          setLoading(false);
          return;
        }
        formData.set("file", file);
      } else {
        if (!textInput.trim()) {
          toast.error("Please enter some text");
          setLoading(false);
          return;
        }
        formData.set("text", textInput);
      }

      const res = await fetch("/api/process-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        setLoading(false);
        return;
      }

      if (data.duplicate) {
        toast.warning(
          `Possible ${data.duplicate.matchType} duplicate: "${data.duplicate.matchedTitle}"`,
          { duration: 6000 }
        );
      }

      toast.success(`Draft created: "${data.title}"`);
      router.push(`/dashboard/draft/${data.articleId}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fileExtension = file?.name.split(".").pop()?.toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Console</h1>
        <p className="text-muted-foreground">
          Upload raw content to generate a knowledge article draft
        </p>
      </div>

      <Tabs defaultValue="file" className="w-full">
        <TabsList>
          <TabsTrigger value="file" className="gap-2">
            <Upload className="h-4 w-4" /> File Upload
          </TabsTrigger>
          <TabsTrigger value="text" className="gap-2">
            <Type className="h-4 w-4" /> Paste Text
          </TabsTrigger>
        </TabsList>

        {/* ── FILE TAB ── */}
        <TabsContent value="file">
          <Card>
            <CardHeader>
              <CardTitle>Upload a Document</CardTitle>
              <CardDescription>
                Supported formats: TXT, PDF, DOCX, PNG, JPG, JPEG, WEBP, GIF,
                BMP - Max 10 MB
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                        <Badge variant="secondary" className="ml-2">
                          {fileExtension}
                        </Badge>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="font-medium">
                      Drag & drop a file here, or click to browse
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supported files: TXT, PDF, DOCX, PNG, JPG, JPEG, WEBP,
                      GIF, BMP
                    </p>
                  </>
                )}
              </div>

              <Button
                className="w-full bg-[#D40511] hover:bg-[#b5040e] text-white"
                disabled={!file || loading}
                onClick={() => handleSubmit("file")}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Upload & Generate Draft
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TEXT TAB ── */}
        <TabsContent value="text">
          <Card>
            <CardHeader>
              <CardTitle>Paste Raw Text</CardTitle>
              <CardDescription>
                Paste logistics notes, chat logs, email content, or any
                operational text
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste your raw logistics content here...&#10;&#10;Example:&#10;1. Scan incoming parcels at the hub&#10;2. Sort by destination zone&#10;3. Load onto delivery vehicle"
                className="min-h-[240px] font-mono text-sm"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {textInput.length} characters
                </p>
                <Button
                  className="bg-[#D40511] hover:bg-[#b5040e] text-white"
                  disabled={!textInput.trim() || loading}
                  onClick={() => handleSubmit("text")}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Generate Draft
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
