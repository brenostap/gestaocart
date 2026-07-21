const BASE='https://pfsfsibgmtbifypuyyqf.supabase.co/functions/v1/fn'; // proxy Edge Function: a chave FoneNinja fica no servidor
const LOGO_PHONECART_FULL='img/phonecart-full.png';
const LOGO_PHONECART_ICON='img/phonecart-icon.png';
const LOGO_URBAN_FULL='img/urban-full.png';
const LOGO_URBAN_ICON='img/urban-icon.png';
const SB_URL='https://pfsfsibgmtbifypuyyqf.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmc2ZzaWJnbXRiaWZ5cHV5eXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjM1ODYsImV4cCI6MjA5MDE5OTU4Nn0.aqjTi0c61lrkk2McawBCatyJDT6SLOB4SccyFLHry2g';
let USE_SUPABASE=true; // usa Supabase como fonte principal
// Supabase Auth: cliente + token da sessão. SB_TOKEN começa como anon e vira o
// access_token do usuário após o login (é ele que faz o RLS ver role=authenticated).
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, autoRefreshToken:true } });
let SB_TOKEN = SB_KEY;
let allVendas=[],allMovs=[],estoqueItens=[],ajustesAcessorios=[];
let currentStore='ambas',currentTab='dash',currentPeriod='mes';
// Estado do Estoque v3
let estoqueViewV3 = 'agrupado';       // 'agrupado' | 'lista'
let estoqueGeracao = 'todas';         // filtro por geracao de iPhone (17, 16, 15...)
let estoqueOrigem  = 'todas';         // 'Entrada (cliente)' ou nome do fornecedor
let estoqueModelo  = 'todos';         // modelo completo: "iPhone 13 Pro Max"
let estoqueCap     = 'todas';         // 128GB, 256GB...
let estoqueSearchV3 = '';
let estoqueColorOpen = null;          // 'modelo__cap__cor' atualmente expandida (vista Agrupada)
let estoqueSkuOpen = new Set();       // SKUs expandidas na vista Lista (multi)
let estoqueWaModalState = { open:false, template:'A', scope:'todos' };
let movsView='compras',movsSearchStr='',movsCache={},movsFilterTipo='todos';
let customDateStart='',customDateEnd='';
let vendasSearch='',vendasLoja='todas',vendasVendedor='todos',vendasAtendente='todos',vendasProduto='',vendasSortCol='',vendasSortDir=1;

const FUNC=[
  {id:'david',  ap:'David',   nome:'Davi da Silva Ramos',         cargo:'Vendedor',          pix:'(11) 98288-1180',          tipo:'online',    email:'',                                   voKey:'david'  },
  {id:'isa',    ap:'Isa',     nome:'Isabella de Almeida Teixeira',cargo:'Vendedora',          pix:'(11) 97710-4588',          tipo:'online',    email:'contatoisabelladealmeida@gmail.com',  voKey:'isa'    },
  {id:'mel',    ap:'Mel',     nome:'Melissa',                     cargo:'Vendedora',          pix:'11947154518',              tipo:'online',    email:'melfiengo@gmail.com',                 voKey:'mel'    },
  {id:'vitinho',ap:'Vitinho', nome:'Vitor Lima',                  cargo:'Atendente',          pix:'(11) 95836-7649',          tipo:'presencial',email:'vitorgsc31@gmail.com',                atKey:'vitinho'},
  {id:'davi',   ap:'Davi',    nome:'Davi Pacheco da Silva',        cargo:'Atendente',          pix:'(11) 95774-6749',          tipo:'presencial',email:'',                                   atKey:'davi'   },
  {id:'anne',   ap:'Anne',    nome:'Alauany Ramos de Campos',     cargo:'Atendente',          pix:'(11) 95143-9933',          tipo:'presencial',email:'alauanyramosdecampos@gmail.com',     atKey:'anne',  bonus:true},
  {id:'pietra', ap:'Pietra',  nome:'Pietra Castro',               cargo:'Atendente / Gerente',pix:'pietracassttro@gmail.com', tipo:'presencial',email:'pietraurban@gmail.com',              atKey:'pietra', voKey:'pietra' },
  {id:'denilson',ap:'Denilson',nome:'Denilson Henrique Campos',   cargo:'Atendente',          pix:'47362104863',              tipo:'presencial',email:'denilson.h.c2708@gmail.com',         atKey:'denilson'},
  {id:'leo',    ap:'Leo',     nome:'Leo',                         cargo:'Atendente',          pix:'',                         tipo:'presencial',email:'',                                   atKey:'leo'    },
  {id:'maria',  ap:'Maria',   nome:'Maria',                       cargo:'SAC / Vendedora',    pix:'',                         tipo:'online',    email:'',                                   atKey:'maria', voKey:'maria' },
  {id:'luana',  ap:'Luana',   nome:'Luana',                       cargo:'Atendente (saiu)',   pix:'',                         tipo:'presencial',email:'',                                   atKey:'luana'  },
  {id:'gustavo',   ap:'Gustavo',   nome:'Gustavo',   cargo:'Vendedor / Sócio',  pix:'', tipo:'online', email:'', voKey:'gustavo'},
  {id:'marcella',  ap:'Marcella',  nome:'Marcella',  cargo:'Sócia',             pix:'', tipo:'socio',  email:''},
];
const COLORS=['#1d4ed8','#0f766e','#7c3aed','#b45309','#be123c','#0369a1','#15803d','#9333ea','#0e7490','#166534'];

