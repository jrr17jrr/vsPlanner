"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Briefcase, ListChecks, Layers, Globe } from "lucide-react";
import { useDbStore } from "@/store/db-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Result {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  icon: typeof Search;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const clients = useDbStore((s) => s.clients);
  const workItems = useDbStore((s) => s.workItems);
  const tasks = useDbStore((s) => s.tasks);
  const services = useDbStore((s) => s.services);
  const clientSites = useDbStore((s) => s.clientSites);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];

    clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q))
      .forEach((c) =>
        out.push({ id: c.id, label: c.name, sub: c.company, href: `/visionario/clientes/${c.id}`, group: "Clientes", icon: Users })
      );

    workItems
      .filter((w) => w.title.toLowerCase().includes(q))
      .forEach((w) =>
        out.push({ id: w.id, label: w.title, sub: "Trabalho", href: "/visionario/trabalhos", group: "Trabalhos", icon: Briefcase })
      );

    tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .forEach((t) =>
        out.push({ id: t.id, label: t.title, sub: "Tarefa", href: "/tarefas", group: "Tarefas", icon: ListChecks })
      );

    services
      .filter((s) => s.name.toLowerCase().includes(q))
      .forEach((s) =>
        out.push({ id: s.id, label: s.name, sub: "Serviço", href: "/visionario/servicos", group: "Serviços", icon: Layers })
      );

    clientSites
      .filter((cs) => cs.siteName?.toLowerCase().includes(q) || cs.domain?.toLowerCase().includes(q))
      .forEach((cs) =>
        out.push({
          id: cs.id,
          label: cs.siteName ?? cs.domain ?? "Site",
          sub: cs.domain,
          href: `/visionario/clientes/${cs.clientId}`,
          group: "Sites",
          icon: Globe,
        })
      );

    return out.slice(0, 20);
  }, [query, clients, workItems, tasks, services, clientSites]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden text-muted-foreground sm:flex sm:w-56 sm:justify-start sm:gap-2"
      >
        <Search className="h-3.5 w-3.5" />
        Buscar…
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="sm:hidden">
        <Search className="h-4.5 w-4.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 translate-y-0 gap-3 sm:max-w-md" showClose={false}>
          <DialogHeader>
            <DialogTitle className="sr-only">Busca global</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar clientes, trabalhos, tarefas, serviços, sites…"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {query && results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum resultado para &quot;{query}&quot;.
              </p>
            )}
            {results.map((r) => (
              <button
                key={`${r.group}-${r.id}`}
                onClick={() => {
                  router.push(r.href);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary/60"
              >
                <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.group}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
