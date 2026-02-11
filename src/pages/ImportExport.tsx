import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const APP_NAME = "notecard-beast";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "collection";
}

type StoredCollection = { id: number; name: string };

type FileCollectionSummary = { name: string; card_count: number; sub_collection_count: number };

type ImportRowState = {
  selected: boolean;
  destinationMode: "existing" | "new";
  destinationId: string;
  newName: string;
};

export function ImportExport() {
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [fileCollections, setFileCollections] = useState<FileCollectionSummary[]>([]);
  const [importRows, setImportRows] = useState<ImportRowState[]>([]);
  const [importModalError, setImportModalError] = useState<string | null>(null);

  const isExportAll = selectedCollectionId === "all";
  const selectedCollection = collections.find((c) => String(c.id) === selectedCollectionId);
  const defaultExportFilename = isExportAll
    ? `${APP_NAME}-export.json`
    : `${APP_NAME}-${sanitizeFilename(selectedCollection?.name ?? "collection").toLowerCase()}-export.json`;

  useEffect(() => {
    let cancelled = false;
    invoke<StoredCollection[]>("get_collections")
      .then((data) => {
        if (!cancelled) {
          setCollections(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport() {
    setExportError(null);
    setExportSuccess(false);
    let filePath: string | null = null;
    try {
      filePath = await save({
        defaultPath: defaultExportFilename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (filePath == null) return;
    setExporting(true);
    try {
      if (isExportAll) {
        await invoke("export_collections_to_path", { path: filePath });
      } else {
        const collectionId = Number(selectedCollectionId);
        await invoke("export_collection_to_path", { collectionId, path: filePath });
      }
      setExportSuccess(true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportClick() {
    setImportError(null);
    setImportSuccess(null);
    setImportModalError(null);
    let filePath: string | string[] | null = null;
    try {
      filePath = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (filePath == null || Array.isArray(filePath)) return;
    setImporting(true);
    try {
      const list = await invoke<FileCollectionSummary[]>("read_export_file", { path: filePath });
      if (list.length === 0) {
        setImportError("No collections found in file.");
        return;
      }
      setImportFilePath(filePath);
      setFileCollections(list);
      setImportRows(
        list.map((fc) => {
          const matching = collections.find(
            (c) => c.name.trim().toLowerCase() === fc.name.trim().toLowerCase()
          );
          if (matching) {
            return {
              selected: true,
              destinationMode: "existing" as const,
              destinationId: String(matching.id),
              newName: "",
            };
          }
          return {
            selected: true,
            destinationMode: "new" as const,
            destinationId: "",
            newName: fc.name.trim(),
          };
        })
      );
      setImportModalOpen(true);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  function updateImportRow(index: number, updates: Partial<ImportRowState>) {
    setImportRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  async function handleImportConfirm() {
    if (importFilePath == null) return;
    const selectedIndices = importRows
      .map((row, i) => (row.selected ? i : -1))
      .filter((i) => i >= 0);
    if (selectedIndices.length === 0) {
      setImportModalError("Select at least one collection to import.");
      return;
    }
    for (const i of selectedIndices) {
      const row = importRows[i];
      const fcName = fileCollections[i]?.name ?? "Collection";
      if (row.destinationMode === "existing" && !row.destinationId) {
        setImportModalError(`"${fcName}": select a collection to import into.`);
        return;
      }
      if (row.destinationMode === "new" && !row.newName.trim()) {
        setImportModalError(`"${fcName}": enter a name for the new collection.`);
        return;
      }
    }
    setImportModalError(null);
    setImporting(true);
    try {
      let totalCards = 0;
      let totalCollections = 0;
      for (const i of selectedIndices) {
        const row = importRows[i];
        const destinationId =
          row.destinationMode === "existing" && row.destinationId
            ? Number(row.destinationId)
            : null;
        const newName = row.destinationMode === "new" ? row.newName.trim() : null;
        const result = await invoke<{ collections: number; cards_added: number }>(
          "import_collection_from_file",
          {
            path: importFilePath,
            fileCollectionIndex: i,
            destinationCollectionId: destinationId ?? undefined,
            destinationNewName: newName ?? undefined,
          }
        );
        totalCards += result.cards_added;
        totalCollections += result.collections;
      }
      setImportModalOpen(false);
      setImportSuccess(
        `Imported ${totalCards} card(s) into ${totalCollections} collection(s).`
      );
      invoke<StoredCollection[]>("get_collections").then(setCollections);
    } catch (e) {
      setImportModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="container max-w-2xl py-6">
      <Card>
        <CardHeader>
          <CardTitle>Import / Export</CardTitle>
          <CardDescription>
            Import collections from a file or export your collections to backup or share.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h3 className="font-medium">Export</h3>
            <p className="text-sm text-muted-foreground">
              Export your collections to a JSON file for backup or use in another device.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={selectedCollectionId}
                onValueChange={setSelectedCollectionId}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "Exporting…" : "Export collection(s)"}
              </Button>
            </div>
            {exportError != null && (
              <p className="text-sm text-destructive">{exportError}</p>
            )}
            {exportSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">Export saved successfully.</p>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Import</h3>
            <p className="text-sm text-muted-foreground">
              Import collections from a previously exported JSON file.
            </p>
            <Button
              variant="outline"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? "Importing…" : "Import from file"}
            </Button>
            {importError != null && (
              <p className="text-sm text-destructive">{importError}</p>
            )}
            {importSuccess != null && (
              <p className="text-sm text-green-600 dark:text-green-400">{importSuccess}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import collections</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Select which collections to import and choose a destination for each.
            </p>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 w-10">Import</th>
                    <th className="text-left p-2">Collection in file</th>
                    <th className="text-left p-2">Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {fileCollections.map((fc, i) => {
                    const row = importRows[i];
                    if (!row) return null;
                    return (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => updateImportRow(i, { selected: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                        </td>
                        <td className="p-2 align-top">
                          {fc.name} ({fc.card_count} card{fc.card_count !== 1 ? "s" : ""}
                          {fc.sub_collection_count > 0 &&
                            `, ${fc.sub_collection_count} sub collection${fc.sub_collection_count !== 1 ? "s" : ""}`})
                        </td>
                        <td className="p-2 align-top space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              id={`dest-existing-${i}`}
                              name={`destination-${i}`}
                              checked={row.destinationMode === "existing"}
                              onChange={() =>
                                updateImportRow(i, {
                                  destinationMode: "existing",
                                  destinationId: collections[0] ? String(collections[0].id) : "",
                                })
                              }
                              className="h-3 w-3 shrink-0"
                            />
                            <label
                              htmlFor={`dest-existing-${i}`}
                              className="text-xs cursor-pointer w-28 shrink-0"
                            >
                              Existing
                            </label>
                            <Select
                              value={row.destinationId}
                              onValueChange={(v) => updateImportRow(i, { destinationId: v })}
                              disabled={
                                row.destinationMode !== "existing" || collections.length === 0
                              }
                            >
                              <SelectTrigger
                                className={`h-8 text-xs w-44 shrink-0 ${row.destinationMode !== "existing" ? "opacity-50 pointer-events-none" : ""}`}
                              >
                                <SelectValue placeholder="Select collection" />
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
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              id={`dest-new-${i}`}
                              name={`destination-${i}`}
                              checked={row.destinationMode === "new"}
                              onChange={() =>
                                updateImportRow(i, { destinationMode: "new", destinationId: "" })
                              }
                              className="h-3 w-3 shrink-0"
                            />
                            <label
                              htmlFor={`dest-new-${i}`}
                              className="text-xs cursor-pointer w-28 shrink-0"
                            >
                              New collection
                            </label>
                            <Input
                              className={`h-8 text-xs w-44 shrink-0 ${row.destinationMode !== "new" ? "opacity-50 pointer-events-none" : ""}`}
                              placeholder="Collection name"
                              value={row.newName}
                              onChange={(e) => updateImportRow(i, { newName: e.target.value })}
                              disabled={row.destinationMode !== "new"}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {importModalError != null && (
              <p className="text-sm text-destructive">{importModalError}</p>
            )}
          </div>
          <DialogFooter showCloseButton={false}>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportConfirm} disabled={importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
