"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, Sparkles, UserCog } from "lucide-react";
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
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import { logoutAction } from "@/lib/supabase/actions";
import { removeDeviceSubscription } from "@/lib/push/client";
import { initials } from "@/lib/format";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Identidade REAL (Supabase `profiles`) — menu usa o usuário real.
  const { profile, email } = useAuthProfile();
  const router = useRouter();

  async function handleLogout() {
    // Para de enviar lembretes desta conta a este aparelho antes de sair.
    await removeDeviceSubscription();
    await logoutAction();
  }

  return (
    // PWA no iPhone (status bar translúcida + viewport-fit=cover): o header
    // reserva a área do relógio/notch via safe-area; no navegador o inset é 0.
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] w-full min-w-0 shrink-0 items-center gap-1.5 overflow-visible border-b border-border bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:h-[calc(3.5rem+env(safe-area-inset-top))] sm:gap-2 sm:px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(88vw,340px)] max-w-full overflow-hidden p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:hidden">
          <SheetHeader className="border-b border-sidebar-border px-4 py-4">
            <SheetTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              VSPlanner
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
        className="h-12 w-12 shrink-0 rounded-xl border border-border/70 bg-secondary/40 text-foreground active:bg-secondary lg:hidden"
        aria-label="Abrir menu de navegação"
        onClick={() => setMobileOpen(true)}
      >
        <span aria-hidden="true" className="flex h-7 w-7 flex-col justify-center gap-[5px]"><span className="block h-[3px] w-7 rounded-full bg-current" /><span className="block h-[3px] w-7 rounded-full bg-current" /><span className="block h-[3px] w-7 rounded-full bg-current" /></span>
      </Button>

      <div className="min-w-0 flex-1" />

      <GlobalSearch />
      <NotificationsBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-secondary sm:h-9 sm:w-9 sm:rounded-full" aria-label="Abrir perfil">
            <Avatar className="h-10 w-10 sm:h-8 sm:w-8">
              <AvatarFallback className="bg-primary/15 text-primary">
                {initials(profile.name)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{profile.name}</p>
            {email && <p className="text-xs font-normal text-muted-foreground">{email}</p>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/configuracoes")}>
            <Settings className="h-4 w-4" /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout}>
            <UserCog className="h-4 w-4" /> Trocar de conta
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
