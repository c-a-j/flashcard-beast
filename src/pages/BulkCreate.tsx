import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, generateNotecard, parseNotecard } from "@/lib/utils";
import { createWorker } from "tesseract.js";

const OLLAMA_HOSTS = {
  local: "http://localhost:11434",
  cloud: "https://ollama.com",
} as const;

type StoredCollection = { id: number; name: string };
type StoredSubCollection = { id: number; name: string; collection_id: number };

const BULK_IMAGE_FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const BULK_IMAGE_FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "gif", label: "GIF" },
] as const;

const BULK_DIRECTORY_STORAGE_KEY = "bulk-create-directory";

export function BulkCreate() {
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [bulkFileFormat, setBulkFileFormat] = useState<string>("png");
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BULK_DIRECTORY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [ollamaHost, setOllamaHost] = useState<"local" | "cloud">("local");
  const [model, setModel] = useState("glm-4.7-flash");
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [fileCountLoading, setFileCountLoading] = useState(false);
  /** Queue of OCR results (path + text) for the Card Preview side to process later. */
  const [ocrQueue, setOcrQueue] = useState<{ path: string; text: string }[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  /** Index into ocrQueue for the Card Preview (which item we're viewing/editing). */
  const [previewIndex, setPreviewIndex] = useState(0);
  /** Editable title/question/answer for the current queue item (when tesseract text is available). */
  const [editTitle, setEditTitle] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [subCollections, setSubCollections] = useState<StoredSubCollection[]>([]);
  const [selectedSubCollectionId, setSelectedSubCollectionId] = useState<string>("");
  const [newSubCollectionOpen, setNewSubCollectionOpen] = useState(false);
  const [newSubCollectionName, setNewSubCollectionName] = useState("");
  const [creatingSubCollection, setCreatingSubCollection] = useState(false);

  const currentQueueItem = ocrQueue.length > 0 && previewIndex >= 0 && previewIndex < ocrQueue.length
    ? ocrQueue[previewIndex]
    : null;
  const rawTextRead = currentQueueItem?.text ?? "";
  const [llmResponse, setLlmResponse] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const hasProcessedText = currentQueueItem != null;

  useEffect(() => {
    setEditTitle("");
    setEditQuestion("");
    setEditAnswer("");
    setLlmResponse("");
  }, [previewIndex, currentQueueItem?.path]);

  useEffect(() => {
    try {
      if (selectedDirectory) {
        localStorage.setItem(BULK_DIRECTORY_STORAGE_KEY, selectedDirectory);
      } else {
        localStorage.removeItem(BULK_DIRECTORY_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [selectedDirectory]);

  async function handleSave() {
    const collectionIdNum = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;
    if (collectionIdNum == null) return;
    const q = editQuestion.trim();
    const a = editAnswer.trim();
    if (!q || !a) return;
    try {
      await invoke("add_card", {
        question: q,
        answer: a,
        collectionId: collectionIdNum,
        title: editTitle.trim() || undefined,
        subCollectionId: selectedSubCollectionId ? Number(selectedSubCollectionId) : undefined,
      });
      setOcrQueue((prev) => prev.filter((_, i) => i !== previewIndex));
    } catch {
      // TODO: surface error to user
    }
  }

  async function handleRunLlm() {
    const text = rawTextRead.trim();
    if (!text || !llmEnabled) return;
    setLlmLoading(true);
    setLlmResponse("");
    try {
      const host = OLLAMA_HOSTS[ollamaHost];
      const apiKey =
        ollamaHost === "cloud" ? await invoke<string>("get_ollama_api_key") : undefined;
      const message = await generateNotecard(
        text,
        model,
        host,
        apiKey ?? undefined,
        ollamaHost === "cloud" ? tauriFetch : undefined
      );
      const content = message.content ?? "";
      setLlmResponse(content);
      const notecard = parseNotecard(content);
      setEditQuestion(notecard.question);
      setEditAnswer(notecard.answer);
    } catch (e) {
      setLlmResponse(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLlmLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    invoke<StoredCollection[]>("get_collections")
      .then((data) => {
        if (!cancelled) {
          setCollections(data);
          if (data.length > 0 && !selectedCollectionId) {
            setSelectedCollectionId(String(data[0].id));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (collections.length > 0 && !selectedCollectionId) {
      setSelectedCollectionId(String(collections[0].id));
    }
  }, [collections, selectedCollectionId]);

  useEffect(() => {
    if (!selectedCollectionId) {
      setSubCollections([]);
      setSelectedSubCollectionId("");
      return;
    }
    setSubCollections([]);
    setSelectedSubCollectionId("");
    let cancelled = false;
    invoke<StoredSubCollection[]>("get_sub_collections", {
      collectionId: Number(selectedCollectionId),
    })
      .then((data) => {
        if (!cancelled) {
          setSubCollections(data);
          setSelectedSubCollectionId(data[0] ? String(data[0].id) : "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubCollections([]);
          setSelectedSubCollectionId("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollectionId]);

  async function handleCreateSubCollection() {
    const name = newSubCollectionName.trim();
    const cid = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;
    if (!name || cid == null) return;
    setCreatingSubCollection(true);
    try {
      const created = await invoke<StoredSubCollection>("create_sub_collection", {
        collectionId: cid,
        name,
      });
      setSubCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSubCollectionId(String(created.id));
      setNewSubCollectionName("");
      setNewSubCollectionOpen(false);
    } finally {
      setCreatingSubCollection(false);
    }
  }

  useEffect(() => {
    if (ocrQueue.length > 0 && previewIndex >= ocrQueue.length) {
      setPreviewIndex(ocrQueue.length - 1);
    }
  }, [ocrQueue.length, previewIndex]);

  async function handleCreateCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      const created = await invoke<StoredCollection>("create_collection", { name });
      setCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCollectionId(String(created.id));
      setNewCollectionName("");
      setNewCollectionOpen(false);
    } finally {
      setCreatingCollection(false);
    }
  }

  async function handleSelectDirectory() {
    try {
      const path = await invoke<string | null>("pick_directory");
      if (path) {
        setSelectedDirectory(path);
      }
    } catch (e) {
      console.error("Directory dialog failed:", e);
    }
  }

  async function handleCreateCards() {
    if (!selectedDirectory) return;
    setOcrProcessing(true);
    setOcrQueue([]);
    try {
      const paths = await invoke<string[]>("list_files_in_directory", {
        directory: selectedDirectory,
        format: bulkFileFormat,
      });
      const mime = BULK_IMAGE_FORMAT_MIME[bulkFileFormat] ?? "image/png";
      const worker = await createWorker("eng");
      try {
        for (const path of paths) {
          try {
            const base64 = await invoke<string>("read_file_base64", { path });
            const dataUrl = `data:${mime};base64,${base64}`;
            const { data } = await worker.recognize(dataUrl);
            setOcrQueue((prev) => [...prev, { path, text: data.text ?? "" }]);
          } catch {
            setOcrQueue((prev) => [...prev, { path, text: "" }]);
          }
        }
      } finally {
        await worker.terminate();
      }
    } finally {
      setOcrProcessing(false);
    }
  }

  useEffect(() => {
    if (!selectedDirectory) {
      setFileCount(null);
      return;
    }
    let cancelled = false;
    setFileCountLoading(true);
    invoke<number>("count_files_in_directory", {
      directory: selectedDirectory,
      format: bulkFileFormat,
    })
      .then((count) => {
        if (!cancelled) {
          setFileCount(count);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFileCount(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFileCountLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDirectory, bulkFileFormat]);

  const fileCountMessage =
    !selectedDirectory
      ? null
      : fileCountLoading
        ? "Counting…"
        : fileCount === 0
          ? "No files found."
          : `${fileCount} ${fileCount === 1 ? "file" : "files"} found.`;

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Create</CardTitle>
          <CardDescription>
            Add many notecards at once. Paste or type bulk content and configure how cards are split.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid w-full gap-2">
            <Label>Collection</Label>
            <div className="flex gap-2">
              <Select
                value={selectedCollectionId}
                onValueChange={setSelectedCollectionId}
                disabled={collections.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select collection..." />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={newCollectionOpen} onOpenChange={setNewCollectionOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="icon" title="New collection">
                    +
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New collection</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="bulk-new-collection-name">Name</Label>
                    <Input
                      id="bulk-new-collection-name"
                      placeholder="e.g. Spanish vocab"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateCollection()}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewCollectionOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!newCollectionName.trim() || creatingCollection}
                      onClick={handleCreateCollection}
                    >
                      {creatingCollection ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="grid w-full gap-2">
            <Label>Bulk File Format</Label>
            <Select value={bulkFileFormat} onValueChange={setBulkFileFormat}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select format..." />
              </SelectTrigger>
              <SelectContent>
                {BULK_IMAGE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-2">
            <Label>Directory</Label>
            <div className="flex gap-2">
              <Input
                value={selectedDirectory ?? ""}
                onChange={(e) => setSelectedDirectory(e.target.value.trim() || null)}
                placeholder="Path or click Select…"
                className="bg-muted/50"
              />
              <Button type="button" variant="outline" onClick={handleSelectDirectory}>
                Select…
              </Button>
            </div>
          </div>
          <div className="grid w-full gap-2">
            <Label>LLM</Label>
            <button
              type="button"
              role="switch"
              aria-checked={llmEnabled}
              onClick={() => setLlmEnabled((v) => !v)}
              className="relative inline-flex h-9 w-[8.5rem] rounded-md border border-input bg-muted/50 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span
                className={cn(
                  "absolute top-0.5 bottom-0.5 rounded-[4px] bg-background shadow-sm transition-all duration-200",
                  llmEnabled ? "left-0.5 right-1/2" : "left-1/2 right-0.5"
                )}
              />
              <span
                className={cn(
                  "relative z-10 flex flex-1 items-center justify-center text-sm font-medium transition-colors",
                  llmEnabled ? "text-foreground" : "text-muted-foreground"
                )}
              >
                LLM On
              </span>
              <span
                className={cn(
                  "relative z-10 flex flex-1 items-center justify-center text-sm font-medium transition-colors",
                  !llmEnabled ? "text-foreground" : "text-muted-foreground"
                )}
              >
                LLM Off
              </span>
            </button>
          </div>
          <div className="grid w-full gap-2">
            <Label>Ollama host</Label>
            <Select
              value={ollamaHost}
              onValueChange={(v) => {
                const host = v as "local" | "cloud";
                setOllamaHost(host);
                if (host === "cloud") setModel("deepseek-v3.1:671b-cloud");
                if (host === "local") setModel("glm-4.7-flash");
              }}
              disabled={!llmEnabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select host..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-2">
            <Label htmlFor="bulk-model">Model</Label>
            <Input
              id="bulk-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="glm-4.7-flash"
              disabled={!llmEnabled}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={ocrQueue.length > 0 && !ocrProcessing ? "destructive" : "default"}
              disabled={
                ocrProcessing ||
                (ocrQueue.length === 0 && (!selectedDirectory || fileCount === 0))
              }
              onClick={() => {
                if (ocrQueue.length > 0 && !ocrProcessing) {
                  setOcrQueue([]);
                  setPreviewIndex(0);
                } else {
                  handleCreateCards();
                }
              }}
            >
              {ocrProcessing
                ? "Running OCR…"
                : ocrQueue.length > 0
                  ? "Stop Creating Cards"
                  : "Create Cards"}
            </Button>
            {fileCountMessage !== null && (
              <p className="text-muted-foreground text-sm">
                {fileCountMessage}
              </p>
            )}
            {ocrQueue.length > 0 && !ocrProcessing && (
              <p className="text-muted-foreground text-sm">
                {ocrQueue.length} in queue
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card Preview</CardTitle>
          <CardDescription>
            Preview how your notecards will look.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Raw Text Read</p>
            {hasProcessedText ? (
              <Textarea
                value={rawTextRead}
                onChange={(e) =>
                  setOcrQueue((prev) =>
                    prev.map((item, i) =>
                      i === previewIndex ? { ...item, text: e.target.value } : item
                    )
                  )
                }
                placeholder="Run OCR to see raw text from images."
                rows={4}
                className="min-h-[4rem] resize-y font-mono text-sm"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm min-h-[4rem] text-muted-foreground">
                {ocrQueue.length === 0
                  ? "Run OCR to see raw text from images."
                  : "No text for this item."}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">LLM Response</p>
            <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm min-h-[4rem]">
              {llmResponse || (ocrQueue.length === 0 ? "—" : "No LLM response for this item.")}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Title</p>
            {hasProcessedText ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Chapter 1"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
                —
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Question</p>
            {hasProcessedText ? (
              <Textarea
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                placeholder="Edit the question..."
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
                Your question will appear here.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Answer</p>
            {hasProcessedText ? (
              <Textarea
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                placeholder="Edit the answer..."
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
                Your answer will appear here.
              </p>
            )}
          </div>
          <div className="grid w-full max-w-xs gap-2">
            <Label className="text-muted-foreground text-sm font-medium">Sub Collection</Label>
            <div className="flex gap-2">
              <Select
                value={selectedSubCollectionId}
                onValueChange={setSelectedSubCollectionId}
                disabled={!hasProcessedText || !selectedCollectionId || subCollections.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a sub collection..." />
                </SelectTrigger>
                <SelectContent>
                  {subCollections.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={newSubCollectionOpen} onOpenChange={setNewSubCollectionOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="New sub collection"
                    disabled={!hasProcessedText || !selectedCollectionId}
                  >
                    +
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New sub collection</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="bulk-new-sub-collection-name">Name</Label>
                    <Input
                      id="bulk-new-sub-collection-name"
                      placeholder="e.g. Chapter 1"
                      value={newSubCollectionName}
                      onChange={(e) => setNewSubCollectionName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateSubCollection()}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewSubCollectionOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!newSubCollectionName.trim() || creatingSubCollection}
                      onClick={handleCreateSubCollection}
                    >
                      {creatingSubCollection ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!hasProcessedText || !editQuestion.trim() || !editAnswer.trim()}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button type="button" variant="outline">Skip</Button>
            <Button
              type="button"
              variant="outline"
              disabled={!llmEnabled || !hasProcessedText || !rawTextRead.trim() || llmLoading}
              onClick={handleRunLlm}
            >
              {llmLoading ? "Running…" : "Run LLM"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
