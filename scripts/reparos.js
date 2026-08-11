#!/usr/bin/env node
/**
 * Importador das notas das assistencias -> tabela `reparos`.
 *
 * POR QUE EXISTE: as duas assistencias cobram por semana e o valor era lancado
 * agregado em `custos` (area assistencia). Sao R$ 63 mil em jun+jul que ninguem
 * conseguia ligar a um aparelho -- entao a margem por modelo esta superestimada,
 * e mais nos modelos velhos, que sao os que mais quebram. Metade desse dinheiro
 * (53%) nem e custo de mercadoria: e GARANTIA de aparelho ja vendido.
 *
 * NAO E LANCAMENTO CONTABIL. O P&L continua lendo `custos`. Esta tabela e a mesma
 * despesa detalhada, pra decidir compra. Somar as duas conta o dinheiro 2x.
 *
 * AS DUAS FONTES SAO DIFERENTES:
 *   RR/LegacyPhone  PDF gerado por sistema, IMEI completo de 15 digitos. Estavel.
 *   Access          texto solto do WhatsApp, so 4 digitos. Muda toda semana.
 *
 * AS TRES CHAVES DE CASAMENTO (nesta ordem):
 *   1. IMEI completo   -- 15 digitos nao colidem. So a RR manda.
 *   2. Etiqueta        -- E1585 (entrada/troca) ou SP1047 (fornecedor). Comparamos
 *                         so os digitos, entao "1585" casa com "E1585".
 *   3. Ultimos 4 do IMEI -- colide em 14% dos aparelhos; so vale com modelo junto.
 *   Empate entre 2 e 3 -> a COR decide. Se a cor nao bater em nenhum, e erro de
 *   digitacao da nota e a linha fica em `revisar` (nunca chuta).
 *
 * AS DUAS TRAVAS (sem elas isto quebra calado, que e o jeito que este projeto
 * costuma quebrar):
 *   1. A NOTA FECHA -- soma dos liquidos == total impresso. Se nao fecha, aborta
 *      e nao grava nada. Foi assim que apareceu o IMEI de 16 digitos da RR.
 *   2. O MES FECHA  -- soma dos reparos do mes == lancamentos de assistencia em
 *      `custos`. Divergiu? Tem nota nao importada ou lancamento sem nota.
 *
 * CREDENCIAL: a escrita usa a serviee_role, que ignora RLS. Ela NAO entra neste
 * arquivo nem no repo -- a Netlify publica a raiz, arquivo commitado vira URL
 * publica. Leia do ambiente:
 *
 *   export SUPABASE_SERVICE_ROLE_KEY=...
 *
 * As notas tambem nao sao versionadas (/RR/ e /notas/ estao no .gitignore): elas
 * tem IMEI de cliente e preco de fornecedor.
 *
 * USO:
 *   node scripts/reparos.js ler       RR/*.pdf notas/*.txt   # so parseia, trava 1
 *   node scripts/reparos.js importar  RR/*.pdf notas/*.txt   # parseia, casa, grava
 *   node scripts/reparos.js revisar                          # o que nao casou
 *   node scripts/reparos.js conciliar 2026-07                # trava 2
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SB_URL = 'https://pfsfsibgmtbifypuyyqf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------- utilidades

const brl = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

/**
 * Cores: a nota escreve o nome popular ("preto", "branco") e o banco guarda o
 * nome comercial da Apple ("Meia Noite", "Estelar"). Sem este mapa a cor nunca
 * bate e o desempate nao funciona.
 */
const COR = new Map(Object.entries({
  'meia noite': 'preto', 'meianoite': 'preto', 'preto espacial': 'preto',
  'grafite': 'preto', 'space gray': 'preto', 'titanio preto': 'preto',
  'estelar': 'branco', 'branco estelar': 'branco', 'titanio branco': 'branco',
  'prateado': 'prata', 'titanio natural': 'natural', 'natural': 'natural',
  'roxo profundo': 'roxo', 'lilas': 'roxo', 'deep purple': 'roxo',
  'azul sierra': 'azul', 'azul pacifico': 'azul', 'ultramarino': 'azul',
  'titanio azul': 'azul', 'azul marinho': 'azul',
  'verde alpino': 'verde', 'meia-noite': 'preto',
  'titanio deserto': 'desert', 'deserto': 'desert', 'desert': 'desert',
  'dourado': 'dourado', 'gold': 'dourado', 'starlight': 'branco',
  'product red': 'vermelho', 'vermelho': 'vermelho', 'rosa': 'rosa',
}));

function corCanonica(s) {
  const t = String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!t) return '';
  if (COR.has(t)) return COR.get(t);
  for (const [k, v] of COR) if (t.includes(k)) return v;
  return t.split(/\s+/)[0];
}

function modeloDoTitulo(t) {
  const m = String(t || '').match(/iPhone\s+(1[1-7]|SE)(\s+Pro\s+Max|\s+Pro|\s+Plus)?/i);
  return m ? (m[1] + (m[2] || '')).replace(/\s+/g, ' ').trim() : '';
}

// Normaliza o jeito que a Access abrevia: "promax" -> "Pro Max".
function modeloCanonico(s) {
  return String(s || '').toLowerCase()
    .replace(/pro\s*max|promax/g, 'pro max')
    .replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------- leitura de PDF

/** Descomprime os streams do PDF. Sem dependencia: zlib e nativo do Node. */
function streamsDoPdf(buf) {
  const out = [];
  const re = /\/Length[^>]*?>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(buf.toString('latin1'))) !== null) {
    const ini = m.index + m[0].length;
    const fim = buf.indexOf('endstream', ini, 'latin1');
    if (fim < 0) continue;
    const cru = buf.subarray(ini, fim);
    try { out.push(zlib.inflateSync(cru).toString('latin1')); }
    catch { try { out.push(zlib.inflateSync(cru.subarray(0, cru.length - 1)).toString('latin1')); }
            catch { out.push(cru.toString('latin1')); } }
  }
  return out;
}

function desescapar(s) {
  return s.replace(/\\([nrtbf])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '', f: '' }[c]))
          .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
          .replace(/\\(.)/g, '$1');
}

/** Extrai o texto dos operadores Tj / TJ. */
function textoDoPdf(buf) {
  let txt = '';
  for (const s of streamsDoPdf(buf)) {
    const re = /\[((?:[^\[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|')/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[1] !== undefined) {
        const partes = m[1].match(/\((?:[^()\\]|\\.)*\)/g) || [];
        txt += partes.map((p) => desescapar(p.slice(1, -1))).join('');
      } else txt += desescapar(m[2]);
      txt += ' ';
    }
  }
  return txt.replace(/\s+/g, ' ')
            .replace(/(\d{2,3})G\s*B\b/g, '$1GB')
            .replace(/1T\s*B\b/g, '1TB');
}

// -------------------------------------------------------------- parser da RR

/**
 * PDF do Legacy OS: uma linha por aparelho com modelo, GB, cor, IMEI de 15
 * digitos, servicos e valor.
 *
 * LIMITACAO CONHECIDA: a nota so traz o PERIODO, nunca a data de cada servico.
 * Entao `data_servico` vira o fim do periodo -- o que joga a nota de 27/07-01/08
 * inteira em agosto. Pedir data por linha resolve; ate la, e o unico ponto em
 * que a atribuicao por mes e aproximada.
 */
function parseRR(buf, arquivo) {
  const t = textoDoPdf(buf);
  const per = t.match(/Per[ií]odo:\s*([\d/]+)\s*a\s*([\d/]+)/);
  const tot = t.match(/VALOR FINAL DO FECHAMENTO:\s*R\$\s*([\d.]+,\d{2})/);
  if (!per || !tot) throw new Error(`${arquivo}: nao achei periodo ou total -- layout mudou?`);

  const dia = (s) => { const [d, m, a] = s.split('/'); return `${a}-${m}-${d}`; };
  const total = parseFloat(tot[1].replace(/\./g, '').replace(',', '.'));
  const corpo = t.slice(0, tot.index);

  // Eventos em ordem: cada VALOR fecha uma linha; os IMEIs vistos desde o valor
  // anterior pertencem a ela (linhas dual-SIM trazem dois).
  const ev = [];
  for (const m of corpo.matchAll(/\b(\d{14,17})\b/g)) ev.push({ p: m.index, t: 'imei', v: m[1] });
  for (const m of corpo.matchAll(/R\$\s*([\d.]+,\d{2})/g)) ev.push({ p: m.index, t: 'val', v: m[1] });
  ev.sort((a, b) => a.p - b.p);

  const linhas = [];
  let pend = [];
  for (const e of ev) {
    if (e.t === 'imei') { pend.push(e); continue; }
    const im = pend[0];
    const antes = corpo.slice(Math.max(0, (im ? im.p : e.p) - 170), im ? im.p : e.p);
    const mm = [...antes.matchAll(/iPhone\s+(1[1-7]|SE)(\s+Pro\s+Max|\s+Pro|\s+Plus)?\s*(\d{2,3}GB|1TB)?\s*([A-Za-zÀ-ÿ\- ]*)$/g)].pop();
    linhas.push({
      linha: linhas.length + 1,
      imei: im ? im.v : '',
      modelo: mm ? (mm[1] + (mm[2] || '')).replace(/\s+/g, ' ').trim() : '',
      cor: mm ? (mm[4] || '').trim() : '',
      servico: corpo.slice(im ? im.p + im.v.length : Math.max(0, e.p - 120), e.p)
                    .replace(/\b\d{14,17}\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 130),
      valor: parseFloat(e.v.replace(/\./g, '').replace(',', '.')),
    });
    pend = [];
  }
  return {
    fornecedor: 'RR', arquivo, nota_ref: path.basename(arquivo, '.pdf'),
    periodo: `${per[1]} a ${per[2]}`,
    data_fechamento: dia(per[2]), data_servico_padrao: dia(per[2]),
    total, desconto: 0, linhas,
  };
}

// ---------------------------------------------------------- parser da Access

/**
 * Texto do WhatsApp. Formato observado (agrupado por dia):
 *
 *   03/08 em diante
 *   04/08
 *   14 promax roxo face id + camera genuina 5129 R$620
 *   ...
 *   Total R$3.565,00
 *   Desconto Thiago R$265,00
 *
 * FRAGIL DE PROPOSITO: e texto humano e muda toda semana. A trava da soma e o
 * que impede uma mudanca de formato de virar dado errado -- se a Access mudar o
 * jeito de escrever, isto ABORTA em vez de gravar lixo.
 */
function parseAccess(txt, arquivo) {
  const linhas = [];
  let diaAtual = null, ano = null, total = null, desconto = 0;

  const cab = arquivo.match(/(\d{4})/);
  ano = cab ? cab[1] : String(new Date().getFullYear());

  for (const bruta of txt.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l) continue;

    const mDesc = l.match(/desconto[^\d]*R?\$?\s*([\d.]+,\d{2}|[\d.]+)/i);
    if (mDesc) { desconto = parseFloat(mDesc[1].replace(/\./g, '').replace(',', '.')); continue; }
    const mTot = l.match(/^total(?:\s+geral)?[^\d]*R?\$?\s*([\d.]+,\d{2}|[\d.]+)/i);
    if (mTot) { const v = parseFloat(mTot[1].replace(/\./g, '').replace(',', '.'));
                if (total === null || v > total) total = v; continue; }

    const mDia = l.match(/^(\d{2})\/(\d{2})(?:\s+em diante)?$/);
    if (mDia) { diaAtual = `${ano}-${mDia[2]}-${mDia[1]}`; continue; }
    if (/^\d{2}\/\d{2}\s+em diante/.test(l)) continue;

    // linha de servico: termina em "R$<valor>"
    const mVal = l.match(/R\$\s*([\d.]+(?:,\d{2})?)\s*$/);
    if (!mVal) continue;
    const valor = parseFloat(mVal[1].replace(/\./g, '').replace(',', '.'));
    let corpo = l.slice(0, mVal.index).trim();

    // codigo de 4 digitos (etiqueta ou fim de IMEI), com prefixo opcional
    const mCod = corpo.match(/\b([A-Za-z]{0,2})\s?(\d{4})\s*$/);
    let etiqueta = '', codigo = '';
    if (mCod) { etiqueta = (mCod[1] || '') + mCod[2]; codigo = mCod[2]; corpo = corpo.slice(0, mCod.index).trim(); }

    // lote sem aparelho ("6x sub bat 35"): sem codigo e com multiplicador
    const lote = !codigo && /^\d+\s*x\s/i.test(corpo);
    const mMod = corpo.match(/^(1[1-7]|SE)\s*(pro\s*max|promax|pro|plus)?\s*([a-zà-ÿ]+)?/i);

    linhas.push({
      linha: linhas.length + 1,
      imei: '', etiqueta, codigo,
      modelo: mMod ? modeloCanonico(mMod[1] + ' ' + (mMod[2] || '')) : '',
      cor: mMod && mMod[3] ? mMod[3] : '',
      servico: corpo.slice(0, 130), valor, lote,
      data_servico: diaAtual,
    });
  }
  if (total === null) throw new Error(`${arquivo}: nao achei a linha de Total`);
  return {
    fornecedor: 'ACCESS', arquivo, nota_ref: path.basename(arquivo, '.txt'),
    periodo: '', data_fechamento: linhas.length ? linhas[linhas.length - 1].data_servico : null,
    data_servico_padrao: null, total, desconto, linhas,
  };
}

// -------------------------------------------------------------- trava 1: nota

/**
 * A soma das linhas tem que bater com o total impresso. Aborta se nao bater --
 * gravar uma nota que nao fecha e pior que nao gravar nada.
 */
function travaNota(nota) {
  const soma = nota.linhas.reduce((a, l) => a + l.valor, 0);
  const alvo = nota.total + nota.desconto; // o Total costuma vir bruto
  const ok = Math.abs(soma - nota.total) < 0.01 || Math.abs(soma - alvo) < 0.01;
  if (!ok) {
    throw new Error(
      `${nota.arquivo}: TRAVA 1 -- a nota nao fecha.\n` +
      `  soma das ${nota.linhas.length} linhas: ${brl(soma)}\n` +
      `  total impresso:                        ${brl(nota.total)}` +
      (nota.desconto ? `  (+ desconto ${brl(nota.desconto)} = ${brl(alvo)})` : '') +
      `\n  diferenca: ${brl(Math.abs(soma - nota.total))}\n` +
      `  -> confira a nota: e comum ser IMEI com digito a mais/menos, ou linha nova.`
    );
  }
  // Rateio do desconto, proporcional ao valor de cada linha.
  // O arredondamento centavo a centavo nao fecha (R$ 2.399,99 em vez de 2.400,00),
  // entao a sobra vai toda pra maior linha -- assim a soma dos liquidos bate
  // exatamente com o que voce pagou, que e o que a trava 2 confere depois.
  for (const l of nota.linhas) {
    l.valor_bruto = l.valor;
    l.desconto_rateado = nota.desconto ? +(nota.desconto * (l.valor / soma)).toFixed(2) : 0;
    l.valor_liquido = +(l.valor_bruto - l.desconto_rateado).toFixed(2);
  }
  if (nota.desconto) {
    const alvoLiq = +(soma - nota.desconto).toFixed(2);
    const sobra = +(alvoLiq - nota.linhas.reduce((s, l) => s + l.valor_liquido, 0)).toFixed(2);
    if (sobra) {
      const maior = nota.linhas.reduce((a, b) => (b.valor_bruto > a.valor_bruto ? b : a));
      maior.valor_liquido = +(maior.valor_liquido + sobra).toFixed(2);
      maior.desconto_rateado = +(maior.valor_bruto - maior.valor_liquido).toFixed(2);
    }
  }
  return soma;
}

// -------------------------------------------------------------------- rede

async function sb(caminho, opts = {}) {
  if (!KEY) throw new Error('falta SUPABASE_SERVICE_ROLE_KEY no ambiente (export SUPABASE_SERVICE_ROLE_KEY=...)');
  const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`,
               'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/**
 * Estoque pra casar. Com --estoque <arquivo.json> le um retrato local em vez de
 * bater na rede: serve pra rodar sem a service_role em maquina que nao tem a
 * chave, e pra reproduzir uma importacao antiga com o estoque daquele dia.
 */
async function baixarEstoque(local) {
  if (local) return JSON.parse(fs.readFileSync(local, 'utf8'));
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const p = await sb(`estoque?select=id,titulo,serial,imei_1,valor_estoque,status,ultimo_fornecedor&order=id&offset=${de}&limit=1000`);
    todos.push(...p);
    if (p.length < 1000) break;
  }
  return todos;
}

const sqlLit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** Gera o INSERT em vez de gravar. Revisar SQL antes de rodar em producao. */
function emitirSql(linhas, saida) {
  const cols = ['fornecedor','nota_ref','linha','data_servico','data_fechamento','apple_id',
    'chave_usada','imei_nota','etiqueta_nota','modelo_nota','cor_nota','servico',
    'valor_bruto','desconto_rateado','valor_liquido','tipo','status','obs'];
  const sql = `insert into public.reparos (${cols.join(', ')}) values\n` +
    linhas.map((l) => '  (' + cols.map((c) => sqlLit(l[c] ?? null)).join(', ') + ')').join(',\n') +
    `\non conflict (fornecedor, nota_ref, linha) do update set\n` +
    cols.filter((c) => !['fornecedor','nota_ref','linha'].includes(c))
        .map((c) => `  ${c} = excluded.${c}`).join(',\n') +
    `,\n  atualizado_em = now();\n`;
  fs.writeFileSync(saida, sql);
  console.log(`SQL escrito em ${saida} (${linhas.length} linhas)`);
}

// ------------------------------------------------------------- casamento

/**
 * Cascata: IMEI completo > etiqueta > 4 ultimos do IMEI. A cor desempata.
 * Devolve {apple_id, chave, confianca, nota}. Nunca chuta: empate sem cor
 * resolvida sai como candidato nulo e a linha vai pra `revisar`.
 */
function casar(l, estoque, idx) {
  if (l.lote) return { apple_id: null, chave: null, obs: 'lote de bancada, sem aparelho' };

  if (l.imei) {
    const e = idx.porImei.get(soDigitos(l.imei));
    if (e) return { apple_id: e.id, chave: 'imei', obs: null };
    return { apple_id: null, chave: null,
             obs: `IMEI ${l.imei} (${l.imei.length} digitos) nao existe no estoque` };
  }

  const cod = l.codigo;
  if (!cod) return { apple_id: null, chave: null, obs: 'linha sem codigo' };

  const porEtq = idx.porEtiqueta.get(cod) || [];
  const porIm4 = (idx.porImei4.get(cod) || [])
    .filter((e) => !l.modelo || modeloCanonico(modeloDoTitulo(e.titulo)) === l.modelo);

  const cands = [...porEtq.map((e) => ({ e, chave: 'etiqueta' })),
                 ...porIm4.map((e) => ({ e, chave: 'imei4' }))]
    .filter((c, i, a) => a.findIndex((x) => x.e.id === c.e.id) === i);

  if (cands.length === 0) return { apple_id: null, chave: null, obs: `codigo ${cod} nao achado por etiqueta nem por IMEI` };
  if (cands.length === 1) {
    const c = cands[0];
    const okMod = !l.modelo || modeloCanonico(modeloDoTitulo(c.e.titulo)) === l.modelo;
    if (!okMod) return { apple_id: null, chave: null,
      obs: `codigo ${cod}: nota diz "${l.modelo} ${l.cor}", banco diz "${c.e.titulo}"` };
    return { apple_id: c.e.id, chave: c.chave, obs: null };
  }

  // empate: a cor decide
  const alvo = corCanonica(l.cor);
  const porCor = cands.filter((c) => alvo && corCanonica(c.e.titulo.replace(/^.*?(GB|TB)\s*/, '')) === alvo);
  if (porCor.length === 1) return { apple_id: porCor[0].e.id, chave: 'cor', obs: `desempate por cor (${alvo})` };

  return { apple_id: null, chave: null,
    obs: `codigo ${cod} ambiguo: ${cands.map((c) => `${c.e.id} ${c.e.titulo} [${c.chave}]`).join(' | ')}` };
}

function indexar(estoque) {
  const porImei = new Map(), porEtiqueta = new Map(), porImei4 = new Map();
  for (const e of estoque) {
    const im = soDigitos(e.imei_1);
    if (im) {
      porImei.set(im, e);
      const q = im.slice(-4);
      if (!porImei4.has(q)) porImei4.set(q, []);
      porImei4.get(q).push(e);
    }
    const dig = soDigitos(e.serial);
    if (dig) {
      if (!porEtiqueta.has(dig)) porEtiqueta.set(dig, []);
      porEtiqueta.get(dig).push(e);
    }
  }
  return { porImei, porEtiqueta, porImei4 };
}

// -------------------------------------------------------------------- CLI

function lerNota(arquivo) {
  const buf = fs.readFileSync(arquivo);
  const nota = arquivo.toLowerCase().endsWith('.pdf')
    ? parseRR(buf, arquivo)
    : parseAccess(buf.toString('utf8'), arquivo);
  travaNota(nota);
  return nota;
}

async function cmdLer(arqs) {
  let n = 0, v = 0;
  for (const a of arqs) {
    const nota = lerNota(a);
    console.log(`\n${nota.fornecedor}  ${path.basename(a)}  ${nota.periodo || ''}`);
    console.log(`  ${nota.linhas.length} linhas · bruto ${brl(nota.linhas.reduce((s, l) => s + l.valor_bruto, 0))}` +
                (nota.desconto ? ` · desconto ${brl(nota.desconto)}` : '') +
                ` · liquido ${brl(nota.linhas.reduce((s, l) => s + l.valor_liquido, 0))}   ✅ trava 1`);
    n += nota.linhas.length; v += nota.linhas.reduce((s, l) => s + l.valor_liquido, 0);
  }
  console.log(`\nTOTAL: ${n} linhas · ${brl(v)}`);
}

async function cmdImportar(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
  const estoqueLocal = opt('--estoque'), saidaSql = opt('--sql'), vendasLocal = opt('--vendas');
  const arqs = argv.filter((a, i) => !a.startsWith('--') && !['--estoque','--sql','--vendas'].includes(argv[i - 1]));

  const notas = arqs.map(lerNota);            // trava 1 antes de qualquer rede
  console.log(`✅ trava 1: ${notas.length} notas fecham com o total impresso`);

  const estoque = await baixarEstoque(estoqueLocal);
  const idx = indexar(estoque);
  console.log(`estoque: ${estoque.length} aparelhos`);

  const linhas = [];
  for (const nota of notas) {
    for (const l of nota.linhas) {
      const m = casar(l, estoque, idx);
      linhas.push({
        fornecedor: nota.fornecedor, nota_ref: nota.nota_ref, linha: l.linha,
        data_servico: l.data_servico || nota.data_servico_padrao || nota.data_fechamento,
        data_fechamento: nota.data_fechamento,
        apple_id: m.apple_id, chave_usada: m.chave,
        imei_nota: l.imei || null, etiqueta_nota: l.etiqueta || null,
        modelo_nota: l.modelo || null, cor_nota: l.cor || null,
        servico: l.servico, valor_bruto: l.valor_bruto,
        desconto_rateado: l.desconto_rateado, valor_liquido: l.valor_liquido,
        status: m.apple_id ? 'confirmado' : 'revisar',
        obs: [nota.periodo && `periodo ${nota.periodo}`, m.obs].filter(Boolean).join(' · ') || null,
      });
    }
  }

  // tipo: reparo antes da venda = recondicionamento; depois = garantia
  const ids = [...new Set(linhas.map((l) => l.apple_id).filter(Boolean))];
  const vendas = new Map();
  if (vendasLocal) {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(vendasLocal, 'utf8')))) vendas.set(+k, v);
  } else for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const vp = await sb(`venda_produtos?select=apple_id,vendas!inner(data_saida,status)` +
                        `&apple_id=in.(${lote.join(',')})&vendas.status=eq.completed`);
    for (const r of vp) {
      const d = r.vendas && r.vendas.data_saida;
      if (d && (!vendas.has(r.apple_id) || d > vendas.get(r.apple_id))) vendas.set(r.apple_id, d);
    }
  }
  for (const l of linhas) {
    if (!l.apple_id) { l.tipo = 'indefinido'; continue; }
    const dv = vendas.get(l.apple_id);
    l.tipo = !dv ? 'recondicionamento'
           : dv.slice(0, 10) > l.data_servico ? 'recondicionamento' : 'garantia';
  }

  if (saidaSql) emitirSql(linhas, saidaSql);
  else for (let i = 0; i < linhas.length; i += 200) {
    await sb('reparos?on_conflict=fornecedor,nota_ref,linha', {
      method: 'POST', body: JSON.stringify(linhas.slice(i, i + 200)),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  const ok = linhas.filter((l) => l.status === 'confirmado');
  const rev = linhas.filter((l) => l.status === 'revisar');
  const val = (a) => a.reduce((s, l) => s + l.valor_liquido, 0);
  console.log(`\ngravadas ${linhas.length} linhas · ${brl(val(linhas))}`);
  console.log(`  casadas:  ${ok.length} (${(100 * ok.length / linhas.length).toFixed(1)}%) · ${brl(val(ok))}`);
  console.log(`  revisar:  ${rev.length} · ${brl(val(rev))}`);
  const porTipo = {};
  for (const l of ok) porTipo[l.tipo] = (porTipo[l.tipo] || 0) + l.valor_liquido;
  for (const [t, v] of Object.entries(porTipo))
    console.log(`  ${t}: ${brl(v)} (${(100 * v / val(ok)).toFixed(1)}%)`);
  if (rev.length) console.log(`\n-> node scripts/reparos.js revisar`);
}

async function cmdRevisar() {
  const rs = await sb('reparos?status=eq.revisar&select=*&order=data_servico,linha');
  if (!rs.length) return console.log('nada pra revisar 🎉');
  console.log(`${rs.length} linhas em revisao · ${brl(rs.reduce((s, r) => s + +r.valor_liquido, 0))}\n`);
  for (const r of rs) {
    console.log(`${r.fornecedor} ${r.nota_ref} #${r.linha}  ${r.data_servico}  ${brl(+r.valor_liquido)}`);
    console.log(`  nota diz: ${[r.modelo_nota, r.cor_nota, r.etiqueta_nota || r.imei_nota].filter(Boolean).join(' · ')} | ${r.servico}`);
    console.log(`  motivo:   ${r.obs || '-'}\n`);
  }
  console.log('Pra resolver, descubra o aparelho e rode no Supabase:');
  console.log("  update reparos set apple_id=<id>, chave_usada='manual', status='confirmado' where id=<id_do_reparo>;");
}

async function cmdConciliar(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('uso: conciliar YYYY-MM');
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const rep = await sb(`reparos?data_servico=gte.${mes}-01&data_servico=lt.${fim}&select=valor_liquido,status`);
  const cus = await sb(`custos?data=gte.${mes}-01&data=lt.${fim}&area=eq.assistencia&select=valor,descricao`);
  const vr = rep.reduce((s, r) => s + +r.valor_liquido, 0);
  const vc = cus.reduce((s, c) => s + +c.valor, 0);
  console.log(`${mes}\n  reparos importados: ${brl(vr)} (${rep.length} linhas)`);
  console.log(`  custos/assistencia: ${brl(vc)} (${cus.length} lancamentos)`);
  const d = vr - vc;
  if (Math.abs(d) < 0.01) console.log('  ✅ TRAVA 2: o mes fecha');
  else console.log(`  ⚠️  TRAVA 2: diferenca de ${brl(Math.abs(d))} — ` +
    (d < 0 ? 'tem nota nao importada' : 'tem reparo sem lancamento em custos') +
    `\n     (a RR nao datu servico por linha: nota que atravessa o mes cai toda no mes do fechamento)`);
}

// --------------------------------------------------------------------- main

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'ler') await cmdLer(args);
    else if (cmd === 'importar') await cmdImportar(args);
    else if (cmd === 'revisar') await cmdRevisar();
    else if (cmd === 'conciliar') await cmdConciliar(args[0]);
    else {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('\n')
        .filter((l) => l.includes('node scripts/reparos.js')).join('\n') || 'comandos: ler | importar | revisar | conciliar');
      process.exit(1);
    }
  } catch (e) { console.error('\n✖ ' + e.message); process.exit(1); }
})();
