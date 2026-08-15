#!/usr/bin/env node
// ===========================================================================
// IMPORTA A PLANILHA DA ASSISTÊNCIA (a do Vitinho) -> tabela `bancada`
//
// Uso:  npm i xlsx                                  # não é dependência do repo
//       node scripts/bancada-planilha.js            # só compara, não grava
//       node scripts/bancada-planilha.js --sql      # imprime o SQL pra revisar
//
// A planilha precisa estar acessível por link (é como ela foi lida em 15/ago).
//
// ⚠️ Este script NÃO escreve no banco de propósito. Ele cospe o SQL pra ser
// lido antes de aplicar. A importação de 15/ago/2026 mostrou por que: duas
// correções manuais foram necessárias DEPOIS de aplicar, porque a chave de
// casamento estava errada (ver "A chave" abaixo). Import de histórico é
// operação de uma vez só — não vale automatizar o que precisa de olho.
//
// A planilha está sendo APOSENTADA (o painel virou a fonte). Isto fica para o
// caso de aparecer coisa nova nela, e como registro de como a carga foi feita.
//
// ---------------------------------------------------------------------------
// A SEMÂNTICA QUE INVERTE — erre aqui e todo o resto fica de cabeça pra baixo
// ---------------------------------------------------------------------------
//   planilha "DATA ENTRADA" = entrou na ASSISTÊNCIA -> bancada.saiu_em
//   planilha "DATA SAIDA"   = saiu   da ASSISTÊNCIA -> bancada.voltou_em
//
// ---------------------------------------------------------------------------
// AS ABAS (5, e só 3 valem)
// ---------------------------------------------------------------------------
//   "Lucas 2.0" / "Acess 2.0"  -> o que está fora AGORA (DATA SAIDA vazia)
//   "Agosto Baixa"             -> o que saiu e voltou. DUAS tabelas lado a
//                                 lado: LUCAS nas colunas A-G, ACESS nas I-O.
//   "Lucas" / "Acess"          -> versões antigas, 4 colunas, sem data. Ignorar.
//
// ⚠️ As abas se contradizem: a mesma ida aparece aberta na "2.0" e baixada na
// "Agosto Baixa" (caso 5185/E1632). Regra: A BAIXA MANDA — a aba de baixa é
// que é preenchida no ato da volta; a "2.0" é que fica pra trás.
//
// ---------------------------------------------------------------------------
// A CHAVE — foi o que quebrou em 15/ago
// ---------------------------------------------------------------------------
// Uma ida é (imei4, saiu_em). Mas APARELHO DE CLIENTE NÃO TEM IMEI: vira
// '0000', e dois clientes que saíram no mesmo dia colidem. Aconteceu duas
// vezes: um "12 Pro Azul" recebeu a baixa do "15 preto", e dois clientes de
// 05/ago viraram uma linha só com serviço "bat / conector".
// Por isso a chave inclui o MODELO quando não há IMEI.
// ===========================================================================

const XLSX = require('xlsx');

const SHEET_ID = '1XiapI2wAoIeHbSaWUB8baRViUu4VZ4esCN5oPn_cLhY';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const ANO = 2026;

const MES = {jan:1,feb:2,fev:2,mar:3,apr:4,abr:4,may:5,mai:5,jun:6,jul:7,aug:8,ago:8,
             sep:9,set:9,oct:10,out:10,nov:11,dec:12,dez:12};

function data(v){
  const s = String(v || '').trim().replace(/\.$/,'');
  if(!s) return null;
  let m = s.match(/^(\d{1,2})-([A-Za-zç]+)\.?$/);      // 11-May, 30-jul.
  if(m){ const mes = MES[m[2].toLowerCase().slice(0,3)];
         return mes ? `${ANO}-${String(mes).padStart(2,'0')}-${m[1].padStart(2,'0')}` : null; }
  m = s.match(/^(\d{1,2})-(\d{1,2})$/);                 // 13-08
  return m ? `${ANO}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
}

// 4 últimos dígitos com zero à esquerda: a planilha escreve "433" e "60771"
// para o que no banco é "0433" e "0771".
const fim4 = v => {
  const d = String(v || '').replace(/\D/g,'');
  return d ? d.slice(-4).padStart(4,'0') : null;
};

// A ida. Sem IMEI (cliente), o modelo entra na chave — senão dois clientes do
// mesmo dia viram um só.
const chave = l => [l.imei4 || 'S/IMEI:' + l.modelo_txt.toLowerCase(), l.saiu_em].join('|');

function lerAba(wb, aba, forn, cols){
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba] || {}, {header:1, raw:false, defval:''});
  const out = [];
  for(const r of rows){
    const [dIn, modelo, imei, etiq, serv, obs, dOut] = cols.map(i => String(r[i] ?? '').trim());
    if(!modelo || String(dIn).toUpperCase().includes('DATA')) continue;
    const saiu = data(dIn);
    if(!saiu) continue;
    const etiqL = etiq.toLowerCase();
    out.push({
      aba, fornecedor: forn,
      origem: /garantia/i.test(obs) ? 'garantia' : (etiqL.includes('cliente') ? 'cliente' : 'estoque'),
      modelo_txt: modelo,
      imei4: fim4(imei),
      etiqueta: (etiqL.includes('cliente') || !etiq) ? null : etiq,
      servico: serv || null,
      saiu_em: saiu,
      voltou_em: data(dOut),
    });
  }
  return out;
}

async function main(){
  const buf = Buffer.from(await (await fetch(URL)).arrayBuffer());
  const wb = XLSX.read(buf, {type:'buffer'});
  const A = [0,1,2,3,4,5,6];          // Lucas 2.0 / Acess 2.0 / lado LUCAS
  const B = [8,9,10,11,12,13,14];     // lado ACESS da "Agosto Baixa"

  const linhas = [
    ...lerAba(wb, 'Lucas 2.0',    'RR',     A),
    ...lerAba(wb, 'Acess 2.0',    'ACCESS', A),
    ...lerAba(wb, 'Agosto Baixa', 'RR',     A),
    ...lerAba(wb, 'Agosto Baixa', 'ACCESS', B),
  ];

  // Uma linha por ida. A baixa manda sobre o "aberto" da aba 2.0.
  const idas = new Map();
  for(const l of linhas){
    const k = chave(l);
    const j = idas.get(k);
    if(!j){ idas.set(k, {...l}); continue; }
    if(l.voltou_em && !j.voltou_em){ j.voltou_em = l.voltou_em; j.conflito = true; }
    if(!j.etiqueta && l.etiqueta) j.etiqueta = l.etiqueta;
  }
  const todas = [...idas.values()];
  const abertas = todas.filter(l => !l.voltou_em);

  console.log(`planilha: ${linhas.length} linhas -> ${todas.length} idas`);
  console.log(`  fora agora: ${abertas.length}  |  já voltaram: ${todas.length - abertas.length}`);
  const conflitos = todas.filter(l => l.conflito);
  if(conflitos.length){
    console.log(`\n⚠️ ${conflitos.length} ida(s) aberta(s) numa aba e baixada(s) na outra (a baixa mandou):`);
    conflitos.forEach(l => console.log(`   ${l.modelo_txt} ${l.imei4 || ''} saiu ${l.saiu_em} -> voltou ${l.voltou_em}`));
  }
  const semImei = todas.filter(l => !l.imei4);
  if(semImei.length) console.log(`\n${semImei.length} sem IMEI (cliente) — casam por modelo+data, confira à mão`);

  if(!process.argv.includes('--sql')) {
    console.log('\n(rode com --sql para ver o SQL; este script nunca grava)');
    return;
  }
  const esc = v => v == null ? 'null' : `'${String(v).replace(/'/g,"''")}'`;
  console.log('\n-- conferir ANTES de aplicar. apple_id fica null quando 4 dígitos são ambíguos.');
  for(const l of todas){
    console.log(`insert into public.bancada (imei4,modelo_txt,fornecedor,origem,servico,saiu_em,voltou_em,etiqueta,quem) ` +
      `select ${esc(l.imei4 || '0000')},${esc(l.modelo_txt)},${esc(l.fornecedor)},${esc(l.origem)},` +
      `${esc(l.servico)},${esc(l.saiu_em)}::date,${l.voltou_em ? esc(l.voltou_em)+'::date' : 'null'},` +
      `${esc(l.etiqueta)},'import-planilha' ` +
      `where not exists (select 1 from public.bancada b where b.imei4=${esc(l.imei4 || '0000')} ` +
      `and b.saiu_em=${esc(l.saiu_em)}::date${l.imei4 ? '' : ` and lower(b.modelo_txt) like ${esc('%'+l.modelo_txt.toLowerCase()+'%')}`});`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
