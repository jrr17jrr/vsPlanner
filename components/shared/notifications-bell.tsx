"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const { profile } = useAuth();
  const notifications = useDbStore((s) => s.notifications);
  const update = useDbStore((s) => s.update);
  const router = useRouter();

  const mine = profile
    ? notifications
        .filter((n) => n.userId === profile.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];
  const unread = mine.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Notificações</p>
          {unread > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() => mine.forEach((n) => update("notifications", n.id, { read: true }))}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {mine.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nenhuma notificação"
              description="Você está em dia."
              className="border-0 py-8"
            />
          ) : (
            mine.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  update("notifications", n.id, { read: true });
                  if (n.href) router.push(n.href);
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 transition-colors hover:bg-secondary/50",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <p className="text-[11px] text-muted-foreground/70">
                  {formatDate(n.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
