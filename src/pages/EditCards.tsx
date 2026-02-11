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
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type StoredCard = { id: number; question: string; answer: string; title: string; skipped?: boolean };
type StoredCollection = { id: number; name: string };

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
  const [saving, setSaving] = useState(false);
  const [addingCopy, setAddingCopy] = useState(false);
  const [clearingSkips, setClearingSkips] = useState(false);

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

  function openEdit(card: StoredCard) {
    setEditingCard(card);
    setEditTitle(card.title ?? "");
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
    setEditCollectionId(selectedCollectionId);
  }

  function closeEdit() {
    setEditingCard(null);
    setEditTitle("");
    setEditQuestion("");
    setEditAnswer("");
    setEditCollectionId("");
  }

  const cardCurrentCollectionId = selectedCollectionId;
  const selectedCollectionIsDifferent =
    editCollectionId !== "" && editCollectionId !== cardCurrentCollectionId;

  async function handleSaveEdit() {
    if (!editingCard) return;
    const cid = Number(editCollectionId);
    if (!editCollectionId || Number.isNaN(cid)) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("update_card", {
        id: editingCard.id,
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
        collectionId: cid,
        title: editTitle.trim() || undefined,
      });
      const currentId = Number(selectedCollectionId);
      if (cid === currentId) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === editingCard.id
              ? { ...c, title: editTitle.trim(), question: editQuestion.trim(), answer: editAnswer.trim() }
              : c
          )
        );
      } else {
        setCards((prev) => prev.filter((c) => c.id !== editingCard.id));
      }
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCopyToCollection() {
    if (!editCollectionId || !selectedCollectionIsDifferent) return;
    const cid = Number(editCollectionId);
    if (Number.isNaN(cid)) return;
    setAddingCopy(true);
    setError(null);
    try {
      await invoke("add_card", {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
        collectionId: cid,
        title: editTitle.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingCopy(false);
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
            <div className="grid gap-2">
              <Label>Collection</Label>
              <Select value={editCollectionId} onValueChange={setEditCollectionId}>
                <SelectTrigger>
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
              {selectedCollectionIsDifferent && (
                <p className="text-muted-foreground text-xs">
                  Move card or add a copy to the selected collection?
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            {selectedCollectionIsDifferent ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!editQuestion.trim() || !editAnswer.trim() || addingCopy}
                  onClick={handleAddCopyToCollection}
                >
                  {addingCopy ? "Adding…" : "Add copy"}
                </Button>
                <Button
                  type="button"
                  disabled={!editQuestion.trim() || !editAnswer.trim() || saving}
                  onClick={handleSaveEdit}
                >
                  {saving ? "Moving…" : "Move"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={!editQuestion.trim() || !editAnswer.trim() || !editCollectionId || saving}
                onClick={handleSaveEdit}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
