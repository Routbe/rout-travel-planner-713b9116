import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Loader2, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCardBatchFn, exportCardBatchFn, importCardManifestFn, listCardBatchesFn } from "@/lib/wallet/card-admin.functions";
import { parseCardManifest } from "@/lib/wallet/card-manifest";

export const Route = createFileRoute("/_authenticated/admin/cards")({
  head: () => ({
    meta: [
      { title: "ROUT Card-batches | ROUT" },
      { name: "description", content: "Productieruns van ROUT Cards: batch aanmaken, stationconfiguratie exporteren en manifest importeren." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "ROUT Card-batches | ROUT" },
      { property: "og:description", content: "Productieruns van ROUT Cards beheren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCards,
});

function AdminCards() {
  const qc = useQueryClient();
  const list = useServerFn(listCardBatchesFn);
  const create = useServerFn(createCardBatchFn);
  const exportCfg = useServerFn(exportCardBatchFn);
  const importManifest = useServerFn(importCardManifestFn);
  const batches = useQuery({ queryKey: ["admin", "card-batches"], queryFn: () => list() });
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manifestFor, setManifestFor] = useState<string | null>(null);
  const [manifest, setManifest] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "card-batches"] });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy("create");
    setMessage(null);
    try {
      await create({ data: { label: label.trim() } });
      setLabel("");
      setMessage("Batch aangemaakt.");
      await refresh();
    } catch {
      setMessage("Batch aanmaken mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onExport(batchId: string) {
    setBusy(`export:${batchId}`);
    setMessage(null);
    try {
      const cfg = await exportCfg({ data: { batchId } });
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-card-station-${batchId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await refresh();
    } catch {
      setMessage("Export mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function onImport(batchId: string) {
    const cards = parseCardManifest(manifest);
    if (!cards.ok) {
      setMessage(cards.error);
      return;
    }
    setBusy(`import:${batchId}`);
    setMessage(null);
    try {
      const r = await importManifest({ data: { batchId, cards: cards.cards } });
      setMessage(r.ok ? `${r.imported} kaarten geïmporteerd (bekende kaarten overgeslagen).` : "Import geweigerd.");
      if (r.ok) {
        setManifest("");
        setManifestFor(null);
      }
      await refresh();
    } catch {
      setMessage("Import mislukt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">ROUT Card-batches</h1>
        <p className="text-sm text-muted-foreground">
          Maak een productierun, exporteer de instellingen voor het schrijfstation en importeer daarna de lijst met geschreven chips. Sleutels verlaten de server nooit.
        </p>
      </header>

      <form onSubmit={onCreate} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-muted-foreground">Naam van de batch</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Batch 2026-A" />
        </label>
        <Button type="submit" disabled={busy !== null || !label.trim()}>
          {busy === "create" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Batch aanmaken
        </Button>
      </form>

      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}

      <section className="space-y-3">
        {batches.isPending ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Laden" />
        ) : batches.isError ? (
          <p className="text-sm text-destructive">Batches konden niet geladen worden. Je hebt de adminrol en tweestapsverificatie nodig.</p>
        ) : batches.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen batches.</p>
        ) : (
          batches.data.map((b) => (
            <article key={b.batchId} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{b.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {b.cards} kaarten · {b.activeCards} actief · aangemaakt {b.createdAt.slice(0, 10)}
                    {b.exportedAt ? ` · geëxporteerd ${b.exportedAt.slice(0, 10)}` : ""}
                    {b.retiredAt ? " · buiten gebruik" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={busy !== null || !!b.retiredAt} onClick={() => onExport(b.batchId)}>
                    <Download className="size-4" aria-hidden /> Stationconfiguratie
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null || !!b.retiredAt} onClick={() => setManifestFor(manifestFor === b.batchId ? null : b.batchId)} aria-expanded={manifestFor === b.batchId}>
                    <Upload className="size-4" aria-hidden /> Manifest
                  </Button>
                </div>
              </div>
              {manifestFor === b.batchId && (
                <div className="space-y-2">
                  <Textarea
                    value={manifest}
                    onChange={(e) => setManifest(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    className="font-mono text-xs"
                    placeholder={"Eén chip per regel: UID (14 hex), optioneel gevolgd door een komma en de activatiecode\n04A1B2C3D4E5F6,ABCD-1234"}
                  />
                  <Button size="sm" disabled={busy !== null || !manifest.trim()} onClick={() => onImport(b.batchId)}>
                    {busy === `import:${b.batchId}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Importeren
                  </Button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
