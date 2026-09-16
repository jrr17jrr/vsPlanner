"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Settings, Sparkles, UserCog } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavContent } from "@/components/layout/nav-content";
import { SpaceSwitcher } from "@/components/shared/space-switcher";
import { GlobalSearch } from "@/components/shared/global-search";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import { useAuth } from "@/hooks/use-auth";
import { initials } from "@/lib/format";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur sm:px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <SheetHeader className="border-b border-sidebar-border px-4 py-4">
            <SheetTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              VSLead
            </SheetTitle>
          </SheetHeader>
          <div className="px-3 pt-3">
            <SpaceSwitcher />
          </div>
          <NavContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <GlobalSearch />
      <NotificationsBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-secondary">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/15 text-primary">
                {profile ? initials(profile.name) : "??"}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{profile?.name}</p>
            <p className="text-xs font-normal text-muted-foreground">{profile?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/configuracoes")}>
            <Settings className="h-4 w-4" /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <UserCog className="h-4 w-4" /> Trocar de conta
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
