import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";

type StoredCollection = { id: number; name: string };
type StoredSubCollection = { id: number; name: string; collection_id: number };

export function CreateCards() {
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [subCollections, setSubCollections] = useState<StoredSubCollection[]>([]);
  const [selectedSubCollectionId, setSelectedSubCollectionId] = useState<string>("");
  const [newSubCollectionOpen, setNewSubCollectionOpen] = useState(false);
  const [newSubCollectionName, setNewSubCollectionName] = useState("");
  const [creatingSubCollection, setCreatingSubCollection] = useState(false);

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

  async function handleAddCard() {
    const q = question.trim();
    const a = answer.trim();
    const cid = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;
    if (!q || !a || cid == null) return;
    setError(null);
    setAdding(true);
    try {
      await invoke("add_card", {
        question: q,
        answer: a,
        collectionId: cid,
        title: title.trim() || undefined,
        subCollectionId: selectedSubCollectionId ? Number(selectedSubCollectionId) : undefined,
      });
      setTitle("");
      setQuestion("");
      setAnswer("");
      setFlipped(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleCreateCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const created = await invoke<StoredCollection>("create_collection", { name });
      setCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCollectionId(String(created.id));
      setNewCollectionName("");
      setNewCollectionOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingCollection(false);
    }
  }

  async function handleCreateSubCollection() {
    const name = newSubCollectionName.trim();
    const cid = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;
    if (!name || cid == null) return;
    setCreatingSubCollection(true);
    setError(null);
    try {
      const created = await invoke<StoredSubCollection>("create_sub_collection", {
        collectionId: cid,
        name,
      });
      setSubCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSubCollectionId(String(created.id));
      setNewSubCollectionName("");
      setNewSubCollectionOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingSubCollection(false);
    }
  }

  const collectionIdNum = selectedCollectionId ? Number(selectedCollectionId) : collections[0]?.id;

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create Cards</CardTitle>
          <CardDescription>
            Add a question and answer to create a notecard. Choose a collection to add it to.
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
                    <Label htmlFor="new-collection-name">Name</Label>
                    <Input
                      id="new-collection-name"
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
            <Label>Sub Collection</Label>
            <div className="flex gap-2">
              <Select
                value={selectedSubCollectionId}
                onValueChange={setSelectedSubCollectionId}
                disabled={!selectedCollectionId || subCollections.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sub collection (optional)..." />
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
                    disabled={!selectedCollectionId}
                  >
                    +
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New sub collection</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="new-sub-collection-name">Name</Label>
                    <Input
                      id="new-sub-collection-name"
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
          <div className="grid w-full gap-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="e.g. Chapter 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid w-full gap-2">
            <Label htmlFor="question">Question</Label>
            <Textarea
              id="question"
              placeholder="Enter the question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="min-h-[4.5rem] resize-y"
            />
          </div>
          <div className="grid w-full gap-2">
            <Label htmlFor="answer">Answer</Label>
            <Textarea
              id="answer"
              placeholder="Enter the answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              className="min-h-[4.5rem] resize-y"
            />
          </div>
          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
          <Button
            type="button"
            disabled={
              !question.trim() ||
              !answer.trim() ||
              adding ||
              (collections.length > 0 && collectionIdNum == null)
            }
            onClick={handleAddCard}
          >
            {adding ? "Adding…" : "Add card"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card Preview</CardTitle>
          <CardDescription>
            Preview how your notecard will look.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Question</p>
            <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
              {question || "Your question will appear here."}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">Answer</p>
            <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
              {answer || "Your answer will appear here."}
            </p>
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
                  {title.trim() ? (
                    <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                      {title.trim()}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                    {question || "Question side"}
                  </p>
                </div>
                <div
                  className="absolute inset-0 flex flex-col rounded-xl border bg-muted p-4 shadow-md [backface-visibility:hidden]"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  {title.trim() ? (
                    <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                      {title.trim()}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                    {answer || "Answer side"}
                  </p>
                </div>
              </div>
            </button>
            <p className="text-muted-foreground text-xs">Click to flip</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
