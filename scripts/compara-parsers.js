#!/usr/bin/env node
// ===========================================================================
// COMPARA OS DOIS PARSERS DA OBSERVACAO DA VENDA.
//
//   node scripts/compara-parsers.js ../phonecar-sync/sync.js
//
// POR QUE EXISTE: a mesma observacao e lida em DOIS lugares, em repos
// diferentes -- `parseObs()` em js/equipe.js (o painel, que PAGA a comissao) e
// `parseObs()` em sync.js do repo brenostap/phonecar-sync (que preenche
// vendas.vendedor_obs/atendente_obs, de onde nasce a chave e de onde as views
// do "Meu dia" leem).
//
// Nao ha modulo compartilhado possivel entre os dois: um roda no browser sem
// bundler, o outro no Node de uma GitHub Action. Entao sao espelhos, como
// eh_principal/eh_acessorio sao espelhos no Postgres -- e espelho sem guarda
// diverge calado.
//
// Foi o que aconteceu ate 01/set/2026: o sync aceitava so `-` e `:` como
// separador, o painel aceitava tambem `.` e `,`. "Atendente. Anne" resolvia num
// lado e nao no outro. 47 divergencias em 1.000 vendas -- e o colaborador via
// menos comissao no "Meu dia" do que recebeu na folha.
//
// ⚠️ PRECISA da service_role no ambiente (le `vendas` direto):
//   export SUPABASE_SERVICE_ROLE_KEY=...
//
// Saida esperada: DIVERGEM 0. Qualquer numero acima disso e alguem que mexeu em
// um dos dois lados sem mexer no outro.
// ===========================================================================
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=require('path').join(__dirname,'..');
const SYNC=process.argv[2];

// -- parser do painel (js/equipe.js, carregado de verdade) --
const ctx={console,window:{supabase:{createClient:()=>({auth:{}})},matchMedia:()=>({matches:false})},
 document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
  createElement:()=>({style:{},addEventListener(){},remove(){}}),
  documentElement:{getAttribute:()=>null,setAttribute(){}},body:{appendChild(){},insertAdjacentHTML(){}}},
 localStorage:{getItem:()=>null,setItem(){}},fetch:()=>Promise.reject(new Error('x')),
 Date,Math,JSON,Set,Map,Object,Array,String,Number,parseFloat,parseInt,isNaN,RegExp,Error,Promise,setTimeout};
ctx.globalThis=ctx; vm.createContext(ctx);
for(const f of ['config.js','equipe.js','core.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),ctx,{filename:f});
const painel = o => { ctx._o=o; return vm.runInContext('parseObs(_o||"")',ctx); };

// -- parser do sync: recorta so a funcao, sem rodar o resto do arquivo --
const src=fs.readFileSync(SYNC,'utf8');
const iNome=src.indexOf('const NOME_E_LOJA');
const ini=iNome>=0?iNome:src.indexOf('function parseObs(');
const fim=src.indexOf('\nasync function getLastSync');
const sctx={console,RegExp,String,Object,Array}; sctx.globalThis=sctx; vm.createContext(sctx);
vm.runInContext(src.slice(ini,fim),sctx,{filename:'sync.js'});
const sync = o => { sctx._o=o; return vm.runInContext('parseObs(_o)',sctx); };

(async()=>{
  const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch('https://pfsfsibgmtbifypuyyqf.supabase.co/rest/v1/vendas?'+
    'select=id,observacoes&data_saida=gte.2026-06-01&observacoes=not.is.null&limit=2000',
    {headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
  const vendas=await r.json();
  let iguais=0; const dif=[];
  for(const v of vendas){
    const a=painel(v.observacoes)||{}, b=sync(v.observacoes)||{};
    const norm=x=>(x===undefined?null:x);
    if(norm(a.vendedor)===norm(b.vendedor)&&norm(a.atendente)===norm(b.atendente)&&norm(a.loja)===norm(b.loja)) iguais++;
    else dif.push({id:v.id,obs:(v.observacoes||'').replace(/\n/g,' | ').slice(0,52),
      painel:`${a.loja||'—'}/${a.vendedor||'—'}/${a.atendente||'—'}`,
      sync:`${b.loja||'—'}/${b.vendedor||'—'}/${b.atendente||'—'}`});
  }
  console.log(`\n${vendas.length} vendas com obs (jun–set/2026)`);
  console.log(`  concordam: ${iguais}`);
  console.log(`  DIVERGEM : ${dif.length}\n`);
  dif.slice(0,25).forEach(d=>console.log(
    `  ${d.id}  painel=${d.painel.padEnd(24)} sync=${d.sync.padEnd(24)} ${d.obs}`));
  if(dif.length>25) console.log(`  ...e mais ${dif.length-25}`);
})();
