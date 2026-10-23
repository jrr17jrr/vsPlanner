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
 return <div className="mt-2 space-y-2 rounded-lg border p-3">
  <p className="text-sm font-semibold">Produção dos vídeos</p>
  {videos.map(v=><button key={v.id} type="button" onClick={()=>choose(v)} className={"block w-full rounded-md border px-3 py-2 text-left text-sm "+(selected===v.id?"border-primary":"border-border")}>{v.title} <span className="text-xs text-muted-foreground">· {v.production_status??"roteiro"}</span></button>)}
  {video&&<div className="space-y-3 rounded-md border p-3">
   <p className="text-sm font-medium">{video.title}</p>
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
