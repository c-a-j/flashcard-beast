import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
import { createWorker } from "tesseract.js";

type StoredCollection = { id: number; name: string };

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

export function BulkCreate() {
  const [flipped, setFlipped] = useState(false);
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [bulkFileFormat, setBulkFileFormat] = useState<string>("png");
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
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

  const currentQueueItem = ocrQueue.length > 0 && previewIndex >= 0 && previewIndex < ocrQueue.length
    ? ocrQueue[previewIndex]
    : null;
  const rawTextRead = currentQueueItem?.text ?? "";
  const hasProcessedText = currentQueueItem != null;

  useEffect(() => {
    setEditTitle("");
    setEditQuestion("");
    setEditAnswer("");
  }, [previewIndex, currentQueueItem?.path]);

  async function handleSave() {
    const collectionIdNum = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;
    if (collectionIdNum == null) return;
    const q = editQuestion.trim();
    const a = editAnswer.trim();
    if (!q || !a) return;
    try {
      await invoke("add_card", { question: q, answer: a, collectionId: collectionIdNum, title: editTitle.trim() || undefined });
      setOcrQueue((prev) => prev.filter((_, i) => i !== previewIndex));
      setFlipped(false);
    } catch {
      // TODO: surface error to user
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
    const path = await open({
      directory: true,
      multiple: false,
    });
    if (path !== null) {
      setSelectedDirectory(typeof path === "string" ? path : path[0] ?? null);
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
                readOnly
                value={selectedDirectory ?? ""}
                placeholder="No directory selected"
                className="bg-muted/50"
              />
              <Button type="button" variant="outline" onClick={handleSelectDirectory}>
                Select…
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!selectedDirectory || fileCount === 0 || ocrProcessing}
              onClick={handleCreateCards}
            >
              {ocrProcessing ? "Running OCR…" : "Create Cards"}
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
            <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm min-h-[4rem]">
              {rawTextRead || (ocrQueue.length === 0 ? "Run OCR to see raw text from images." : "No text for this item.")}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Title (optional)</p>
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

          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Flip card</p>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="relative h-[180px] w-full cursor-pointer [perspective:1000px]"
              aria-label={flipped ? "Show question" : "Show answer"}
            >
              <div
                className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
              >
                <div
                  className="absolute inset-0 flex flex-col rounded-xl border bg-card p-4 shadow-md [backface-visibility:hidden]"
                  style={{ transform: "rotateY(0deg)" }}
                >
                  {hasProcessedText && editTitle.trim() ? (
                    <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                      {editTitle.trim()}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                    {hasProcessedText ? editQuestion || "Question side" : "Question side"}
                  </p>
                </div>
                <div
                  className="absolute inset-0 flex flex-col rounded-xl border bg-muted p-4 shadow-md [backface-visibility:hidden]"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  {hasProcessedText && editTitle.trim() ? (
                    <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                      {editTitle.trim()}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                    {hasProcessedText ? editAnswer || "Answer side" : "Answer side"}
                  </p>
                </div>
              </div>
            </button>
            <p className="text-muted-foreground text-xs">Click to flip</p>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
