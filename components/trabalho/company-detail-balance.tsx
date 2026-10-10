"use client";
import {useState,useTransition} from "react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {adjustCltCompanyBalancesAction} from "@/lib/supabase/clt-actions";
import type {CltCompany} from "@/types/database.types";
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function CompanyDetailBalance({company}:{company:CltCompany}){
 const [operation,setOperation]=useState<"add"|"remove"|"set">("add");
 const [amount,setAmount]=useState("");
 const [pending,start]=useTransition();
 function save(){const value=Number(amount);if(!amount||!Number.isFinite(value)||value<0)return toast.error("Informe um valor válido.");const before=Number(company.current_ad_balance);const after=operation==="set"?value:operation==="add"?before+value:before-value;if(after<0)return toast.error("Saldo insuficiente.");if(!confirm(company.name+": "+money(before)+" → "+money(after)+"\nConfirmar movimentação?"))return;start(async()=>{const r=await adjustCltCompanyBalancesAction({companyIds:[company.id],operation,amount:value});if(r.error)toast.error(r.error);else{toast.success(r.success);setAmount("");}});}
 return <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">Saldo da conta de anúncios</h2><p className="text-sm text-muted-foreground">Saldo registrado: <b className="text-foreground">{money(Number(company.current_ad_balance))}</b></p><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="space-y-1"><Label>Operação</Label><Select value={operation} onValueChange={v=>setOperation(v as typeof operation)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="add">Adicionar</SelectItem><SelectItem value="remove">Remover</SelectItem><SelectItem value="set">Definir saldo</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></div><Button onClick={save} disabled={pending}>{pending?"Salvando...":"Atualizar saldo"}</Button></div><p className="text-xs text-muted-foreground">Controle manual. Não altera o saldo real da Meta.</p></CardContent></Card>;
}
