import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { verifyCardTapFn, type CardTapResult } from "@/lib/wallet/card-tap.functions";
import { activateCardFn, type CardActivationResult } from "@/lib/wallet/card-admin.functions";
import { takeActivationIntent } from "@/lib/wallet/card-activation-intent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * ROUT Card tap: the chip opens /t?p=<PICCData>&m=<CMAC>. The parameters are
 * read once on the client and removed from the address bar before anything
 * else happens; the server checks the AES-CMAC and the counter. No card id and
 * no personal data are ever shown.
 */
export const Route = createFileRoute("/t")({
  head: () => ({
    meta: [
      { title: "ROUT Card · echtheidscontrole" },
      { name: "description", content: "Controleer cryptografisch of een ROUT Card echt is, met één tik. Geen persoonsgegevens." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { property: "og:title", content: "ROUT Card · echtheidscontrole" },
      { property: "og:description", content: "Eén tik bewijst dat een ROUT Card echt is, zonder persoonsgegevens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardTap,
});

type View =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "activate" | "activating"; p: string; m: string }
  | { activation: CardActivationResult["status"] }
  | CardTapResult;

function CardTap() {
  const verify = useServerFn(verifyCardTapFn);
  const activate = useServerFn(activateCardFn);
  const [code, setCode] = useState("");
  const [view, setView] = useState<View>({ kind: "checking" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p") ?? "";
    const m = params.get("m") ?? "";
    // The tap bytes never stay in the address bar, history or a shared link.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!/^[0-9A-Fa-f]{32}$/.test(p) || !/^[0-9A-Fa-f]{16}$/.test(m)) {
      setView({ kind: "missing" });
      return;
    }
    // Started from "Activeer je ROUT Card": this tap links the card instead.
    // The single-use tap bytes stay in memory only until the member confirms.
    if (takeActivationIntent()) {
      setView({ kind: "activate", p, m });
      return;
    }
    verify({ data: { p, m } })
      .then((r) => setView(r))
      .catch(() => setView({ status: "denied" }));
  }, [verify]);

  if ("kind" in view && (view.kind === "activate" || view.kind === "activating")) {
    const busy = view.kind === "activating";
    const tapBytes = { p: view.p, m: view.m };
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <form
          className="flex w-full flex-col items-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setView({ kind: "activating", ...tapBytes });
            activate({ data: { ...tapBytes, code: code.trim() || null } })
              .then((r: CardActivationResult) => setView({ activation: r.status }))
              .catch(() => setView({ activation: "denied" }));
          }}
        >
          <ShieldCheck className="h-14 w-14 text-primary" strokeWidth={1.5} aria-hidden />
          <h1 className="text-2xl font-semibold">Activeer je ROUT Card</h1>
          <p className="text-sm text-muted-foreground">Deze kaart wordt aan je ingelogde account gekoppeld. Staat er een activatiecode bij je kaart, vul ze dan in.</p>
          <label className="w-full text-left text-sm">
            <span className="mb-1 block text-muted-foreground">Activatiecode (optioneel)</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Kaart koppelen"}
          </Button>
        </form>
      </main>
    );
  }
  if ("activation" in view) {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        {view.activation === "activated" ? (
          <>
            <ShieldCheck className="h-14 w-14 text-primary" strokeWidth={1.5} aria-hidden />
            <h1 className="text-2xl font-semibold">Je ROUT Card is actief</h1>
            <p className="text-sm text-muted-foreground">De kaart is nu aan je account gekoppeld.</p>
          </>
        ) : (
          <>
            <ShieldX className="h-14 w-14 text-destructive" strokeWidth={1.5} aria-hidden />
            <h1 className="text-2xl font-semibold">{view.activation === "limited" ? "Even wachten" : "Niet gekoppeld"}</h1>
            <p className="text-sm text-muted-foreground">
              {view.activation === "limited"
                ? "Te veel pogingen kort na elkaar. Probeer het later opnieuw."
                : "Deze kaart kon niet gekoppeld worden. Ben je ingelogd, is de kaart nog niet gekoppeld en klopt de code? Start opnieuw via je account en tik de kaart opnieuw."}
            </p>
          </>
        )}
        <Link to="/studio/account" className="text-xs text-muted-foreground hover:text-foreground">Naar je account</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      {"kind" in view && view.kind === "checking" ? (
        <div role="status" className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Kaart wordt gecontroleerd…</p>
        </div>
      ) : "status" in view && view.status === "verified" ? (
        <section aria-labelledby="tap-verified" className="flex w-full flex-col items-center gap-5">
          <div className="relative flex h-32 w-32 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping [animation-iteration-count:1]" aria-hidden />
            <span className="absolute inset-2 rounded-full border border-primary/30 bg-primary/5" aria-hidden />
            <ShieldCheck className="relative h-16 w-16 text-primary" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 id="tap-verified" className="text-2xl font-semibold tracking-tight">Authentic ROUT Card</h1>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Cryptographically Verified</p>
          </div>
          <div className="w-full rounded-2xl border border-border bg-card p-4 text-left text-sm text-muted-foreground">
            <p>De chip bewees net met zijn eigen geheime sleutel dat hij echt is. Deze tik is eenmalig: een gekopieerde link werkt niet opnieuw.</p>
            {!view.activated && <p className="mt-2">Deze kaart is nog niet aan een lid gekoppeld.</p>}
          </div>
        </section>
      ) : "status" in view && view.status === "limited" ? (
        <section className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-semibold">Even wachten</h1>
          <p className="text-sm text-muted-foreground">Te veel controles kort na elkaar. Probeer het zo opnieuw.</p>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-4">
          <ShieldX className="h-14 w-14 text-destructive" strokeWidth={1.5} aria-hidden />
          <h1 className="text-2xl font-semibold">Niet bevestigd</h1>
          <p className="text-sm text-muted-foreground">
            {"kind" in view && view.kind === "missing"
              ? "Open deze pagina door je ROUT Card tegen je telefoon te houden."
              : "Deze tik kon niet bevestigd worden. Houd de kaart opnieuw tegen je telefoon; een gekopieerde of oude link werkt nooit."}
          </p>
        </section>
      )}
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">ROUT</Link>
    </main>
  );
}
