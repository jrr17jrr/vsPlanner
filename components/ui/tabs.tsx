"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-9 items-center justify-start gap-1 rounded-lg bg-secondary/50 p-1 text-muted-foreground overflow-x-auto no-scrollbar max-w-full",
        className
      )}
      {...props}
    />
  );
}

/**
 * Lista de abas com rolagem horizontal (celular): nunca quebra linha nem
 * corta abas. Mostra um degradê com seta na borda enquanto houver abas
 * escondidas e mantém a aba ativa visível (ex.: `?aba=a_pagar`). No
 * computador, sem overflow, fica igual ao TabsList comum.
 */
function ScrollableTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const revealActive = () => {
      const active = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) return;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 24;
      else if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 24);
      update();
    };
    revealActive();
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutations = new MutationObserver(revealActive);
    mutations.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"], childList: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };

  return (
    <div className="relative min-w-0 max-w-full">
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          "relative flex h-9 w-fit max-w-full items-center justify-start gap-1 rounded-lg bg-secondary/50 p-1 text-muted-foreground",
          "overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar [-webkit-overflow-scrolling:touch]",
          className
        )}
        {...props}
      />
      {edges.start && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Ver abas anteriores"
          onClick={() => scrollBy(-1)}
          className="absolute inset-y-0 left-0 flex w-9 items-center justify-start rounded-l-lg bg-gradient-to-r from-background via-background/80 to-transparent pl-1 text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Ver mais abas"
          onClick={() => scrollBy(1)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-end rounded-r-lg bg-gradient-to-l from-background via-background/80 to-transparent pr-1 text-primary"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-3 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, ScrollableTabsList, TabsTrigger, TabsContent };
