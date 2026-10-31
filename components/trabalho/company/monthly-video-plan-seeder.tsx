"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMonthlyVideoPlans } from "@/lib/supabase/video-actions";
import type { CltModule } from "@/lib/clt/module";

/**
 * Garante as tarefas de Produção de Vídeos do mês ao abrir a empresa
 * (antes ficava dentro da lista de tarefas; agora ela está numa aba que nem
 * sempre está montada).
 */
export function MonthlyVideoPlanSeeder({ module = "clt" }: { module?: CltModule }) {
  const router = useRouter();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    void createMonthlyVideoPlans(month, module).then(r => { if (r.error) toast.error("Vídeos: " + r.error); else if (r.created) router.refresh(); }).catch(e => toast.error("Vídeos: " + String(e)));
  }, [router, module]);
  return null;
}
