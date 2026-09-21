"use client";

import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Rocket, User, Video } from "lucide-react";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG } from "@/lib/space-slugs";
import { cn } from "@/lib/utils";
import type { Space } from "@/types/database.types";

/**
 * `spaces.type`/`slug` decidem ícone, cor e destino — nunca campos mock
 * (`color`/`icon`/`DESTINATION` fixo por slug de seed) que não existem no
 * Supabase real.
 */
function spaceColor(space: Space | undefined): string {
  if (space?.slug === VISIONARIO_DEV_SLUG) return "#00E1FF";
  if (space?.slug === TIKTOK_SLUG) return "#FF2D78";
  return "#8B5CF6";
}

function spaceDestination(space: Space): string {
  if (space.slug === VISIONARIO_DEV_SLUG) return "/visionario";
  if (space.slug === TIKTOK_SLUG) return "/tiktok";
  return "/hoje";
}

/** Ícones fixos por ramo (nunca um componente escolhido dinamicamente e guardado numa variável). */
function SpaceIcon({ space, className }: { space: Space | undefined; className?: string }) {
  const color = spaceColor(space);
  if (space?.slug === VISIONARIO_DEV_SLUG) return <Rocket className={className} style={{ color }} />;
  if (space?.slug === TIKTOK_SLUG) return <Video className={className} style={{ color }} />;
  return <User className={className} style={{ color }} />;
}

export function SpaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { mySpaces } = useAuthProfile();
  const router = useRouter();
  const pathname = usePathname();

  const active =
    mySpaces.find((s) => {
      const dest = spaceDestination(s);
      return dest !== "/hoje" && pathname.startsWith(dest);
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
            style={{ backgroundColor: `${spaceColor(active)}22` }}
          >
            <SpaceIcon space={active} className="h-3.5 w-3.5" />
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate font-medium">{active?.name ?? "Espaço"}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Meus espaços</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mySpaces.map((space) => (
          <DropdownMenuItem key={space.id} onClick={() => router.push(spaceDestination(space))}>
            <span className="flex h-5 w-5 items-center justify-center rounded" style={{ backgroundColor: `${spaceColor(space)}22` }}>
              <SpaceIcon space={space} className="h-3 w-3" />
            </span>
            <span className="flex-1">{space.name}</span>
            {active?.id === space.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
