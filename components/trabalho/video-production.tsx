"use client";
import {useEffect,useState,useTransition} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {listCompanyVideoTasks,saveVideoDetails,type VideoData,type VideoStatus} from "@/lib/supabase/video-actions";
import type {CltCompany} from "@/types/database.types";

export function VideoProduction({parentId,companyId,companies}:{parentId:string;companyId:string;companies:CltCompany[]}){
 const [videos,setVideos]=useState<VideoData[]>([]),[selected,setSelected]=useState<string|null>(null),[scope,setScope]=useState("one"),[targets,setTargets]=useState<string[]>([]);
 const [script,setScript]=useState(""),[url,setUrl]=useState(""),[notes,setNotes]=useState(""),[status,setStatus]=useState<VideoStatus>("roteiro"),[pending,start]=useTransition();
 useEffect(()=>{void listCompanyVideoTasks(parentId).then(setVideos).catch(e=>toast.error(e.message));},[parentId]);
 const video=videos.find(v=>v.id===selected);
 function choose(v:VideoData){setSelected(v.id);setScript(v.script??"");setUrl(v.reference_url??"");setNotes(v.production_notes??"");setStatus(v.production_status??"roteiro");setScope("one");setTargets([]);}
 function save(){if(!selected)return;start(async()=>{const chosen=scope==="all"?companies.filter(c=>c.id!==companyId&&!["piv","verificar"].includes(c.name.trim().toLowerCase())).map(c=>c.id):scope==="select"?targets:undefined;
 const result=await saveVideoDetails(parentId,selected,{script,referenceUrl:url,notes,status},chosen);
 if(result.error)toast.error(result.error);else{toast.success("Dados do vídeo salvos.");setVideos(old=>old.map(v=>v.id===selected?{...v,script,reference_url:url,production_notes:notes,production_status:status}:v));}
 });}
 const statuses:Record<VideoStatus,string>={roteiro:"Roteiro",gravacao:"Gravação",edicao:"Edição",finalizado:"Finalizado"};
 const colors:Record<VideoStatus,string>={roteiro:"bg-muted text-muted-foreground",gravacao:"bg-amber-500/15 text-amber-500",edicao:"bg-sky-500/15 text-sky-400",finalizado:"bg-emerald-500/15 text-emerald-400"};
 const completed=videos.filter(v=>v.production_status==="finalizado").length;
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Acompanhe a produção e edite os roteiros.</p><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{completed}/{videos.length||3} finalizados</span></div>
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{videos.map((v,i)=><div key={v.id} className={"flex min-h-44 flex-col justify-between rounded-xl border bg-card p-4 "+(selected===v.id?"border-primary":"border-border")}>
   <div className="space-y-3"><div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">VÍDEO {String(i+1).padStart(2,"0")}</span><span className={"rounded-full px-2 py-1 text-xs font-medium "+colors[v.production_status??"roteiro"]}>{statuses[v.production_status??"roteiro"]}</span></div>
   <h3 className="text-base font-semibold leading-snug">{v.title.replace(/^Vídeo\s*\d+\s*[—–-]\s*/i,"")}</h3>
   <p className="text-xs text-muted-foreground">{v.script?.trim()?"Roteiro preenchido":"Sem roteiro"} · {v.reference_url?"Com referência":"Sem referência"}</p></div>
   <Button size="sm" variant={selected===v.id?"secondary":"outline"} className="mt-4 w-full" onClick={()=>selected===v.id?setSelected(null):choose(v)}>{selected===v.id?"Fechar edição":"Editar vídeo"}</Button>
  </div>)}</div>
  {video&&<div className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 md:p-5">
   <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Editar — {video.title}</h3><Button size="sm" variant="ghost" onClick={()=>setSelected(null)}>Fechar</Button></div>
   <label className="block text-xs font-medium">Roteiro completo</label><Textarea value={script} onChange={e=>setScript(e.target.value)} rows={8} placeholder="Gancho, desenvolvimento e CTA..."/>
   <label className="block text-xs font-medium">Link de referência</label><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/..."/>
   {/^https?:\/\/\S+$/i.test(url)&&<a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Abrir referência</a>}
   <label className="block text-xs font-medium">Observações</label><Textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/>
   <label className="block text-xs font-medium">Etapa da produção</label>
   <select className="w-full rounded-md border bg-background p-2 text-sm" value={status} onChange={e=>setStatus(e.target.value as VideoStatus)}><option value="roteiro">Criando roteiro</option><option value="gravacao">Aguardando gravação</option><option value="edicao">Em edição</option><option value="finalizado">Finalizado</option></select>
   <label className="block text-xs font-medium">Aplicar alterações em</label>
   <select className="w-full rounded-md border bg-background p-2 text-sm" value={scope} onChange={e=>setScope(e.target.value)}><option value="one">Somente esta empresa</option><option value="all">Todas as empresas (exceto PIV e Verificar)</option><option value="select">Empresas selecionadas</option></select>
   {scope==="select"&&<div className="space-y-1">{companies.filter(c=>c.id!==companyId&&!["piv","verificar"].includes(c.name.trim().toLowerCase())).map(c=><label key={c.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={targets.includes(c.id)} onChange={e=>setTargets(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.name}</label>)}</div>}
   <p className="text-xs text-muted-foreground">Edição em massa atualiza apenas roteiros, links, observações e status de vídeos com o mesmo nome dentro de tarefas com o mesmo título. Não altera o progresso.</p>
   <Button disabled={pending} onClick={save}>{pending?"Salvando...":"Salvar vídeo"}</Button>
  </div>}
 </div>;
}
