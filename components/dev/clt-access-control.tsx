"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserCltAccessAction } from "@/lib/supabase/admin-clt-access-actions";

export function CltAccessControl({ userId, enabled, isSelf }: { userId:string; enabled:boolean; isSelf:boolean }) {
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState("");
  const router=useRouter();
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
    <div><p className="text-sm font-medium">Trabalho / CLT</p><p className="text-xs text-muted-foreground">Controla a visualização do menu e o acesso às páginas CLT.</p></div>
    <button type="button" disabled={pending||(isSelf&&enabled)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>{
      if(enabled&&!window.confirm("Remover o acesso deste usuário ao CLT?"))return;
      startTransition(async()=>{setError("");const result=await setUserCltAccessAction(userId,!enabled);if(result.error)setError(result.error);else router.refresh();});
    }}>{pending?"Salvando...":enabled?"Remover acesso":"Liberar acesso"}</button>
    {error&&<p role="alert" className="w-full text-sm text-destructive">{error}</p>}
  </div>;
}
