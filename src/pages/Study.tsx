import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SUB_COLLECTION_ALL = "__all__"; // Radix Select forbids SelectItem value=""
const SUB_COLLECTION_NONE = "__none__"; // No sub-collection in edit modal

function shuffle<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type StoredCard = { id: number; question: string; answer: string; hint: string; skipped: boolean; sub_collection_id?: number | null };
type StoredCollection = { id: number; name: string };
type StoredSubCollection = { id: number; name: string; collection_id: number };

export function Study() {
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [subCollections, setSubCollections] = useState<StoredSubCollection[]>([]);
  const [selectedSubCollectionId, setSelectedSubCollectionId] = useState<string>(SUB_COLLECTION_ALL);
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [skipChecked, setSkipChecked] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<StoredCard | null>(null);
  const [editSubCollectionId, setEditSubCollectionId] = useState<string>(SUB_COLLECTION_NONE);
  const [editHint, setEditHint] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [editSaveAction, setEditSaveAction] = useState<"overwrite" | "copy">("overwrite");
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
        if (!cancelled) setLoadingCollections(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCollectionId) {
      setSubCollections([]);
      setSelectedSubCollectionId(SUB_COLLECTION_ALL);
      setLoadingCards(false);
      setCards([]);
      return;
    }
    setSubCollections([]);
    setSelectedSubCollectionId(SUB_COLLECTION_ALL);
    let cancelled = false;
    invoke<StoredSubCollection[]>("get_sub_collections", {
      collectionId: Number(selectedCollectionId),
    })
      .then((data) => {
        if (!cancelled) setSubCollections(data);
      })
      .catch(() => {
        if (!cancelled) setSubCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollectionId]);

  useEffect(() => {
    if (!selectedCollectionId) {
      setLoadingCards(false);
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoadingCards(true);
    setError(null);
    invoke<StoredCard[]>("get_cards", { collectionId: Number(selectedCollectionId) })
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          setCurrentIndex(0);
          setFlipped(false);
          setSkipChecked(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollectionId]);

  const filteredCards = useMemo(
    () =>
      selectedSubCollectionId === SUB_COLLECTION_ALL
        ? cards
        : cards.filter(
            (c) => c.sub_collection_id != null && c.sub_collection_id === Number(selectedSubCollectionId)
          ),
    [cards, selectedSubCollectionId]
  );

  const sessionCards = useMemo(
    () => filteredCards.filter((c) => !c.skipped),
    [filteredCards]
  );
  const currentCard = sessionCards[Math.min(currentIndex, sessionCards.length - 1)];

  const handleNextRef = useRef(() => {});
  const handlePreviousRef = useRef(() => {});
  useEffect(() => {
    if (sessionCards.length === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (editingCard) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [role='listbox']")) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePreviousRef.current();
      } else if (e.key === " ") {
        e.preventDefault();
        setSkipChecked((s) => !s);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sessionCards.length, editingCard]);

  async function handleNext() {
    setFlipped(false);
    setSkipChecked(false);
    if (skipChecked && currentCard) {
      try {
        await invoke("set_card_skipped", { cardId: currentCard.id, skipped: true });
        setCards((prev) =>
          prev.map((c) => (c.id === currentCard.id ? { ...c, skipped: true } : c))
        );
        setCurrentIndex((i) => Math.max(0, Math.min(i, sessionCards.length - 2)));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } else {
      setCurrentIndex((i) =>
        i >= sessionCards.length - 1 ? 0 : i + 1
      );
    }
  }
  handleNextRef.current = handleNext;

  function handlePrevious() {
    setFlipped(false);
    setSkipChecked(false);
    setCurrentIndex((i) => (i <= 0 ? sessionCards.length - 1 : i - 1));
  }
  handlePreviousRef.current = handlePrevious;

  function handleRestart() {
    setFlipped(false);
    setCurrentIndex(0);
    setSkipChecked(false);
  }

  function handleShuffle() {
    setCards((prev) => shuffle(prev));
    setCurrentIndex(0);
    setFlipped(false);
    setSkipChecked(false);
  }

  function openEdit(card: StoredCard) {
    setEditingCard(card);
    const sub = subCollections.find((s) => s.id === card.sub_collection_id);
    const isNone = card.sub_collection_id == null || sub?.name === "- None -";
    setEditSubCollectionId(isNone ? SUB_COLLECTION_NONE : String(card.sub_collection_id!));
    setEditHint(card.hint ?? "");
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
    setModalError(null);
  }

  function closeEdit() {
    setEditingCard(null);
    setEditSubCollectionId(SUB_COLLECTION_NONE);
    setEditHint("");
    setEditQuestion("");
    setEditAnswer("");
    setEditSaveAction("overwrite");
    setModalError(null);
  }

  async function handleSaveEdit() {
    if (!editingCard) return;
    const q = editQuestion.trim();
    const a = editAnswer.trim();
    if (!q || !a) return;
    setModalError(null);
    setSaving(true);
    try {
      if (editSaveAction === "copy") {
        await invoke("add_card", {
          question: a,
          answer: q,
          collectionId: Number(selectedCollectionId),
          hint: editHint.trim() || undefined,
          subCollectionId:
            editSubCollectionId && editSubCollectionId !== SUB_COLLECTION_NONE
              ? Number(editSubCollectionId)
              : undefined,
        });
        const data = await invoke<StoredCard[]>("get_cards", {
          collectionId: Number(selectedCollectionId),
        });
        setCards(data);
      } else {
        await invoke("update_card", {
          id: editingCard.id,
          question: q,
          answer: a,
          collectionId: Number(selectedCollectionId),
          hint: editHint.trim() || undefined,
          subCollectionId:
            editSubCollectionId && editSubCollectionId !== SUB_COLLECTION_NONE
              ? Number(editSubCollectionId)
              : undefined,
        });
        const newSubId =
          editSubCollectionId && editSubCollectionId !== SUB_COLLECTION_NONE
            ? Number(editSubCollectionId)
            : null;
        setCards((prev) =>
          prev.map((c) =>
            c.id === editingCard.id
              ? {
                  ...c,
                  hint: editHint.trim(),
                  question: q,
                  answer: a,
                  sub_collection_id: newSubId,
                }
              : c
          )
        );
      }
      closeEdit();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadingCollections) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Study</CardTitle>
            <CardDescription>
              Review your notecards. Flip to reveal answers and track what you know.
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

  if (loadingCards) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading cards…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (filteredCards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Study</CardTitle>
            <CardDescription>
              Review your notecards. Flip to reveal answers and track what you know.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
              <Label className="shrink-0">Collection</Label>
              <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                <SelectTrigger className="w-full min-w-0">
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
              <Label className="shrink-0">Sub Collection</Label>
              <Select
                value={selectedSubCollectionId}
                onValueChange={setSelectedSubCollectionId}
                disabled={!selectedCollectionId}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SUB_COLLECTION_ALL}>All</SelectItem>
                  {subCollections.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-sm">
              {cards.length === 0
                ? "No cards in this collection. Add some on the Create Cards page."
                : "No cards in this sub collection."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionCards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Study</CardTitle>
            <CardDescription>
              Review your notecards. Flip to reveal answers and track what you know.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
              <Label className="shrink-0">Collection</Label>
              <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                <SelectTrigger className="w-full min-w-0">
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
              <Label className="shrink-0">Sub Collection</Label>
              <Select
                value={selectedSubCollectionId}
                onValueChange={setSelectedSubCollectionId}
                disabled={!selectedCollectionId}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SUB_COLLECTION_ALL}>All</SelectItem>
                  {subCollections.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-sm">
              You&apos;ve skipped all cards in this collection. Clear skips on the Edit Cards page to continue studying.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Study</CardTitle>
          <CardDescription>
            Review your notecards. Flip to reveal answers and track what you know.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
            <Label className="shrink-0">Collection</Label>
            <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
              <SelectTrigger className="w-full min-w-0">
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
            <Label className="shrink-0">Sub Collection</Label>
            <Select
              value={selectedSubCollectionId}
              onValueChange={setSelectedSubCollectionId}
              disabled={!selectedCollectionId}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUB_COLLECTION_ALL}>All</SelectItem>
                {subCollections.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-muted-foreground text-sm">
            Card {currentIndex + 1} of {sessionCards.length}
            {sessionCards.length < filteredCards.length ? (
              <span className="ml-1">({filteredCards.length - sessionCards.length} skipped)</span>
            ) : null}
          </p>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="relative h-[220px] w-full cursor-pointer [perspective:1000px]"
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
                {currentCard.hint ? (
                  <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                    {currentCard.hint}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3 size-8 shrink-0"
                  aria-label="Edit card"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(currentCard);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                  {currentCard.question}
                </p>
              </div>
              <div
                className="absolute inset-0 flex flex-col rounded-xl border bg-muted p-4 shadow-md [backface-visibility:hidden]"
                style={{ transform: "rotateY(180deg)" }}
              >
                {currentCard.hint ? (
                  <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                    {currentCard.hint}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3 size-8 shrink-0"
                  aria-label="Edit card"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(currentCard);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                  {currentCard.answer}
                </p>
              </div>
            </div>
          </button>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipChecked}
              onChange={() => setSkipChecked((s) => !s)}
              className="h-4 w-4 rounded border-input"
            />
            <span>Skip this card (I know this)</span>
          </label>

          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRestart}>
                Restart
              </Button>
              <Button variant="outline" onClick={handleShuffle}>
                Shuffle
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrevious}>
                Previous
              </Button>
              <Button onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingCard} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div
              className="flex h-8 rounded-md border bg-muted/30 p-0.5"
              role="group"
              aria-label="Save as overwrite existing or make new card"
            >
              <button
                type="button"
                onClick={() => setEditSaveAction("overwrite")}
                className={cn(
                  "flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
                  editSaveAction === "overwrite"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Overwrite Existing
              </button>
              <button
                type="button"
                onClick={() => setEditSaveAction("copy")}
                className={cn(
                  "flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
                  editSaveAction === "copy"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Make New Card
              </button>
            </div>
            <div className="grid gap-2">
              <Label>Sub Collection</Label>
              <Select
                value={editSubCollectionId}
                onValueChange={setEditSubCollectionId}
                disabled={!selectedCollectionId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SUB_COLLECTION_NONE}>None</SelectItem>
                  {subCollections
                    .filter((s) => s.name !== "- None -")
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="study-edit-hint">Hint (optional)</Label>
              <Input
                id="study-edit-hint"
                placeholder="e.g. A short hint"
                value={editHint}
                onChange={(e) => setEditHint(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="study-edit-question">Question</Label>
              <Textarea
                id="study-edit-question"
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="study-edit-answer">Answer</Label>
              <Textarea
                id="study-edit-answer"
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                rows={3}
                className="min-h-[4.5rem] resize-y"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setEditQuestion(editAnswer);
                setEditAnswer(editQuestion);
              }}
            >
              Flip Q and A
            </Button>
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
              disabled={!editQuestion.trim() || !editAnswer.trim() || saving}
              onClick={handleSaveEdit}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
