import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";


type StoredCard = { id: number; question: string; answer: string; title: string; skipped?: boolean; sub_collection_id?: number | null };
type StoredCollection = { id: number; name: string };
type StoredSubCollection = { id: number; name: string; collection_id: number };

export function EditCards() {
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<StoredCard | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editCollectionId, setEditCollectionId] = useState<string>("");
  const [editSubCollectionId, setEditSubCollectionId] = useState<string>("");
  const [editSubCollections, setEditSubCollections] = useState<StoredSubCollection[]>([]);
  const [editCollectionAction, setEditCollectionAction] = useState<"move" | "copy">("move");
  const [newSubCollectionOpen, setNewSubCollectionOpen] = useState(false);
  const [newSubCollectionName, setNewSubCollectionName] = useState("");
  const [creatingSubCollection, setCreatingSubCollection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingCopy, setAddingCopy] = useState(false);
  const [clearingSkips, setClearingSkips] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCollectionId) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<StoredCard[]>("get_cards", { collectionId: Number(selectedCollectionId) })
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollectionId]);

  useEffect(() => {
    if (!editingCard || !editCollectionId) {
      setEditSubCollections([]);
      setEditSubCollectionId("");
      return;
    }
    setEditSubCollections([]);
    setEditSubCollectionId("");
    let cancelled = false;
    invoke<StoredSubCollection[]>("get_sub_collections", {
      collectionId: Number(editCollectionId),
    })
      .then((data) => {
        if (!cancelled) {
          setEditSubCollections(data);
          const cardSubId = editingCard.sub_collection_id;
          if (cardSubId != null && data.some((s) => s.id === cardSubId)) {
            setEditSubCollectionId(String(cardSubId));
          } else {
            setEditSubCollectionId(data[0] ? String(data[0].id) : "");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setEditSubCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editingCard, editCollectionId]);

  function openEdit(card: StoredCard) {
    setEditingCard(card);
    setEditTitle(card.title ?? "");
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
    setEditCollectionId(selectedCollectionId);
    setEditSubCollectionId(""); // Set from card after sub-collections load (in useEffect)
    setModalError(null);
  }

  function closeEdit() {
    setEditingCard(null);
    setEditTitle("");
    setEditQuestion("");
    setEditAnswer("");
    setEditCollectionId("");
    setEditSubCollectionId("");
    setEditCollectionAction("move");
    setModalError(null);
  }

  const selectedCollectionIsDifferent =
    editCollectionId !== "" &&
    editCollectionId !== selectedCollectionId;

  async function handleSaveEdit() {
    if (!editingCard) return;
    const cid = Number(editCollectionId);
    if (!editCollectionId || Number.isNaN(cid)) return;
    setSaving(true);
    setModalError(null);
    try {
      await invoke("update_card", {
        id: editingCard.id,
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
        collectionId: cid,
        title: editTitle.trim() || undefined,
        subCollectionId: editSubCollectionId ? Number(editSubCollectionId) : undefined,
      });
      const currentId = Number(selectedCollectionId);
      if (cid === currentId) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === editingCard.id
              ? {
                  ...c,
                  title: editTitle.trim(),
                  question: editQuestion.trim(),
                  answer: editAnswer.trim(),
                  sub_collection_id: editSubCollectionId ? Number(editSubCollectionId) : null,
                }
              : c
          )
        );
      } else {
        setCards((prev) => prev.filter((c) => c.id !== editingCard.id));
      }
      closeEdit();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCopyToCollection() {
    if (!editCollectionId || !selectedCollectionIsDifferent) return;
    const cid = Number(editCollectionId);
    if (Number.isNaN(cid)) return;
    setAddingCopy(true);
    setModalError(null);
    try {
      await invoke("add_card", {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
        collectionId: cid,
        title: editTitle.trim() || undefined,
        subCollectionId: editSubCollectionId ? Number(editSubCollectionId) : undefined,
      });
      closeEdit();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingCopy(false);
    }
  }

  async function handleCreateSubCollectionInModal() {
    const name = newSubCollectionName.trim();
    const cid = editCollectionId ? Number(editCollectionId) : null;
    if (!name || cid == null) return;
    setCreatingSubCollection(true);
    setModalError(null);
    try {
      const created = await invoke<StoredSubCollection>("create_sub_collection", {
        collectionId: cid,
        name,
      });
      setEditSubCollections((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditSubCollectionId(String(created.id));
      setNewSubCollectionName("");
      setNewSubCollectionOpen(false);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingSubCollection(false);
    }
  }

  async function handleDelete(card: StoredCard) {
    if (!confirm("Delete this card?")) return;
    setError(null);
    try {
      await invoke("delete_card", { id: card.id });
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSkipChange(card: StoredCard, skipped: boolean) {
    setError(null);
    try {
      await invoke("set_card_skipped", { cardId: card.id, skipped });
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, skipped } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleClearAllSkips() {
    if (!selectedCollectionId) return;
    setClearingSkips(true);
    setError(null);
    try {
      await invoke("clear_skipped_for_collection", {
        collectionId: Number(selectedCollectionId),
      });
      const data = await invoke<StoredCard[]>("get_cards", {
        collectionId: Number(selectedCollectionId),
      });
      setCards(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearingSkips(false);
    }
  }

  if (loading && collections.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && collections.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Edit Cards</CardTitle>
            <CardDescription>
              Edit or delete notecards in a collection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No collections yet. Create one on the Create Cards page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Cards</CardTitle>
          <CardDescription>
            Edit or delete notecards in a collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid w-full max-w-xs gap-2">
              <Label>Collection</Label>
              <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleClearAllSkips}
              disabled={!selectedCollectionId || clearingSkips}
            >
              {clearingSkips ? "Clearing…" : "Clear All Skips"}
            </Button>
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading cards…</p>
          ) : cards.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No cards in this collection.
            </p>
          ) : (
            <ScrollArea className="h-[400px] rounded-md border">
              <ul className="flex flex-col gap-2 p-2">
                {cards.map((card) => (
                  <li
                    key={card.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3"
                  >
                    <p className="line-clamp-2 text-sm font-medium">{card.question}</p>
                    <p className="line-clamp-1 text-muted-foreground text-xs">
                      {card.answer}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(card)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(card)}
                      >
                        Delete
                      </Button>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={card.skipped ?? false}
                          onChange={(e) =>
                            handleSkipChange(card, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-input"
                        />
                        <span>Skip</span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingCard} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-center">
              <Label className="shrink-0">Collection</Label>
                <Select value={editCollectionId} onValueChange={(v) => { setEditCollectionId(v); setEditSubCollectionId(""); }}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Collection…" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div
                  className="flex h-8 rounded-md border bg-muted/30 p-0.5"
                  role="group"
                  aria-label="Move or copy to collection"
                >
                  <button
                    type="button"
                    onClick={() => setEditCollectionAction("move")}
                    className={cn(
                      "flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
                      editCollectionAction === "move"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCollectionAction("copy")}
                    className={cn(
                      "flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
                      editCollectionAction === "copy"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Copy
                  </button>
                </div>
              <Label className="shrink-0">Sub Collection</Label>
              <Select
                value={editSubCollectionId}
                onValueChange={setEditSubCollectionId}
                disabled={!editCollectionId}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="None (optional)…" />
                </SelectTrigger>
                <SelectContent>
                  {editSubCollections.map((s) => (
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
                    disabled={!editCollectionId}
                    className="h-8 w-8 shrink-0"
                  >
                    +
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New sub collection</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="edit-new-sub-collection-name">Name</Label>
                    <Input
                      id="edit-new-sub-collection-name"
                      placeholder="e.g. Chapter 1"
                      value={newSubCollectionName}
                      onChange={(e) => setNewSubCollectionName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleCreateSubCollectionInModal()
                      }
                    />
                  </div>
                  <DialogFooter className="sm:justify-center">
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
                      onClick={handleCreateSubCollectionInModal}
                    >
                      {creatingSubCollection ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title (optional)</Label>
              <Input
                id="edit-title"
                placeholder="e.g. Chapter 1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-question">Question</Label>
              <Textarea
                id="edit-question"
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-answer">Answer</Label>
              <Textarea
                id="edit-answer"
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            </div>
          </div>
          {modalError && (
            <p className="text-destructive text-sm">{modalError}</p>
          )}
          <DialogFooter className="sm:justify-center">
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !editQuestion.trim() ||
                !editAnswer.trim() ||
                !editCollectionId ||
                (selectedCollectionIsDifferent ? (editCollectionAction === "move" ? saving : addingCopy) : saving)
              }
              onClick={
                selectedCollectionIsDifferent && editCollectionAction === "copy"
                  ? handleAddCopyToCollection
                  : handleSaveEdit
              }
            >
              {saving || addingCopy ? "Accepting…" : "Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
