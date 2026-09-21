"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

/**
 * Sem tabela de notificação: a lista vem de `getNotificationItems()`
 * (calculada ao vivo a partir de reuniões/trabalhos/financeiro reais,
 * resolvida uma vez no layout — ver app/(app)/layout.tsx), a MESMA fonte
 * usada pelo "Precisa da sua atenção" do Dashboard. "Marcar como lida"
 * não existe mais — não há estado de leitura sem tabela própria; a
 * contagem é sempre "quantos itens urgentes existem agora".
 */
export function NotificationsBell() {
  const { notifications } = useAuthProfile();
  const router = useRouter();

  const urgentCount = notifications.filter((n) => n.urgent).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4.5 w-4.5" />
          {urgentCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {urgentCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Notificações</p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="Nenhuma notificação" description="Você está em dia." className="border-0 py-8" />
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => router.push(n.href)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 transition-colors hover:bg-secondary/50",
                  n.urgent && "bg-destructive/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {n.urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
