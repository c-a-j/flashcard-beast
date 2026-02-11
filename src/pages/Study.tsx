import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

type StoredCard = { id: number; question: string; answer: string; title: string; skipped: boolean };
type StoredCollection = { id: number; name: string };

export function Study() {
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [skipChecked, setSkipChecked] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const sessionCards = useMemo(
    () => cards.filter((c) => !c.skipped),
    [cards]
  );
  const currentCard = sessionCards[Math.min(currentIndex, sessionCards.length - 1)];

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

  function handleRestart() {
    setFlipped(false);
    setCurrentIndex(0);
    setSkipChecked(false);
  }

  if (loadingCollections) {
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

  if (error) {
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
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading cards…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Study</CardTitle>
            <CardDescription>
              Review your notecards. Flip to reveal answers and track what you know.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
            <p className="text-muted-foreground text-sm">
              No cards in this collection. Add some on the Create Cards page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sessionCards.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Study</CardTitle>
            <CardDescription>
              Review your notecards. Flip to reveal answers and track what you know.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
            <p className="text-muted-foreground text-sm">
              You&apos;ve skipped all cards in this collection. Clear skips on the Edit Cards page to continue studying.
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
          <CardTitle>Study</CardTitle>
          <CardDescription>
            Review your notecards. Flip to reveal answers and track what you know.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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

          <p className="text-muted-foreground text-sm">
            Card {currentIndex + 1} of {sessionCards.length}
            {sessionCards.length < cards.length ? (
              <span className="ml-1">({cards.length - sessionCards.length} skipped)</span>
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
                {currentCard.title ? (
                  <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                    {currentCard.title}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap break-words text-center text-sm flex-1 flex items-center justify-center">
                  {currentCard.question}
                </p>
              </div>
              <div
                className="absolute inset-0 flex flex-col rounded-xl border bg-muted p-4 shadow-md [backface-visibility:hidden]"
                style={{ transform: "rotateY(180deg)" }}
              >
                {currentCard.title ? (
                  <p className="text-muted-foreground absolute left-3 top-3 text-xs font-medium">
                    {currentCard.title}
                  </p>
                ) : null}
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
            <Button variant="outline" onClick={handleRestart}>
              Restart
            </Button>
            <Button onClick={handleNext}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
