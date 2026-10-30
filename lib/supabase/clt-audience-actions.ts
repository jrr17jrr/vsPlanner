"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export type AudienceKind="personalizado"|"semelhante"|"salvo";
export type AudienceRecord={id:string;name:string;audience_type:AudienceKind;settings:Record<string,unknown>;source_audience_id:string|null;included_audience_ids:string[];excluded_audience_ids:string[]};
type AudienceInput={id?:string;name:string;audience_type:AudienceKind;settings?:Record<string,unknown>;source_audience_id?:string|null;included_audience_ids?:string[];excluded_audience_ids?:string[]};
async function access(companyId:string){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)throw Error("Sessão expirada.");const {data}=await s.from("clt_companies").select("id").eq("id",companyId).eq("user_id",user.id).maybeSingle();if(!data)throw Error("Empresa não encontrada.");return {s,user};}
export async function saveCltAudienceAction(companyId:string,input:AudienceInput){
 try{const {s,user}=await access(companyId);const name=input.name.trim();if(!name||name.length>180)throw Error("Nome inválido.");if(!["personalizado","semelhante","salvo"].includes(input.audience_type))throw Error("Tipo inválido.");
 const {data:all,error:readError}=await s.from("clt_audiences").select("id,audience_type").eq("company_id",companyId).eq("user_id",user.id);if(readError)throw readError;
 const byId=new Map((all||[]).map(a=>[a.id,a.audience_type]));const included=[...new Set(input.included_audience_ids||[])];const excluded=[...new Set(input.excluded_audience_ids||[])];
 if(input.audience_type==="semelhante"&&(!input.source_audience_id||!byId.has(input.source_audience_id)))throw Error("Selecione um público de origem válido.");
 if(input.audience_type==="salvo"&&(!included.length||included.some(id=>!byId.has(id)||byId.get(id)==="salvo")||excluded.some(id=>!byId.has(id)||byId.get(id)==="salvo")))throw Error("Selecione públicos personalizados ou semelhantes válidos.");
 if(input.id&&(included.includes(input.id)||input.source_audience_id===input.id))throw Error("Um público não pode incluir a si próprio.");
 const values={name,audience_type:input.audience_type,settings:input.settings||{},source_audience_id:input.audience_type==="semelhante"?input.source_audience_id:null,included_audience_ids:input.audience_type==="salvo"?included:[],excluded_audience_ids:input.audience_type==="salvo"?excluded:[]};
 const query=input.id?s.from("clt_audiences").update(values).eq("id",input.id).eq("company_id",companyId).eq("user_id",user.id):s.from("clt_audiences").insert({...values,company_id:companyId,user_id:user.id});
 const {error}=await query;if(error)throw error;revalidatePath("/trabalho/empresas/[id]","page");return {success:"Público salvo."};
 }catch(e){return {error:e instanceof Error?e.message:"Não foi possível salvar."};}
}
export async function importCltAudiencesJsonAction(companyId:string,raw:unknown){
 try{const {s,user}=await access(companyId);const data=raw as {publicos?:unknown};if(!data||!Array.isArray(data.publicos)||!data.publicos.length||data.publicos.length>100)throw Error("JSON deve conter 'publicos' (1 a 100 itens).");
 const entries=data.publicos as Record<string,unknown>[];const types=["personalizado","semelhante","salvo"];
 const normalized=entries.map(a=>({name:String(a.nome||"").trim(),audience_type:String(a.tipo||"").toLowerCase(),settings:(a.configuracoes&&typeof a.configuracoes==="object"&&!Array.isArray(a.configuracoes)?a.configuracoes:{}) as Record<string,unknown>,source:String(a.origem||""),included:Array.isArray(a.incluidos)?a.incluidos.map(String):[],excluded:Array.isArray(a.excluidos)?a.excluidos.map(String):[]}));
 if(normalized.some(a=>!a.name||a.name.length>180||!types.includes(a.audience_type)))throw Error("Nome ou tipo inválido.");
 if(new Set(normalized.map(a=>a.name.toLowerCase())).size!==normalized.length)throw Error("Há nomes duplicados no JSON.");
 const {data:existing,error:err}=await s.from("clt_audiences").select("id,name,audience_type").eq("company_id",companyId).eq("user_id",user.id);if(err)throw err;
 const lookup=new Map((existing||[]).map(a=>[a.name.toLowerCase(),a]));let count=0;
 for(const type of types){for(const a of normalized.filter(x=>x.audience_type===type)){
 const resolve=(name:string)=>lookup.get(name.toLowerCase())?.id;
 const origin=a.source?resolve(a.source):null;const includes=a.included.map(resolve).filter((id):id is string=>typeof id==="string");const excludes=a.excluded.map(resolve).filter((id):id is string=>typeof id==="string");
 if(includes.length!==a.included.length||excludes.length!==a.excluded.length)throw Error("Públicos incluídos/excluídos não encontrados em "+a.name);
 if(type==="semelhante"&&!origin)throw Error("Origem não encontrada: "+a.source);
 if(type==="salvo"&&(!includes.length||includes.some(x=>!x)||excludes.some(x=>!x)))throw Error("Públicos incluídos/excluídos não encontrados em "+a.name);
 const values={name:a.name,audience_type:type,settings:a.settings,source_audience_id:type==="semelhante"?origin:null,included_audience_ids:type==="salvo"?includes:[],excluded_audience_ids:type==="salvo"?excludes:[]};
 const prior=lookup.get(a.name.toLowerCase());if(prior&&prior.audience_type!==type)throw Error("Tipo diferente para "+a.name);
 const q=prior?s.from("clt_audiences").update(values).eq("id",prior.id).eq("user_id",user.id).select("id").single():s.from("clt_audiences").insert({...values,user_id:user.id,company_id:companyId}).select("id").single();
 const {data:saved,error}=await q;if(error)throw Error(a.name+": "+error.message);lookup.set(a.name.toLowerCase(),{id:saved.id,name:a.name,audience_type:type});count++;
 }}
 revalidatePath("/trabalho/empresas/[id]","page");return {success:count+" públicos importados/atualizados."};
 }catch(e){return {error:e instanceof Error?e.message:"Erro ao importar."};}
}
