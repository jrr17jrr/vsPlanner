"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ShieldCheck, User2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format";
import { toast } from "sonner";

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const profiles = useDbStore((s) => s.profiles);
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  function handleLogin(userId: string, name: string, status: string) {
    if (status === "bloqueado") {
      toast.error("Esta conta está bloqueada. Fale com um administrador.");
      return;
    }
    login(userId);
    toast.success(`Bem-vindo, ${name.split(" ")[0]}!`);
    router.push("/");
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">VSLead</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Central para organizar sua vida pessoal e seus negócios.
          </p>
        </div>

        <Card className="p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Escolha uma conta de teste
          </p>
          <div className="flex flex-col gap-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleLogin(profile.id, profile.name, profile.status)}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary/60"
              >
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {initials(profile.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{profile.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
                </div>
                <Badge variant={profile.role === "super_admin" ? "default" : "secondary"}>
                  {profile.role === "super_admin" ? (
                    <>
                      <ShieldCheck className="h-3 w-3" /> Super admin
                    </>
                  ) : (
                    <>
                      <User2 className="h-3 w-3" /> Usuário
                    </>
                  )}
                </Badge>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Login simulado — a autenticação real via Supabase Auth será conectada futuramente.
          </p>
        </Card>
      </div>
    </div>
  );
}
