#!/usr/bin/env node
/**
 * Cria o LOGIN de um colaborador: usuario no Supabase Auth + linha em `perfis`.
 *
 * POR QUE EXISTE: em 26/ago/2026 a tabela `perfis` tinha 7 linhas -- Vitinho
 * (bancada), David/Isa/Mel/Maria (comercial) e os dois socios. Dos SEIS com
 * `atKey` no cadastro, so dois conseguiam abrir a propria comissao. Leo, Gabi e
 * Davi -- que sao exatamente quem ganha os 25% do lucro de acessorio -- nao
 * tinham como conferir o proprio numero. O §14 de
 * docs/funcoes/atendente-de-vendas.md diz na cara que "os atendentes trabalham
 * com comissao"; comissao que a pessoa nao consegue conferir vira desconfianca.
 *
 * A tela "Meu dia" ja existia e ja vem da CHAVE (`at_key`), nao do papel --
 * faltava so o perfil. Este script e o que faltava.
 *
 * ⚠️ PRECISA DA service_role (cria usuario no Auth). Do AMBIENTE, nunca do repo:
 *   export SUPABASE_SERVICE_ROLE_KEY=...
 *
 * USO:
 *   node scripts/criar-perfil.js listar
 *   node scripts/criar-perfil.js criar <id-do-FUNC> [--email x@y.com] [--seco]
 *   node scripts/criar-perfil.js criar leo gabi davi          # varios de uma vez
 *
 * O `id-do-FUNC` e a chave de js/config.js (leo, gabi, davi, anne...). Papel,
 * chaves e e-mail saem DALI -- este script nao tem uma segunda tabela de gente,
 * que e o erro que ja custou R$1.000 na folha de jul/2026.
 *
 * A senha e gerada aqui e impressa UMA vez. O colaborador troca no primeiro
 * acesso; nada e gravado em arquivo.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SB_URL = 'https://pfsfsibgmtbifypuyyqf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------- cadastro
// FUNC/AT_KEYS/VO_KEYS vem dos js/ REAIS. Sem copia: o cadastro e um so.
function carregarCadastro() {
  const ROOT = path.join(__dirname, '..');
  const ctx = { console, Date, Math, JSON, Set, Map, Object, Array, String, Number,
                parseFloat, parseInt, isNaN, RegExp, Error, Promise, setTimeout,
                document: { getElementById: () => null, querySelectorAll: () => [] },
                // config.js chama supabase.createClient na carga -- o mesmo stub
                // que os test/*.js usam. Aqui nao ha browser nem sessao.
                window: { supabase: { createClient: () => ({ auth: {} }) },
                          matchMedia: () => ({ matches: false }) },
                localStorage: { getItem: () => null, setItem() {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['config.js', 'core.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
  return {
    FUNC: vm.runInContext('FUNC', ctx),
    AT_KEYS: vm.runInContext('AT_KEYS', ctx),
    VO_KEYS: vm.runInContext('VO_KEYS', ctx),
    // ⚠️ 'YYYY-MM', nao 'YYYY-MM-DD': _refAnoMes() so aceita o mes e devolve
    // null pro resto -- e `null >= '2026-08'` e false, o que faria o Denilson
    // (saiuEm 2026-08) aparecer como se estivesse na equipe.
    saiu: (f) => vm.runInContext('saiuDaEquipe', ctx)(f, new Date().toISOString().slice(0, 7)),
  };
}

// Papel do painel a partir do cadastro. Hoje so ha um caminho: quem tem chave
// (vo ou at) e `comercial`. `bancada` e `socio` sao decisao do dono, nao
// derivacao -- por isso este script recusa criar os dois (ver `criar`).
function papelDe(f, cad) {
  const temVo = f.voKey && cad.VO_KEYS.includes(f.voKey);
  const temAt = f.atKey && cad.AT_KEYS.includes(f.atKey);
  return (temVo || temAt) ? 'comercial' : null;
}

// ---------------------------------------------------------------------- rede

async function api(caminho, opts = {}) {
  if (!KEY) throw new Error('falta SUPABASE_SERVICE_ROLE_KEY no ambiente (export SUPABASE_SERVICE_ROLE_KEY=...)');
  const r = await fetch(`${SB_URL}${caminho}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`,
               'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

const perfis = () => api('/rest/v1/perfis?select=user_id,email,nome,papel,vo_key,at_key,ativo&order=nome');

// Procura o usuario no Auth pelo e-mail (pode ja existir de uma tentativa
// anterior -- criar de novo devolveria 422 e o script pararia no meio).
async function acharUsuario(email) {
  const r = await api(`/auth/v1/admin/users?page=1&per_page=200`);
  const lista = (r && r.users) || [];
  return lista.find(u => String(u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function criarUsuario(email, senha) {
  return api('/auth/v1/admin/users', {
    method: 'POST',
    // email_confirm: o painel nao tem fluxo de confirmacao por e-mail; sem isso
    // a pessoa cria a conta e nao consegue entrar.
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });
}

// Senha legivel de ditar por WhatsApp: sem 0/O/1/l, que geram ligacao de volta.
function senhaNova() {
  const abc = 'abcdefghjkmnpqrstuvwxyz';
  const num = '23456789';
  const pick = (s) => s[crypto.randomInt(s.length)];
  return Array.from({ length: 6 }, () => pick(abc)).join('')
       + '-' + Array.from({ length: 4 }, () => pick(num)).join('');
}

// -------------------------------------------------------------------- acoes

async function listar() {
  const cad = carregarCadastro();
  const linhas = await perfis();
  const porChave = {};
  linhas.forEach(p => { if (p.vo_key) porChave[p.vo_key] = p; if (p.at_key) porChave[p.at_key] = p; });

  console.log('\nquem tem login hoje\n');
  linhas.forEach(p => console.log(`  ${(p.nome || '—').padEnd(12)} ${String(p.papel).padEnd(10)}` +
    ` vo=${(p.vo_key || '—').padEnd(8)} at=${(p.at_key || '—').padEnd(9)} ${p.ativo ? '' : '(inativo)'}`));

  const faltando = cad.FUNC.filter(f => !cad.saiu(f)).filter(f => papelDe(f, cad))
    .filter(f => !(f.voKey && porChave[f.voKey]) && !(f.atKey && porChave[f.atKey]));

  console.log('\nna equipe e SEM login\n');
  if (!faltando.length) console.log('  (ninguem)');
  faltando.forEach(f => console.log(`  ${f.ap.padEnd(12)} ${String(f.cargo).padEnd(24)}` +
    ` ${f.email || '⚠️ sem e-mail no FUNC'}`));
  console.log('');
}

async function criar(ids, opts) {
  const cad = carregarCadastro();
  const jaTem = await perfis();

  for (const id of ids) {
    const f = cad.FUNC.find(x => x.id === id);
    if (!f) { console.log(`  ⚠️  ${id}: não existe no FUNC (js/config.js)`); continue; }
    if (cad.saiu(f)) { console.log(`  ⚠️  ${id}: está marcado como "(saiu)" no cadastro`); continue; }

    const papel = papelDe(f, cad);
    if (!papel) {
      console.log(`  ⚠️  ${id}: sem voKey/atKey oficial — papel 'bancada' e 'socio' são decisão sua,`);
      console.log('       não derivo daqui. Crie pelo painel do Supabase e insira em `perfis` à mão.');
      continue;
    }

    const email = (opts.email || f.email || '').trim().toLowerCase();
    if (!email) { console.log(`  ⚠️  ${id}: sem e-mail no FUNC — use --email`); continue; }

    const dup = jaTem.find(p => (f.voKey && p.vo_key === f.voKey) || (f.atKey && p.at_key === f.atKey));
    if (dup) { console.log(`  ·   ${f.ap}: já tem login (${dup.email || dup.user_id})`); continue; }

    const senha = senhaNova();
    console.log(`\n  ${f.ap} → papel '${papel}', vo=${f.voKey || '—'}, at=${f.atKey || '—'}, ${email}`);
    if (opts.seco) { console.log('      (--seco: não gravei nada)'); continue; }

    let user = await acharUsuario(email);
    if (user) console.log('      usuário já existia no Auth, reaproveitando');
    else { user = await criarUsuario(email, senha); console.log(`      senha: ${senha}`); }

    await api('/rest/v1/perfis', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id, email, nome: f.ap, papel,
        vo_key: f.voKey || null, at_key: f.atKey || null, ativo: true,
      }),
    });
    console.log('      ✅ perfil criado — ele já abre "Meu dia", Vitrine e Tabela de preços');
  }
  console.log('\n  A senha aparece UMA vez. Se perder, gere outra pelo painel do Supabase.\n');
}

// ---------------------------------------------------------------------- main

(async () => {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const opts = { seco: args.includes('--seco'), email: null };
  const iE = args.indexOf('--email');
  if (iE >= 0) opts.email = args[iE + 1];
  const ids = args.slice(1).filter(a => !a.startsWith('--') && a !== opts.email);

  try {
    if (cmd === 'listar') await listar();
    else if (cmd === 'criar' && ids.length) await criar(ids, opts);
    else {
      console.log('uso:\n  node scripts/criar-perfil.js listar' +
                  '\n  node scripts/criar-perfil.js criar leo gabi davi [--seco]\n');
      process.exit(1);
    }
  } catch (e) {
    console.error('\n✗ ' + e.message + '\n');
    process.exit(1);
  }
})();
