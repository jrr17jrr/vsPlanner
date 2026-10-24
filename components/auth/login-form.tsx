"use client";

import { useActionState, useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginActionState } from "@/lib/supabase/actions";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">VSPlanner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Central para organizar sua vida pessoal e seus negócios.
          </p>
        </div>

        <Card className="p-5">
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                required
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Senha</Label>
              <div className="relative">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                disabled={pending}
                className="pr-11"
              />
              <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md" disabled={pending}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              </div>
            </div>

            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            <Button type="submit" className="mt-1" disabled={pending}>
              {pending ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acesso restrito. Fale com um administrador se precisar de uma conta.
          </p>
        </Card>
      </div>
    </div>
  );
}
