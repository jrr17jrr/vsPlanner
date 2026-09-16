"use client";

import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Rocket, User, Video, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { User, Rocket, Video };

const DESTINATION: Record<string, string> = {
  "pessoal-ricardo": "/hoje",
  "pessoal-teste": "/hoje",
  "visionario-dev": "/visionario",
  tiktok: "/tiktok",
};

export function SpaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { mySpaces } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const active =
    mySpaces.find((s) => {
      const dest = DESTINATION[s.slug];
      return dest && dest !== "/hoje" && pathname.startsWith(dest);
    }) ?? mySpaces.find((s) => s.type === "personal");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-2"
          )}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${active?.color ?? "#00E1FF"}22` }}
          >
            {(() => {
              const Icon = ICONS[active?.icon ?? "User"] ?? User;
              return <Icon className="h-3.5 w-3.5" style={{ color: active?.color }} />;
            })()}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate font-medium">
                {active?.name ?? "Espaço"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Meus espaços</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mySpaces.map((space) => {
          const Icon = ICONS[space.icon] ?? User;
          return (
            <DropdownMenuItem
              key={space.id}
              onClick={() => router.push(DESTINATION[space.slug] ?? "/")}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded"
                style={{ backgroundColor: `${space.color}22` }}
              >
                <Icon className="h-3 w-3" style={{ color: space.color }} />
              </span>
              <span className="flex-1">{space.name}</span>
              {active?.id === space.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
