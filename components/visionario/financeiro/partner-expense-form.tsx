"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPartnerExpenseAction } from "@/lib/supabase/financial-actions";
import { parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import type { FinancialAccount } from "@/types/database.types";

export function PartnerExpenseForm({accounts}:{accounts:FinancialAccount[]}) {
 const router=useRouter();
 const [description,setDescription]=useState("");
 const [total,setTotal]=useState("");
 const [junior,setJunior]=useState("");
 const [guilherme,setGuilherme]=useState("");
 const [empresa,setEmpresa]=useState("");
 const [companyAccount,setCompanyAccount]=useState("");
 const [date,setDate]=useState(todayKeySaoPaulo());
 const [recordOnly,setRecordOnly]=useState(true);
 const [account,setAccount]=useState("");
 const [saving,setSaving]=useState(false);
 async function submit(e:React.FormEvent) {
   e.preventDefault();
   setSaving(true);
   try {
     const result=await createPartnerExpenseAction({description,amount:parseMoneyInput(total)||0,junior:parseMoneyInput(junior)||0,guilherme:parseMoneyInput(guilherme)||0,empresa:parseMoneyInput(empresa)||0,date,recordOnly,juniorAccountId:account||undefined,companyAccountId:companyAccount||undefined});
     if(result.error) toast.error(result.error); else {toast.success(result.success||"Registrado");setDescription("");setTotal("");setJunior("");setGuilherme("");setEmpresa("");router.refresh();}
   } catch {toast.error("Não foi possível registrar.");} finally {setSaving(false);}
 }
 return <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4">
  <h2 className="font-semibold">+ Lançar gasto dos sócios</h2>
  <label className="block text-sm">Descrição<input required value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2" placeholder="Ex.: Contadora" /></label>
  <div className="grid grid-cols-2 gap-3"><label className="text-sm">Valor total<input required value={total} onChange={e=>setTotal(e.target.value)} placeholder="300,00" className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Data<input type="date" required value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2" /></label></div>
  <div className="grid grid-cols-2 gap-3"><label className="text-sm">Júnior pagou<input value={junior} onChange={e=>setJunior(e.target.value)} placeholder="150,00" className="mt-1 w-full rounded-md border bg-background p-2" /></label><label className="text-sm">Guilherme pagou<input value={guilherme} onChange={e=>setGuilherme(e.target.value)} placeholder="150,00" className="mt-1 w-full rounded-md border bg-background p-2" /></label></div>
  <label className="block text-sm">Visionário Dev pagou<input value={empresa} onChange={e=>setEmpresa(e.target.value)} placeholder="0,00" className="mt-1 w-full rounded-md border bg-background p-2" /></label>
  <p className="text-xs text-muted-foreground">Soma das partes: R$ {((parseMoneyInput(junior)||0)+(parseMoneyInput(guilherme)||0)+(parseMoneyInput(empresa)||0)).toFixed(2).replace(".",",")} de R$ {(parseMoneyInput(total)||0).toFixed(2).replace(".",",")}</p>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recordOnly} onChange={e=>setRecordOnly(e.target.checked)} /> Somente registrar, sem movimentar saldo</label>
  {!recordOnly && Number(parseMoneyInput(junior))>0 && <label className="block text-sm">Conta para descontar a parte do Júnior<select value={account} onChange={e=>setAccount(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Selecione uma conta</option>{accounts.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
  {!recordOnly && Number(parseMoneyInput(empresa))>0 && <label className="block text-sm">Conta da Visionário Dev<select value={companyAccount} onChange={e=>setCompanyAccount(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Selecione uma conta</option>{accounts.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
  <p className="text-xs text-muted-foreground">A despesa entra uma vez no financeiro da Visionário Dev. A parte do Guilherme não movimenta suas contas.</p>
  <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving?"Salvando...":"Registrar gasto"}</button>
 </form>;
}
