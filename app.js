// Programação de Atividades (turnos diurno e noturno) — Obra 4107 Rooftop Iguatemi SP
// Front-end estático + Firebase (Authentication e Firestore).
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, setDoc, updateDoc, getDocs, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ================= constantes ================= */
const STATUS = {
  programada:   {label:'Programada',   c:'--st-prog', aberta:true},
  andamento:    {label:'Em andamento', c:'--st-and',  aberta:true},
  parcial:      {label:'Parcial',      c:'--st-parc', aberta:true,  obs:true, pct:true},
  nao_iniciada: {label:'Não iniciada', c:'--st-nao',  aberta:true,  obs:true, motivo:true},
  impedida:     {label:'Impedida',     c:'--st-imp',  aberta:true,  obs:true, motivo:true},
  concluida:    {label:'Concluída',    c:'--st-ok',   aberta:false},
  cancelada:    {label:'Cancelada',    c:'--st-canc', aberta:false, obs:true},
};
const ORDER = ['programada','andamento','parcial','nao_iniciada','impedida','concluida','cancelada'];
const PLURAL = {programada:'programadas', andamento:'em andamento', parcial:'parciais', nao_iniciada:'não iniciadas', impedida:'impedidas', concluida:'concluídas', cancelada:'canceladas'};
const stN = (k, n) => n === 1 ? STATUS[k].label.toLowerCase() : PLURAL[k];
const MOTIVOS = ['Equipe não compareceu','Efetivo insuficiente','Falta de material','Falta de equipamento','Frente não liberada','Liberação do shopping / cliente','PT / liberação de segurança não emitida','Interferência com outra equipe','Serviço antecessor não concluído','Chuva / condição climática','Outro'];
const PRIOR = {normal:'Normal', alta:'Alta', critica:'Crítica'};
const FUNCOES = ['Coordenador','Residente','Engenheiro','Encarregado','Mestre de obras','Técnico de segurança','Planejamento','Outro'];
const PAPEIS = {pendente:'Aguardando aprovação', visualizador:'Visualizador', usuario:'Usuário', admin:'Administrador', bloqueado:'Bloqueado'};
const FIELDS = {noite:'Início',fim:'Término',avanco:'Avanço',etiquetas:'Etiquetas',turno:'Turno',tipoLocal:'Tipo de local',setor:'Setor',nivel:'Nível',eixo:'Eixo / complemento',pilar:'Pilar',pilarLoja:'Loja / ambiente do pilar',local:'Local do shopping',titulo:'Atividade',detalhes:'Detalhes',fornecedor:'Fornecedor',responsavel:'Responsável no turno',efetivo:'Efetivo previsto',prioridade:'Prioridade'};
const TIPO_LABEL = {setor:'Setor', pilar:'Pilar', shopping:'Shopping'};
const TURNOS = {diurno:'Diurno', noturno:'Noturno'};
const turnoOf = a => a.turno === 'diurno' ? 'diurno' : 'noturno'; // atividades antigas, sem turno, contam como noturnas
const fimOf = a => (a.fim && a.fim >= a.noite) ? a.fim : a.noite;          // término (sem término = mesmo dia do início)
// avanço > 0 em atividade Programada ou Não iniciada passa automaticamente para Em andamento
const autoAnd = (st, av) => Number(av) > 0 && (st === 'programada' || st === 'nao_iniciada');
const avOf = a => a.status === 'concluida' ? 100 : Math.max(0, Math.min(100, Number(a.avanco) || (a.status === 'parcial' ? Number(a.pct) || 0 : 0)));
const progBar = p => `<span class="prog" role="img" aria-label="Avanço ${p}%"><i style="width:${p}%"></i></span><b class="prog-n">${p}%</b>`;
const ICON_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const turnoTag = t => `<span class="turno ${t}">${t === 'diurno' ? ICON_SOL : ICON_LUA}${TURNOS[t]}</span>`;

// Etiquetas: ligam atividades de um mesmo serviço macro (ex.: "Demolição alvenaria eixo 8"), como no Todoist.
const ICON_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>';
const TAG_CORES = ['#f69321','#55b8de','#5cc58c','#d9b650','#b48ae0','#e8835f','#4fc3b5','#e07ab8','#8ea9d4','#c9a27e'];
const MAX_TAGS = 10;
const normTag = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
const tagKey = s => normTag(s).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tagCor = s => { let h = 7; for (const ch of tagKey(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TAG_CORES[h % TAG_CORES.length]; };
const tagsOf = a => Array.isArray(a?.etiquetas) ? a.etiquetas.filter(Boolean) : [];
const hasTag = (a, t) => { const k = tagKey(t); return tagsOf(a).some(x => tagKey(x) === k); };
const tagChip = (t, cls = '') => `<span class="etq ${cls}" style="--tc:${tagCor(t)}">${ICON_TAG}<span>${esc(t)}</span></span>`;
const tagBtn = t => `<button type="button" class="etq" data-etq="${esc(t)}" style="--tc:${tagCor(t)}">${ICON_TAG}<span>${esc(t)}</span></button>`;

// Lista inicial da obra (carregada pelo administrador na aba Cadastros quando o banco está vazio).
// Fontes: planilha de trabalhos executados 06–12/07/2026, cronograma de metálica e controle de efetivo.
const SEED = {
  fornecedores: [
    ['AR Sistemas','Climatização e água gelada'],['CAF','Apoio geral'],['Cia Real','Tela fachadeira e estrutura de sustentação'],['CJF',''],
    ['CRD Engenharia','Recomposição de fachada'],['Diniz','Retirada de entulho e organização'],['Divimatos',''],['Gell','Elétrica'],
    ['GN','Proteções, andaimes e apoio'],['Gordinho Pinturas','Pintura'],['Gruas Copa',''],['IDEA','Forro de gesso'],
    ['Intensione Lycra','Forro Lycra'],['Joadri','Hidráulica'],['Lara Engenharia','Elétrica / desvio de rede'],['Lona Branca','Cobertura provisória'],
    ['Metal Box','Estrutura auxiliar e remoção metálica'],['Noroeste','Estrutura metálica'],['Novais Santos Engenharia','Cabeamento de alarme'],
    ['Novata','Armação, formas e steel deck'],['R E Móveis',''],['R66','Apoio ao trânsito'],['SAENG','Própria – civil, acabamento e apoio'],
    ['Santos Filho Demolidora','Demolição'],['Simbratec',''],['Tapayuna Madeira','Fornecimento de madeira'],['Tecnovaz',''],['Zanela','Estrutura metálica'],
  ].map(([nome,disciplina]) => ({nome, disciplina})),
  setores: [
    ['A','Entry Tower / Valet'],['B','Restaurante 2/3 e cobertura do Café'],['C','Restaurante 5, WC e Apartamento/Cubo'],
    ['D1','Lojas 1, 2 e 7, Bar 2, Terraço Rest. 3 e Lobby NK'],['D2','View Bar e Café Dama'],['E1','Golden Box e Loja 6'],
    ['E2','Restaurante 4'],['F','Restaurantes 1, 2 e 3'],['G1','Esplanada e Lojas 4 e 5'],['G2','Passarela Cinema'],
  ].map(([codigo,descricao]) => ({codigo, descricao})),
  niveis: ['94,00','97,75','98,00','108,86','110,00','110,65','114,20','114,30','114,65','115,00','119,00','120,00','123,00','124,00'],
  pilares: [
    ['P19','N/12','Sanitário Masculino'],['P20','N/11','Sanitário Feminino / Loja Brookfield'],['P33','M/12','Cia. Marítima'],['P34','M/11','A. Niemeyer'],
  ].map(([codigo,eixo,referencia]) => ({codigo, eixo, referencia})),
  locais: ['Mall – Escadas Centrais','Mall – Corredores / forro','Estacionamento 6º pavimento','Estacionamento 7º pavimento','Estacionamento 8º pavimento','CAG 2','Rua da Servidão','Almoxarifado Rooftop','Canteiro (geral)','BDLN','Depósito Chanel','Loja A. Niemeyer','Loja Brookfield',"Loja Tod's",'Loja Zara Home'],
};

/* ================= datas ================= */
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1); };
const addDays = (s,n) => { const d = parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); };
const defaultNight = () => { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate()-1); return ymd(d); }; // até 6h ainda conta o turno noturno do dia anterior
const DOW = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const fmtShort = s => { if (!s) return ''; const d = parseYmd(s); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; };
const fmtNightLong = s => { const d = parseYmd(s), e = parseYmd(addDays(s,1)); return `De ${DOW[d.getDay()]} ${fmtShort(s)} para ${DOW[e.getDay()]} ${fmtShort(addDays(s,1))}`; };
const fmtDay = s => { const d = parseYmd(s); return `${DOW[d.getDay()][0].toUpperCase()}${DOW[d.getDay()].slice(1)}, ${fmtShort(s)}`; };
const durOf = a => Math.round((parseYmd(fimOf(a)) - parseYmd(a.noite)) / 86400000);
const fmtPeriodo = a => fimOf(a) === a.noite ? fmtShort(a.noite) : `${fmtShort(a.noite)} → ${fmtShort(fimOf(a))}`;
const fmtWhen = (s, t) => t === 'diurno' ? `${fmtDay(s)} · turno diurno` : `${fmtNightLong(s)} · turno noturno`;
const toDate = v => !v ? new Date() : typeof v.toDate === 'function' ? v.toDate() : typeof v.seconds === 'number' ? new Date(v.seconds*1000) : new Date(v);
const fmtTs = v => { const d = toDate(v); return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtHM = v => { const d = toDate(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nightsBetween = (a,b) => Math.round((parseYmd(b)-parseYmd(a))/86400000);

/* ================= util ================= */
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cvar = k => `var(${STATUS[k]?.c || '--faint'})`;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 4000); }
const SNAP = {serverTimestamps:'estimate'};

/* ================= firebase ================= */
const configOk = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('COLE');
let app, auth, db;
if (configOk){
  app = initializeApp(firebaseConfig);
  auth = getAuth(app); auth.languageCode = 'pt';
  try { db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}); }
  catch { db = initializeFirestore(app, {}); }
}

/* ================= estado ================= */
const S = {
  uid:null, email:'', perfil:null, started:false, unsubs:[], unsubWin:null, unsubDw:null, unsubDwHist:null,
  usuarios:{}, cad:{fornecedores:[],setores:[],niveis:[],pilares:[],locais:[]}, cadLoaded:false,
  win:new Map(), open:new Map(), extra:new Map(), tagged:new Map(), feed:[], dwHist:[], etq:null,
  noite:defaultNight(), winFrom:addDays(defaultNight(), -35), tab:'noite', gt:{zoom:'qui', grp:'local', conc:true, ref:defaultNight(), jump:true},
  f:{q:'',tipo:[],loc:[],forn:[],status:[],turno:'',etq:[],autor:[]}, cadSub:null, cadDel:null, openId:null, dwMode:null,
};
const isAdmin = () => S.perfil?.papel === 'admin';
const canWrite = () => ['usuario','admin'].includes(S.perfil?.papel);
const canRead = () => ['visualizador','usuario','admin'].includes(S.perfil?.papel);
function all(){ const m = new Map(S.tagged); for (const [k,v] of S.extra) m.set(k,v); for (const [k,v] of S.win) m.set(k,v); for (const [k,v] of S.open) m.set(k,v); return m; }
// catálogo de etiquetas: tudo o que já foi usado nas atividades (as etiquetadas são carregadas inteiras, de qualquer data)
function tagCatalog(){
  const m = new Map();
  for (const a of all().values()) for (const t of tagsOf(a)){
    const k = tagKey(t); if (!k) continue;
    if (!m.has(k)) m.set(k, {k, nome:normTag(t), acts:[]});
    m.get(k).acts.push(a);
  }
  for (const x of m.values()){
    const val = x.acts.filter(a => a.status !== 'cancelada');
    x.n = x.acts.length; x.abertas = x.acts.filter(a => a.aberta).length; x.conc = x.acts.filter(a => a.status === 'concluida').length;
    x.av = val.length ? Math.round(val.reduce((s, a) => s + avOf(a), 0) / val.length) : 0;
    x.ini = x.acts.reduce((v, a) => !v || a.noite < v ? a.noite : v, ''); x.fim = x.acts.reduce((v, a) => fimOf(a) > v ? fimOf(a) : v, '');
    x.ult = Math.max(...x.acts.map(a => toDate(a.atualizadoEm).getTime()));
  }
  return m;
}
const nameOf = u => !u ? 'Sem identificação' : (S.usuarios[u]?.nome || (u === S.uid && S.perfil?.nome) || 'Usuário');
const roleOf = u => S.usuarios[u]?.funcao || '';

// Pilar: o mesmo pilar pode estar em lojas diferentes conforme o piso, por isso a loja/ambiente é um campo próprio
const pilarCodeOf = a => pilarCode(a.pilar) || String(a.pilar || '').trim();
const pilarLojaOf = a => {
  if (a.pilarLoja) return a.pilarLoja;
  const resto = String(a.pilar || '').replace(/^\s*P\s*\d+\s*[-–—:|·]*\s*/i, '').trim(); // lançamentos antigos "P34 - Loja X"
  if (resto) return resto;
  const cad = S.cad.pilares.filter(x => (pilarCode(x.codigo) || x.codigo) === pilarCodeOf(a));
  return cad.length === 1 ? (cad[0].referencia || '') : '';
};
const pilarEixoOf = code => (S.cad.pilares.find(x => (pilarCode(x.codigo) || x.codigo) === code && x.eixo) || {}).eixo || '';
function localLine(a){
  const parts = [];
  if (a.tipoLocal === 'setor') parts.push(`Setor ${a.setor||'?'}`);
  else if (a.tipoLocal === 'pilar'){ const c = pilarCodeOf(a) || '?', e = pilarEixoOf(c), l = pilarLojaOf(a); parts.push(`Pilar ${c}${e ? ' (' + e + ')' : ''}`); if (l) parts.push(l); }
  else parts.push(a.local || 'Shopping');
  if (a.nivel) parts.push(`Nív. ${a.nivel}`);
  if (a.eixo) parts.push(a.tipoLocal === 'shopping' ? a.eixo : `Eixo ${a.eixo}`);
  return parts.join(' · ');
}
function groupKey(a){
  if (a.tipoLocal === 'setor') return {k:'s:'+(a.setor||'?'), label:`Setor ${a.setor||'?'}`, sub:(S.cad.setores.find(x => x.codigo === a.setor)||{}).descricao||''};
  if (a.tipoLocal === 'pilar'){
    // cada pilar é um grupo próprio, dentro do grupo pai "Pilares"
    const code = pilarCode(a.pilar) || String(a.pilar || '?').trim() || '?';
    const cad = S.cad.pilares.find(x => (pilarCode(x.codigo) || x.codigo) === code);
    const resto = String(a.pilar || '').replace(/^\s*P\s*\d+\s*[-–—:|·]*\s*/i, '').trim();
    const lojas = [...new Set(S.cad.pilares.filter(x => (pilarCode(x.codigo) || x.codigo) === code).map(x => x.referencia).filter(Boolean))];
    return {k:'p:'+code, label:`Pilar ${code}`, sub: [cad?.eixo, lojas.length === 1 ? lojas[0] : lojas.length > 1 ? `${lojas.length} lojas` : resto].filter(Boolean).join(' · '), parent:'Pilares'};
  }
  return {k:'z:'+(a.local||''), label:'Shopping', sub:a.local||''};
}
function groupRank(k){
  if (k.startsWith('s:')){ const i = S.cad.setores.findIndex(x => 's:'+x.codigo === k); return i < 0 ? 500 : i; }
  if (k.startsWith('p:')) return 1000 + (parseInt(k.replace(/\D/g, '')) || 999) / 1000;
  return 2000;
}

/* ================= acesso ================= */
const AUTH_ERR = {
  'auth/invalid-email':'E-mail inválido.', 'auth/missing-password':'Informe a senha.', 'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
  'auth/email-already-in-use':'Já existe uma conta com este e-mail. Use “Entrar”.', 'auth/invalid-credential':'E-mail ou senha incorretos.',
  'auth/wrong-password':'E-mail ou senha incorretos.', 'auth/user-not-found':'E-mail ou senha incorretos.', 'auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed':'Sem conexão com a internet.', 'auth/user-disabled':'Esta conta foi desativada.',
};
const authMsg = e => AUTH_ERR[e?.code] || 'Não foi possível concluir. Tente de novo.';

function showGate(html){ $('app').hidden = true; $('gate').hidden = false; $('gate-card').innerHTML = html; }
function gateLogin(msg){
  showGate(`<h2>Entrar</h2>${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <form id="g-login" novalidate>
      <div class="f"><label for="g-email">E-mail</label><input id="g-email" type="email" autocomplete="email" required></div>
      <div class="f"><label for="g-pass">Senha</label><input id="g-pass" type="password" autocomplete="current-password" required></div>
      <button class="btn pri" type="submit">Entrar</button>
    </form>
    <div class="gate-links"><button class="link" type="button" id="g-to-sign">Criar conta</button><button class="link" type="button" id="g-to-reset">Esqueci a senha</button></div>`);
  $('g-to-sign').onclick = gateSignup; $('g-to-reset').onclick = gateReset;
  $('g-login').onsubmit = async e => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, $('g-email').value.trim(), $('g-pass').value); }
    catch (err) { gateLogin(authMsg(err)); }
  };
  $('g-email').focus();
}
function gateSignup(msg){
  showGate(`<h2>Criar conta</h2><p>Depois de criar a conta, um administrador precisa liberar seu acesso.</p>${typeof msg === 'string' ? `<p class="err">${esc(msg)}</p>` : ''}
    <form id="g-sign" novalidate>
      <div class="f"><label for="g-nome">Nome (como aparece no histórico)</label><input id="g-nome" autocomplete="name" required></div>
      <div class="f"><label for="g-func">Função</label><select id="g-func"><option value="">Selecione…</option>${FUNCOES.map(f => `<option>${f}</option>`).join('')}</select></div>
      <div class="f"><label for="g-email">E-mail</label><input id="g-email" type="email" autocomplete="email" required></div>
      <div class="f"><label for="g-pass">Senha (mínimo 6 caracteres)</label><input id="g-pass" type="password" autocomplete="new-password" required></div>
      <button class="btn pri" type="submit">Criar conta</button>
    </form>
    <div class="gate-links"><button class="link" type="button" id="g-to-login">Já tenho conta</button></div>`);
  $('g-to-login').onclick = () => gateLogin();
  $('g-sign').onsubmit = async e => {
    e.preventDefault();
    const nome = $('g-nome').value.trim(), funcao = $('g-func').value, email = $('g-email').value.trim(), pass = $('g-pass').value;
    if (!nome) return gateSignup('Informe seu nome.');
    if (!funcao) return gateSignup('Selecione sua função.');
    S.pendingProfile = {nome, funcao};
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, {displayName: nome}).catch(() => {});
    } catch (err) { S.pendingProfile = null; gateSignup(authMsg(err)); }
  };
  $('g-nome').focus();
}
function gateReset(msg){
  showGate(`<h2>Recuperar senha</h2><p>Enviaremos um link para criar uma nova senha.</p>${typeof msg === 'string' ? `<p class="err">${esc(msg)}</p>` : ''}
    <form id="g-reset" novalidate><div class="f"><label for="g-email">E-mail</label><input id="g-email" type="email" autocomplete="email" required></div><button class="btn pri" type="submit">Enviar link</button></form>
    <div class="gate-links"><button class="link" type="button" id="g-to-login">Voltar</button></div>`);
  $('g-to-login').onclick = () => gateLogin();
  $('g-reset').onsubmit = async e => {
    e.preventDefault();
    try { await sendPasswordResetEmail(auth, $('g-email').value.trim()); gateLogin('Link enviado. Confira seu e-mail (e a caixa de spam).'); }
    catch (err) { gateReset(authMsg(err)); }
  };
}
function gateWaiting(papel){
  const txt = papel === 'bloqueado' ? 'Seu acesso foi bloqueado. Fale com o responsável pelo sistema.' : 'Sua conta foi criada. Assim que um administrador liberar o acesso, esta tela abre sozinha.';
  showGate(`<h2>${papel === 'bloqueado' ? 'Acesso bloqueado' : 'Aguardando liberação'}</h2><p>${txt}</p><p class="ro">${esc(S.perfil?.nome || '')} · ${esc(S.email)}</p><button class="btn" type="button" id="g-out">Sair</button>`);
  $('g-out').onclick = () => signOut(auth);
}

let unsubPerfil = null;
if (!configOk){
  showGate(`<h2>Configuração pendente</h2><p>Cole as chaves do seu projeto Firebase no arquivo <b>firebase-config.js</b> e publique de novo. O passo a passo está no arquivo LEIA-ME.</p>`);
} else {
  onAuthStateChanged(auth, user => {
    stopApp(); if (unsubPerfil){ unsubPerfil(); unsubPerfil = null; }
    if (!user){ S.uid = null; S.perfil = null; gateLogin(); return; }
    S.uid = user.uid; S.email = user.email || '';
    showGate('<p>Carregando…</p>');
    unsubPerfil = onSnapshot(doc(db, 'usuarios', user.uid), async snap => {
      if (!snap.exists()){
        const p = S.pendingProfile || {nome: user.displayName || (user.email || '').split('@')[0], funcao:''};
        try { await setDoc(doc(db, 'usuarios', user.uid), {nome:p.nome, funcao:p.funcao, email:user.email, papel:'pendente', criadoEm:serverTimestamp()}); }
        catch { showGate('<h2>Erro</h2><p>Não foi possível criar seu cadastro. Verifique se as regras do Firestore foram publicadas.</p><button class="btn" type="button" id="g-out">Sair</button>'); $('g-out').onclick = () => signOut(auth); }
        return;
      }
      S.perfil = snap.data(SNAP);
      if (canRead()) startApp(); else { stopApp(); gateWaiting(S.perfil.papel); }
    }, () => gateLogin('Não foi possível ler seu cadastro. Tente entrar de novo.'));
  });
}

/* ================= assinaturas ================= */
function startApp(){
  $('gate').hidden = true; $('app').hidden = false;
  renderWho();
  if (S.started){ renderAll(); return; }
  S.started = true;
  S.tab = 'noite'; // o app abre sempre na aba Atividades
  setTab(S.tab);
  const fail = what => err => { console.warn(what, err); if (err?.code === 'permission-denied') return; toast('Conexão com o banco interrompida. Recarregue a página.'); };
  S.unsubs.push(onSnapshot(collection(db, 'usuarios'), s => {
    const m = {}; s.forEach(d => { m[d.id] = d.data(SNAP); }); S.usuarios = m; renderAll();
  }, fail('usuarios')));
  S.unsubs.push(onSnapshot(doc(db, 'config', 'cadastros'), s => {
    const v = s.exists() ? s.data(SNAP) : {};
    S.cad = {fornecedores:v.fornecedores||[], setores:v.setores||[], niveis:v.niveis||[], pilares:v.pilares||[], locais:v.locais||[]};
    S.cadLoaded = true; fillFilterOptions(); renderAll();
  }, fail('cadastros')));
  subscribeWindow();
  S.unsubs.push(onSnapshot(query(collection(db, 'atividades'), where('temEtiqueta', '==', true), limit(3000)), s => {
    S.tagged = snapToMap(s); fillFilterOptions(); renderAll();
  }, fail('etiquetas')));
  S.unsubs.push(onSnapshot(query(collection(db, 'atividades'), where('aberta', '==', true), limit(1000)), s => {
    S.open = snapToMap(s); fillFilterOptions(); renderAll();
  }, fail('abertas')));
  const since = Timestamp.fromDate(new Date(Date.now() - 31*86400000));
  S.unsubs.push(onSnapshot(query(collection(db, 'historico'), where('t', '>=', since), orderBy('t', 'desc'), limit(2000)), s => {
    S.feed = s.docs.map(d => ({id:d.id, ...d.data(SNAP)})); if (S.tab === 'hist') renderAll();
  }, fail('historico')));
  S.unsubs.push(onSnapshot(query(collection(db, 'pendencias'), limit(1500)), s => {
    S.pend = snapToMap(s); S.pdErr = false; updPendBadge(); if (S.tab === 'pend') renderAll();
  }, err => { S.pdErr = err?.code === 'permission-denied'; console.warn('pendencias', err); if (S.tab === 'pend') renderAll(); }));
}
function stopApp(){
  for (const u of S.unsubs) u(); S.unsubs = [];
  if (S.unsubWin){ S.unsubWin(); S.unsubWin = null; }
  closeDrawer(); closeModal();
  S.started = false; S.win = new Map(); S.open = new Map(); S.extra = new Map(); S.tagged = new Map(); S.feed = []; S.usuarios = {}; S.pend = new Map();
}
function snapToMap(s){ const m = new Map(); s.forEach(d => m.set(d.id, {id:d.id, ...d.data(SNAP)})); return m; }
function subscribeWindow(){
  if (S.unsubWin) S.unsubWin();
  S.unsubWin = onSnapshot(query(collection(db, 'atividades'), where('noite', '>=', S.winFrom), limit(2000)), s => {
    S.win = snapToMap(s); fillFilterOptions(); renderAll();
  }, err => console.warn('janela', err));
}

/* ================= filtros e listas ================= */
// filtro de local em cascata: o tipo (setor, pilar, shopping) define a lista do segundo seletor
const pilarCode = s => (String(s || '').match(/P\s*\d+/i) || [''])[0].replace(/\s+/g, '').toUpperCase();
const lc = s => String(s || '').trim().toLocaleLowerCase('pt-BR');
// Lojas e pilares podem ter setor no cadastro: filtrar um setor traz também as lojas e pilares ligados a ele
const locNome = x => typeof x === 'string' ? x : (x?.nome || '');
const locSetor = x => typeof x === 'string' ? '' : (x?.setor || '');
function setorOf(a){
  if (a.tipoLocal === 'setor') return a.setor || '';
  if (a.tipoLocal === 'shopping'){ const x = S.cad.locais.find(l => lc(locNome(l)) === lc(a.local)); return x ? locSetor(x) : ''; }
  if (a.tipoLocal === 'pilar'){
    const c = pilarCodeOf(a), loja = lc(pilarLojaOf(a)), es = S.cad.pilares.filter(x => (pilarCode(x.codigo) || x.codigo) === c);
    const ex = es.find(x => lc(x.referencia) === loja && x.setor); if (ex) return ex.setor;
    const ss = [...new Set(es.map(x => x.setor).filter(Boolean))]; return ss.length === 1 ? ss[0] : '';
  }
  return '';
}
function locItemMatch(a, v){
  const t = v[0], val = v.slice(2);
  if (t === 's') return setorOf(a) === val;
  if (t === 'p') return a.tipoLocal === 'pilar' && pilarCodeOf(a) === val;
  if (t === 'z') return a.tipoLocal === 'shopping' && lc(a.local) === lc(val);
  return true;
}
// itens do filtro de local, conforme os tipos marcados em "Onde"
function locItems(){
  const tipos = S.f.tipo.length ? S.f.tipo : ['setor','pilar','shopping'], out = [];
  if (tipos.includes('setor')) for (const [v, l] of locOptions('setor')){
    const nl = S.cad.locais.filter(x => locSetor(x) === v).length, np = new Set(S.cad.pilares.filter(x => x.setor === v).map(x => pilarCode(x.codigo) || x.codigo)).size;
    const inc = [nl ? `${nl} ${nl === 1 ? 'loja' : 'lojas'}` : '', np ? `${np} ${np === 1 ? 'pilar' : 'pilares'}` : ''].filter(Boolean).join(' e ');
    out.push({v:'s:' + v, l, sub: inc ? 'inclui ' + inc : '', g:'Setores'});
  }
  if (tipos.includes('pilar')) for (const [v, l] of locOptions('pilar')) out.push({v:'p:' + v, l, g:'Pilares'});
  if (tipos.includes('shopping')) for (const [v, l] of locOptions('shopping')){ const x = S.cad.locais.find(y => lc(locNome(y)) === lc(v)); out.push({v:'z:' + v, l, sub: x && locSetor(x) ? 'Setor ' + locSetor(x) : '', g:'Shopping'}); }
  return out;
}
function locMatch(a, tipo, v){
  if (tipo === 'setor') return a.tipoLocal === 'setor' && a.setor === v;
  if (tipo === 'pilar') return a.tipoLocal === 'pilar' && pilarCode(a.pilar) === v;
  if (tipo === 'shopping') return a.tipoLocal === 'shopping' && lc(a.local) === lc(v);
  return true;
}
function locOptions(tipo){
  const acts = [...all().values()];
  if (tipo === 'setor'){
    const m = new Map(S.cad.setores.map(x => [x.codigo, `Setor ${x.codigo}${x.descricao ? ' — ' + x.descricao : ''}`]));
    for (const a of acts) if (a.tipoLocal === 'setor' && a.setor && !m.has(a.setor)) m.set(a.setor, `Setor ${a.setor}`);
    return [...m.entries()];
  }
  if (tipo === 'pilar'){
    const by = new Map();
    for (const x of S.cad.pilares){ const c = pilarCode(x.codigo) || x.codigo; if (!by.has(c)) by.set(c, {eixo:x.eixo, lojas:[]}); if (x.referencia) by.get(c).lojas.push(x.referencia); if (!by.get(c).eixo && x.eixo) by.get(c).eixo = x.eixo; }
    const m = new Map([...by.entries()].map(([c, o]) => [c, `${c}${o.eixo ? ' (' + o.eixo + ')' : ''}${o.lojas.length ? ' · ' + o.lojas.join(', ') : ''}`]));
    for (const a of acts) if (a.tipoLocal === 'pilar'){ const c = pilarCode(a.pilar); if (c && !m.has(c)) m.set(c, c); }
    return [...m.entries()].sort((x, y) => (parseInt(x[0].slice(1)) || 0) - (parseInt(y[0].slice(1)) || 0));
  }
  if (tipo === 'shopping'){
    const m = new Map(S.cad.locais.map(x => [lc(locNome(x)), locNome(x)]));
    for (const a of acts) if (a.tipoLocal === 'shopping' && a.local && !m.has(lc(a.local))) m.set(lc(a.local), a.local);
    return [...m.values()].sort((x, y) => x.localeCompare(y, 'pt')).map(x => [x, x]);
  }
  return [];
}
function matches(a){
  const f = S.f;
  if (f.tipo.length && !f.tipo.includes(a.tipoLocal)) return false;
  if (f.loc.length && !f.loc.some(v => locItemMatch(a, v))) return false;
  if (f.forn.length && !f.forn.includes(a.fornecedor || '__none__')) return false;
  if (f.status.length && !f.status.includes(a.status)) return false;
  if (f.etq.length && !f.etq.some(t => hasTag(a, t))) return false;
  if (f.autor.length && !f.autor.includes(a.criadoPor)) return false;
  if (f.q){ const hay = [a.titulo,a.detalhes,a.fornecedor,a.responsavel,localLine(a),a.ultimaObs,a.motivo,...tagsOf(a)].join(' ').toLowerCase(); if (!hay.includes(f.q.toLowerCase())) return false; }
  return true;
}
const prRank = p => p === 'critica' ? 0 : p === 'alta' ? 1 : 2;
const sortActs = list => list.sort((x,y) => prRank(x.prioridade)-prRank(y.prioridade) || ORDER.indexOf(x.status)-ORDER.indexOf(y.status) || toDate(x.criadoEm)-toDate(y.criadoEm));

function concDay(a){
  const v = a.concluidoEm || (a.status === 'concluida' ? a.atualizadoEm : null); if (!v) return '';
  const d = toDate(v); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return ymd(d);
}
// Lista de Atividades: por padrão mostra TUDO em aberto (vencidas, em curso e a iniciar).
// Um dia específico é escolhido pelo Calendário (toque no dia) — aí a lista mostra só aquele dia (S.dia).
S.dia = null;
function renderNight(){
  const hoje = defaultNight(), ft = S.f.turno, dia = S.dia;
  if (!dia) S.noite = hoje;
  const tt = ft === 'noturno' ? 'turno noturno' : ft === 'diurno' ? 'turno diurno' : 'turnos diurno e noturno';
  $('night-title').textContent = !dia ? 'Atividades' : dia === hoje ? 'Hoje' : fmtDay(dia);
  $('night-sub').innerHTML = !dia ? `Todas em aberto<span class="sub-t"> · ${tt}</span>` : dia === hoje ? `${esc(fmtDay(dia))}<span class="sub-t"> · ${tt}</span>` : `<span class="sub-t">${tt}</span>`;
  document.querySelector('#v-noite .day-head .nav').hidden = !dia;
  if (dia){ const d = parseYmd(dia); $('night-label').textContent = `${DOW[d.getDay()].slice(0,3)} ${fmtShort(dia)}`; $('n-date').value = dia; }
  $('n-today').hidden = !dia;
  for (const b of document.querySelectorAll('#f-turno button')) b.setAttribute('aria-pressed', String((b.dataset.t || '') === ft));
  const acts = [...all().values()].filter(a => !ft || turnoOf(a) === ft);
  const ref = S.noite, rv = S.refVenc = dia && dia > hoje ? hoje : ref, verConc = S.f.status.includes('concluida'), verCanc = S.f.status.includes('cancelada');
  let pend, cur, fut, concl, canc, contados;
  if (dia){
    const doDia = acts.filter(a => a.noite <= ref && fimOf(a) >= ref);
    pend = acts.filter(a => a.aberta && fimOf(a) < rv); // num dia futuro, vencida = já vencida hoje
    cur = doDia.filter(a => a.status !== 'concluida' && a.status !== 'cancelada'); fut = [];
    concl = acts.filter(a => a.status === 'concluida' && (doDia.includes(a) || concDay(a) === ref));
    canc = doDia.filter(a => a.status === 'cancelada');
  } else {
    const ab = acts.filter(a => a.aberta && STATUS[a.status]?.aberta), desde = addDays(hoje, -30);
    pend = ab.filter(a => fimOf(a) < hoje); cur = ab.filter(a => a.noite <= hoje && fimOf(a) >= hoje); fut = ab.filter(a => a.noite > hoje);
    concl = acts.filter(a => a.status === 'concluida' && (concDay(a) >= desde || fimOf(a) >= hoje));
    canc = acts.filter(a => a.status === 'cancelada' && fimOf(a) >= desde);
  }
  contados = [...pend, ...cur, ...fut];
  const cnt = {}; ORDER.forEach(k => cnt[k] = 0); contados.forEach(a => { cnt[a.status] = (cnt[a.status]||0)+1; });
  cnt.concluida = concl.length; cnt.cancelada = canc.length;
  const total = contados.length;
  const bar = total ? ORDER.filter(k => cnt[k] && k !== 'concluida' && k !== 'cancelada').map(k => `<i style="width:${(cnt[k]/total*100).toFixed(2)}%;background:${cvar(k)}" title="${esc(STATUS[k].label)}: ${cnt[k]}"></i>`).join('') : '';
  const leg = [];
  if (pend.length) leg.push(`<span class="sum-pend"><i class="dot" style="--c:var(--st-nao)"></i>${pend.length} ${pend.length === 1 ? 'vencida' : 'vencidas'}</span>`);
  if (fut.length) leg.push(`<span><i class="dot" style="--c:var(--faint)"></i>${fut.length} a iniciar</span>`);
  leg.push(...ORDER.filter(k => k !== 'concluida' && k !== 'cancelada' && cnt[k]).map(k => `<span><i class="dot" style="--c:${cvar(k)}"></i>${cnt[k]} ${esc(stN(k, cnt[k]))}</span>`));
  $('summary').innerHTML = `<div class="sum-top"><div class="sum-n"><b>${total}</b><span>${total === 1 ? 'em aberto' : 'em aberto'}${dia ? (dia === hoje ? ' hoje' : ' no dia') : ''}</span></div><div class="bar" role="img" aria-label="Distribuição por status">${bar}</div></div>
    ${leg.length ? `<div class="sum-leg">${leg.join('')}</div>` : ''}`;
  // painel de filtros
  $('f-status').innerHTML = ORDER.map(k => `<button type="button" class="chip" data-st="${k}" aria-pressed="${S.f.status.includes(k)}"><span class="dot" style="--c:${cvar(k)}"></span>${esc(STATUS[k].label)} <b>${cnt[k]}</b></button>`).join('');
  const nf = [S.f.status, S.f.tipo, S.f.loc, S.f.forn, S.f.etq, S.f.autor].filter(x => x.length).length;
  $('f-count').hidden = !nf; $('f-count').textContent = nf;
  // concluídas e canceladas só aparecem quando o chip correspondente está marcado
  const base = [...pend, ...cur, ...fut, ...(verConc ? concl : []), ...(verCanc ? canc : [])];
  const byFim = (x, y) => String(fimOf(x)).localeCompare(String(fimOf(y)));
  const t = [...pend.filter(matches).sort(byFim), ...sortActs(cur.filter(matches)), ...fut.filter(matches).sort((x, y) => x.noite.localeCompare(y.noite) || prRank(x.prioridade) - prRank(y.prioridade)),
    ...(verConc ? concl.filter(matches).sort((x, y) => concDay(y).localeCompare(concDay(x))) : []), ...(verCanc ? canc.filter(matches) : [])];
  S.listaAtual = t;
  $('c-tonight').textContent = t.length === base.length ? `${t.length}` : `${t.length} de ${base.length}`;
  $('h-tonight').textContent = !dia ? (verConc && S.f.status.length === 1 ? 'Concluídas (últimos 30 dias)' : 'Em aberto') : dia === hoje ? 'Atividades de hoje' : `Atividades de ${fmtShort(dia)}`;
  let html;
  if (!base.length && (concl.length || canc.length) && !contados.length) html = `<div class="empty"><b>Nada em aberto${dia ? ' neste dia' : ''}</b>As concluídas aparecem em Filtros → “Concluída”.</div>`;
  else if (!base.length) html = `<div class="empty"><b>Nenhuma atividade ${ft ? 'no turno ' + TURNOS[ft].toLowerCase() : ''} ${dia ? 'neste dia' : 'em aberto'}</b>${canWrite() ? 'Toque em “+” para programar o que a equipe vai executar.' : 'Quando coordenadores e residentes programarem atividades, elas aparecem aqui.'}</div>`;
  else if (!t.length) html = '<div class="empty">Nenhuma atividade com esses filtros.</div>';
  else if (ft) html = grouped(t, false, ft);
  else html = ['diurno','noturno'].map(tr => { const l = t.filter(a => turnoOf(a) === tr); return l.length ? `<div class="turno-sec"><div class="turno-h">${turnoTag(tr)}<span class="th-d">${dia ? (tr === 'diurno' ? fmtDay(dia) : fmtNightLong(dia)) : ''}</span><b>${l.length}</b></div>${grouped(l, false, tr)}</div>` : ''; }).join('');
  $('l-tonight').innerHTML = html;
  $('b-new').hidden = !canWrite();
}
// grupos recolhíveis: tocar no título do setor / pilar / local esconde ou mostra as atividades
S.colGrp = (() => { try { return new Set(JSON.parse(localStorage.getItem('pn-col') || '[]')); } catch { return new Set(); } })();
function toggleGrp(key){
  if (S.colGrp.has(key)) S.colGrp.delete(key); else S.colGrp.add(key);
  try { localStorage.setItem('pn-col', JSON.stringify([...S.colGrp])); } catch {}
  renderAll();
}
const CHEV = '<svg class="grp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
function grouped(list, isPend, scope = ''){
  const groups = new Map();
  for (const a of list){ const g = groupKey(a); if (!groups.has(g.k)) groups.set(g.k, {...g, items:[]}); groups.get(g.k).items.push(a); }
  return [...groups.values()].sort((a,b) => groupRank(a.k)-groupRank(b.k) || a.sub.localeCompare(b.sub))
    .map(g => { const tp = g.k.startsWith('p:') ? 'pilares' : g.k.startsWith('z:') ? 'locais' : 'setores', lab = g.k.startsWith('z:') ? (g.sub || 'Shopping') : g.label, sub = g.k.startsWith('z:') ? 'Shopping' : g.sub;
      const key = (isPend ? 'P' : 'T') + scope + '|' + g.k, col = S.colGrp.has(key);
      return `<div class="grp grp-${tp}${col ? ' col' : ''}"><div class="grp-h" role="button" tabindex="0" data-grp="${esc(key)}" aria-expanded="${!col}" title="${col ? 'Mostrar' : 'Recolher'} as atividades"><span class="grp-ic">${ico(tp)}</span><span class="grp-tx"><b>${esc(lab)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span><em class="grp-n">${g.items.length}</em><button type="button" class="grp-open" data-loc="${esc(g.k)}" title="Abrir a página de ${esc(lab)}, com todas as atividades e o relatório">${ICON_OPEN}<span>Abrir</span></button>${CHEV}</div>${col ? '' : `<div class="cards">${g.items.map(a => card(a, isPend || (a.aberta && fimOf(a) < (S.refVenc || S.noite)), S.refVenc || S.noite, !S.dia)).join('')}</div>`}</div>`; }).join('');
}
function card(a, isPend, ref = S.noite, showDate = false, hideTag = ''){
  const st = STATUS[a.status] || STATUS.programada, n = isPend ? nightsBetween(fimOf(a), ref) : 0, av = avOf(a);
  const meta = [localLine(a), a.fornecedor].filter(Boolean).join(' · ');
  const tags = [];
  if (a.prioridade === 'critica' || a.prioridade === 'alta') tags.push(`<span class="tag ${a.prioridade}">${esc(PRIOR[a.prioridade])}</span>`);
  if (!isPend && (showDate || fimOf(a) !== a.noite)) tags.push(`<span class="tag per">${fmtPeriodo(a)}</span>`); // vencida: o selo "venceu dd/mm" já mostra a data
  if (a.aberta && a.noite > ref && STATUS[a.status]?.aberta) tags.push('<span class="tag fut">a iniciar</span>');
  if (isPend) tags.push(`<span class="tag since">venceu ${fmtShort(fimOf(a))} · ${n} ${n === 1 ? 'dia' : 'dias'}</span>`);
  const et = tagsOf(a).filter(t => !hideTag || tagKey(t) !== tagKey(hideTag)); if (et.length) tags.push(et.slice(0, 2).map(t => tagChip(t, 'sm')).join('') + (et.length > 2 ? `<span class="etq-more">+${et.length - 2}</span>` : '') + (et.length > 1 ? `<span class="etq-more m-only">+${et.length - 1}</span>` : ''));
  const alerta = (a.status === 'impedida' || a.status === 'nao_iniciada') && (a.motivo || a.ultimaObs) ? `<div class="c-alert">${esc(a.motivo || a.ultimaObs)}</div>` : '';
  return `<button type="button" class="card" data-id="${esc(a.id)}" style="--c:${cvar(a.status)}"><span class="stripe"></span>
    <span class="body">
      <span class="c-top"><span class="t">${esc(a.titulo)}</span><span class="pill" style="--c:${cvar(a.status)}">${esc(st.label)}</span></span>
      <span class="m">${esc(meta)}</span>${alerta}
      <span class="c-bot"><span class="c-tags"><span class="t-ic ${turnoOf(a)}" title="${TURNOS[turnoOf(a)]}">${turnoOf(a) === 'diurno' ? ICON_SOL : ICON_LUA}</span>${a.criadoPor ? `<span class="c-who" title="Inserida por ${esc(nameOf(a.criadoPor))}"><i>${esc(initials(nameOf(a.criadoPor)))}</i><span class="c-who-n">${esc(shortName(nameOf(a.criadoPor)))}</span></span>` : ''}${tags.join('')}</span>${av ? `<span class="c-prog">${progBar(av)}</span>` : ''}</span>
    </span></button>`;
}

/* ================= histórico ================= */
function evText(ev){
  const st = k => `<span class="pill" style="--c:${cvar(k)}">${esc(STATUS[k]?.label || k)}</span>`;
  switch (ev.tipo){
    case 'criou': return `inseriu ${ev.origem ? 'uma cópia' : 'a atividade'} para ${fmtShort(ev.noite || ev.noiteAtv)}${ev.turno || ev.turnoAtv ? ' (' + (TURNOS[ev.turno || ev.turnoAtv] || '').toLowerCase() + ')' : ''}`;
    case 'status': return `mudou o status de ${st(ev.de)} para ${st(ev.para)}${ev.pct ? ` (${esc(ev.pct)}% executado)` : ''}`;
    case 'obs': return 'adicionou uma observação';
    case 'avanco': return `atualizou o avanço de ${esc(ev.de ?? 0)}% para <b>${esc(ev.para)}%</b>${ev.statusPara ? ` e o status mudou de ${st(ev.statusDe)} para ${st(ev.statusPara)}` : ''}`;
    case 'editou': return ev.mudancas?.length && ev.mudancas.every(m => m.campo === 'etiquetas') ? 'alterou as etiquetas' : 'alterou os dados';
    case 'reprogramou': return `reprogramou de ${fmtShort(ev.de)}${ev.turnoDe ? ' (' + TURNOS[ev.turnoDe].toLowerCase() + ')' : ''} para ${fmtShort(ev.para)}${ev.turnoPara ? ' (' + TURNOS[ev.turnoPara].toLowerCase() + ')' : ''}`;
    case 'excluiu': return 'excluiu a atividade';
    case 'foto': return `adicionou uma foto${ev.legenda ? `: “${esc(ev.legenda)}”` : ''}`;
    case 'foto_del': return `excluiu uma foto${ev.legenda ? ` (“${esc(ev.legenda)}”)` : ''}`;
    case 'exportou': return `exportou ${EXP_LABEL[ev.formato] || 'um arquivo'}`;
    default: return esc(ev.tipo);
  }
}
const fmtVal = (campo, v) => campo === 'status' ? (STATUS[v]?.label || v || '') : (campo === 'noite' || campo === 'fim') && v ? fmtShort(v) : campo === 'avanco' ? `${v || 0}%` : campo === 'turno' ? (TURNOS[v] || (v ? v : 'Noturno')) : campo === 'tipoLocal' ? (TIPO_LABEL[v] || v) : campo === 'prioridade' ? (PRIOR[v] || v) : (v ?? '');
function evExtra(ev){
  if (ev.tipo === 'exportou') return `<div class="ch">${[ev.qtd ? `${ev.qtd} ${ev.qtd === 1 ? 'atividade' : 'atividades'}` : '', ev.periodo || '', ev.filtros ? 'filtros: ' + esc(ev.filtros) : 'sem filtros'].filter(Boolean).map(x => x.startsWith('filtros') || x === 'sem filtros' ? x : esc(x)).join(' · ')}${ev.arquivo ? `<br><span class="ro">${esc(ev.arquivo)}</span>` : ''}</div>`;
  let h = '';
  if (ev.mudancas?.length) h += `<div class="ch">${ev.mudancas.map(m => `${esc(FIELDS[m.campo] || (m.campo === 'status' ? 'Status' : m.campo))}: ${esc(fmtVal(m.campo,m.de)||'—')} → ${esc(fmtVal(m.campo,m.para)||'—')}`).join('<br>')}</div>`;
  if (ev.motivo || ev.obs) h += `<div class="q">${ev.motivo ? `<b>${esc(ev.motivo)}</b>${ev.obs ? ' — ' : ''}` : ''}${esc(ev.obs||'')}</div>`;
  return h;
}
function renderFeed(){
  const since = Date.now() - Number($('h-dias').value)*86400000, fu = $('h-user').value, ft = $('h-tipo').value;
  const sel = $('h-user'), cur = sel.value, ids = Object.keys(S.usuarios).filter(id => S.usuarios[id].papel !== 'pendente');
  sel.innerHTML = '<option value="">Todas as pessoas</option>' + ids.map(id => `<option value="${esc(id)}">${esc(nameOf(id))}${roleOf(id) ? ' · '+esc(roleOf(id)) : ''}</option>`).join('');
  sel.value = ids.includes(cur) ? cur : '';
  const evs = S.feed.filter(ev => toDate(ev.t).getTime() >= since && (!fu || ev.u === fu) && (!ft || ev.tipo === ft));
  if (!evs.length){ $('feed').innerHTML = '<div class="empty" style="margin-top:18px"><b>Sem registros no período</b>Cada inserção, alteração, observação, mudança de status e exportação aparece aqui com nome e horário.</div>'; return; }
  const days = new Map();
  for (const ev of evs){ const d = ymd(toDate(ev.t)); if (!days.has(d)) days.set(d, []); days.get(d).push(ev); }
  $('feed').innerHTML = [...days.entries()].map(([d, list]) => `<div class="feed-day"><h3>${DOW[parseYmd(d).getDay()]} ${fmtShort(d)}</h3>${list.map(ev => `
    <div class="ev"><time>${fmtHM(ev.t)}</time><div><p><b>${esc(nameOf(ev.u))}</b>${roleOf(ev.u) ? ` <span class="ro">${esc(roleOf(ev.u))}</span>` : ''} ${evText(ev)}${ev.tipo === 'exportou' ? '' : ' · '}${ev.tipo === 'exportou' ? '' : ev.tipo === 'excluiu' ? `<span>${esc(ev.titulo)}</span>` : `<button type="button" class="act" data-id="${esc(ev.atividadeId)}">${esc(ev.titulo)}</button>`} <span class="ro">${esc(ev.local||'')}</span></p>${evExtra(ev)}</div></div>`).join('')}</div>`).join('');
}

/* ================= pendências (lembretes e providências de gestão) ================= */
// Não são atividades de campo: não entram em totais, relatórios, calendário nem cronograma.
S.pend = new Map(); S.pdView = 'abertas'; S.pdErr = false; S.fromPend = null; S.lastActId = null;
// títulos que começam com verbo de gestão parecem lembrete, não serviço de campo
const PEND_RX = /^\s*(re)?(programar|solicitar|verificar|cobrar|agendar|ver\s+com|providenciar|pedir|lembrar|avisar|confirmar|contatar|contactar|ligar|enviar|mandar|definir|aguardar|checar|alinhar|combinar|falar\s+com|marcar|or[çc]ar|cotar|comprar|acionar|chamar)(\s|$|:|-)/i;
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const pdState = (p, hoje = defaultNight()) => p.feita ? 'feita' : !p.prazo ? 'sem' : p.prazo < hoje ? 'atr' : p.prazo === hoje ? 'hoje' : 'prox';
const pdMine = p => p.criadoPor === S.uid || (p.responsavel && S.perfil?.nome && lc(p.responsavel) === lc(S.perfil.nome));
function updPendBadge(){
  const hoje = defaultNight(), ab = [...S.pend.values()].filter(p => !p.feita), atr = ab.some(p => pdState(p, hoje) === 'atr');
  for (const el of document.querySelectorAll('[data-pend-n]')){ el.hidden = !ab.length; el.textContent = ab.length; el.classList.toggle('alert', atr); }
}
function renderPend(){
  const hoje = defaultNight(), w = canWrite(), q = lc($('pd-q').value);
  $('pd-new').hidden = !w;
  const todas = [...S.pend.values()];
  const ab = todas.filter(p => !p.feita), mine = ab.filter(pdMine), feitas = todas.filter(p => p.feita);
  $('pd-seg').innerHTML = [['abertas','Abertos',ab.length],['minhas','Meus',mine.length],['feitas','Feitos',feitas.length]]
    .map(([k,l,n]) => `<button type="button" data-pdv="${k}" aria-pressed="${S.pdView === k}">${l} <b>${n}</b></button>`).join('');
  if (S.pdErr){ $('pd-list').innerHTML = '<div class="empty"><b>Lembretes indisponíveis</b>O banco ainda não aceita lembretes. O administrador precisa publicar as regras novas do Firestore.</div>'; return; }
  const hit = p => !q || lc([p.texto, p.responsavel, p.local, p.obs, nameOf(p.criadoPor)].join(' ')).includes(q);
  const base = (S.pdView === 'feitas' ? feitas : S.pdView === 'minhas' ? mine : ab).filter(hit);
  if (!base.length){
    $('pd-list').innerHTML = `<div class="empty"><b>${q ? 'Nada encontrado' : S.pdView === 'feitas' ? 'Nenhum lembrete feito ainda' : 'Nenhum lembrete em aberto'}</b>${q ? 'Tente outra busca.' : S.pdView === 'feitas' ? '' : 'Use para providências da coordenação: programar equipe, solicitar material, cobrar liberação. O serviço de campo em si vai em Atividades.'}</div>`;
    return;
  }
  if (S.pdView === 'feitas'){
    const l = base.sort((x, y) => toDate(y.feitaEm || y.atualizadoEm) - toDate(x.feitaEm || x.atualizadoEm)).slice(0, 150);
    $('pd-list').innerHTML = `<div class="pd-sec">${l.map(p => pdItem(p, hoje, w)).join('')}</div>`;
    return;
  }
  const SEC = [['atr','Atrasados'],['hoje','Para hoje'],['prox','Próximos'],['sem','Sem prazo']];
  const by = k => base.filter(p => pdState(p, hoje) === k).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)) || toDate(x.criadoEm) - toDate(y.criadoEm));
  $('pd-list').innerHTML = SEC.map(([k, l]) => { const items = by(k); return items.length ? `<div class="pd-sec pd-${k}"><div class="pd-h">${l}<em>${items.length}</em></div>${items.map(p => pdItem(p, hoje, w)).join('')}</div>` : ''; }).join('');
}
function pdItem(p, hoje, w){
  const st = pdState(p, hoje), n = st === 'atr' ? nightsBetween(p.prazo, hoje) : 0;
  const prazo = st === 'feita' ? `feito ${p.feitaEm ? fmtTs(p.feitaEm) : ''}${p.feitaPor ? ' por ' + esc(shortName(nameOf(p.feitaPor))) : ''}`
    : st === 'atr' ? `venceu ${fmtShort(p.prazo)} · ${n} ${n === 1 ? 'dia' : 'dias'}` : st === 'hoje' ? 'prazo hoje' : st === 'prox' ? `até ${fmtShort(p.prazo)}` : 'sem prazo';
  const meta = [`<span class="pd-c pd-c-${st}">${prazo}</span>`,
    p.responsavel ? `<span class="pd-c">${esc(p.responsavel)}</span>` : '',
    p.local ? `<span class="pd-c">${esc(p.local)}</span>` : '',
    p.feita && p.feitaPor === p.criadoPor ? '' : `<span class="pd-c pd-by">${p.feita ? 'criado ' : ''}por ${esc(shortName(nameOf(p.criadoPor)))}</span>`,
    p.atividadeId ? `<button type="button" class="pd-c pd-link" data-pd-act="${esc(p.atividadeId)}">virou atividade ›</button>` : '',
    w && !p.feita ? `<button type="button" class="pd-c pd-conv" data-pd-conv="${esc(p.id)}">→ Transformar em atividade</button>` : ''].filter(Boolean).join('');
  return `<div class="pd-item${p.feita ? ' done' : ''}">
    <button type="button" class="pd-chk" data-pd-chk="${esc(p.id)}" aria-pressed="${!!p.feita}" aria-label="${p.feita ? 'Reabrir' : 'Marcar como feito'}"${w ? '' : ' disabled'}>${ICON_CHECK}</button>
    <div class="pd-body"${w ? ` role="button" tabindex="0" data-pd-open="${esc(p.id)}"` : ''}><div class="pd-t">${esc(p.texto)}</div>${p.obs ? `<div class="pd-obs">${esc(p.obs)}</div>` : ''}<div class="pd-meta">${meta}</div></div>
  </div>`;
}
function pdSave(id, data, okMsg){
  const ref = id ? doc(db, 'pendencias', id) : doc(collection(db, 'pendencias')), b = writeBatch(db);
  for (const k of ['texto','responsavel','prazo','local','obs']) if (k in data) data[k] = String(data[k] || '').trim();
  if (id) b.update(ref, {...data, atualizadoPor:S.uid, atualizadoEm:serverTimestamp()});
  else b.set(ref, {...data, feita:false, criadoPor:S.uid, criadoEm:serverTimestamp(), atualizadoPor:S.uid, atualizadoEm:serverTimestamp()});
  commit(b, okMsg);
  return ref.id;
}
function pdToggle(id){
  const p = S.pend.get(id); if (!p || !canWrite()) return;
  const v = !p.feita;
  pdSave(id, {feita:v, feitaPor: v ? S.uid : '', feitaEm: v ? serverTimestamp() : null}, v ? 'Lembrete feito.' : 'Lembrete reaberto.');
}
function openPendForm(id, preset = {}){
  if (!canWrite()) return;
  const p = id ? S.pend.get(id) : null, v = p || {prazo:'', ...preset};
  const pode = p && (isAdmin() || p.criadoPor === S.uid);
  const nomes = Object.keys(S.usuarios).filter(u => ['usuario','admin','visualizador'].includes(S.usuarios[u].papel)).map(u => S.usuarios[u].nome).filter(Boolean);
  const locs = [...S.cad.setores.map(x => 'Setor ' + x.codigo), ...S.cad.locais.map(locNome), ...S.cad.pilares.map(x => x.codigo).filter(Boolean)];
  $('sheet').innerHTML = `<h2>${p ? 'Editar lembrete' : 'Novo lembrete'}</h2>
    <p class="ro" style="margin:-6px 0 14px">Providência da coordenação (programar, solicitar, cobrar, verificar). Quando virar serviço com data, transforme em atividade.</p>
    <form id="pdf" novalidate>
      <div class="f"><label for="pd-texto">O que precisa ser feito <span class="req">*</span></label><textarea id="pd-texto" rows="2" maxlength="300" placeholder="ex.: Programar eletricista para religar a iluminação do Setor D1">${esc(v.texto || '')}</textarea></div>
      <div class="frow">
        <div class="f"><label for="pd-resp">Responsável</label><input id="pd-resp" list="dl-pd-resp" maxlength="80" value="${esc(v.responsavel || '')}" placeholder="Quem vai providenciar"><datalist id="dl-pd-resp">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="f"><label for="pd-prazo">Prazo</label><input id="pd-prazo" type="date" value="${esc(v.prazo || '')}"></div>
      </div>
      <div class="f"><label for="pd-local">Local</label><input id="pd-local" list="dl-pd-local" maxlength="120" value="${esc(v.local || '')}" placeholder="Setor, pilar ou local do shopping (opcional)"><datalist id="dl-pd-local">${locs.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="f"><label for="pd-obs">Observação</label><textarea id="pd-obs" rows="2" maxlength="1000">${esc(v.obs || '')}</textarea></div>
      ${p ? `<div class="pd-extra">${!p.feita ? `<button type="button" class="btn ghost" id="pd-conv">→ Transformar em atividade</button>` : ''}${pode ? `<button type="button" class="link-btn danger" id="pd-del">Excluir lembrete</button>` : ''}</div>` : ''}
      <div class="acts"><button type="button" class="btn ghost" id="pd-cancel">Cancelar</button><button class="btn pri" type="submit">${p ? 'Salvar' : 'Criar lembrete'}</button></div>
    </form>`;
  const val = () => ({texto:$('pd-texto').value.trim(), responsavel:$('pd-resp').value, prazo:$('pd-prazo').value, local:$('pd-local').value, obs:$('pd-obs').value});
  $('pd-cancel').onclick = closeModal;
  if ($('pd-conv')) $('pd-conv').onclick = () => { const d = val(); if (d.texto && (d.texto !== p.texto || d.prazo !== p.prazo || d.local !== (p.local||'') || d.responsavel !== (p.responsavel||'') || d.obs !== (p.obs||''))) pdSave(id, d); pdConvert(id, d); };
  if ($('pd-del')) $('pd-del').onclick = e => {
    const bt = e.currentTarget; if (bt.dataset.ok !== '1'){ bt.dataset.ok = '1'; bt.textContent = 'Toque de novo para excluir'; return; }
    const b = writeBatch(db); b.delete(doc(db, 'pendencias', id)); commit(b, 'Lembrete excluído.'); closeModal();
  };
  $('pdf').onsubmit = e => {
    e.preventDefault(); const d = val();
    if (!d.texto) return toast('Escreva o que precisa ser feito.');
    pdSave(id, d, p ? 'Lembrete salvo.' : 'Lembrete criado.'); closeModal();
  };
  showModal(); setTimeout(() => $('pd-texto').focus(), 50);
}
// pendência → formulário de atividade já preenchido; ao inserir, a pendência fica feita e ligada à atividade
function pdConvert(id, d){
  const p = S.pend.get(id) || {}; d = d || p;
  const preset = {titulo:'', detalhes:[d.texto, d.obs].filter(Boolean).join('\n'), responsavel:'', fromPend:id};
  if (d.prazo && d.prazo >= defaultNight()) preset.noite = d.prazo;
  const L = String(d.local || '').trim(), sc = L.replace(/^setor\s+/i, '').toUpperCase();
  if (S.cad.setores.some(x => x.codigo === sc)){ preset.tipoLocal = 'setor'; preset.setor = sc; }
  else if (L && S.cad.locais.some(x => lc(locNome(x)) === lc(L))){ preset.tipoLocal = 'shopping'; preset.local = S.cad.locais.map(locNome).find(n => lc(n) === lc(L)); }
  else if (L && /^p\s*-?\s*\d/i.test(L)){ preset.tipoLocal = 'pilar'; preset.pilar = pilarCode(L) || L; }
  closeModal(); openForm(null, preset);
}

/* ================= calendário (Gantt) ================= */
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DOW3 = ['dom','seg','ter','qua','qui','sex','sáb'];
const mondayOf = s => { const d = parseYmd(s); return addDays(s, -((d.getDay() + 6) % 7)); };
function gtRange(g = S.gt){
  if (g.zoom === 'mes'){ const d = parseYmd(g.ref); const ini = ymd(new Date(d.getFullYear(), d.getMonth(), 1)); return {ini, n: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}; }
  return {ini: mondayOf(g.ref), n: g.zoom === 'sem' ? 7 : 14};
}
function gtShift(dir, g = S.gt){
  if (g.zoom === 'mes'){ const d = parseYmd(g.ref); g.ref = ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1)); }
  else g.ref = addDays(g.ref, dir * (g.zoom === 'sem' ? 7 : 14));
  g.jump = true; renderAll();
}
function gtSave(){ try { localStorage.setItem('pn-gt', JSON.stringify({zoom:S.gt.zoom, grp:S.gt.grp, conc:S.gt.conc})); } catch {} }
// dados do calendário exatamente como estão na tela (período, turno, agrupamento, concluídas e filtros)
// fonte: lista própria (calendário da página do local, sem os filtros da tela Atividades)
function gtData(g = S.gt, fonte = null){
  const {ini, n} = gtRange(g), fim = addDays(ini, n - 1), hoje = defaultNight(), ft = fonte ? (g.turno || '') : S.f.turno;
  // atividades no período (e as em aberto atrasadas, cuja barra de atraso passa pelo período)
  const acts = (fonte || [...all().values()]).filter(a => a.status !== 'cancelada' && (g.conc || a.status !== 'concluida') && (!ft || turnoOf(a) === ft) && (fonte || matches(a))
    && a.noite <= fim && (fimOf(a) >= ini || (a.aberta && hoje >= ini)));
  const m1 = parseYmd(ini), m2 = parseYmd(fim);
  const mesLbl = m1.getMonth() === m2.getMonth() ? `${MESES[m1.getMonth()]} ${m1.getFullYear()}` : `${MESES[m1.getMonth()]}–${MESES[m2.getMonth()]} ${m2.getFullYear()}`;
  const groups = new Map();
  for (const a of acts){
    let k, label, sub, rank;
    if (g.grp === 'etq'){ const t = tagsOf(a)[0]; k = t ? 'e:' + tagKey(t) : 'zz'; label = t || 'Sem etiqueta'; sub = ''; rank = t ? 0 : 1; }
    else { const gk = groupKey(a); k = gk.k; label = gk.label; sub = gk.sub; rank = groupRank(gk.k); var parent = gk.parent; }
    if (!groups.has(k)) groups.set(k, {k, label, sub, rank, parent: g.grp === 'etq' ? '' : (parent || ''), items:[]});
    groups.get(k).items.push(a);
  }
  const G = [...groups.values()].sort((x, y) => x.rank - y.rank || x.label.localeCompare(y.label, 'pt') || x.sub.localeCompare(y.sub, 'pt'));
  for (const gr of G) gr.items.sort((x, y) => x.noite.localeCompare(y.noite) || fimOf(x).localeCompare(fimOf(y)) || prRank(x.prioridade) - prRank(y.prioridade));
  return {ini, n, fim, hoje, ft, acts, G, mesLbl};
}
const ZLBL = {sem:'Semana', qui:'Quinzena', mes:'Mês'};
function ganttCtx(D, g, titulo, filtros, arquivo){
  const now = new Date();
  return {...D, fimOf, avOf, localLine, nightsBetween, addDays, parseYmd, fmtShort, statusLabel: k => STATUS[k]?.label || k,
    turnoDe: a => turnoOf(a), nomeDe: id => id ? shortName(nameOf(id)) : '', tagCor, lojaDe: a => a.tipoLocal === 'pilar' && g.grp !== 'etq' ? pilarLojaOf(a) : '',
    titulo, sub: `${fmtShort(D.ini)} a ${fmtShort(D.fim)}/${D.fim.slice(0, 4)} · ${ZLBL[g.zoom]} · por ${g.grp === 'etq' ? 'etiqueta' : 'local'} · ${D.ft ? 'turno ' + TURNOS[D.ft].toLowerCase() : 'turnos diurno e noturno'}${g.conc ? '' : ' · sem concluídas'}`,
    filtros, emitidoEm: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} às ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    emitidoPor: S.perfil?.nome || 'Usuário', logoUrl: 'logo-saeng.png', arquivo};
}
let gerandoGt = false;
async function exportGanttPdf(){
  if (gerandoGt) return;
  const D = gtData();
  if (!D.acts.length){ toast('Nenhuma atividade no calendário deste período.'); return; }
  gerandoGt = true; toast('Gerando o PDF do calendário…');
  try {
    const { gerarGanttPDF } = await import('./relatorio.js?v=37');
    const Z = {sem:'Semana', qui:'Quinzena', mes:'Mês'};
    await gerarGanttPDF(ganttCtx(D, S.gt, 'Calendário de atividades', filtrosTxt(), `Calendario_Atividades_${D.ini}_a_${D.fim}${D.ft ? '_' + D.ft : ''}.pdf`));
    toast('PDF do calendário gerado.');
    logExport('calendario', {arquivo: `Calendario_Atividades_${D.ini}_a_${D.fim}${D.ft ? '_' + D.ft : ''}.pdf`, qtd: D.acts.length, periodo: `${fmtShort(D.ini)} a ${fmtShort(D.fim)}/${D.fim.slice(0, 4)} · ${Z[S.gt.zoom].toLowerCase()} · ${D.ft ? 'turno ' + TURNOS[D.ft].toLowerCase() : 'turnos diurno e noturno'}`, filtros: filtrosTxt()});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar o PDF. Tente de novo.' : 'Para gerar o PDF pela primeira vez é preciso internet.'); }
  finally { gerandoGt = false; }
}
function renderGantt(){
  const g = S.gt, {ini, n} = gtRange(), fim = addDays(ini, n - 1), hoje = defaultNight(), ft = S.f.turno;
  if (ini < S.winFrom){ S.winFrom = addDays(ini, -7); subscribeWindow(); }
  for (const b of document.querySelectorAll('#gt-zoom button')) b.setAttribute('aria-pressed', String(b.dataset.z === g.zoom));
  for (const b of document.querySelectorAll('#gt-grp button')) b.setAttribute('aria-pressed', String(b.dataset.g === g.grp));
  for (const b of document.querySelectorAll('#gt-turno button')) b.setAttribute('aria-pressed', String((b.dataset.t || '') === ft));
  $('gt-conc').checked = g.conc;
  $('gt-hoje').disabled = hoje >= ini && hoje <= fim;
  const nf = [S.f.status, S.f.tipo, S.f.loc, S.f.forn, S.f.etq, S.f.autor, S.f.q].filter(x => x.length).length;
  $('gt-filt').hidden = !nf;
  if (nf) $('gt-filt').innerHTML = `<span>Filtros da tela Atividades aplicados: <b>${esc(filtrosTxt())}</b></span><button type="button" class="link-btn" id="gt-fclear">Limpar</button>`;
  const D = gtData(), acts = D.acts, mesLbl = D.mesLbl;
  $('gt-sub').textContent = `${fmtShort(ini)} a ${fmtShort(fim)}/${fim.slice(0, 4)} · ${acts.length} ${acts.length === 1 ? 'atividade' : 'atividades'}`;
  const wrap = $('gt-wrap');
  if (!acts.length){ wrap.innerHTML = `<div class="empty gt-empty"><b>Nenhuma atividade de ${fmtShort(ini)} a ${fmtShort(fim)}</b>Use as setas para ver outro período${nf ? ' ou limpe os filtros' : ''}.</div>`; $('gt-leg').innerHTML = ''; return; }
  const r = ganttHTML(D, g, wrap, {dias:true});
  const sl = wrap.scrollLeft, st = wrap.scrollTop;
  wrap.innerHTML = r.html;
  if (g.jump){ g.jump = false; wrap.scrollTop = 0; wrap.scrollLeft = r.ti >= 0 && r.ti < n ? Math.max(0, r.ti * r.cw - r.avail / 3) : 0; }
  else { wrap.scrollLeft = sl; wrap.scrollTop = st; }
  $('gt-leg').innerHTML = ganttLegenda('Toque numa atividade para abrir, ou num dia para ver só as atividades dele.');
}
const ganttLegenda = dica => ['programada','andamento','parcial','nao_iniciada','impedida','concluida'].map(k => `<span><i class="sw" style="--c:${cvar(k)}"></i>${esc(STATUS[k].label)}</span>`).join('')
  + `<span><i class="sw tail"></i>Atraso</span><span><i class="sw now"></i>Hoje</span><span class="gt-leg-tx">A parte mais forte da barra é o avanço. ${dica}</span>`;
// monta o gráfico (usado no calendário principal e no da página do local)
function ganttHTML(D, g, wrap, opt = {}){
  const {ini, n, hoje} = D, G = D.G, mesLbl = D.mesLbl;
  // medidas
  const mob = innerWidth <= 760, lw = mob ? 138 : 300;
  const avail = Math.max(200, (wrap.clientWidth || innerWidth - 32) - lw - 2);
  const cw = Math.max(mob ? (n <= 7 ? 40 : 34) : (n <= 7 ? 64 : 30), Math.floor(avail / n));
  const days = Array.from({length:n}, (_, i) => addDays(ini, i)), di = s => nightsBetween(ini, s), ti = di(hoje);
  const we = d => { const x = parseYmd(d).getDay(); return x === 0 || x === 6; };
  let h = `<div class="gt" style="--lw:${lw}px;--cw:${cw}px;width:${lw + n * cw}px">`;
  h += `<div class="gt-h"><div class="gt-corner">${mesLbl}</div>${days.map(d => { const dt = parseYmd(d); return `<div class="gt-d${we(d) ? ' we' : ''}${d === hoje ? ' today' : ''}${dt.getDate() === 1 && d !== ini ? ' m1' : ''}" data-dia="${d}" role="button" tabindex="0" ${opt.dias ? '' : 'data-sem-dia '}title="Ver as atividades de ${fmtShort(d)}">${dt.getDate() === 1 && d !== ini ? `<em>${MESES[dt.getMonth()]}</em>` : ''}<span>${DOW3[dt.getDay()]}</span><b>${dt.getDate()}</b></div>`; }).join('')}</div>`;
  h += `<div class="gt-b"><div class="gt-cols">${days.map((d, i) => we(d) ? `<i style="left:${i * cw}px;width:${cw}px"></i>` : '').join('')}</div>`;
  if (ti >= 0 && ti < n) h += `<div class="gt-now" style="left:calc(var(--lw) + ${(ti + .5) * cw}px)"></div>`;
  const span = items => [Math.max(0, Math.min(...items.map(a => di(a.noite)))), Math.min(n - 1, Math.max(...items.map(a => Math.max(di(fimOf(a)), a.aberta && fimOf(a) < hoje ? ti : -1))))];
  let lastParent = '';
  for (const gr of G){
    if (gr.parent && gr.parent !== lastParent){
      const kids = G.filter(x => x.parent === gr.parent), all_ = kids.flatMap(x => x.items), [ps, pe] = span(all_);
      h += `<div class="gt-g gt-par"><div class="gt-gn"><b>${esc(gr.parent)}</b><span>${kids.length} ${kids.length === 1 ? 'pilar' : 'pilares'}</span><em>${all_.filter(a => a.status === 'concluida').length}/${all_.length}</em></div>
        <div class="gt-gt">${pe >= ps ? `<span class="gt-sum par" style="left:${ps * cw + 3}px;width:${(pe - ps + 1) * cw - 6}px"></span>` : ''}</div></div>`;
    }
    lastParent = gr.parent || '';
    const items = gr.items;
    const gs = Math.max(0, Math.min(...items.map(a => di(a.noite)))), ge = Math.min(n - 1, Math.max(...items.map(a => Math.max(di(fimOf(a)), a.aberta && fimOf(a) < hoje ? ti : -1))));
    const done = items.filter(a => a.status === 'concluida').length;
    h += `<div class="gt-g${gr.parent ? ' gt-child' : ''}"><div class="gt-gn${gr.k.startsWith('e:') ? ' etq-g' : ''}"${gr.k.startsWith('e:') ? ` style="--tc:${tagCor(gr.label)}"` : ''}>${gr.k.startsWith('e:') ? ICON_TAG : ''}<b>${esc(gr.label)}</b>${gr.sub && !mob ? `<span>${esc(gr.sub)}</span>` : ''}<em>${done}/${items.length}</em></div>
      <div class="gt-gt">${ge >= gs ? `<span class="gt-sum" style="left:${gs * cw + 3}px;width:${(ge - gs + 1) * cw - 6}px"></span>` : ''}</div></div>`;
    for (const a of items){
      const st = STATUS[a.status] || STATUS.programada, av = avOf(a), i0 = di(a.noite), i1 = di(fimOf(a));
      const s0 = Math.max(0, i0), e0 = Math.min(n - 1, i1);
      let bar = '';
      if (e0 >= s0){
        const w = (e0 - s0 + 1) * cw - 6;
        const lab = w >= 150 ? `${esc(st.label)} · ${av}%` : w >= 42 ? `${av}%` : '';
        bar = `<span class="gt-bar${i0 < 0 ? ' cl' : ''}${i1 > n - 1 ? ' cr' : ''}${a.status === 'concluida' ? ' ok' : ''}" style="left:${s0 * cw + 3}px;width:${w}px;--c:${cvar(a.status)}"><i style="width:${av}%"></i><em>${lab}</em></span>`;
      }
      let tail = '';
      if (a.aberta && fimOf(a) < hoje){
        const t0 = Math.max(0, i1 + 1), t1 = Math.min(n - 1, ti);
        if (t1 >= t0){ const w = (t1 - t0 + 1) * cw - 3, d = nightsBetween(fimOf(a), hoje); tail = `<span class="gt-tail" style="left:${t0 * cw - (i1 + 1 >= 0 ? 3 : -3)}px;width:${w}px" title="${d} ${d === 1 ? 'dia' : 'dias'} de atraso">${w >= 46 ? `+${d}d` : ''}</span>`; }
      }
      const meta = [g.grp === 'etq' ? localLine(a) : a.tipoLocal === 'pilar' ? pilarLojaOf(a) : '', a.fornecedor, a.criadoPor ? shortName(nameOf(a.criadoPor)) : ''].filter(Boolean).join(' · ');
      h += `<div class="gt-r${gr.parent ? ' in-child' : ''}" data-id="${esc(a.id)}" role="button" tabindex="0" title="${esc(a.titulo)} · ${fmtPeriodo(a)} · ${esc(st.label)} ${av}%">
        <div class="gt-n"><b>${a.prioridade === 'critica' || a.prioridade === 'alta' ? `<i class="gt-p ${a.prioridade}"></i>` : ''}<span class="gt-tt">${esc(a.titulo)}</span></b><small><span class="t-ic ${turnoOf(a)}">${turnoOf(a) === 'diurno' ? ICON_SOL : ICON_LUA}</span>${esc(meta)}</small></div>
        <div class="gt-t">${tail}${bar}</div></div>`;
    }
  }
  h += '</div></div>';
  return {html: h, ti, cw, avail};
}

/* ================= etiquetas ================= */
function renderEtq(){
  const cat = tagCatalog();
  $('etq-home').hidden = !!S.etq; $('etq-page').hidden = !S.etq;
  if (S.etq){
    const x = cat.get(tagKey(S.etq));
    if (x) return renderEtqPage(x);
    // durante uma renomeação, ou se a etiqueta saiu de todas as atividades
    $('etq-page').innerHTML = `<div class="cad-page"><button type="button" class="back" data-etq-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>Etiquetas</button><div class="empty"><b>${esc(S.etq)}</b>Nenhuma atividade com esta etiqueta no momento.</div></div>`;
    return;
  }
  const q = tagKey($('etq-q').value), list = [...cat.values()].filter(x => !q || x.k.includes(q));
  const row = x => `<button type="button" class="cad-row etq-row" data-etq="${esc(x.nome)}" style="--tc:${tagCor(x.nome)}">
      <span class="etq-ico">${ICON_TAG}</span>
      <span class="cad-tx"><b>${esc(x.nome)}</b><span>${x.n} ${x.n === 1 ? 'atividade' : 'atividades'}${x.abertas ? ` · ${x.abertas} em aberto` : ' · encerrada'} · ${x.ini === x.fim ? fmtShort(x.ini) : `${fmtShort(x.ini)} → ${fmtShort(x.fim)}`}</span>
        <span class="etq-av">${progBar(x.av)}</span></span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>`;
  const ab = list.filter(x => x.abertas).sort((a, b) => b.ult - a.ult), enc = list.filter(x => !x.abertas).sort((a, b) => b.fim.localeCompare(a.fim));
  if (!cat.size){ $('etq-list').innerHTML = `<div class="empty"><b>Nenhuma etiqueta ainda</b>Ao inserir ou editar uma atividade, use o campo “Etiquetas” para ligá-la a um serviço macro, por exemplo “Demolição alvenaria eixo 8”. As atividades com a mesma etiqueta aparecem juntas aqui.</div>`; return; }
  $('etq-list').innerHTML = !list.length ? '<div class="empty">Nenhuma etiqueta com essa busca.</div>'
    : (ab.length ? `<div class="sec-h"><h2>Em andamento</h2><span>${ab.length}</span></div><div class="cad-menu">${ab.map(row).join('')}</div>` : '')
    + (enc.length ? `<div class="sec-h" style="margin-top:22px"><h2>Encerradas</h2><span>${enc.length}</span></div><div class="cad-menu">${enc.map(row).join('')}</div>` : '');
}
function renderEtqPage(x){
  const hoje = defaultNight(), cor = tagCor(x.nome);
  const cnt = {}; ORDER.forEach(k => cnt[k] = 0); x.acts.forEach(a => { cnt[a.status] = (cnt[a.status] || 0) + 1; });
  const atras = x.acts.filter(a => a.aberta && fimOf(a) < hoje).length;
  const bar = ORDER.filter(k => cnt[k]).map(k => `<i style="width:${(cnt[k] / x.n * 100).toFixed(2)}%;background:${cvar(k)}" title="${esc(STATUS[k].label)}: ${cnt[k]}"></i>`).join('');
  const leg = ORDER.filter(k => cnt[k]).map(k => `<span><i class="dot" style="--c:${cvar(k)}"></i>${cnt[k]} ${esc(stN(k, cnt[k]))}</span>`).join('');
  const ab = x.acts.filter(a => a.aberta).sort((a, b) => a.noite.localeCompare(b.noite) || fimOf(a).localeCompare(fimOf(b)) || prRank(a.prioridade) - prRank(b.prioridade));
  const enc = x.acts.filter(a => !a.aberta).sort((a, b) => fimOf(b).localeCompare(fimOf(a)) || b.noite.localeCompare(a.noite));
  const encOpen = S.etqEnc || !ab.length;
  $('etq-page').innerHTML = `<div class="cad-page etq-page">
    <button type="button" class="back" data-etq-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>Etiquetas</button>
    <div class="etq-head" style="--tc:${cor}">
      <span class="etq-ico lg">${ICON_TAG}</span>
      <div class="etq-ht"><h1>${esc(x.nome)}</h1><p>${x.n} ${x.n === 1 ? 'atividade' : 'atividades'} · ${x.ini === x.fim ? fmtDay(x.ini) : `${fmtShort(x.ini)} a ${fmtShort(x.fim)}`}</p></div>
      ${isAdmin() ? `<div class="menu"><button type="button" class="ibtn" id="etq-more-b" aria-haspopup="true" aria-label="Opções da etiqueta"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
        <div class="menu-pop" id="etq-more-pop" hidden><button type="button" data-etq-act="ren">Renomear etiqueta</button><button type="button" class="m-danger" data-etq-act="del">Remover de todas as atividades</button></div></div>` : ''}
    </div>
    <div class="etq-kpis">
      <div class="kp"><span>Avanço médio</span><b>${x.av}%</b>${progBar(x.av)}</div>
      <div class="kp"><span>Concluídas</span><b>${x.conc}<small> de ${x.n - cnt.cancelada}</small></b></div>
      <div class="kp"><span>Em aberto</span><b>${x.abertas}</b></div>
      <div class="kp${atras ? ' warn' : ''}"><span>Atrasadas</span><b>${atras}</b></div>
    </div>
    <div class="etq-st"><div class="bar" role="img" aria-label="Distribuição por status">${bar}</div><div class="sum-leg">${leg}</div></div>
    <div class="etq-acts">
      <button type="button" class="btn" id="etq-crono"><span class="exp-ic xls">XLS</span>Cronograma desta etiqueta</button>
      ${canWrite() ? `<button type="button" class="btn pri" id="etq-new"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nova atividade com esta etiqueta</button>` : ''}
    </div>
    ${ab.length ? `<div class="sec"><div class="sec-h"><h2>Em aberto</h2><span>${ab.length}</span></div><div class="cards">${ab.map(a => card(a, fimOf(a) < hoje, hoje, true, x.nome)).join('')}</div></div>` : ''}
    ${enc.length ? `<div class="sec"><div class="sec-h"><h2>Concluídas e canceladas</h2><span>${enc.length}</span>${ab.length ? `<button type="button" class="link-btn" id="etq-enc-tg">${encOpen ? 'Ocultar' : 'Mostrar'}</button>` : ''}</div>${encOpen ? `<div class="cards">${enc.map(a => card(a, false, hoje, true, x.nome)).join('')}</div>` : ''}</div>` : ''}
  </div>`;
}
function openTag(nome){
  if (S.openId) closeDrawer();
  S.etq = nome; S.etqEnc = false;
  if (S.tab !== 'etq') setTab('etq'); else { window.scrollTo({top:0}); renderAll(); }
}
// Renomear ou remover uma etiqueta em todas as atividades (administrador). Cada atividade vai num lote próprio com o seu registro de histórico.
async function retag(antigo, novo){
  const k = tagKey(antigo), acts = [...all().values()].filter(a => hasTag(a, antigo));
  if (!acts.length) return;
  toast(`Atualizando ${acts.length} ${acts.length === 1 ? 'atividade' : 'atividades'}…`);
  let ok = 0;
  await Promise.all(acts.map(a => {
    const de = tagsOf(a), nv = [];
    for (const t of de){ const v = tagKey(t) === k ? novo : t; if (v && !nv.some(x => tagKey(x) === tagKey(v))) nv.push(v); }
    const histRef = doc(collection(db, 'historico')), b = writeBatch(db);
    b.update(doc(db, 'atividades', a.id), {etiquetas:nv, temEtiqueta:nv.length > 0, atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:histRef.id});
    b.set(histRef, evDoc(a.id, a, {tipo:'editou', mudancas:[{campo:'etiquetas', de:de.join(', '), para:nv.join(', ')}]}));
    return b.commit().then(() => { ok++; }, e => console.warn(e));
  }));
  toast(ok === acts.length ? (novo ? `Etiqueta renomeada em ${ok} ${ok === 1 ? 'atividade' : 'atividades'}.` : `Etiqueta removida de ${ok} ${ok === 1 ? 'atividade' : 'atividades'}.`) : `Atualizadas ${ok} de ${acts.length}. Tente de novo para as restantes.`);
}
function openRetag(mode){
  const x = tagCatalog().get(tagKey(S.etq)); if (!x || !isAdmin()) return;
  if (mode === 'ren'){
    $('sheet').innerHTML = `<h2>Renomear etiqueta</h2><p class="ro" style="margin:-6px 0 14px">O novo nome vale para as ${x.n} atividades. Se já existir outra etiqueta com esse nome, as duas viram uma só. Cada mudança fica no histórico.</p>
      <form id="rf"><div class="f"><label for="rf-n">Novo nome</label><input id="rf-n" maxlength="60" value="${esc(x.nome)}" autocomplete="off"></div>
      <div class="acts"><button type="button" class="btn ghost" id="rf-c">Cancelar</button><button class="btn pri" type="submit">Renomear</button></div></form>`;
    $('rf').onsubmit = e => {
      e.preventDefault(); const n = normTag($('rf-n').value);
      if (!n) return toast('Informe o nome.'); if (n === x.nome){ closeModal(); return; }
      const ex = tagCatalog().get(tagKey(n)), alvo = ex && ex.k !== x.k ? ex.nome : n;
      closeModal(); S.etq = alvo; retag(x.nome, alvo).then(renderAll);
    };
    setTimeout(() => $('rf-n').select(), 30);
  } else {
    $('sheet').innerHTML = `<h2>Remover a etiqueta?</h2><p class="ro" style="margin:-6px 0 14px">“${esc(x.nome)}” sai das ${x.n} atividades. As atividades continuam como estão, só sem essa etiqueta. Cada mudança fica no histórico.</p>
      <div class="acts"><button type="button" class="btn ghost" id="rf-c">Manter</button><button type="button" class="btn danger" id="rf-del">Remover etiqueta</button></div>`;
    $('rf-del').onclick = () => { closeModal(); S.etq = null; retag(x.nome, '').then(renderAll); };
  }
  $('rf-c').onclick = closeModal;
  showModal();
}

/* ================= cadastros ================= */
const ICONS = {
  usuarios:'<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>',
  fornecedores:'<path d="M3 21V8l6-4v4l6-4v4l6-4v17z"/><path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2M15 17.5h2"/>',
  setores:'<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  niveis:'<path d="M4 20h16M4 15h12M4 10h8M4 5h4"/>',
  pilares:'<path d="M6 21V3M18 21V3M3 3h18M3 21h18M10 7v10M14 7v10"/>',
  locais:'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;
const CAD_DEF = [
  {key:'fornecedores', title:'Fornecedores', hint:'Empresas que atuam na obra.', cols:[['nome','Nome da empresa'],['disciplina','Disciplina (opcional)']], k:'nome', v:'disciplina'},
  {key:'setores', title:'Setores', hint:'Código e frentes principais de cada setor.', cols:[['codigo','Código (ex.: D1)'],['descricao','Descrição']], k:'codigo', v:'descricao'},
  {key:'niveis', title:'Níveis', hint:'Cotas de nível usadas nos relatos (m).', cols:[['valor','Nível (ex.: 114,30)']], k:'valor'},
  {key:'pilares', title:'Pilares', hint:'Cadastre o mesmo pilar uma vez para cada loja ou ambiente que ele atravessa (ex.: P34 · Loja Lenny e P34 · Loja Corello).', cols:[['codigo','Pilar (ex.: P34)'],['eixo','Eixo (ex.: M/11)'],['referencia','Loja / ambiente'],['setor','Setor']], k:'codigo', v:'referencia', v2:'eixo'},
  {key:'locais', title:'Locais do shopping', hint:'Lojas, mall, estacionamento e áreas de apoio. Informe o setor da obra a que cada local pertence: ao filtrar o setor, os trabalhos do local também aparecem.', cols:[['nome','Nome do local'],['setor','Setor']], k:'nome'},
];
const cadItemText = (d, it) => { const o = typeof it === 'string' ? {[d.k]:it} : it || {}; return {o, k:o[d.k], v:[d.v2 ? o[d.v2] : '', d.v ? o[d.v] : ''].filter(Boolean).join(' · ')}; };

function renderCad(){
  const admin = isAdmin();
  if (S.cadSub === 'usuarios' && !admin) S.cadSub = null;
  const view = $('cad');
  // página de um assunto já aberta: atualiza só a lista, sem apagar o que está sendo digitado
  if (S.cadSub && view.dataset.key === S.cadSub){ renderCadList(); return; }
  view.dataset.key = S.cadSub || '';
  view.classList.toggle('sub', !!S.cadSub);
  $('cad-head').hidden = !!S.cadSub;
  if (!S.cadSub){
    const empty = S.cadLoaded && CAD_DEF.every(d => !(S.cad[d.key]||[]).length);
    $('cad-sub').innerHTML = admin ? 'Toque em um assunto para ver a lista e cadastrar.' : 'Listas usadas nos formulários. Só administradores alteram.';
    const pend = Object.values(S.usuarios).filter(u => u.papel === 'pendente').length;
    const rows = [];
    if (admin) rows.push({key:'usuarios', title:'Usuários e acessos', hint:pend ? `${pend} aguardando liberação` : 'Liberar, bloquear e definir papéis', count:Object.keys(S.usuarios).length, alert:pend});
    for (const d of CAD_DEF) rows.push({key:d.key, title:d.title, hint:d.hint, count:(S.cad[d.key]||[]).length});
    view.innerHTML = `${admin && empty ? `<div class="seed"><div><b>Os cadastros estão vazios.</b><span>Carregue a lista da obra: 28 fornecedores, 10 setores, níveis, pilares e locais.</span></div><button type="button" class="btn pri" id="b-seed">Carregar lista inicial</button></div>` : ''}
      <div class="cad-menu">${rows.map(r => `<button type="button" class="cad-row" data-cad="${r.key}">
        <span class="cad-ico">${ico(r.key)}</span>
        <span class="cad-tx"><b>${esc(r.title)}</b><span class="${r.alert ? 'alert' : ''}">${esc(r.hint)}</span></span>
        <span class="cad-n">${S.cadLoaded || r.key === 'usuarios' ? r.count : '…'}</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>`).join('')}</div>`;
    return;
  }
  const isU = S.cadSub === 'usuarios', d = CAD_DEF.find(x => x.key === S.cadSub);
  const title = isU ? 'Usuários e acessos' : d.title, hint = isU ? 'Usuário insere e atualiza atividades. Visualizador só consulta e exporta. Administrador também altera cadastros, libera pessoas e exclui atividades.' : d.hint;
  view.innerHTML = `<div class="cad-page">
    <button type="button" class="back" data-cad-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>Cadastros</button>
    <div class="cad-title"><span class="cad-ico">${ico(S.cadSub)}</span><div><h1>${esc(title)}</h1><p>${esc(hint)}</p></div></div>
    ${!isU && admin ? `<form class="cad-add" data-add="${d.key}"><div class="cad-add-h">Novo cadastro</div><div class="cad-add-f">${d.cols.map(([c,l]) => c === 'setor' ? `<select id="cad-${d.key}-${c}" name="${c}" aria-label="${l}"><option value="">Setor da obra (opcional)</option>${S.cad.setores.map(x => `<option value="${esc(x.codigo)}">Setor ${esc(x.codigo)}</option>`).join('')}</select>` : `<input id="cad-${d.key}-${c}" name="${c}" placeholder="${l}" aria-label="${l}" autocomplete="off">`).join('')}<button class="btn pri" type="submit">Adicionar</button></div></form>` : ''}
    <div class="search cad-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="cad-q" placeholder="Buscar em ${esc(title.toLowerCase())}…" aria-label="Buscar" autocomplete="off"></div>
    <div class="cad-list-h"><span id="cad-count"></span></div>
    <div class="cad-list" id="cad-list"></div>
  </div>`;
  $('cad-q').oninput = renderCadList;
  renderCadList();
}
function renderCadList(){
  const list = $('cad-list'); if (!list) return;
  const admin = isAdmin(), q = ($('cad-q')?.value || '').trim().toLowerCase();
  if (S.cadSub === 'usuarios'){
    const ord = {pendente:0, admin:1, usuario:2, visualizador:3, bloqueado:4};
    const us = Object.entries(S.usuarios).filter(([,u]) => !q || [u.nome,u.email,u.funcao,PAPEIS[u.papel]].join(' ').toLowerCase().includes(q))
      .sort(([,a],[,b]) => (ord[a.papel] ?? 9) - (ord[b.papel] ?? 9) || String(a.nome).localeCompare(String(b.nome),'pt'));
    $('cad-count').textContent = `${us.length} ${us.length === 1 ? 'pessoa' : 'pessoas'}`;
    list.innerHTML = us.length ? us.map(([id,u]) => `<div class="cad-item user ${esc(u.papel)}">
      <span class="av sm">${esc(initials(u.nome))}</span>
      <div class="ci-tx"><b>${esc(u.nome)}${id === S.uid ? ' <span class="ro">(você)</span>' : ''}</b><span>${esc([u.funcao, u.email].filter(Boolean).join(' · '))}</span></div>
      <span class="badge ${u.papel}">${esc(u.papel === 'pendente' ? 'Pendente' : PAPEIS[u.papel] || u.papel)}</span>
      ${id === S.uid ? '<span class="u-sp"></span>' : `<div class="menu u-menu"><button type="button" class="ibtn u-more" data-umenu="${id}" aria-haspopup="true" aria-expanded="${S.uMenu === id}" aria-label="Ações para ${esc(u.nome)}"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
        <div class="menu-pop u-pop"${S.uMenu === id ? '' : ' hidden'}>${userActions(id, u.papel)}</div></div>`}
    </div>`).join('') : '<div class="empty">Ninguém encontrado.</div>';
    return;
  }
  const d = CAD_DEF.find(x => x.key === S.cadSub); if (!d) return;
  const all = (S.cad[d.key] || []).map((it, i) => ({i, ...cadItemText(d, it)}));
  const items = all.filter(x => !q || (x.k + ' ' + x.v).toLowerCase().includes(q));
  $('cad-count').textContent = q ? `${items.length} de ${all.length}` : `${all.length} ${all.length === 1 ? 'item' : 'itens'}`;
  list.innerHTML = items.length ? items.map(x => `<div class="cad-item">
      <div class="ci-tx"><b>${esc(x.k)}</b>${x.v ? `<span>${esc(x.v)}</span>` : ''}</div>
      ${d.key === 'pilares' || d.key === 'locais' ? (admin ? `<select class="ci-setor" data-cad-setor="${d.key}:${x.i}" aria-label="Setor de ${esc(x.k)}"><option value="">Sem setor</option>${S.cad.setores.map(z => `<option value="${esc(z.codigo)}" ${z.codigo === (x.o.setor || '') ? 'selected' : ''}>Setor ${esc(z.codigo)}</option>`).join('')}</select>` : (x.o.setor ? `<span class="ci-st">Setor ${esc(x.o.setor)}</span>` : '')) : ''}
      ${admin ? (S.cadDel === `${d.key}:${x.i}` ? `<div class="ci-conf"><span>Remover?</span><button type="button" class="btn danger" data-del="${d.key}:${x.i}">Sim</button><button type="button" class="btn" data-del-cancel>Não</button></div>`
        : `<button type="button" class="x" data-del-ask="${d.key}:${x.i}" aria-label="Remover ${esc(x.k)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`) : ''}
    </div>`).join('') : `<div class="empty">${S.cadLoaded ? (q ? 'Nada encontrado com essa busca.' : 'Lista vazia.') : 'Carregando…'}</div>`;
}
// ações do menu ⋯ de cada pessoa, conforme o papel atual
function userActions(id, papel){
  const it = (p, label, cls = '') => `<button type="button" class="${cls}" data-papel="${id}:${p}">${label}</button>`;
  const L = {
    pendente: [it('usuario','Liberar como usuário','m-pri'), it('visualizador','Liberar como visualizador'), it('bloqueado','Recusar acesso','m-danger')],
    usuario: [it('admin','Tornar administrador'), it('visualizador','Tornar visualizador'), it('bloqueado','Bloquear','m-danger')],
    visualizador: [it('usuario','Tornar usuário'), it('admin','Tornar administrador'), it('bloqueado','Bloquear','m-danger')],
    admin: [it('usuario','Remover administrador (vira usuário)'), it('visualizador','Tornar visualizador')],
    bloqueado: [it('usuario','Reativar como usuário'), it('visualizador','Reativar como visualizador')],
  };
  return `<span class="ro">${esc(nameOf(id))} · ${esc(PAPEIS[papel] || papel)}</span>` + (L[papel] || L.bloqueado).join('');
}
async function saveCad(next){
  try { await setDoc(doc(db, 'config', 'cadastros'), {...next, atualizadoPor:S.uid, atualizadoEm:serverTimestamp()}); return true; }
  catch (e) { toast(e?.code === 'permission-denied' ? 'Só administradores alteram os cadastros.' : 'Não foi possível salvar o cadastro.'); return false; }
}
const MS = {
  'ms-loc':   {ph:'Todos os locais', key:'loc', opts: () => locItems()},
  'ms-forn':  {ph:'Todos os fornecedores', key:'forn', opts: () => {
    const used = new Set(S.cad.fornecedores.map(x => x.nome)); let none = false;
    for (const a of all().values()){ if (a.fornecedor) used.add(a.fornecedor); else none = true; }
    return [...(none ? [{v:'__none__', l:'Sem fornecedor informado'}] : []), ...[...used].sort((a, b) => a.localeCompare(b, 'pt')).map(n => ({v:n, l:n}))];
  }},
  'ms-etq':   {ph:'Todas as etiquetas', key:'etq', opts: () => [...tagCatalog().values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).map(x => ({v:x.nome, l:x.nome, sub:`${x.n} ${x.n === 1 ? 'atividade' : 'atividades'}`}))},
  'ms-autor': {ph:'Todas as pessoas', key:'autor', opts: () => {
    const ids = new Set();
    for (const a of all().values()) if (a.criadoPor) ids.add(a.criadoPor);
    for (const [id, u] of Object.entries(S.usuarios)) if (['usuario','admin'].includes(u.papel)) ids.add(id);
    return [...ids].sort((x, y) => nameOf(x).localeCompare(nameOf(y), 'pt')).map(id => ({v:id, l:nameOf(id), sub:roleOf(id)}));
  }},
};
function msLabel(id){
  const c = MS[id], sel = S.f[c.key], el = $(id);
  let t = c.ph;
  if (sel.length === 1){ const o = c.opts().find(x => x.v === sel[0]); t = o ? o.l.split(' — ')[0] : sel[0]; }
  else if (sel.length > 1) t = `${sel.length} selecionados`;
  el.querySelector('.ms-lbl').textContent = t; el.classList.toggle('on', sel.length > 0);
}
function msRender(id){
  const c = MS[id], el = $(id), q = tagKey(el.querySelector('.ms-q').value), sel = new Set(S.f[c.key]);
  const opts = c.opts().filter(o => !q || tagKey(o.l + ' ' + (o.sub || '')).includes(q));
  let g = null, h = '';
  for (const o of opts){
    if (o.g && o.g !== g){ g = o.g; h += `<div class="ms-g">${esc(g)}</div>`; }
    h += `<label class="ms-opt"><input type="checkbox" value="${esc(o.v)}" ${sel.has(o.v) ? 'checked' : ''}><span class="ms-ol">${esc(o.l)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></label>`;
  }
  el.querySelector('.ms-list').innerHTML = h || '<div class="ms-empty">Nada encontrado.</div>';
}
function msClose(except){ for (const id of Object.keys(MS)) if (id !== except){ const p = $(id).querySelector('.ms-pop'); if (!p.hidden){ p.hidden = true; $(id).querySelector('.ms-btn').setAttribute('aria-expanded', 'false'); } } }
function fillFilterOptions(){
  // remove do filtro de local o que não pertence mais aos tipos marcados
  const okLoc = new Set(locItems().map(o => o.v)); S.f.loc = S.f.loc.filter(v => okLoc.has(v));
  for (const id of Object.keys(MS)){ msLabel(id); if (!$(id).querySelector('.ms-pop').hidden) msRender(id); }
  for (const b of document.querySelectorAll('#f-tipo .chip')) b.setAttribute('aria-pressed', String(S.f.tipo.includes(b.dataset.tipo)));
}

/* ================= render geral ================= */
function renderAll(){
  if (!S.started) return;
  if (S.loc) renderLocal(); else if (S.tab === 'noite') renderNight(); else if (S.tab === 'hist') renderFeed(); else if (S.tab === 'etq') renderEtq(); else if (S.tab === 'gantt') renderGantt(); else if (S.tab === 'pend') renderPend(); else renderCad();
  if (S.openId){ renderDrawerHead(); renderTimeline(); if (!S.dwMode) renderDrawerActions(); }
  updPendBadge(); renderWho();
  $('exp-ia').hidden = !isAdmin(); // exportação para o Claude: só administradores
}
const shortName = n => { const p = String(n||'').trim().split(/\s+/).filter(Boolean); return p.length > 2 ? `${p[0]} ${p[p.length-1]}` : p.join(' '); };
function initials(n){ const p = String(n||'').trim().split(/\s+/).filter(Boolean); return ((p[0]||'?')[0] + (p.length > 1 ? p[p.length-1][0] : '')).toUpperCase(); }
function renderWho(){
  const n = S.perfil?.nome || 'Você', r = S.perfil?.funcao || '';
  $('who-av').textContent = initials(n);
  $('who-name').innerHTML = `${esc(n)}${r ? ` <small>· ${esc(r)}</small>` : ''}`;
  $('who-email').textContent = `${S.email} · ${(PAPEIS[S.perfil?.papel] || '').toLowerCase()}`;
  const ro = S.perfil?.papel === 'visualizador';
  $('banner').hidden = !ro;
  if (ro) $('banner').innerHTML = '<b>Acesso de visualização.</b> Você consulta as atividades, o histórico e pode exportar, mas não insere nem altera nada.';
}
function closeMore(){ for (const id of ['tab-more-pop','bn-more-pop']){ const p = $(id); if (p) p.hidden = true; } for (const b of document.querySelectorAll('[data-more]')) b.setAttribute('aria-expanded', 'false'); }
function setTab(t){
  if (t === 'cad' && S.tab === 'cad') S.cadSub = null;
  if (t === 'etq' && S.tab === 'etq') S.etq = null;
  S.loc = null; $('v-local').hidden = true;
  S.tab = ['noite','pend','gantt','etq','hist','cad'].includes(t) ? t : 'noite';
  if (S.tab === 'gantt') S.gt.jump = true;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
  // Etiquetas, Histórico e Cadastros ficam no menu "Mais"
  { const inMore = ['etq','hist','cad'].includes(S.tab), LBL = {etq:'Etiquetas', hist:'Histórico', cad:'Cadastros'};
    for (const b of document.querySelectorAll('.tab-more-b')) b.setAttribute('aria-selected', String(inMore));
    const ml = document.querySelector('.tabs .tm-l'); if (ml) ml.textContent = inMore ? LBL[S.tab] : 'Mais';
    for (const x of document.querySelectorAll('[data-go]')) x.classList.toggle('on', x.dataset.go === S.tab);
    closeMore(); }
  $('v-noite').hidden = S.tab !== 'noite'; $('v-gantt').hidden = S.tab !== 'gantt'; $('v-etq').hidden = S.tab !== 'etq'; $('v-hist').hidden = S.tab !== 'hist'; $('v-cad').hidden = S.tab !== 'cad'; $('v-pend').hidden = S.tab !== 'pend';
  try { localStorage.setItem('pn-tab', S.tab); } catch {}
  window.scrollTo({top:0});
  renderAll();
}
// Se o app ficou aberto de um dia para o outro, quem estava em "hoje" passa para o novo dia.
S.hoje = defaultNight();
function checkDayChange(){
  const h = defaultNight(); if (h === S.hoje) return;
  const era = S.hoje; S.hoje = h;
  if (S.gt.ref === era) { S.gt.ref = h; S.gt.jump = true; }
  if (S.dia === era) setNight(h); else renderAll();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
window.addEventListener('focus', checkDayChange);
setInterval(checkDayChange, 60000);
function setNight(n){
  if (!n) return;
  S.dia = n; S.noite = n;
  if (n < S.winFrom){ S.winFrom = addDays(n, -7); subscribeWindow(); }
  renderAll();
}

/* ================= painel da atividade ================= */
function openDrawer(id){
  S.openId = id; S.dwMode = null; S.dwHist = []; S.avEdit = false; S.histOpen = false; S.moreOpen = false;
  $('drawer').hidden = false; $('scrim').hidden = false; $('dw-panel').innerHTML = '';
  document.querySelector('.dw-scroll').scrollTop = 0;
  if (S.unsubDw) S.unsubDw(); if (S.unsubDwHist) S.unsubDwHist();
  S.unsubDw = onSnapshot(doc(db, 'atividades', id), s => {
    if (!s.exists()){ if (S.openId === id){ toast('Esta atividade foi excluída.'); closeDrawer(); } return; }
    S.extra.set(id, {id, ...s.data(SNAP)}); renderDrawerHead(); if (!S.dwMode) renderDrawerActions();
  }, () => {});
  S.unsubDwHist = onSnapshot(query(collection(db, 'historico'), where('atividadeId', '==', id)), s => {
    S.dwHist = s.docs.map(d => ({id:d.id, ...d.data(SNAP)})).sort((a,b) => toDate(a.t)-toDate(b.t)); renderTimeline();
  }, () => {});
  if (S.unsubDwFotos) S.unsubDwFotos();
  if (S.fxUp) fxLimpar(); S.dwFotos = null;
  S.unsubDwFotos = onSnapshot(query(collection(db, 'fotos'), where('atividadeId', '==', id)), s => {
    if (S.openId !== id) return;
    S.dwFotos = s.docs.map(d => ({id:d.id, ...d.data(SNAP)})).sort((a, b) => toDate(b.t) - toDate(a.t)); renderFotos();
  }, err => { console.warn('fotos', err); S.dwFotos = []; renderFotos(); });
  renderDrawerHead(); renderDrawerActions(); renderTimeline(); renderFotos();
}
function closeDrawer(){
  if (S.unsubDw){ S.unsubDw(); S.unsubDw = null; } if (S.unsubDwHist){ S.unsubDwHist(); S.unsubDwHist = null; }
  if (S.unsubDwFotos){ S.unsubDwFotos(); S.unsubDwFotos = null; } if (S.fxUp && !S.fxUp.sending) fxLimpar(); S.dwFotos = null; lbFechar();
  if (S.openId) S.extra.delete(S.openId);
  S.openId = null; S.dwMode = null; $('drawer').hidden = true; if ($('modal').hidden) $('scrim').hidden = true;
}
function renderDrawerHead(){
  const a = all().get(S.openId);
  if (!a){ $('dw-head').innerHTML = '<p class="ro">Carregando…</p>'; $('dw-pill').innerHTML = ''; $('dw-info').innerHTML = ''; $('dw-av').innerHTML = ''; return; }
  const st = STATUS[a.status] || STATUS.programada;
  $('dw-pill').innerHTML = `<span class="pill" style="--c:${cvar(a.status)}">${esc(st.label)}</span>`;
  $('dw-head').innerHTML = `<div class="dw-tags">${turnoTag(turnoOf(a))}${a.prioridade === 'critica' || a.prioridade === 'alta' ? `<span class="tag ${a.prioridade}">${esc(PRIOR[a.prioridade])}</span>` : ''}</div><h2 class="dw-title">${esc(a.titulo)}</h2>
    ${tagsOf(a).length || canWrite() ? `<div class="dw-etqs">${tagsOf(a).map(tagBtn).join('')}${canWrite() ? `<button type="button" class="etq-add" data-mode="etq">${tagsOf(a).length ? 'Editar' : '+ Etiqueta'}</button>` : ''}</div>` : ''}`;
  if (!S.avEdit) renderAv(a);
  const d1 = durOf(a);
  const kv = [['Período', d1 ? `${fmtDay(a.noite)} a ${fmtDay(fimOf(a))} · ${d1 + 1} dias` : fmtWhen(a.noite, turnoOf(a))], ['Local', localLine(a)], ['Fornecedor', a.fornecedor || 'Não informado'],
    a.responsavel ? ['Responsável', a.responsavel] : null, a.efetivo ? ['Efetivo previsto', a.efetivo] : null, a.motivo ? ['Motivo', a.motivo] : null, ['Inserida por', `${nameOf(a.criadoPor)}${roleOf(a.criadoPor) ? ' (' + roleOf(a.criadoPor) + ')' : ''}${a.criadoEm ? ' · ' + fmtTs(a.criadoEm) : ''}`]].filter(Boolean);
  $('dw-info').innerHTML = `<dl class="kv">${kv.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${a.detalhes ? `<div class="det">${esc(a.detalhes)}</div>` : ''}`;
}
// avanço: a própria barra do topo é o controle
function renderAv(a){
  const v = avOf(a), w = canWrite();
  if (!S.avEdit){
    $('dw-av').innerHTML = `<${w ? 'button type="button" id="av-open"' : 'div'} class="av-row${w ? ' edit' : ''}"><span class="av-l">Avanço</span>${progBar(v)}${w ? '<span class="av-ed">Ajustar</span>' : ''}</${w ? 'button' : 'div'}>`;
    if (w) $('av-open').onclick = () => { S.avEdit = true; renderAv(all().get(S.openId) || a); };
    return;
  }
  $('dw-av').innerHTML = `<div class="av-edit">
    <div class="av-big"><b id="av-n">${v}%</b><span class="prog lg"><i id="av-bar" style="width:${v}%"></i></span></div>
    <input type="range" id="av-r" class="range" min="0" max="100" step="5" value="${v}" aria-label="Avanço em porcentagem">
    <div class="av-quick">${[0,25,50,75,100].map(x => `<button type="button" class="chip" data-av="${x}">${x}%</button>`).join('')}</div>
    <div class="acts"><button type="button" class="btn ghost" id="av-cancel">Cancelar</button><button type="button" class="btn pri" id="av-save">Salvar avanço</button></div></div>`;
  const sync = x => { $('av-r').value = x; $('av-n').textContent = x + '%'; $('av-bar').style.width = x + '%'; };
  $('av-r').oninput = e => sync(e.target.value);
  $('dw-av').querySelector('.av-quick').onclick = e => { const b = e.target.closest('[data-av]'); if (b) sync(b.dataset.av); };
  $('av-cancel').onclick = () => { S.avEdit = false; renderAv(all().get(S.openId) || a); };
  $('av-save').onclick = () => {
    const nv = Number($('av-r').value), cur = all().get(S.openId) || a;
    S.avEdit = false;
    if (nv === avOf(cur)){ renderAv(cur); return toast('O avanço não mudou.'); }
    const vira = autoAnd(cur.status, nv);
    mutate(S.openId, c => { const au = autoAnd(c.status, nv); return {changes:{avanco:nv, ...(au ? {status:'andamento', motivo:''} : {})}, ev:{tipo:'avanco', de:avOf(c), para:nv, ...(au ? {statusDe:c.status, statusPara:'andamento'} : {})}}; },
      nv === 100 && cur.status !== 'concluida' ? `Avanço em 100%.${vira ? ' Status: Em andamento.' : ''} Quando finalizar, mude o status para Concluída.` : `Avanço atualizado para ${nv}%.${vira ? ' Status: Em andamento.' : ''}`);
    renderAv({...cur, avanco:nv, ...(vira ? {status:'andamento'} : {})});
  };
}
function renderDrawerActions(){
  const a = all().get(S.openId); if (!a){ $('dw-actions').innerHTML = ''; return; }
  if (!canWrite()){ $('dw-actions').innerHTML = '<p class="readonly">Acesso de visualização: você consulta a atividade e o histórico, sem alterar.</p>'; return; }
  $('dw-actions').innerHTML = `<div class="dw-bar">
      <button type="button" class="btn dw-st" data-mode="status"><span class="dot" style="--c:${cvar(a.status)}"></span>Mudar status<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m7 10 5 5 5-5"/></svg></button>
      <button type="button" class="btn" data-mode="obs">Observação</button>
      <div class="menu dw-more"><button type="button" class="ibtn" id="dw-more-b" aria-haspopup="true" aria-expanded="false" aria-label="Mais ações"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
        <div class="menu-pop" id="dw-more-pop" hidden>
          <button type="button" data-mode="reprog">Reprogramar</button>
          <button type="button" data-mode="edit">Editar dados</button>
          <button type="button" data-mode="dup">Duplicar</button>
          ${isAdmin() ? '<button type="button" class="m-danger" data-mode="del">Excluir</button>' : ''}
        </div></div>
    </div>`;
  $('dw-more-b').onclick = e => { e.stopPropagation(); const p = $('dw-more-pop'); p.hidden = !p.hidden; $('dw-more-b').setAttribute('aria-expanded', String(!p.hidden)); };
}
function setMode(mode){
  if (!canWrite()) return;
  { const mp = $('dw-more-pop'); if (mp) mp.hidden = true; }
  if (mode === 'edit'){ openForm(S.openId); return; }
  S.dwMode = mode || null;
  const a = all().get(S.openId), p = $('dw-panel');
  if (!a || !mode){ p.innerHTML = ''; renderDrawerActions(); return; }
  const cancel = '<button type="button" class="btn ghost" data-mode="">Cancelar</button>';
  if (mode === 'etq'){
    p.innerHTML = `<form class="panel" id="pf"><h4>Etiquetas</h4><p class="ro" style="margin:0 0 10px">Ligue esta atividade a um serviço macro. Todas as atividades com a mesma etiqueta aparecem juntas na aba Etiquetas.</p>
      <div class="f" id="pf-etq"></div><div class="acts">${cancel}<button class="btn pri" type="submit">Salvar etiquetas</button></div></form>`;
    const pk = tagPicker($('pf-etq'), tagsOf(a));
    $('pf').onsubmit = e => {
      e.preventDefault(); const nv = pk.get(), de = tagsOf(a).join(', '), para = nv.join(', ');
      if (de === para){ setMode(null); return; }
      mutate(S.openId, () => ({changes:{etiquetas:nv, temEtiqueta:nv.length > 0}, ev:{tipo:'editou', mudancas:[{campo:'etiquetas', de, para}]}}), 'Etiquetas salvas.');
    };
    setTimeout(() => $('pf-etq').querySelector('input')?.focus(), 30);
    return;
  }
  if (mode === 'status'){
    p.innerHTML = `<div class="panel st-list"><h4>Mudar status</h4>${ORDER.filter(k => k !== a.status).map(k => `<button type="button" class="st-opt" data-mode="status:${k}" style="--c:${cvar(k)}"><span class="dot"></span><span>${esc(STATUS[k].label)}</span>${STATUS[k].motivo ? '<small>pede motivo</small>' : STATUS[k].obs ? '<small>pede observação</small>' : ''}</button>`).join('')}<div class="acts">${cancel}</div></div>`;
    return;
  }
  if (mode.startsWith('status:')){
    const k = mode.slice(7), st = STATUS[k];
    p.innerHTML = `<form class="panel" id="pf"><h4>Mudar para <span class="pill" style="--c:${cvar(k)}">${esc(st.label)}</span></h4>
      ${st.motivo ? `<div class="f"><label for="pf-motivo">Motivo <span class="req">*</span></label><select id="pf-motivo"><option value="">Selecione…</option>${MOTIVOS.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>` : ''}
      ${st.pct ? '<div class="f"><label for="pf-pct">Percentual executado (%)</label><input id="pf-pct" type="number" min="1" max="99" inputmode="numeric" placeholder="ex.: 60"></div>' : ''}
      <div class="f"><label for="pf-obs">Observação ${st.obs ? '<span class="req">*</span>' : '(opcional)'}</label><textarea id="pf-obs" placeholder="${st.motivo ? 'Explique o que aconteceu e o que precisa para executar' : 'O que foi feito, o que falta, quem acompanhou…'}"></textarea></div>
      <div class="acts">${cancel}<button class="btn pri" type="submit">Confirmar</button></div></form>`;
    $('pf').onsubmit = e => {
      e.preventDefault();
      const motivo = $('pf-motivo')?.value || '', obs = $('pf-obs').value.trim(), pct = $('pf-pct')?.value || '';
      if (st.motivo && !motivo) return toast('Selecione o motivo.');
      if (st.obs && !obs) return toast('Escreva a observação.');
      mutate(S.openId, cur => ({changes:{status:k, aberta:st.aberta, motivo:st.motivo ? motivo : '', pct:st.pct ? pct : '', ...(k === 'concluida' ? {avanco:100, concluidoEm:serverTimestamp()} : st.pct && pct ? {avanco:Number(pct)} : {}), ...(obs ? {ultimaObs:obs} : {})}, ev:{tipo:'status', de:cur.status, para:k, motivo, obs, pct}}), `Status alterado para ${st.label}.`);
    };
    (p.querySelector('#pf-motivo') || p.querySelector('#pf-obs')).focus();
  } else if (mode === 'obs'){
    p.innerHTML = `<form class="panel" id="pf"><h4>Observação</h4><div class="f"><label for="pf-obs">Texto <span class="req">*</span></label><textarea id="pf-obs"></textarea></div><div class="acts">${cancel}<button class="btn pri" type="submit">Registrar</button></div></form>`;
    $('pf').onsubmit = e => { e.preventDefault(); const obs = $('pf-obs').value.trim(); if (!obs) return toast('Escreva a observação.'); mutate(S.openId, () => ({changes:{ultimaObs:obs}, ev:{tipo:'obs', obs}}), 'Observação registrada.'); };
    $('pf-obs').focus();
  } else if (mode === 'reprog'){
    const t0 = turnoOf(a);
    p.innerHTML = `<form class="panel" id="pf"><h4>Reprogramar</h4><p class="ro" style="margin:0 0 10px">A atividade volta para “Programada” (ou “Em andamento”, se já tiver avanço) a partir do novo início, mantendo a duração. O histórico continua junto.</p>
      <div class="frow"><div class="f"><label for="pf-date">Novo início <span class="req">*</span></label><input id="pf-date" type="date" value="${esc(addDays(a.noite,1))}"></div>
      <div class="f"><label>Turno</label><div class="seg" id="pf-turno">${['diurno','noturno'].map(x => `<button type="button" data-t="${x}" aria-pressed="${x === t0}">${TURNOS[x]}</button>`).join('')}</div></div></div>
      <div class="f"><label for="pf-obs">Motivo da reprogramação</label><textarea id="pf-obs"></textarea></div><div class="acts">${cancel}<button class="btn pri" type="submit">Reprogramar</button></div></form>`;
    let tsel = t0;
    $('pf-turno').onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; tsel = b.dataset.t; for (const x of $('pf-turno').children) x.setAttribute('aria-pressed', String(x === b)); };
    $('pf').onsubmit = e => {
      e.preventDefault(); const d = $('pf-date').value, obs = $('pf-obs').value.trim();
      if (!d) return toast('Escolha o novo dia.'); if (d === a.noite && tsel === t0) return toast('A atividade já está nesse dia e turno.');
      mutate(S.openId, cur => ({changes:{noite:d, fim:addDays(d, durOf(cur)), turno:tsel, status:avOf(cur) > 0 ? 'andamento' : 'programada', aberta:true, motivo:'', pct:'', ...(obs ? {ultimaObs:obs} : {})}, ev:{tipo:'reprogramou', de:cur.noite, para:d, turnoDe:turnoOf(cur), turnoPara:tsel, obs}}), `Reprogramada para ${fmtShort(d)} (${TURNOS[tsel].toLowerCase()}).`);
    };
  } else if (mode === 'dup'){
    p.innerHTML = `<form class="panel" id="pf"><h4>Duplicar para outro dia</h4><p class="ro" style="margin:0 0 10px">Cria uma nova atividade igual, com status “Programada” e histórico próprio. A original não muda.</p>
      <div class="f"><label for="pf-date">Dia <span class="req">*</span></label><input id="pf-date" type="date" value="${esc(addDays(a.noite,1))}"></div><div class="acts">${cancel}<button class="btn pri" type="submit">Duplicar</button></div></form>`;
    $('pf').onsubmit = e => {
      e.preventDefault(); const d = $('pf-date').value; if (!d) return;
      const data = {}; for (const k of Object.keys(FIELDS)) data[k] = a[k] ?? ''; data.noite = d; data.fim = addDays(d, durOf(a)); data.avanco = 0; data.turno = turnoOf(a); data.etiquetas = tagsOf(a);
      createAct(data, a.id); setMode(null); toast(`Cópia criada para ${fmtShort(d)}.`);
    };
  } else if (mode === 'del'){
    p.innerHTML = `<div class="panel"><h4>Excluir esta atividade?</h4><p class="ro" style="margin:0 0 10px">O registro da exclusão fica no histórico. Para manter a atividade visível, prefira mudar o status para “Cancelada”.</p>
      <div class="acts"><button type="button" class="btn ghost" data-mode="">Manter</button><button type="button" class="btn danger" id="pf-del">Excluir definitivamente</button></div></div>`;
    $('pf-del').onclick = () => {
      const id = S.openId, histRef = doc(collection(db, 'historico')), b = writeBatch(db);
      b.delete(doc(db, 'atividades', id));
      b.set(histRef, evDoc(id, a, {tipo:'excluiu'}));
      commit(b, 'Atividade excluída.'); closeDrawer();
    };
  }
}
function tlItem(ev, a){
  const c = ev.tipo === 'status' ? cvar(ev.para) : ev.tipo === 'criou' ? 'var(--brand)' : ev.tipo === 'avanco' || ev.tipo === 'foto' ? 'var(--brand)' : 'var(--faint)';
  return `<li style="--c:${c}"><span class="d"></span><div class="h"><b>${esc(nameOf(ev.u))}</b> ${evText({...ev, noiteAtv:ev.noiteAtv || a?.noite})}</div><div class="ts">${esc(fmtTs(ev.t))}${roleOf(ev.u) ? ' · ' + esc(roleOf(ev.u)) : ''}</div>${evExtra(ev)}</li>`;
}
function renderTimeline(){
  const a = all().get(S.openId), hs = [...S.dwHist].reverse();
  $('dw-last').innerHTML = hs.length ? tlItem(hs[0], a) : '<li class="ro">Carregando…</li>';
  const rest = hs.slice(1);
  const tg = $('dw-hist-tg');
  tg.hidden = !rest.length;
  tg.textContent = S.histOpen ? 'Ocultar histórico' : `Ver histórico completo (${hs.length} registros)`;
  tg.onclick = () => { S.histOpen = !S.histOpen; renderTimeline(); };
  $('dw-tl').hidden = !S.histOpen || !rest.length;
  $('dw-tl').innerHTML = S.histOpen ? rest.map(ev => tlItem(ev, a)).join('') : '';
}

/* ================= fotos do andamento ================= */
// Cada foto vira dois documentos: "fotos" (miniatura + legenda, para a galeria) e "fotosImg" (imagem maior,
// carregada só ao abrir em tela cheia ou no PDF). O envio entra no histórico da atividade.
S.dwFotos = null; S.fxUp = null; S.imgCache = new Map();
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>';
const podeApagarFoto = f => isAdmin() || (canWrite() && f.u === S.uid);
async function lerImagem(file){
  try { return await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch { return await new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('imagem inválida')); im.src = URL.createObjectURL(file); }); }
}
function paraJpeg(src, max, q, maxLen){
  let k = Math.min(1, max / Math.max(src.width, src.height)), url = '', w = 0, h = 0;
  for (let tent = 0; tent < 4; tent++){
    w = Math.max(1, Math.round(src.width * k)); h = Math.max(1, Math.round(src.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
    let qq = q; url = cv.toDataURL('image/jpeg', qq);
    while (url.length > maxLen && qq > .42){ qq -= .08; url = cv.toDataURL('image/jpeg', qq); }
    if (url.length <= maxLen) break;
    k *= .8;
  }
  return {url, w, h};
}
// Foto grande vai para o Firebase Storage, reduzida para 1920 px (~400–700 KB) para caber mais na cota. Sem sinal ou com o Storage indisponível,
// cai no método anterior (imagem de 1600 px no Firestore), que fica na fila do aparelho e sobe depois.
let _st = null;
async function stor(){ if (!_st){ const m = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'); _st = {m, s: m.getStorage(app)}; } return _st; }
function paraBlob(src, max, q){
  const k = Math.min(1, max / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
  return new Promise((ok, fail) => cv.toBlob(b => b ? ok({blob:b, w, h}) : fail(new Error('falha ao converter')), 'image/jpeg', q));
}
const comPrazo = (p, ms) => Promise.race([p, new Promise((_, f) => setTimeout(() => f(new Error('tempo esgotado')), ms))]);
async function prepararFoto(file, atividadeId, fotoId){
  const src = await lerImagem(file);
  try {
    const thumb = paraJpeg(src, 480, .72, 70000);
    if (navigator.onLine && !S.stOff){
      try {
        const big = await paraBlob(src, 1920, .8);
        const {m, s} = await stor(), path = `fotos/${atividadeId}/${fotoId}.jpg`, r = m.ref(s, path);
        await comPrazo(m.uploadBytes(r, big.blob, {contentType:'image/jpeg', customMetadata:{u:S.uid, atividadeId}}), 90000);
        const url = await m.getDownloadURL(r);
        return {thumb: thumb.url, w: big.w, h: big.h, path, url};
      } catch (e) { console.warn('Storage indisponível, usando o banco', e); if (/unauthorized|forbidden|402|403|not-found|unknown|bucket/i.test(String(e?.code || e?.message))) S.stOff = true; S.stAviso = true; }
    }
    const full = paraJpeg(src, 1600, .8, 880000);
    return {img: full.url, thumb: thumb.url, w: full.w, h: full.h};
  } finally { if (src.close) src.close(); }
}
function renderFotos(){
  const el = $('dw-fotos'); if (!el) return;
  const a = all().get(S.openId), w = canWrite(), fs = S.dwFotos;
  const addBtn = (cls = '') => w ? `<label class="btn sm fx-add${cls}">${ICON_CAM}<span>Adicionar fotos</span><input type="file" accept="image/*" multiple hidden data-fx-in></label>` : '';
  const zipBtn = fs && fs.length ? `<button type="button" class="btn sm ghost fx-zip" data-fx-zip title="Baixar todas as fotos desta atividade numa pasta .zip">${ICON_DL}<span>Baixar todas</span></button>` : '';
  let h = `<div class="fx-h"><div class="lbl">Fotos${fs && fs.length ? ` <em>${fs.length}</em>` : ''}</div>${zipBtn}${fs && fs.length ? addBtn() : ''}</div>`;
  const up = S.fxUp;
  if (up){
    h += `<div class="fx-up">
      <div class="fx-up-grid">${up.items.map((x, i) => `<div class="fx-up-it${x.ok ? ' ok' : ''}${x.err ? ' err' : ''}"><img src="${x.prev}" alt="">${up.sending ? '' : `<button type="button" class="fx-up-x" data-fx-rm="${i}" aria-label="Remover">×</button>`}${x.ok ? '<span class="fx-up-st">✓</span>' : ''}</div>`).join('')}</div>
      <input type="text" class="fx-up-leg" id="fx-leg" maxlength="200" placeholder="Legenda (opcional): ex.: armação concluída no eixo 8" value="${esc(up.legenda || '')}"${up.sending ? ' disabled' : ''}>
      <div class="fx-up-a"><span class="ro" id="fx-msg">${esc(up.msg || `${up.items.length} ${up.items.length === 1 ? 'foto selecionada' : 'fotos selecionadas'}`)}</span><span class="sp"></span>${up.sending ? '' : `<button type="button" class="btn ghost sm" data-fx-cancel>Cancelar</button><button type="button" class="btn pri sm" data-fx-send>Enviar</button>`}</div>
    </div>`;
  }
  if (fs === null) h += '<div class="fx-grid">' + '<span class="fx-sk"></span>'.repeat(3) + '</div>';
  else if (!fs.length && !up) h += `<div class="fx-empty">${ICON_CAM}<b>Nenhuma foto ainda</b><span>${w ? 'Registre o andamento com fotos do local. Elas aparecem aqui e no PDF da atividade.' : 'Quando a equipe registrar fotos, elas aparecem aqui.'}</span>${addBtn(' pri')}</div>`;
  else if (fs.length) h += `<div class="fx-grid">${fs.map((f, i) => `<button type="button" class="fx-it" data-fx="${i}" title="${esc(f.legenda || 'Ver foto')}"><img src="${f.thumb}" alt="${esc(f.legenda || 'Foto da atividade')}" loading="lazy"><span class="fx-cap${f.legenda ? ' has-l' : ''}">${f.legenda ? `<b>${esc(f.legenda)}</b>` : ''}<i>${f.t ? fmtTs(f.t) : 'enviando…'} · ${esc(shortName(nameOf(f.u)))}</i></span></button>`).join('')}</div>`;
  el.innerHTML = h;
}
async function fxEscolher(files){
  const list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)).slice(0, 12);
  if (!list.length) return toast('Escolha arquivos de imagem.');
  if (files.length > 12) toast('Até 12 fotos por envio.');
  S.fxUp = {items: list.map(f => ({file:f, prev:URL.createObjectURL(f)})), legenda:'', sending:false};
  renderFotos(); setTimeout(() => { const l = $('fx-leg'); if (l) l.focus(); }, 50);
}
function fxLimpar(){ if (S.fxUp) for (const x of S.fxUp.items) URL.revokeObjectURL(x.prev); S.fxUp = null; renderFotos(); }
async function fxEnviar(){
  const up = S.fxUp, id = S.openId; if (!up || up.sending || !id) return;
  const cur = all().get(id); if (!cur) return;
  up.legenda = ($('fx-leg')?.value || '').trim().slice(0, 200); up.sending = true;
  let n = cur.nFotos || (S.dwFotos ? S.dwFotos.length : 0), ok = 0;
  for (let i = 0; i < up.items.length; i++){
    const x = up.items[i]; up.msg = `Preparando e enviando ${i + 1} de ${up.items.length}…`; renderFotos();
    try {
      const fRef = doc(collection(db, 'fotos')), hRef = doc(collection(db, 'historico')), b = writeBatch(db);
      const f = await prepararFoto(x.file, id, fRef.id);
      b.set(fRef, {atividadeId:id, thumb:f.thumb, w:f.w, h:f.h, legenda:up.legenda, u:S.uid, t:serverTimestamp(), ...(f.url ? {path:f.path, url:f.url} : {})});
      if (!f.url){ b.set(doc(db, 'fotosImg', fRef.id), {atividadeId:id, img:f.img, u:S.uid, t:serverTimestamp()}); S.imgCache.set(fRef.id, f.img); }
      b.update(doc(db, 'atividades', id), {nFotos:++n, atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:hRef.id});
      b.set(hRef, evDoc(id, cur, {tipo:'foto', fotoId:fRef.id, legenda:up.legenda}));
      b.commit().catch(handleWriteError); // offline: fica na fila do aparelho e sobe quando a conexão voltar
      x.ok = true; ok++;
    } catch (e) { console.warn(e); x.err = true; }
  }
  const falhas = up.items.length - ok;
  fxLimpar();
  if (S.stAviso && ok){ S.stAviso = false; toast(navigator.onLine ? 'Fotos salvas no banco: o armazenamento de fotos (Storage) não respondeu.' : 'Sem conexão: as fotos ficam no aparelho e sobem quando o sinal voltar.'); return; }
  toast(falhas ? `${ok} ${ok === 1 ? 'foto enviada' : 'fotos enviadas'}, ${falhas} não ${falhas === 1 ? 'pôde' : 'puderam'} ser lida${falhas === 1 ? '' : 's'}.` : `${ok} ${ok === 1 ? 'foto adicionada' : 'fotos adicionadas'}.${navigator.onLine ? '' : ' Sobe quando a conexão voltar.'}`);
}
async function fotoGrande(f){
  if (f.url) return f.url;
  if (S.imgCache.has(f.id)) return S.imgCache.get(f.id);
  try { const s = await getDoc(doc(db, 'fotosImg', f.id)); const v = s.exists() ? s.data().img : null; if (v){ S.imgCache.set(f.id, v); return v; } } catch (e) { console.warn(e); }
  return f.thumb;
}
// para o PDF a imagem precisa vir como dados (Storage exige CORS liberado; se não, usa a miniatura)
async function fotoPdf(f, max = 1600){
  if (!f.url){ const im = await fotoGrande(f); if (max >= 1600) return {img: im, w: f.w, h: f.h};
    try { const src = await lerImagem(await (await fetch(im)).blob()), j = paraJpeg(src, max, .8, 3000000); if (src.close) src.close(); return {img: j.url, w: j.w, h: j.h}; } catch { return {img: im, w: f.w, h: f.h}; } }
  try {
    const bl = await (await comPrazo(fetch(f.url), 30000)).blob(), src = await lerImagem(bl);
    const j = paraJpeg(src, max, .8, 3000000); if (src.close) src.close();
    return {img: j.url, w: j.w, h: j.h};
  } catch (e) { console.warn('foto do Storage no PDF: usando miniatura', e); return {img: f.thumb, w: f.w, h: f.h, mini: true}; }
}
// ---------- visualizador em tela cheia ----------
let lbI = 0;
async function lbAbrir(i){
  const fs = S.dwFotos || []; if (!fs.length) return;
  lbI = (i + fs.length) % fs.length; const f = fs[lbI];
  $('lb').hidden = false;
  $('lb-n').textContent = `${lbI + 1} de ${fs.length}`;
  $('lb-cap').innerHTML = `${f.legenda ? `<b>${esc(f.legenda)}</b>` : ''}<span>${f.t ? fmtTs(f.t) : ''} · ${esc(nameOf(f.u))}</span>`;
  $('lb-del').hidden = !podeApagarFoto(f); $('lb-del').textContent = 'Excluir'; delete $('lb-del').dataset.ok;
  $('lb-prev').hidden = $('lb-next').hidden = fs.length < 2;
  const img = $('lb-img'); img.src = f.thumb; img.classList.add('lo');
  const a = all().get(S.openId), nome = `${(a?.titulo || 'foto').replace(/[^\wÀ-ú -]+/g, '').trim().slice(0, 40).replace(/\s+/g, '_')}_${lbI + 1}.jpg`;
  $('lb-dl').href = f.url || f.thumb; $('lb-dl').download = nome; $('lb-dl').target = f.url ? '_blank' : '';
  const big = await fotoGrande(f);
  if (S.dwFotos && S.dwFotos[lbI] === f){ img.src = big; img.classList.remove('lo'); $('lb-dl').href = big; }
}
function lbFechar(){ $('lb').hidden = true; $('lb-img').src = ''; }
function fotoExcluir(){
  const f = (S.dwFotos || [])[lbI], id = S.openId, cur = all().get(id); if (!f || !cur || !podeApagarFoto(f)) return;
  const bt = $('lb-del'); if (bt.dataset.ok !== '1'){ bt.dataset.ok = '1'; bt.textContent = 'Toque de novo para excluir'; return; }
  const hRef = doc(collection(db, 'historico')), b = writeBatch(db);
  b.delete(doc(db, 'fotos', f.id)); if (!f.url) b.delete(doc(db, 'fotosImg', f.id));
  b.update(doc(db, 'atividades', id), {nFotos:Math.max(0, (cur.nFotos || S.dwFotos.length) - 1), atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:hRef.id});
  b.set(hRef, evDoc(id, cur, {tipo:'foto_del', legenda:f.legenda || ''}));
  commit(b, 'Foto excluída.'); S.imgCache.delete(f.id); lbFechar();
  if (f.path) stor().then(({m, s}) => m.deleteObject(m.ref(s, f.path))).catch(e => console.warn('arquivo do Storage', e));
}
// ---------- baixar todas as fotos da atividade (.zip) ----------
let zipando = false;
async function blobFoto(f){
  try { const src = f.url || await fotoGrande(f); return {blob: await (await comPrazo(fetch(src), 30000)).blob()}; }
  catch (e) { console.warn('zip: usando miniatura', e); return {blob: await (await fetch(f.thumb)).blob(), mini: true}; }
}
async function carregarJSZip(){
  if (window.JSZip) return window.JSZip;
  await new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; sc.onload = ok; sc.onerror = () => fail(new Error('JSZip')); document.head.appendChild(sc); });
  return window.JSZip;
}
const slugArq = (v, n = 40) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w -]+/g, '').trim().slice(0, n).replace(/\s+/g, '_');
async function baixarZipFotos(){
  const a = all().get(S.openId), fs = [...(S.dwFotos || [])].sort((x, y) => toDate(x.t) - toDate(y.t));
  if (!a || !fs.length || zipando) return;
  zipando = true; const bt = document.querySelector('[data-fx-zip]'); if (bt) bt.disabled = true;
  try {
    toast('Preparando as fotos…');
    const JSZip = await carregarJSZip(), zip = new JSZip(), hoje = defaultNight();
    const nomes = new Set(); let mini = 0;
    const linhas = [`Atividade: ${a.titulo}`, `Local: ${localLine(a)}`, `Período: ${fmtPeriodo(a)}/${fimOf(a).slice(0, 4)} · turno ${TURNOS[turnoOf(a)].toLowerCase()}`, `Status: ${STATUS[a.status]?.label || a.status} · avanço ${avOf(a)}%`, `Fotos: ${fs.length} · baixadas em ${fmtTs(new Date())} por ${S.perfil?.nome || ''}`, ''];
    for (let i = 0; i < fs.length; i++){
      const f = fs[i]; toast(`Baixando foto ${i + 1} de ${fs.length}…`);
      const r = await blobFoto(f), blob = r.blob; if (r.mini) mini++;
      const quando = f.t ? toDate(f.t) : new Date();
      let nome = `${String(i + 1).padStart(2, '0')}_${pad(quando.getDate())}-${pad(quando.getMonth() + 1)}_${slugArq(f.legenda, 50) || 'foto'}.jpg`;
      while (nomes.has(nome)) nome = nome.replace(/\.jpg$/, '_.jpg'); nomes.add(nome);
      zip.file(nome, blob);
      linhas.push(`${nome} — ${f.legenda || '(sem legenda)'} — ${f.t ? fmtTs(f.t) : ''} — ${nameOf(f.u)}`);
    }
    zip.file('LEIA-ME.txt', linhas.join('\r\n') + '\r\n');
    const out = await zip.generateAsync({type:'blob'}), arquivo = `Fotos_${slugArq(a.titulo, 50) || 'atividade'}_${hoje}.zip`;
    const url = URL.createObjectURL(out), el = document.createElement('a'); el.href = url; el.download = arquivo; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(mini ? `Pasta gerada. ${mini} ${mini === 1 ? 'foto saiu' : 'fotos saíram'} em tamanho reduzido (o Storage ainda não libera o download direto).` : `Pasta com ${fs.length} ${fs.length === 1 ? 'foto' : 'fotos'} gerada.`);
    logExport('fotos', {arquivo, qtd: fs.length, periodo: (a.titulo || '').slice(0, 150)});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar a pasta. Tente de novo.' : 'Sem internet: é preciso estar online para baixar as fotos.'); }
  finally { zipando = false; const b2 = document.querySelector('[data-fx-zip]'); if (b2) b2.disabled = false; }
}
// ---------- PDF da atividade (dados + fotos + histórico) ----------
let gerandoAtv = false;
// dados da ficha (usada no PDF da atividade e no PDF do local)
async function fichaCtx(a, fs, hs, max = 1600, onFoto = () => {}){
  const fotos = [];
  for (const f of fs){ const p = await fotoPdf(f, max); fotos.push({...p, legenda:f.legenda || '', sub:`${f.t ? fmtTs(f.t) : ''} · ${nameOf(f.u)}`}); onFoto(); }
  const hist = hs.map(ev => {
    let tx = evText({...ev, noiteAtv: ev.noiteAtv || a.noite}).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (ev.mudancas?.length) tx += '\n' + ev.mudancas.map(x => `${FIELDS[x.campo] || (x.campo === 'status' ? 'Status' : x.campo)}: ${fmtVal(x.campo, x.de) || '—'} → ${fmtVal(x.campo, x.para) || '—'}`).join('\n');
    if (ev.motivo || ev.obs) tx += '\n' + [ev.motivo, ev.obs].filter(Boolean).join(' — ');
    return {quando: fmtTs(ev.t), quem: nameOf(ev.u), texto: tx};
  });
  const d1 = durOf(a), hoje = defaultNight();
  const situ = a.status === 'concluida' ? 'Concluída' : a.status === 'cancelada' ? 'Cancelada' : fimOf(a) < hoje ? `Vencida há ${nightsBetween(fimOf(a), hoje)} ${nightsBetween(fimOf(a), hoje) === 1 ? 'dia' : 'dias'}` : a.noite > hoje ? 'A iniciar' : 'Em curso';
  const info = [
    ['Período', `${fmtDay(a.noite)}${d1 ? ' a ' + fmtDay(fimOf(a)) : ''}/${fimOf(a).slice(0, 4)} · ${d1 + 1} ${d1 ? 'dias' : 'dia'} · turno ${TURNOS[turnoOf(a)].toLowerCase()}`],
    ['Situação', situ], ['Local', localLine(a) || '—'], ['Fornecedor', a.fornecedor || 'Não informado'],
    ['Responsável no turno', a.responsavel || 'Não informado'], ['Efetivo previsto', a.efetivo || 'Não informado'],
    ['Prioridade', PRIOR[a.prioridade] || 'Normal'], tagsOf(a).length ? ['Etiquetas', tagsOf(a).join(', ')] : null,
    ['Inserida por', `${nameOf(a.criadoPor)}${a.criadoEm ? ' em ' + fmtTs(a.criadoEm) : ''}`],
    a.atualizadoPor ? ['Última alteração', `${nameOf(a.atualizadoPor)}${a.atualizadoEm ? ' em ' + fmtTs(a.atualizadoEm) : ''}`] : null,
  ].filter(Boolean);
  return {titulo: a.titulo || '', status: a.status, statusLabel: STATUS[a.status]?.label || a.status, avanco: avOf(a), info,
    detalhes: a.detalhes || '', motivo: a.motivo ? `${a.motivo}${a.pct ? ` · ${a.pct}% executado` : ''}` : '', obs: a.ultimaObs || '', fotos, hist};
}
async function exportAtividadePdf(){
  const a = all().get(S.openId); if (!a || gerandoAtv) return;
  gerandoAtv = true; const bt = $('dw-pdf'); bt.disabled = true; toast('Gerando o PDF da atividade…');
  try {
    const fs = [...(S.dwFotos || [])].sort((x, y) => toDate(x.t) - toDate(y.t));
    const ficha = await fichaCtx(a, fs, [...S.dwHist], 1600);
    const now = new Date(), hoje = defaultNight(), arquivo = `Atividade_${slugArq(a.titulo, 50) || 'atividade'}_${hoje}.pdf`;
    const { gerarAtividadePDF } = await import('./relatorio.js?v=37');
    await gerarAtividadePDF({...ficha, logoUrl: 'logo-saeng.png', arquivo,
      emitidoEm: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} às ${pad(now.getHours())}:${pad(now.getMinutes())}`, emitidoPor: S.perfil?.nome || 'Usuário'});
    toast('PDF da atividade gerado.');
    logExport('atividade', {arquivo, qtd: ficha.fotos.length, periodo: (a.titulo || '').slice(0, 150)});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar o PDF. Tente de novo.' : 'Para gerar o PDF pela primeira vez é preciso internet.'); }
  finally { gerandoAtv = false; bt.disabled = false; }
}

/* ================= página do local (setor, pilar ou loja) ================= */
// Toque em "Abrir" no cabeçalho de um grupo: abre uma página com todas as atividades daquele local,
// de onde sai o PDF do local (todas as atividades, com informações, fotos e histórico) e o .zip das fotos.
S.loc = null; S.todas = null; S.todasEm = 0;
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
async function carregarTodas(force){
  if (!force && S.todas && Date.now() - S.todasEm < 300000) return;
  try { const s = await getDocs(query(collection(db, 'atividades'), limit(5000))); S.todas = snapToMap(s); S.todasEm = Date.now(); } catch (e) { console.warn(e); }
}
const atividadesDoLocal = k => [...new Map([...(S.todas || new Map()), ...all()]).values()].filter(a => groupKey(a).k === k);
function metaLocal(k, acts){
  const g = acts[0] ? groupKey(acts[0]) : {label: k.slice(2), sub: ''};
  const tp = k[0] === 'p' ? 'pilares' : k[0] === 'z' ? 'locais' : 'setores';
  return {tp, tipo: {s:'Setor', p:'Pilar', z:'Local do shopping'}[k[0]] || 'Local', nome: k[0] === 'z' ? (g.sub || k.slice(2) || 'Shopping') : g.label, sub: k[0] === 'z' ? 'Shopping' : g.sub};
}
function openLocal(k){
  if (S.openId) closeDrawer();
  S.loc = {k}; S.locEnc = false; S.locView = 'lista';
  S.lgt = {zoom: S.gt.zoom === 'sem' ? 'qui' : S.gt.zoom, ref: defaultNight(), conc: true, grp: 'local', turno: '', jump: true, auto: true};
  for (const v of ['v-noite','v-gantt','v-etq','v-hist','v-cad','v-pend']) $(v).hidden = true;
  $('v-local').hidden = false; window.scrollTo({top:0});
  renderLocal();
  carregarTodas().then(() => { if (S.loc && S.loc.k === k) renderLocal(); });
}
function closeLocal(){ S.loc = null; setTab(S.tab); }
function renderLocal(){
  const k = S.loc.k, acts = atividadesDoLocal(k), hoje = defaultNight(), m = metaLocal(k, acts);
  const ab = acts.filter(a => a.aberta && STATUS[a.status]?.aberta).sort((x, y) => (fimOf(x) < hoje ? 0 : 1) - (fimOf(y) < hoje ? 0 : 1) || x.noite.localeCompare(y.noite) || prRank(x.prioridade) - prRank(y.prioridade));
  const enc = acts.filter(a => !(a.aberta && STATUS[a.status]?.aberta)).sort((x, y) => fimOf(y).localeCompare(fimOf(x)));
  const cnt = {}; ORDER.forEach(s2 => cnt[s2] = 0); acts.forEach(a => cnt[a.status] = (cnt[a.status] || 0) + 1);
  const venc = ab.filter(a => fimOf(a) < hoje).length, fotos = acts.reduce((s2, a) => s2 + (Number(a.nFotos) || 0), 0);
  const bar = acts.length ? ORDER.filter(s2 => cnt[s2]).map(s2 => `<i style="width:${(cnt[s2] / acts.length * 100).toFixed(2)}%;background:${cvar(s2)}" title="${esc(STATUS[s2].label)}: ${cnt[s2]}"></i>`).join('') : '';
  const leg = ORDER.filter(s2 => cnt[s2]).map(s2 => `<span><i class="dot" style="--c:${cvar(s2)}"></i>${cnt[s2]} ${esc(stN(s2, cnt[s2]))}</span>`).join('');
  const encOpen = S.locEnc || !ab.length, carregando = !S.todas;
  $('v-local').innerHTML = `<div class="cad-page loc-page">
    <button type="button" class="back" data-loc-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>Voltar</button>
    <div class="loc-head grp-${m.tp}"><span class="grp-ic lg">${ico(m.tp)}</span><div class="loc-ht"><div class="eyebrow">${esc(m.tipo)}</div><h1>${esc(m.nome)}</h1>${m.sub ? `<p>${esc(m.sub)}</p>` : ''}</div></div>
    <div class="etq-kpis loc-kpis">
      <div class="kp"><span>Atividades</span><b>${acts.length}</b></div>
      <div class="kp"><span>Em aberto</span><b>${ab.length}</b></div>
      <div class="kp${venc ? ' warn' : ''}"><span>Vencidas</span><b>${venc}</b></div>
      <div class="kp"><span>Concluídas</span><b>${cnt.concluida || 0}</b></div>
      <div class="kp"><span>Fotos</span><b>${fotos}</b></div>
    </div>
    ${acts.length ? `<div class="etq-st"><div class="bar" role="img" aria-label="Distribuição por status">${bar}</div><div class="sum-leg">${leg}</div></div>` : ''}
    <div class="etq-acts">
      <button type="button" class="btn pri" data-loc-pdf${acts.length ? '' : ' disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>Relatório do local (PDF)</button>
      <button type="button" class="btn" data-loc-zip${fotos ? '' : ' disabled'}>${ICON_DL}Baixar fotos (.zip)</button>
      ${canWrite() ? `<button type="button" class="btn" data-loc-new><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nova atividade aqui</button>` : ''}
    </div>
    <div class="seg loc-seg" role="group" aria-label="Visualização"><button type="button" data-loc-view="lista" aria-pressed="${S.locView !== 'cal'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>Lista</button><button type="button" data-loc-view="cal" aria-pressed="${S.locView === 'cal'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3M7 14h5M9 17.5h7"/></svg>Calendário</button></div>
    ${carregando ? '<p class="ro loc-load">Buscando as atividades antigas deste local…</p>' : ''}
    ${S.locView === 'cal' ? '<div id="lgt"></div>' : `
    ${ab.length ? `<div class="sec"><div class="sec-h"><h2>Em aberto</h2><span>${ab.length}</span></div><div class="cards">${ab.map(a => card(a, fimOf(a) < hoje, hoje, true)).join('')}</div></div>` : ''}
    ${enc.length ? `<div class="sec"><div class="sec-h"><h2>Concluídas e canceladas</h2><span>${enc.length}</span>${ab.length ? `<button type="button" class="link-btn" data-loc-enc>${encOpen ? 'Ocultar' : 'Mostrar'}</button>` : ''}</div>${encOpen ? `<div class="cards">${enc.map(a => card(a, false, hoje, true)).join('')}</div>` : ''}</div>` : ''}
    ${!acts.length && !carregando ? '<div class="empty">Nenhuma atividade neste local.</div>' : ''}`}
  </div>`;
  if (S.locView === 'cal') renderLocalCal(acts, m);
}
// calendário da página do local: mesmas funções do calendário principal, só com as atividades deste local
function renderLocalCal(acts, m){
  const g = S.lgt, el = $('lgt'); if (!el) return;
  // ao abrir, se o período atual não tem nada, vai para o período das atividades em aberto (ou das mais recentes)
  if (g.auto){ g.auto = false; const D0 = gtData(g, acts); if (!D0.acts.length && acts.length){ const ab = acts.filter(a => a.aberta); g.ref = (ab.length ? ab : acts).reduce((v, a) => ab.length ? (a.noite < v ? a.noite : v) : (a.noite > v ? a.noite : v), ab.length ? '9999' : '0000'); } }
  const D = gtData(g, acts), {ini, n, fim, hoje} = D;
  el.innerHTML = `<div class="lgt-top">
      <div class="lgt-per"><b>${fmtShort(ini)} a ${fmtShort(fim)}/${fim.slice(0, 4)}</b><span>${D.acts.length} ${D.acts.length === 1 ? 'atividade' : 'atividades'}</span></div>
      <div class="nav"><button class="ibtn" type="button" data-lgt-nav="-1" aria-label="Período anterior">‹</button><button class="gt-hoje" type="button" data-lgt-hoje${hoje >= ini && hoje <= fim ? ' disabled' : ''}>Hoje</button><button class="ibtn" type="button" data-lgt-nav="1" aria-label="Próximo período">›</button>
      <button class="gt-pdf" type="button" data-lgt-pdf title="Exportar este calendário em PDF" aria-label="Exportar este calendário em PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg><span>PDF</span></button></div>
    </div>
    <div class="gt-ctl">
      <div class="seg gt-seg" role="group" aria-label="Período">${[['sem','Semana'],['qui','Quinzena'],['mes','Mês']].map(([k, l]) => `<button type="button" data-lgt-z="${k}" aria-pressed="${g.zoom === k}">${l}</button>`).join('')}</div>
      <div class="seg gt-seg" role="group" aria-label="Agrupar por">${[['local','Local'],['etq','Etiqueta']].map(([k, l]) => `<button type="button" data-lgt-g="${k}" aria-pressed="${g.grp === k}">${l}</button>`).join('')}</div>
      <div class="seg gt-seg gt-tseg" role="group" aria-label="Turno">${[['','Todos'],['diurno',ICON_SOL],['noturno',ICON_LUA]].map(([k, l]) => `<button type="button" data-lgt-t="${k}" aria-pressed="${(g.turno || '') === k}"${k ? ` aria-label="${TURNOS[k]}" title="${TURNOS[k]}"` : ''}>${l}</button>`).join('')}</div>
      <label class="gt-chk"><input type="checkbox" data-lgt-conc${g.conc ? ' checked' : ''}><span>Concluídas</span></label>
    </div>
    <div class="gt-wrap lgt-wrap" id="lgt-wrap"></div>
    <div class="gt-leg" id="lgt-leg"></div>`;
  const wrap = $('lgt-wrap');
  if (!D.acts.length){ wrap.innerHTML = `<div class="empty gt-empty"><b>Nenhuma atividade de ${fmtShort(ini)} a ${fmtShort(fim)}</b>Use as setas para ver outro período.</div>`; return; }
  const r = ganttHTML(D, g, wrap, {dias:false});
  wrap.innerHTML = r.html;
  if (g.jump){ g.jump = false; wrap.scrollLeft = r.ti >= 0 && r.ti < n ? Math.max(0, r.ti * r.cw - r.avail / 3) : 0; }
  $('lgt-leg').innerHTML = ganttLegenda('Toque numa atividade para abrir.');
}
async function exportLocalCalPdf(){
  if (gerandoGt || !S.loc) return;
  const acts = atividadesDoLocal(S.loc.k), m = metaLocal(S.loc.k, acts), D = gtData(S.lgt, acts);
  if (!D.acts.length) return toast('Nenhuma atividade no calendário deste período.');
  gerandoGt = true; toast('Gerando o PDF do calendário…');
  try {
    const arquivo = `Calendario_${slugArq(m.nome, 50) || 'local'}_${D.ini}_a_${D.fim}.pdf`;
    const { gerarGanttPDF } = await import('./relatorio.js?v=37');
    await gerarGanttPDF(ganttCtx(D, S.lgt, `Calendário · ${m.nome}`, '', arquivo));
    toast('PDF do calendário gerado.');
    logExport('calendario', {arquivo, qtd: D.acts.length, periodo: `${m.tipo} ${m.nome} · ${fmtShort(D.ini)} a ${fmtShort(D.fim)}/${D.fim.slice(0, 4)}`.slice(0, 200)});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar o PDF. Tente de novo.' : 'Para gerar o PDF pela primeira vez é preciso internet.'); }
  finally { gerandoGt = false; }
}
// dados de várias atividades de uma vez (consultas "in" de 30 em 30)
async function buscarPorAtividade(col, ids){
  const out = {};
  for (let i = 0; i < ids.length; i += 30){
    const s = await getDocs(query(collection(db, col), where('atividadeId', 'in', ids.slice(i, i + 30))));
    s.forEach(d => { const v = {id:d.id, ...d.data(SNAP)}; (out[v.atividadeId] ||= []).push(v); });
  }
  return out;
}
function openLocalPdf(){
  const k = S.loc?.k; if (!k) return;
  const acts = atividadesDoLocal(k), m = metaLocal(k, acts), nEnc = acts.filter(a => !(a.aberta && STATUS[a.status]?.aberta)).length;
  $('sheet').innerHTML = `<h2>Relatório do local</h2>
    <p class="ro" style="margin:-6px 0 14px">${esc(m.tipo)} <b>${esc(m.nome)}</b>: capa com resumo e lista, depois uma ficha por atividade com informações${' '}e, se marcado, fotos e histórico.</p>
    <form id="lpf" novalidate>
      <div class="f"><label class="chk"><input type="checkbox" id="lp-enc"${nEnc ? ' checked' : ' disabled'}> Incluir concluídas e canceladas <span class="ro">(${nEnc})</span></label></div>
      <div class="f"><label class="chk"><input type="checkbox" id="lp-fotos" checked> Incluir as fotos</label></div>
      <div class="f"><label class="chk"><input type="checkbox" id="lp-hist" checked> Incluir o histórico de cada atividade</label></div>
      <div class="f"><label class="chk"><input type="checkbox" id="lp-cal" checked> Incluir o calendário</label>
        <div class="seg lp-calp" id="lp-calp" style="margin-top:8px">${[['tudo','Todo o período (mês a mês)'],['tela',`Período do calendário (${ZLBL[S.lgt.zoom].toLowerCase()} ${fmtShort(gtRange(S.lgt).ini)})`]].map(([k, l], i) => `<button type="button" data-p="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div></div>
      <div class="cf-prev" id="lp-prev"></div>
      <div class="acts"><button type="button" class="btn ghost" id="lp-cancel">Cancelar</button><button class="btn pri" type="submit">Gerar PDF</button></div>
    </form>`;
  const upd = () => { const n = acts.filter(a => $('lp-enc').checked || (a.aberta && STATUS[a.status]?.aberta)).length; $('lp-prev').textContent = `${n} ${n === 1 ? 'atividade entra' : 'atividades entram'} no relatório.`; };
  let calp = 'tudo';
  $('lp-calp').onclick = e => { const b = e.target.closest('button[data-p]'); if (!b) return; calp = b.dataset.p; for (const x of $('lp-calp').children) x.setAttribute('aria-pressed', String(x === b)); };
  $('lp-cal').onchange = () => { $('lp-calp').hidden = !$('lp-cal').checked; };
  $('lp-enc').onchange = upd; upd();
  $('lp-cancel').onclick = closeModal;
  $('lpf').onsubmit = async e => {
    e.preventDefault();
    const bt = $('lpf').querySelector('button[type=submit]'); bt.disabled = true; bt.textContent = 'Gerando…';
    try { await gerarPdfLocal(k, {enc: $('lp-enc').checked, fotos: $('lp-fotos').checked, hist: $('lp-hist').checked, cal: $('lp-cal').checked ? calp : ''}, msg => { $('lp-prev').textContent = msg; }); closeModal(); }
    catch (err) { console.warn(err); bt.disabled = false; bt.textContent = 'Gerar PDF'; $('lp-prev').textContent = navigator.onLine ? 'Não foi possível gerar. Tente de novo.' : 'Sem internet: é preciso estar online para buscar fotos e histórico.'; }
  };
  showModal();
}
async function gerarPdfLocal(k, op, prog){
  await carregarTodas();
  const hoje = defaultNight(), todas = atividadesDoLocal(k), m = metaLocal(k, todas);
  const lista = todas.filter(a => op.enc || (a.aberta && STATUS[a.status]?.aberta))
    .sort((x, y) => x.noite.localeCompare(y.noite) || fimOf(x).localeCompare(fimOf(y)) || String(x.titulo).localeCompare(String(y.titulo), 'pt'));
  if (!lista.length) throw new Error('vazio');
  const ids = lista.map(a => a.id);
  prog('Buscando fotos e histórico…');
  const fotosPor = op.fotos ? await buscarPorAtividade('fotos', ids) : {}, histPor = op.hist ? await buscarPorAtividade('historico', ids) : {};
  const total = Object.values(fotosPor).reduce((s2, l) => s2 + l.length, 0); let feitas = 0;
  const fichas = [];
  for (const a of lista){
    const fs = (fotosPor[a.id] || []).sort((x, y) => toDate(x.t) - toDate(y.t)), hs = (histPor[a.id] || []).sort((x, y) => toDate(x.t) - toDate(y.t));
    fichas.push(await fichaCtx(a, fs, hs, 1280, () => { feitas++; prog(`Preparando fotos ${feitas} de ${total}…`); }));
  }
  const venc = lista.filter(a => a.aberta && STATUS[a.status]?.aberta && fimOf(a) < hoje).length;
  const now = new Date(), arquivo = `Relatorio_${slugArq(m.nome, 50) || 'local'}_${hoje}.pdf`;
  // calendário: o período em tela, ou todo o período das atividades, mês a mês (até 12 meses, os mais recentes)
  const gantts = [];
  if (op.cal){
    const titulo = `Calendário · ${m.nome}`;
    if (op.cal === 'tela'){ const g = {...S.lgt, conc: op.enc ? S.lgt.conc : false}, D = gtData(g, lista); if (D.acts.length) gantts.push(ganttCtx(D, g, titulo, '', '')); }
    else {
      const ini = lista.reduce((v, a) => a.noite < v ? a.noite : v, '9999'), fimT = lista.reduce((v, a) => { const f = a.aberta && fimOf(a) < hoje ? hoje : fimOf(a); return f > v ? f : v; }, '0000');
      const meses = []; let d = parseYmd(ini); d = new Date(d.getFullYear(), d.getMonth(), 1); const fimD = parseYmd(fimT);
      while (d <= fimD){ meses.push(ymd(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
      for (const ref of meses.slice(-12)){ const g = {zoom:'mes', ref, conc: op.enc, grp:'local', turno:''}, D = gtData(g, lista); if (D.acts.length) gantts.push(ganttCtx(D, g, titulo, '', '')); }
    }
  }
  prog('Montando o PDF…');
  const { gerarLocalPDF } = await import('./relatorio.js?v=37');
  await gerarLocalPDF({
    tipo: m.tipo, nome: m.nome, sub: m.sub,
    escopo: `${lista.length} ${lista.length === 1 ? 'atividade' : 'atividades'} · ${op.enc ? 'em aberto, concluídas e canceladas' : 'somente em aberto'} · situação em ${fmtShort(hoje)}/${hoje.slice(0, 4)}`,
    kpis: [['Atividades', lista.length], ['Em aberto', lista.filter(a => a.aberta && STATUS[a.status]?.aberta).length], ['Vencidas', venc, venc ? [196,86,44] : null], ['Concluídas', lista.filter(a => a.status === 'concluida').length], ['Fotos', total]],
    itens: lista.map(a => ({titulo: a.titulo || '', periodo: fmtPeriodo(a), status: a.status, statusLabel: STATUS[a.status]?.label || a.status, avanco: avOf(a), fornecedor: a.fornecedor || '—', fotos: (fotosPor[a.id] || []).length || Number(a.nFotos) || 0})),
    fichas, gantts, comFotos: op.fotos, comHist: op.hist, logoUrl: 'logo-saeng.png', arquivo,
    emitidoEm: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} às ${pad(now.getHours())}:${pad(now.getMinutes())}`, emitidoPor: S.perfil?.nome || 'Usuário',
  });
  toast('Relatório do local gerado.');
  logExport('local', {arquivo, qtd: lista.length, periodo: `${m.tipo} ${m.nome}`.slice(0, 150)});
}
async function baixarZipLocal(){
  const k = S.loc?.k; if (!k || zipando) return;
  zipando = true;
  try {
    toast('Buscando as fotos do local…');
    await carregarTodas();
    const acts = atividadesDoLocal(k).sort((x, y) => x.noite.localeCompare(y.noite)), m = metaLocal(k, acts), hoje = defaultNight();
    const fotosPor = await buscarPorAtividade('fotos', acts.map(a => a.id));
    const total = Object.values(fotosPor).reduce((s2, l) => s2 + l.length, 0);
    if (!total) { toast('Nenhuma foto neste local.'); return; }
    const JSZip = await carregarJSZip(), zip = new JSZip(); let n = 0, mini = 0, ia = 0;
    const leia = [`${m.tipo}: ${m.nome}${m.sub ? ' — ' + m.sub : ''}`, `Fotos: ${total} · baixadas em ${fmtTs(new Date())} por ${S.perfil?.nome || ''}`, ''];
    for (const a of acts){
      const fs = (fotosPor[a.id] || []).sort((x, y) => toDate(x.t) - toDate(y.t)); if (!fs.length) continue;
      ia++; const pasta = `${String(ia).padStart(2, '0')}_${slugArq(a.titulo, 50) || 'atividade'}`;
      leia.push(`[${pasta}] ${a.titulo} — ${fmtPeriodo(a)} — ${STATUS[a.status]?.label || a.status}`);
      for (let i = 0; i < fs.length; i++){
        const f = fs[i]; n++; toast(`Baixando foto ${n} de ${total}…`);
        const r = await blobFoto(f); if (r.mini) mini++;
        const quando = f.t ? toDate(f.t) : new Date();
        const nome = `${String(i + 1).padStart(2, '0')}_${pad(quando.getDate())}-${pad(quando.getMonth() + 1)}_${slugArq(f.legenda, 50) || 'foto'}.jpg`;
        zip.file(`${pasta}/${nome}`, r.blob);
        leia.push(`   ${nome} — ${f.legenda || '(sem legenda)'} — ${f.t ? fmtTs(f.t) : ''} — ${nameOf(f.u)}`);
      }
    }
    zip.file('LEIA-ME.txt', leia.join('\r\n') + '\r\n');
    const out = await zip.generateAsync({type:'blob'}), arquivo = `Fotos_${slugArq(m.nome, 50) || 'local'}_${hoje}.zip`;
    const url = URL.createObjectURL(out), el = document.createElement('a'); el.href = url; el.download = arquivo; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(mini ? `Pasta gerada. ${mini} ${mini === 1 ? 'foto saiu' : 'fotos saíram'} em tamanho reduzido (o Storage ainda não libera o download direto).` : `Pasta com ${total} fotos de ${ia} ${ia === 1 ? 'atividade' : 'atividades'} gerada.`);
    logExport('fotos', {arquivo, qtd: total, periodo: `${m.tipo} ${m.nome}`.slice(0, 150)});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar a pasta. Tente de novo.' : 'Sem internet: é preciso estar online para baixar as fotos.'); }
  finally { zipando = false; }
}

/* ================= escrita ================= */
// Toda gravação vai num lote: a atividade + um registro novo e imutável em "historico".
// As regras do Firestore recusam qualquer alteração de atividade que não venha com o seu registro.
// Exportações (relatório PDF, calendário PDF, cronograma Excel, CSV) também ficam no histórico.
// Se a gravação falhar (sem internet, regra antiga), o arquivo sai do mesmo jeito.
const EXP_LABEL = {relatorio:'o relatório PDF de atividades em aberto', calendario:'o calendário em PDF', cronograma:'o cronograma quinzenal em Excel', csv:'a lista de atividades em CSV', claude:'o arquivo de atividades para o Claude (IA)', atividade:'o PDF de uma atividade (dados, fotos e histórico)', fotos:'as fotos de uma atividade ou local (.zip)', local:'o relatório de um local (setor, pilar ou loja)'};
function logExport(formato, info = {}){
  if (!S.uid) return;
  const d = {atividadeId:'', tipo:'exportou', formato, t:serverTimestamp(), u:S.uid,
    arquivo: String(info.arquivo || '').slice(0, 200), qtd: Number(info.qtd) || 0,
    periodo: String(info.periodo || '').slice(0, 200), filtros: String(info.filtros || '').slice(0, 500)};
  for (const k of ['arquivo','periodo','filtros']) if (!d[k]) delete d[k];
  try { const b = writeBatch(db); b.set(doc(collection(db, 'historico')), d); b.commit().catch(e => console.warn('histórico da exportação', e)); }
  catch (e) { console.warn('histórico da exportação', e); }
}
function evDoc(atividadeId, a, ev){
  const d = {atividadeId, t:serverTimestamp(), u:S.uid, titulo:a.titulo || '', local:localLine(a), noiteAtv:a.noite || '', turnoAtv:turnoOf(a), ...ev};
  for (const k of Object.keys(d)) if (d[k] === '' || d[k] === undefined || d[k] === null) delete d[k];
  return d;
}
function handleWriteError(e){
  console.warn(e);
  if (e?.code === 'permission-denied') toast('O banco recusou a gravação. Verifique se seu acesso continua liberado.');
  else toast('Não foi possível salvar. Tente de novo.');
}
function commit(batch, okMsg){
  let done = false;
  const p = batch.commit().then(() => { done = true; }, handleWriteError);
  setTimeout(() => { if (!done && !navigator.onLine) toast('Salvo no aparelho. Será enviado quando a conexão voltar.'); else if (okMsg) toast(okMsg); }, 600);
  return p;
}
function mutate(id, build, okMsg){
  const cur = all().get(id);
  if (!cur){ toast('Esta atividade não está mais disponível.'); return; }
  const {changes, ev} = build(cur);
  const histRef = doc(collection(db, 'historico')), b = writeBatch(db);
  b.update(doc(db, 'atividades', id), {...changes, atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:histRef.id});
  b.set(histRef, evDoc(id, {...cur, ...changes}, ev));
  commit(b, okMsg);
  S.dwMode = null; $('dw-panel').innerHTML = ''; renderDrawerActions();
}
function createAct(data, origem){
  delete data.fromPend;
  const actRef = doc(collection(db, 'atividades')); S.lastActId = actRef.id;
  const histRef = doc(collection(db, 'historico')), b = writeBatch(db);
  const et = tagsOf(data);
  b.set(actRef, {...data, etiquetas:et, temEtiqueta:et.length > 0, avanco:Number(data.avanco) || 0, fim:data.fim || data.noite, status:Number(data.avanco) > 0 ? 'andamento' : 'programada', aberta:true, motivo:'', pct:'', ultimaObs:'', criadoPor:S.uid, criadoEm:serverTimestamp(), atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:histRef.id});
  b.set(histRef, evDoc(actRef.id, data, {tipo:'criou', noite:data.noite, turno:data.turno, ...(origem ? {origem} : {})}));
  return commit(b);
}

/* ================= formulário ================= */
function openForm(id, preset = {}){
  if (!canWrite()) return;
  const a = id ? all().get(id) : null;
  const v = a ? {...a, turno:turnoOf(a)} : {noite:S.noite < defaultNight() ? defaultNight() : S.noite, turno:S.f.turno || '', tipoLocal:(S.f.tipo.length === 1 ? S.f.tipo[0] : '') || (S.f.loc.length === 1 ? {s:'setor', p:'pilar', z:'shopping'}[S.f.loc[0][0]] : '') || 'setor', setor:S.f.loc.length === 1 && S.f.loc[0][0] === 's' ? S.f.loc[0].slice(2) : '', pilar:S.f.loc.length === 1 && S.f.loc[0][0] === 'p' ? S.f.loc[0].slice(2) : '', local:S.f.loc.length === 1 && S.f.loc[0][0] === 'z' ? S.f.loc[0].slice(2) : '', prioridade:'normal', fornecedor:S.f.forn.length === 1 && S.f.forn[0] !== '__none__' ? S.f.forn[0] : '', etiquetas:[...S.f.etq], ...preset};
  S.fromPend = !a && preset.fromPend ? preset.fromPend : null;
  const pdOrig = S.fromPend ? S.pend.get(S.fromPend) : null;
  $('sheet').innerHTML = `<h2>${a ? 'Editar atividade' : 'Nova atividade'}</h2>
  ${pdOrig ? `<div class="af-from"><b>Do lembrete:</b> ${esc(pdOrig.texto)}<br>Descreva o <b>serviço que será executado em campo</b> (ex.: “Instalação da iluminação provisória – Setor D1”), com o fornecedor e a data em que acontece. Ao inserir, o lembrete fica como feito.</div>` : ''}
  <form id="af" novalidate>
    <div class="frow">
      <div class="f"><label for="af-noite">Início <span class="req">*</span></label><input id="af-noite" type="date" value="${esc(v.noite)}"></div>
      <div class="f"><label for="af-fim">Término <span class="req">*</span></label><input id="af-fim" type="date" value="${esc(a ? fimOf(a) : v.noite)}"></div>
    </div>
    <div class="frow">
      <div class="f"><label>Turno <span class="req">*</span></label><div class="seg seg-turno" id="af-turno">${['diurno','noturno'].map(t => `<button type="button" data-t="${t}" aria-pressed="${v.turno === t}">${t === 'diurno' ? ICON_SOL : ICON_LUA}${TURNOS[t]}</button>`).join('')}</div></div>
      <div class="f"><label for="af-prior">Prioridade</label><select id="af-prior">${Object.entries(PRIOR).map(([k,l]) => `<option value="${k}" ${k === (v.prioridade||'normal') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="f"><label>Onde</label><div class="seg" id="af-tipo">${['setor','pilar','shopping'].map(t => `<button type="button" data-t="${t}" aria-pressed="${v.tipoLocal === t}">${TIPO_LABEL[t]}</button>`).join('')}</div></div>
    <div class="frow" id="af-loc-setor"><div class="f"><label for="af-setor">Setor <span class="req">*</span></label><select id="af-setor"><option value="">Selecione…</option>${S.cad.setores.map(x => `<option value="${esc(x.codigo)}" ${x.codigo === v.setor ? 'selected' : ''}>Setor ${esc(x.codigo)}${x.descricao ? ' — '+esc(x.descricao) : ''}</option>`).join('')}</select></div></div>
    <div class="frow" id="af-loc-pilar"><div class="f"><label for="af-pilar">Pilar <span class="req">*</span></label><input id="af-pilar" list="dl-pilar" value="${esc(v.tipoLocal === 'pilar' || v.pilar ? pilarCodeOf(v) : '')}" placeholder="ex.: P34" autocomplete="off"></div>
      <div class="f"><label for="af-pilar-loja">Loja / ambiente</label><input id="af-pilar-loja" list="dl-pilar-loja" value="${esc(v.pilar || v.pilarLoja ? pilarLojaOf(v) : '')}" placeholder="ex.: Loja A. Niemeyer" autocomplete="off"></div></div>
    <div class="frow" id="af-loc-shop"><div class="f"><label for="af-local">Local no shopping <span class="req">*</span></label><input id="af-local" list="dl-local" value="${esc(v.local||'')}" placeholder="ex.: Mall – Escadas Centrais" autocomplete="off"></div></div>
    <div class="frow">
      <div class="f"><label for="af-nivel">Nível</label><input id="af-nivel" list="dl-nivel" value="${esc(v.nivel||'')}" placeholder="ex.: 114,30" autocomplete="off"></div>
      <div class="f"><label for="af-eixo" id="af-eixo-l">Eixo</label><input id="af-eixo" value="${esc(v.eixo||'')}" placeholder="ex.: 8 / E-H" autocomplete="off"></div>
    </div>
    <div class="f"><label for="af-av">Avanço</label><div class="av-form"><input type="range" id="af-av" class="range" min="0" max="100" step="5" value="${a ? avOf(a) : 0}"><b id="af-av-n">${a ? avOf(a) : 0}%</b></div></div>
    <div class="f"><label for="af-titulo">Atividade <span class="req">*</span></label><input id="af-titulo" maxlength="300" value="${esc(v.titulo||'')}" placeholder="ex.: Demolição da parede do eixo 8, trecho E–F" autocomplete="off"></div>
    <div class="f"><label>Etiquetas <span class="lbl-h">serviço macro que liga atividades</span></label><div id="af-etq"></div></div>
    <div class="f"><label for="af-det">Detalhes / orientações para a equipe</label><textarea id="af-det" placeholder="Sequência, cuidados, liberações necessárias, contato no shopping…">${esc(v.detalhes||'')}</textarea></div>
    <div class="frow">
      <div class="f"><label for="af-forn">Fornecedor</label><input id="af-forn" list="dl-forn" value="${esc(v.fornecedor||'')}" placeholder="Selecione ou digite" autocomplete="off"></div>
      <div class="f"><label for="af-resp">Responsável no turno</label><input id="af-resp" value="${esc(v.responsavel||'')}" placeholder="Encarregado / técnico" autocomplete="off"></div>
      <div class="f"><label for="af-efet">Efetivo previsto</label><input id="af-efet" type="number" min="0" inputmode="numeric" value="${esc(v.efetivo||'')}"></div>
    </div>
    <datalist id="dl-forn">${S.cad.fornecedores.map(x => `<option value="${esc(x.nome)}">${esc(x.disciplina||'')}</option>`).join('')}</datalist>
    <datalist id="dl-pilar">${locOptions('pilar').map(([c, l]) => `<option value="${esc(c)}">${esc(l)}</option>`).join('')}</datalist>
    <datalist id="dl-pilar-loja"></datalist>
    <datalist id="dl-local">${S.cad.locais.map(x => `<option value="${esc(locNome(x))}">${esc(locSetor(x) ? 'Setor ' + locSetor(x) : '')}</option>`).join('')}</datalist>
    <datalist id="dl-nivel">${S.cad.niveis.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    <div class="af-warn" id="af-pwarn" role="alert" hidden></div>
    <div class="af-warn" id="af-warn" role="alert" hidden></div>
    <div class="acts"><button type="button" class="btn ghost" id="af-cancel">Cancelar</button><button class="btn pri" type="submit">${a ? 'Salvar alterações' : 'Inserir atividade'}</button></div>
  </form>`;
  let tipo = v.tipoLocal || 'setor', turno = v.turno || '';
  const syncTurno = () => { for (const b of $('af-turno').children) b.setAttribute('aria-pressed', String(b.dataset.t === turno)); $('af-noite-h').textContent = turno === 'noturno' ? 'No noturno, use a data em que o turno começa.' : ''; };
  $('af-turno').onclick = e => { const b = e.target.closest('button[data-t]'); if (b){ turno = b.dataset.t; syncTurno(); } };
  const syncTipo = () => {
    $('af-loc-setor').hidden = tipo !== 'setor'; $('af-loc-pilar').hidden = tipo !== 'pilar'; $('af-loc-shop').hidden = tipo !== 'shopping';
    $('af-eixo-l').textContent = tipo === 'shopping' ? 'Complemento (piso, frente, eixo)' : 'Eixo';
    for (const b of $('af-tipo').children) b.setAttribute('aria-pressed', String(b.dataset.t === tipo));
  };
  $('af-tipo').onclick = e => { const b = e.target.closest('button[data-t]'); if (b){ tipo = b.dataset.t; syncTipo(); } };
  syncTipo();
  const syncLojas = () => {
    const c = pilarCode($('af-pilar').value) || $('af-pilar').value.trim(), set = new Set();
    for (const x of S.cad.pilares) if ((pilarCode(x.codigo) || x.codigo) === c && x.referencia) set.add(x.referencia);
    for (const a of all().values()) if (a.tipoLocal === 'pilar' && pilarCodeOf(a) === c){ const l = pilarLojaOf(a); if (l) set.add(l); }
    $('dl-pilar-loja').innerHTML = [...set].sort((x, y) => x.localeCompare(y, 'pt')).map(l => `<option value="${esc(l)}"></option>`).join('');
  };
  $('af-pilar').addEventListener('input', syncLojas); syncLojas();
  const pk = tagPicker($('af-etq'), tagsOf(v));
  $('af-noite').insertAdjacentHTML('afterend', '<span class="ro" id="af-noite-h"></span>'); syncTurno();
  for (const id of ['af-noite','af-fim']) $(id).addEventListener('change', () => { $('af-warn').hidden = true; delete $('af-warn').dataset.ok; });
  $('af-titulo').addEventListener('input', () => { $('af-pwarn').hidden = true; delete $('af-pwarn').dataset.ok; });
  $('af-noite').addEventListener('change', () => { if (!$('af-fim').value || $('af-fim').value < $('af-noite').value) $('af-fim').value = $('af-noite').value; });
  $('af-av').oninput = e => { $('af-av-n').textContent = e.target.value + '%'; };
  $('af-cancel').onclick = closeModal;
  $('af').onsubmit = e => {
    e.preventDefault();
    const d = {noite:$('af-noite').value, fim:$('af-fim').value || $('af-noite').value, avanco:Number($('af-av').value) || 0, turno, prioridade:$('af-prior').value, tipoLocal:tipo,
      setor: tipo === 'setor' ? $('af-setor').value : '', pilar: tipo === 'pilar' ? (pilarCode($('af-pilar').value) || $('af-pilar').value.trim()) : '', pilarLoja: tipo === 'pilar' ? $('af-pilar-loja').value.trim() : '', local: tipo === 'shopping' ? $('af-local').value.trim() : '',
      nivel:$('af-nivel').value.trim(), eixo:$('af-eixo').value.trim(), titulo:$('af-titulo').value.trim(), detalhes:$('af-det').value.trim(),
      fornecedor:$('af-forn').value.trim(), responsavel:$('af-resp').value.trim(), efetivo:$('af-efet').value.trim(), etiquetas:pk.get()};
    d.temEtiqueta = d.etiquetas.length > 0;
    if (!d.noite) return toast('Informe a data de início.');
    if (d.fim < d.noite) return toast('O término não pode ser antes do início.');
    if (!d.turno) return toast('Escolha o turno: diurno ou noturno.');
    if (tipo === 'setor' && !d.setor) return toast('Selecione o setor.');
    if (tipo === 'pilar' && !d.pilar) return toast('Informe o pilar.');
    if (tipo === 'shopping' && !d.local) return toast('Informe o local no shopping.');
    if (!d.titulo) return toast('Descreva a atividade.');
    // título com cara de lembrete (programar, solicitar, cobrar...): sugere salvar como pendência
    { const w = $('af-pwarn');
      if (!a && PEND_RX.test(d.titulo) && w.dataset.ok !== d.titulo){
        w.dataset.ok = d.titulo; w.hidden = false;
        w.innerHTML = `<b>Isso parece um lembrete, não uma atividade de campo.</b> Atividade é o serviço que a equipe vai executar (ex.: “Instalação elétrica – Setor D1”). Providências como programar, solicitar ou cobrar vão em Lembretes.
          <div class="af-warn-a">${S.fromPend ? '' : '<button type="button" class="btn pri sm" id="af-to-pend">Salvar como lembrete</button>'}<span class="ro">ou corrija o título${S.fromPend ? '' : ', ou toque de novo em “Inserir atividade” para manter'}</span></div>`;
        if ($('af-to-pend')) $('af-to-pend').onclick = () => {
          const L = d.tipoLocal === 'setor' && d.setor ? 'Setor ' + d.setor : d.tipoLocal === 'pilar' ? [d.pilar, d.pilarLoja].filter(Boolean).join(' - ') : d.local;
          pdSave(null, {texto:d.titulo.slice(0, 300), responsavel:d.responsavel, prazo:d.noite, local:L, obs:[d.fornecedor ? 'Fornecedor: ' + d.fornecedor : '', d.detalhes].filter(Boolean).join('\n')}, 'Salvo em Lembretes.');
          closeModal();
        };
        w.scrollIntoView({behavior:'smooth', block:'center'}); return;
      } }
    { const hj = defaultNight(), w = $('af-warn'), mudouFim = !a || fimOf(a) !== d.fim;
      if (d.fim < hj && mudouFim && w.dataset.ok !== d.fim){
        w.dataset.ok = d.fim; w.hidden = false;
        w.innerHTML = `<b>O término (${fmtShort(d.fim)}) já passou.</b> Hoje é ${fmtShort(hj)}: a atividade vai entrar como vencida. Confira as datas ou toque de novo em “${a ? 'Salvar alterações' : 'Inserir atividade'}” para confirmar.`;
        w.scrollIntoView({behavior:'smooth', block:'center'}); return;
      } }
    if (!a){
      const fp = S.fromPend; createAct(d); closeModal(); if (S.dia && d.noite !== S.dia) setNight(d.noite);
      if (fp && S.pend.has(fp)){ pdSave(fp, {feita:true, feitaPor:S.uid, feitaEm:serverTimestamp(), atividadeId:S.lastActId}); toast('Atividade inserida. O lembrete ficou como feito.'); }
      else toast('Atividade inserida.');
      S.fromPend = null; return;
    }
    const gv = (o, k) => String((k === 'etiquetas' ? tagsOf(o).join(', ') : k === 'turno' ? turnoOf(o) : k === 'fim' ? fimOf(o) : k === 'avanco' ? (o === a ? avOf(o) : Number(o.avanco) || 0) : o[k]) ?? '');
    const mudancas = Object.keys(FIELDS).filter(k => gv(a, k) !== gv(d, k)).map(k => ({campo:k, de:gv(a, k), para:gv(d, k)}));
    if (mudancas.some(m => m.campo === 'avanco') && autoAnd(a.status, d.avanco)){ d.status = 'andamento'; d.motivo = ''; mudancas.push({campo:'status', de:a.status, para:'andamento'}); }
    closeModal();
    if (mudancas.length) mutate(a.id, () => ({changes:d, ev:{tipo:'editou', mudancas}}), 'Alterações salvas.');
  };
  showModal(); setTimeout(() => $('af-titulo').focus(), 30);
}
// Campo de etiquetas: escolhe uma já usada (com sugestões) ou cria uma nova digitando e tocando em Enter.
function tagPicker(el, initial){
  let sel = [...initial];
  el.classList.add('etq-pick');
  el.innerHTML = `<div class="etq-box"><span class="etq-sel"></span><input class="etq-in" maxlength="60" autocomplete="off" enterkeyhint="done" aria-label="Adicionar etiqueta"></div><div class="etq-sug" hidden></div>`;
  const box = el.querySelector('.etq-box'), selEl = el.querySelector('.etq-sel'), inp = el.querySelector('.etq-in'), sug = el.querySelector('.etq-sug');
  const draw = () => {
    selEl.innerHTML = sel.map((t, i) => `<span class="etq on" style="--tc:${tagCor(t)}">${ICON_TAG}<span>${esc(t)}</span><button type="button" data-rm="${i}" aria-label="Remover ${esc(t)}">×</button></span>`).join('');
    inp.placeholder = sel.length ? 'Adicionar outra…' : 'Escolha ou crie (ex.: Demolição alvenaria eixo 8)';
  };
  const add = raw => {
    const t = normTag(raw); if (!t) return;
    const k = tagKey(t);
    if (!sel.some(x => tagKey(x) === k)){
      if (sel.length >= MAX_TAGS){ toast(`Use no máximo ${MAX_TAGS} etiquetas por atividade.`); return; }
      sel.push(tagCatalog().get(k)?.nome || t);
    }
    inp.value = ''; draw(); sug.hidden = true;
  };
  let hi = 0;
  const opts = () => [...sug.querySelectorAll('[data-sug]')];
  const mark = () => opts().forEach((b, i) => b.classList.toggle('hi', i === hi));
  const showSug = () => {
    const q = tagKey(inp.value), cat = tagCatalog();
    const list = [...cat.values()].filter(x => !sel.some(t => tagKey(t) === x.k) && (!q || x.k.includes(q)))
      .sort((a, b) => (b.abertas > 0) - (a.abertas > 0) || b.ult - a.ult).slice(0, 8);
    let h = list.map(x => `<button type="button" data-sug="${esc(x.nome)}" style="--tc:${tagCor(x.nome)}">${ICON_TAG}<span>${esc(x.nome)}</span><small>${x.n} ${x.n === 1 ? 'atividade' : 'atividades'}</small></button>`).join('');
    if (q && !cat.has(q) && !sel.some(t => tagKey(t) === q)) h += `<button type="button" class="new" data-sug="${esc(normTag(inp.value))}" style="--tc:${tagCor(inp.value)}">${ICON_TAG}<span>Criar “${esc(normTag(inp.value))}”</span></button>`;
    if (!q && !list.length) h = '<div class="etq-hint">Digite o nome do serviço macro e toque em Enter para criar a primeira etiqueta.</div>';
    sug.innerHTML = h; sug.hidden = document.activeElement !== inp; hi = 0; if (q) mark();
  };
  inp.onfocus = showSug; inp.oninput = showSug;
  inp.onblur = () => setTimeout(() => { if (document.activeElement !== inp) sug.hidden = true; }, 120);
  inp.onkeydown = e => {
    if (e.key === 'Enter'){ e.preventDefault(); const o = !sug.hidden && normTag(inp.value) ? opts()[hi] : null; add(o ? o.dataset.sug : inp.value); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !sug.hidden && opts().length){ e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + opts().length) % opts().length; mark(); }
    else if (e.key === 'Backspace' && !inp.value && sel.length){ sel.pop(); draw(); }
    else if (e.key === 'Escape' && !sug.hidden){ e.stopPropagation(); sug.hidden = true; }
  };
  sug.onmousedown = e => e.preventDefault();
  sug.onclick = e => { const b = e.target.closest('[data-sug]'); if (b) add(b.dataset.sug); };
  box.onclick = e => {
    const r = e.target.closest('[data-rm]');
    if (r){ sel.splice(Number(r.dataset.rm), 1); draw(); return; }
    inp.focus();
  };
  draw();
  return { get(){ if (normTag(inp.value)) add(inp.value); return [...sel]; } };
}
function showModal(){ $('modal').hidden = false; $('scrim').hidden = false; }
function closeModal(){ $('modal').hidden = true; if ($('drawer').hidden) $('scrim').hidden = true; }
function openPerfil(){
  $('sheet').innerHTML = `<h2>Meu nome no histórico</h2><form id="pff">
    <div class="f"><label for="pf-nome">Nome</label><input id="pf-nome" value="${esc(S.perfil?.nome||'')}" maxlength="80"></div>
    <div class="f"><label for="pf-func">Função</label><select id="pf-func"><option value="">Selecione…</option>${FUNCOES.map(f => `<option ${f === S.perfil?.funcao ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="acts"><button type="button" class="btn ghost" id="pf-c">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`;
  $('pf-c').onclick = closeModal;
  $('pff').onsubmit = async e => {
    e.preventDefault(); const nome = $('pf-nome').value.trim(); if (!nome) return toast('Informe seu nome.');
    try { await updateDoc(doc(db, 'usuarios', S.uid), {nome, funcao:$('pf-func').value}); closeModal(); toast('Salvo.'); } catch (err) { handleWriteError(err); }
  };
  showModal();
}

/* ================= exportar ================= */
async function exportCsv(){
  const ft = S.f.turno, hoje = defaultNight();
  if (S.tab !== 'noite' || !S.listaAtual) renderNight();
  const rows = [...(S.listaAtual || [])];
  if (!rows.length) return toast('Nenhuma atividade na lista para exportar.');
  const hist = {};
  try {
    const ids = rows.map(a => a.id);
    for (let i = 0; i < ids.length; i += 30){
      const s = await getDocs(query(collection(db, 'historico'), where('atividadeId', 'in', ids.slice(i, i+30))));
      s.forEach(d => { const v = d.data(SNAP); (hist[v.atividadeId] ||= []).push(v); });
    }
  } catch (e) { console.warn(e); }
  const head = ['Início','Término','Turno','Situação','Tipo de local','Setor','Pilar','Loja / ambiente do pilar','Local shopping','Nível','Eixo/complemento','Atividade','Etiquetas','Detalhes','Fornecedor','Responsável','Efetivo previsto','Prioridade','Status','Avanço (%)','Motivo','Última observação','Inserida por','Inserida em','Última alteração por','Última alteração em','Histórico'];
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  const histTxt = a => (hist[a.id] || []).sort((x,y) => toDate(x.t)-toDate(y.t)).map(ev => `${fmtTs(ev.t)} ${nameOf(ev.u)}: ${evText(ev).replace(/<[^>]+>/g,'')}${ev.motivo ? ' ['+ev.motivo+']' : ''}${ev.obs ? ' — '+ev.obs : ''}`).join(' | ');
  const lines = [head.map(q).join(';'), ...rows.map(a => [fmtShort(a.noite), fmtShort(fimOf(a)), TURNOS[turnoOf(a)], a.status === 'concluida' ? 'Concluída' : a.status === 'cancelada' ? 'Cancelada' : fimOf(a) < S.noite ? 'Vencida' : a.noite > S.noite ? 'A iniciar' : 'Em curso', TIPO_LABEL[a.tipoLocal]||'', a.setor, a.tipoLocal === 'pilar' ? pilarCodeOf(a) : '', a.tipoLocal === 'pilar' ? pilarLojaOf(a) : '', a.local, a.nivel, a.eixo, a.titulo, tagsOf(a).join(', '), a.detalhes, a.fornecedor, a.responsavel, a.efetivo, PRIOR[a.prioridade]||'', STATUS[a.status]?.label||a.status, avOf(a), a.motivo, a.ultimaObs, nameOf(a.criadoPor), fmtTs(a.criadoEm), nameOf(a.atualizadoPor), fmtTs(a.atualizadoEm), histTxt(a)].map(q).join(';'))];
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  const el = document.createElement('a'); el.href = url; el.download = `Atividades_${S.dia ? S.dia : 'em_aberto_' + hoje}${ft ? '_' + ft : ''}.csv`; document.body.appendChild(el); el.click(); el.remove();
  logExport('csv', {arquivo: el.download, qtd: rows.length, periodo: `${S.dia ? 'dia ' + fmtShort(S.dia) + '/' + S.dia.slice(0, 4) + ' + vencidas' : 'todas em aberto em ' + fmtShort(hoje) + '/' + hoje.slice(0, 4)} · ${ft ? 'turno ' + TURNOS[ft].toLowerCase() : 'turnos diurno e noturno'}`, filtros: filtrosTxt()});
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ================= cronograma quinzenal (Excel) ================= */
function openCronograma(opts = {}){
  const ft = S.f.turno || '', etq0 = opts.etq || '';
  let ini0 = defaultNight();
  if (etq0){ // pela etiqueta: começa hoje se houver atividade nos próximos 15 dias; senão, no primeiro início da etiqueta
    const ls = [...all().values()].filter(a => hasTag(a, etq0) && a.status !== 'cancelada');
    if (ls.length && !ls.some(a => a.noite <= addDays(ini0, 14) && fimOf(a) >= ini0)){ const ab = ls.filter(a => a.aberta); ini0 = (ab.length ? ab : ls).reduce((v, a) => a.noite < v ? a.noite : v, '9999'); }
  }
  const cat = [...tagCatalog().values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  $('sheet').innerHTML = `<h2>Gerar cronograma quinzenal</h2>
    <p class="ro" style="margin:-6px 0 16px">Cria a planilha Excel no padrão de cronograma SAENG, com as atividades que acontecem no período (início ou término dentro dos 15 dias). Canceladas não entram.</p>
    <form id="cf" novalidate>
      <div class="frow">
        <div class="f"><label for="cf-ini">Data inicial <span class="req">*</span></label><input id="cf-ini" type="date" value="${ini0}"></div>
        <div class="f"><label>Data final</label><div class="cf-fim" id="cf-fim"></div></div>
      </div>
      <div class="f"><label>Turno</label><div class="seg" id="cf-turno">${[['','Todos'],['diurno','Diurno'],['noturno','Noturno']].map(([k,l]) => `<button type="button" data-t="${k}" aria-pressed="${k === ft}">${l}</button>`).join('')}</div></div>
      <div class="frow">
        <div class="f"><label for="cf-etq">Etiqueta</label><select id="cf-etq"><option value="">Todas as atividades</option>${cat.map(x => `<option value="${esc(x.nome)}" ${tagKey(x.nome) === tagKey(etq0) ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="f"><label>Agrupar por</label><div class="seg" id="cf-grp">${[['local','Setor / local'],['etq','Etiqueta']].map(([k,l]) => `<button type="button" data-g="${k}" aria-pressed="${k === (etq0 ? 'etq' : 'local')}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="frow">
        <div class="f"><label for="cf-rev">Revisão</label><input id="cf-rev" value="00" maxlength="3" inputmode="numeric"></div>
        <div class="f"><label class="chk"><input type="checkbox" id="cf-conc" checked> Incluir concluídas no período</label></div>
      </div>
      <div class="f"><label for="cf-tit">Título da planilha</label><input id="cf-tit" value="PROGRAMAÇÃO DE ATIVIDADES | SHOPPING IGUATEMI SP - ROOFTOP"></div>
      <div class="cf-prev" id="cf-prev"></div>
      <div class="acts"><button type="button" class="btn ghost" id="cf-cancel">Cancelar</button><button class="btn pri" type="submit">Gerar Excel</button></div>
    </form>`;
  let turno = ft, grp = etq0 ? 'etq' : 'local';
  const sel = () => {
    const ini = $('cf-ini').value; if (!ini) return [];
    const fim = addDays(ini, 14), conc = $('cf-conc').checked, et = $('cf-etq').value;
    return [...all().values()].filter(a => a.status !== 'cancelada' && (conc || a.status !== 'concluida') && (!turno || turnoOf(a) === turno) && (!et || hasTag(a, et)) && a.noite <= fim && fimOf(a) >= ini);
  };
  $('cf-grp').onclick = e => { const b = e.target.closest('button[data-g]'); if (!b) return; grp = b.dataset.g; for (const x of $('cf-grp').children) x.setAttribute('aria-pressed', String(x === b)); };
  const upd = () => {
    const ini = $('cf-ini').value;
    $('cf-fim').textContent = ini ? `${fmtDay(addDays(ini, 14))}/${addDays(ini, 14).slice(0,4)} · 15 dias` : '—';
    const n = sel().length;
    $('cf-prev').textContent = ini ? (n ? `${n} ${n === 1 ? 'atividade entra' : 'atividades entram'} no cronograma de ${fmtShort(ini)} a ${fmtShort(addDays(ini, 14))}.` : 'Nenhuma atividade nesse período.') : '';
  };
  $('cf-turno').onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; turno = b.dataset.t; for (const x of $('cf-turno').children) x.setAttribute('aria-pressed', String(x === b)); upd(); };
  $('cf-ini').onchange = upd; $('cf-conc').onchange = upd; $('cf-etq').onchange = upd; upd();
  $('cf-cancel').onclick = closeModal;
  $('cf').onsubmit = async e => {
    e.preventDefault();
    const ini = $('cf-ini').value; if (!ini) return toast('Escolha a data inicial.');
    const list = sel(); if (!list.length) return toast('Nenhuma atividade nesse período.');
    const rev = ($('cf-rev').value.trim() || '00').padStart(2, '0');
    const et = $('cf-etq').value, groups = new Map();
    if (grp === 'etq'){
      // cada atividade entra na etiqueta escolhida ou na primeira que tiver; sem etiqueta vai para o fim
      for (const a of list){ const t = et ? (tagsOf(a).find(x => tagKey(x) === tagKey(et)) || et) : tagsOf(a)[0], k = t ? 'e:' + tagKey(t) : 'zz';
        if (!groups.has(k)) groups.set(k, {k, label: t || 'Sem etiqueta', sub: t ? '' : 'Atividades avulsas', items:[]}); groups.get(k).items.push(a); }
    } else for (const a of list){ const g = groupKey(a); const k = a.tipoLocal === 'shopping' ? 'z' : g.k; if (!groups.has(k)) groups.set(k, {k, label: a.tipoLocal === 'shopping' ? 'Shopping' : g.label, sub: a.tipoLocal === 'shopping' ? 'Lojas, mall, estacionamento e áreas de apoio' : g.sub, items:[]}); groups.get(k).items.push(a); }
    const ordG = grp === 'etq' ? (x, y) => (x.k === 'zz') - (y.k === 'zz') || x.label.localeCompare(y.label, 'pt') : (x, y) => groupRank(x.k) - groupRank(y.k);
    const grupos = [...groups.values()].sort(ordG).map(g => ({label:g.label, sub:g.sub,
      items: g.items.sort((x, y) => x.noite.localeCompare(y.noite) || fimOf(x).localeCompare(fimOf(y)) || String(x.titulo).localeCompare(String(y.titulo), 'pt')).map(a => ({
        titulo: a.titulo, empresa: a.fornecedor || '', inicio: a.noite, fim: fimOf(a), status: a.status, avanco: avOf(a),
        detalhe: [localLine(a), `turno ${TURNOS[turnoOf(a)].toLowerCase()}`, a.responsavel ? `resp.: ${a.responsavel}` : '', grp === 'local' && tagsOf(a).length ? `etiqueta: ${tagsOf(a).join(', ')}` : ''].filter(Boolean).join(' · '),
      }))}));
    const now = new Date(), hojeBR = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
    const btn = $('cf').querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Gerando…';
    try {
      const { gerarCronogramaXLSX } = await import('./cronograma.js?v=37');
      const fimP = addDays(ini, 14);
      const r = await gerarCronogramaXLSX({
        inicio: ini, nDias: 15, grupos, emitidoPor: S.perfil?.nome || '',
        titulo: $('cf-tit').value.trim() || 'PROGRAMAÇÃO DE ATIVIDADES | SHOPPING IGUATEMI SP - ROOFTOP',
        subtitulo: `OBRA 4107 | REVISÃO: ${rev} | ${hojeBR} - CRONOGRAMA QUINZENAL ${fmtShort(ini)} A ${fmtShort(fimP)}/${fimP.slice(0,4)}${turno ? ' - TURNO ' + TURNOS[turno].toUpperCase() : ''}${et ? ' - ' + et.toUpperCase() : ''}`,
        logoUrl: 'logo-saeng-cinza.png',
        arquivo: `4107_ROOFTOP_IGSP_ATIVIDADES_CRONOGRAMA_REV${rev}_${ini}${turno ? '_' + turno.toUpperCase() : ''}.xlsx`,
      });
      closeModal(); toast(`Cronograma gerado com ${r.linhas} ${r.linhas === 1 ? 'atividade' : 'atividades'}.`);
      logExport('cronograma', {arquivo: `4107_ROOFTOP_IGSP_ATIVIDADES_CRONOGRAMA_REV${rev}_${ini}${turno ? '_' + turno.toUpperCase() : ''}.xlsx`, qtd: r.linhas, periodo: `${fmtShort(ini)} a ${fmtShort(fimP)}/${fimP.slice(0, 4)} · rev. ${rev} · ${turno ? 'turno ' + TURNOS[turno].toLowerCase() : 'turnos diurno e noturno'}${$('cf-conc').checked ? '' : ' · sem concluídas'}`, filtros: et ? `etiqueta ${et}` : ''});
    } catch (err) { console.warn(err); btn.disabled = false; btn.textContent = 'Gerar Excel'; toast(navigator.onLine ? 'Não foi possível gerar o cronograma. Tente de novo.' : 'Para gerar o Excel pela primeira vez é preciso internet.'); }
  };
  showModal();
}

/* ================= exportar para o Claude (arquivo de contexto em Markdown) ================= */
// Gera um texto com TODAS as informações de cada atividade (dados + histórico completo), lembretes e cadastros,
// pronto para colar ou anexar no Claude e fazer perguntas. Não usa API: é só um arquivo.
function openExportIA(){
  if (!isAdmin()) return toast('Somente administradores podem exportar para o Claude.');
  $('sheet').innerHTML = `<h2>Exportar para o Claude</h2>
    <p class="ro" style="margin:-6px 0 14px">Gera um arquivo com todas as informações de cada atividade (dados, observações e histórico completo), além dos lembretes e cadastros. Anexe no Claude (ou cole o texto) e peça análises, resumos ou cobranças.</p>
    <form id="iaf" novalidate>
      <div class="f"><label>Período</label><div class="seg" id="ia-per">${[['30','Últimos 30 dias'],['90','Últimos 90 dias'],['all','Tudo']].map(([k,l]) => `<button type="button" data-p="${k}" aria-pressed="${k === '90'}">${l}</button>`).join('')}</div>
        <span class="ro" style="display:block;margin-top:6px">Entram as atividades em aberto (de qualquer data) e as que terminaram no período.</span></div>
      <div class="f"><label class="chk"><input type="checkbox" id="ia-conc" checked> Incluir concluídas e canceladas do período</label></div>
      <div class="f"><label class="chk"><input type="checkbox" id="ia-filt"${filtrosTxt() ? '' : ' disabled'}> Usar os filtros da lista${filtrosTxt() ? ` <span class="ro">(${esc(filtrosTxt())})</span>` : ' <span class="ro">(nenhum filtro ativo)</span>'}</label></div>
      <div class="cf-prev" id="ia-prev">Clique em gerar para montar o arquivo.</div>
      <div class="acts"><button type="button" class="btn ghost" id="ia-copy">Copiar texto</button><button class="btn pri" type="submit">Baixar arquivo</button></div>
    </form>`;
  let per = '90';
  $('ia-per').onclick = e => { const b = e.target.closest('button[data-p]'); if (!b) return; per = b.dataset.p; for (const x of $('ia-per').children) x.setAttribute('aria-pressed', String(x === b)); };
  const gerar = async () => {
    $('ia-prev').textContent = 'Buscando atividades e histórico no banco…';
    const r = await montarExportIA({per, conc:$('ia-conc').checked, filt:$('ia-filt').checked});
    $('ia-prev').textContent = r.n ? `${r.n} ${r.n === 1 ? 'atividade' : 'atividades'}, ${r.nEv} registros de histórico · ${Math.round(r.txt.length / 1000)} mil caracteres.` : 'Nenhuma atividade nesse período.';
    return r;
  };
  $('ia-copy').onclick = async () => {
    try { const r = await gerar(); if (!r.n) return; await navigator.clipboard.writeText(r.txt); closeModal(); toast('Texto copiado. Cole no Claude e faça sua pergunta.'); logExport('claude', {qtd:r.n, periodo:r.periodo + ' · copiado', filtros:r.filtros}); }
    catch (err) { console.warn(err); toast('Não foi possível copiar. Use “Baixar arquivo”.'); }
  };
  $('iaf').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await gerar(); if (!r.n) return;
      const url = URL.createObjectURL(new Blob([r.txt], {type:'text/markdown;charset=utf-8'}));
      const el = document.createElement('a'); el.href = url; el.download = r.arquivo; document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      closeModal(); toast('Arquivo gerado. Anexe no Claude e faça sua pergunta.');
      logExport('claude', {arquivo:r.arquivo, qtd:r.n, periodo:r.periodo, filtros:r.filtros});
    } catch (err) { console.warn(err); $('ia-prev').textContent = navigator.onLine ? 'Não foi possível gerar. Tente de novo.' : 'Sem internet: é preciso estar online para buscar o histórico.'; }
  };
  showModal();
}
async function montarExportIA({per, conc, filt}){
  const hoje = defaultNight(), desde = per === 'all' ? '' : addDays(hoje, -Number(per));
  // busca tudo no banco (a tela só mantém em memória as últimas semanas)
  const m = new Map(all());
  try { const s = await getDocs(query(collection(db, 'atividades'), limit(5000))); s.forEach(d => m.set(d.id, {id:d.id, ...d.data(SNAP)})); } catch (e) { console.warn(e); }
  let acts = [...m.values()].filter(a => (a.aberta && STATUS[a.status]?.aberta) || (conc && (!desde || fimOf(a) >= desde || concDay(a) >= desde)));
  if (filt) acts = acts.filter(a => matches(a) && (!S.f.turno || turnoOf(a) === S.f.turno));
  const hist = {}; let nEv = 0;
  try { const s = await getDocs(query(collection(db, 'historico'), limit(20000))); s.forEach(d => { const v = d.data(SNAP); if (v.atividadeId){ (hist[v.atividadeId] ||= []).push(v); } }); } catch (e) { console.warn(e); }
  const L = [], ln = x => L.push(x), dt = s => s ? `${fmtShort(s)}/${String(s).slice(0, 4)}` : '—';
  const now = new Date(), emit = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const periodo = per === 'all' ? 'todo o histórico' : `últimos ${per} dias`, filtros = filt ? filtrosTxt() : '';
  const situ = a => a.status === 'concluida' ? `concluída${concDay(a) ? ' em ' + dt(concDay(a)) : ''}` : a.status === 'cancelada' ? 'cancelada'
    : fimOf(a) < hoje ? `VENCIDA há ${nightsBetween(fimOf(a), hoje)} ${nightsBetween(fimOf(a), hoje) === 1 ? 'dia' : 'dias'}` : a.noite > hoje ? `a iniciar (começa em ${nightsBetween(hoje, a.noite)} ${nightsBetween(hoje, a.noite) === 1 ? 'dia' : 'dias'})` : 'em curso';
  const evTxt = ev => { let t = evText(ev).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (ev.mudancas?.length) t += ' [' + ev.mudancas.map(x => `${FIELDS[x.campo] || (x.campo === 'status' ? 'Status' : x.campo)}: ${fmtVal(x.campo, x.de) || '—'} → ${fmtVal(x.campo, x.para) || '—'}`).join('; ') + ']';
    if (ev.motivo) t += ` · motivo: ${ev.motivo}`; if (ev.obs) t += ` · obs.: ${ev.obs}`; return t; };
  // identificação curta e estável na ordem do arquivo
  const grupos = new Map();
  for (const a of acts){ const g = groupKey(a); if (!grupos.has(g.k)) grupos.set(g.k, {...g, items:[]}); grupos.get(g.k).items.push(a); }
  const G = [...grupos.values()].sort((x, y) => groupRank(x.k) - groupRank(y.k) || String(x.sub).localeCompare(String(y.sub), 'pt') || x.label.localeCompare(y.label, 'pt'));
  for (const g of G) g.items.sort((x, y) => x.noite.localeCompare(y.noite) || fimOf(x).localeCompare(fimOf(y)));
  const cnt = {}; for (const a of acts) cnt[a.status] = (cnt[a.status] || 0) + 1;
  const venc = acts.filter(a => a.aberta && STATUS[a.status]?.aberta && fimOf(a) < hoje).length, fut = acts.filter(a => a.aberta && a.noite > hoje).length;
  ln('# Programação de Atividades — Obra 4107 · Rooftop Iguatemi SP (SAENG)');
  ln(''); ln(`Exportado em ${emit} por ${S.perfil?.nome || 'usuário'}. Data de referência (hoje): ${dt(hoje)}.`);
  ln(`Escopo: atividades em aberto de qualquer data${conc ? ` + concluídas/canceladas (${periodo})` : ''}${filtros ? ` · filtros: ${filtros}` : ''}.`);
  ln(''); ln('## Instruções para o assistente');
  ln('- Responda somente com base nas informações deste arquivo. Se algo não estiver aqui, diga que não consta.');
  ln('- Ao citar uma atividade, use o código entre colchetes (ex.: [A012]) e o título.');
  ln('- "Vencida" = em aberto com término anterior à data de referência. Turno noturno começa na noite da data de início.');
  ln('- Os status possíveis são: Programada, Em andamento, Parcial, Não iniciada, Impedida, Concluída, Cancelada.');
  ln(''); ln('## Resumo');
  ln(`- Total de atividades no arquivo: ${acts.length}`);
  ln(`- Por status: ${ORDER.filter(k => cnt[k]).map(k => `${STATUS[k].label} ${cnt[k]}`).join(' · ') || '—'}`);
  ln(`- Em aberto vencidas: ${venc} · a iniciar: ${fut}`);
  ln(`- Por local: ${G.map(g => `${g.k.startsWith('z:') ? (g.sub || 'Shopping') : g.label} (${g.items.length})`).join(' · ')}`);
  let i = 0; ln(''); ln('## Atividades (agrupadas por setor, pilar ou local do shopping)');
  for (const g of G){
    const nomeG = g.k.startsWith('z:') ? `${g.sub || 'Shopping'} — Shopping` : `${g.label}${g.sub ? ' — ' + g.sub : ''}`;
    ln(''); ln(`### ${nomeG}`);
    for (const a of g.items){
      i++; const id = 'A' + String(i).padStart(3, '0'), et = tagsOf(a), hs = (hist[a.id] || []).sort((x, y) => toDate(x.t) - toDate(y.t)); nEv += hs.length;
      ln(''); ln(`#### [${id}] ${a.titulo || '(sem título)'}`);
      ln(`- Local: ${localLine(a) || '—'}${a.tipoLocal ? ` (${TIPO_LABEL[a.tipoLocal] || a.tipoLocal})` : ''}`);
      ln(`- Período: ${dt(a.noite)} → ${dt(fimOf(a))} (${durOf(a) + 1} ${durOf(a) ? 'dias' : 'dia'}) · turno ${TURNOS[turnoOf(a)].toLowerCase()}`);
      ln(`- Status: ${STATUS[a.status]?.label || a.status} · avanço ${avOf(a)}% · situação: ${situ(a)}`);
      ln(`- Prioridade: ${PRIOR[a.prioridade] || 'Normal'}`);
      ln(`- Fornecedor: ${a.fornecedor || 'não informado'} · Responsável no turno: ${a.responsavel || 'não informado'} · Efetivo previsto: ${a.efetivo || 'não informado'}`);
      if (et.length) ln(`- Etiquetas (serviço macro): ${et.join(', ')}`);
      if (a.detalhes) ln(`- Detalhes: ${String(a.detalhes).replace(/\s*\n\s*/g, ' / ')}`);
      if (a.motivo) ln(`- Motivo atual: ${a.motivo}${a.pct ? ` · ${a.pct}% executado` : ''}`);
      if (a.ultimaObs) ln(`- Última observação: ${String(a.ultimaObs).replace(/\s*\n\s*/g, ' / ')}`);
      ln(`- Inserida por ${nameOf(a.criadoPor)}${a.criadoEm ? ' em ' + fmtTs(a.criadoEm) : ''}${a.atualizadoPor ? ` · última alteração por ${nameOf(a.atualizadoPor)}${a.atualizadoEm ? ' em ' + fmtTs(a.atualizadoEm) : ''}` : ''}`);
      if (hs.length){ ln('- Histórico:'); for (const ev of hs) ln(`  - ${fmtTs(ev.t)} — ${nameOf(ev.u)}: ${evTxt(ev)}`); }
    }
  }
  const pend = [...S.pend.values()].filter(p => !p.feita || !desde || String(p.prazo || '') >= desde || ymd(toDate(p.feitaEm || p.atualizadoEm)) >= desde);
  if (pend.length){
    ln(''); ln('## Lembretes (providências da coordenação — não são atividades de campo)');
    for (const p of pend.sort((x, y) => (x.feita - y.feita) || String(x.prazo || '9').localeCompare(String(y.prazo || '9'))))
      ln(`- [${p.feita ? 'feito' : 'aberto'}] ${p.texto}${p.responsavel ? ` · responsável: ${p.responsavel}` : ''}${p.prazo ? ` · prazo: ${dt(p.prazo)}${!p.feita && p.prazo < hoje ? ' (ATRASADO)' : ''}` : ''}${p.local ? ` · local: ${p.local}` : ''}${p.obs ? ` · obs.: ${String(p.obs).replace(/\s*\n\s*/g, ' / ')}` : ''} · criado por ${nameOf(p.criadoPor)}`);
  }
  ln(''); ln('## Cadastros da obra');
  if (S.cad.setores.length) ln(`- Setores: ${S.cad.setores.map(x => `${x.codigo}${x.descricao ? ' (' + x.descricao + ')' : ''}`).join(' · ')}`);
  if (S.cad.pilares.length) ln(`- Pilares: ${S.cad.pilares.map(x => [x.codigo, x.referencia, x.setor ? 'setor ' + x.setor : ''].filter(Boolean).join(' – ')).join(' · ')}`);
  if (S.cad.locais.length) ln(`- Locais do shopping: ${S.cad.locais.map(x => locNome(x) + (locSetor(x) ? ` (setor ${locSetor(x)})` : '')).join(' · ')}`);
  if (S.cad.fornecedores.length) ln(`- Fornecedores: ${S.cad.fornecedores.map(x => typeof x === 'string' ? x : (x.nome ? x.nome + (x.disciplina ? ` (${x.disciplina})` : '') : '')).filter(Boolean).join(' · ')}`);
  return {txt: L.join('\n') + '\n', n: acts.length, nEv, periodo, filtros, arquivo: `4107_Atividades_para_Claude_${hoje}.md`};
}

/* ================= relatório PDF ================= */
let gerandoPdf = false;
// texto dos filtros ativos (aparece no relatório)
function filtrosTxt(){
  const f = S.f, p = [], L = (arr, fn) => arr.map(fn).join(', ');
  if (f.autor.length) p.push(`inseridas por ${L(f.autor, nameOf)}`);
  if (f.status.length) p.push(`status ${L(f.status, k => STATUS[k].label.toLowerCase())}`);
  if (f.tipo.length) p.push(L(f.tipo, t => ({setor:'setores', pilar:'pilares', shopping:'shopping'})[t]));
  if (f.loc.length) p.push(L(f.loc, v => v[0] === 's' ? 'setor ' + v.slice(2) : v[0] === 'p' ? 'pilar ' + v.slice(2) : v.slice(2)));
  if (f.forn.length) p.push(`fornecedor ${L(f.forn, x => x === '__none__' ? 'não informado' : x)}`);
  if (f.etq.length) p.push(`etiqueta ${L(f.etq, x => x)}`);
  if (f.q) p.push(`busca "${f.q}"`);
  return p.join(' · ');
}
async function exportPdf(){
  if (gerandoPdf) return;
  const ft = S.f.turno;
  const acts = [...all().values()].filter(a => a.aberta && STATUS[a.status]?.aberta && (!ft || turnoOf(a) === ft) && matches(a));
  if (!acts.length){ toast(filtrosTxt() ? 'Nenhuma atividade em aberto com esses filtros.' : 'Não há atividades em aberto para o relatório.'); return; }
  gerandoPdf = true; toast('Gerando o relatório…');
  try {
    const { gerarRelatorioPDF } = await import('./relatorio.js?v=37');
    const now = new Date(), hoje = defaultNight();
    await gerarRelatorioPDF({
      acts, hoje, hojeLabel: fmtShort(hoje) + '/' + hoje.slice(0,4),
      setores: S.cad.setores, localLine, fmtShort, diasEntre: nightsBetween, fimOf, avOf,
      grupoDe: a => { const g = groupKey(a); return {...g, rank: groupRank(g.k), sub: a.tipoLocal === 'shopping' ? g.sub : g.sub}; },
      turnoLabelDe: a => TURNOS[turnoOf(a)],
      turnoLabel: ft ? `Turno ${TURNOS[ft].toLowerCase()}` : 'Turnos diurno e noturno',
      filtros: filtrosTxt(), nomeDe: id => id ? nameOf(id) : '-', fmtTs,
      emitidoEm: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} às ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      emitidoPor: S.perfil?.nome || 'Usuário',
      logoUrl: 'logo-saeng.png',
      arquivo: `Relatorio_Atividades_em_Aberto_${hoje}${ft ? '_' + ft : ''}.pdf`,
    });
    toast('Relatório gerado.');
    logExport('relatorio', {arquivo: `Relatorio_Atividades_em_Aberto_${hoje}${ft ? '_' + ft : ''}.pdf`, qtd: acts.length, periodo: `em aberto em ${fmtShort(hoje)}/${hoje.slice(0, 4)} · ${ft ? 'turno ' + TURNOS[ft].toLowerCase() : 'turnos diurno e noturno'}`, filtros: filtrosTxt()});
  } catch (e) { console.warn(e); toast(navigator.onLine ? 'Não foi possível gerar o relatório. Tente de novo.' : 'Para gerar o PDF pela primeira vez é preciso internet.'); }
  finally { gerandoPdf = false; }
}

/* ================= eventos ================= */
document.addEventListener('click', e => {
  const t = e.target;
  { const x = t.closest('[data-pdv]'); if (x){ S.pdView = x.dataset.pdv; return renderAll(); } }
  { const x = t.closest('[data-pd-chk]'); if (x) return pdToggle(x.dataset.pdChk); }
  { const x = t.closest('[data-pd-conv]'); if (x) return pdConvert(x.dataset.pdConv); }
  { const x = t.closest('[data-pd-act]'); if (x) return openDrawer(x.dataset.pdAct); }
  { const x = t.closest('[data-pd-open]'); if (x) return openPendForm(x.dataset.pdOpen); }
  if (!t.closest('.tab-more, .bn-more')) closeMore();
  if (!t.closest('.menu')){ $('who-pop').hidden = true; $('tools-pop').hidden = true; $('b-tools').setAttribute('aria-expanded','false'); for (const id of ['dw-more-pop','etq-more-pop']){ const mp = $(id); if (mp) mp.hidden = true; } if (S.uMenu){ S.uMenu = null; renderCadList(); } }
  if (!t.closest('.ms')) msClose();
  { const lo = t.closest('[data-loc]'); if (lo) return openLocal(lo.dataset.loc); }
  if (t.closest('[data-loc-back]')) return closeLocal();
  { const x = t.closest('[data-loc-view]'); if (x){ S.locView = x.dataset.locView; if (S.locView === 'cal') S.lgt.jump = true; return renderLocal(); } }
  { const x = t.closest('[data-lgt-nav]'); if (x){ gtShift(Number(x.dataset.lgtNav), S.lgt); return; } }
  if (t.closest('[data-lgt-hoje]')){ S.lgt.ref = defaultNight(); S.lgt.jump = true; return renderLocal(); }
  { const x = t.closest('[data-lgt-z]'); if (x){ S.lgt.zoom = x.dataset.lgtZ; S.lgt.jump = true; return renderLocal(); } }
  { const x = t.closest('[data-lgt-g]'); if (x){ S.lgt.grp = x.dataset.lgtG; return renderLocal(); } }
  { const x = t.closest('[data-lgt-t]'); if (x){ S.lgt.turno = x.dataset.lgtT; return renderLocal(); } }
  if (t.closest('[data-lgt-pdf]')) return exportLocalCalPdf();
  if (t.closest('[data-loc-pdf]')) return openLocalPdf();
  if (t.closest('[data-loc-zip]')) return baixarZipLocal();
  if (t.closest('[data-loc-enc]')){ S.locEnc = !S.locEnc; return renderLocal(); }
  if (t.closest('[data-loc-new]')){ const k = S.loc.k, pre = k[0] === 's' ? {tipoLocal:'setor', setor:k.slice(2)} : k[0] === 'p' ? {tipoLocal:'pilar', pilar:k.slice(2)} : {tipoLocal:'shopping', local:k.slice(2)}; return openForm(null, {...pre, noite:defaultNight()}); }
  const gh = t.closest('[data-grp]'); if (gh) return toggleGrp(gh.dataset.grp);
  const etqEl = t.closest('[data-etq]'); if (etqEl) return openTag(etqEl.dataset.etq);
  if (t.closest('[data-etq-back]')){ S.etq = null; window.scrollTo({top:0}); return renderAll(); }
  if (t.closest('#etq-more-b')){ const mp = $('etq-more-pop'); mp.hidden = !mp.hidden; return; }
  const ea = t.closest('[data-etq-act]'); if (ea){ $('etq-more-pop').hidden = true; return openRetag(ea.dataset.etqAct); }
  if (t.closest('#etq-crono')) return openCronograma({etq:S.etq});
  if (t.closest('#etq-new')) return openForm(null, {etiquetas:[S.etq], noite:defaultNight()});
  if (t.closest('#etq-enc-tg')){ S.etqEnc = !S.etqEnc; return renderAll(); }
  { const x = t.closest('[data-fx]'); if (x) return lbAbrir(Number(x.dataset.fx)); }
  { const x = t.closest('[data-fx-rm]'); if (x && S.fxUp){ const it = S.fxUp.items.splice(Number(x.dataset.fxRm), 1)[0]; if (it) URL.revokeObjectURL(it.prev); if (!S.fxUp.items.length) fxLimpar(); else renderFotos(); return; } }
  if (t.closest('[data-fx-cancel]')) return fxLimpar();
  if (t.closest('[data-fx-send]')) return fxEnviar();
  if (t.closest('[data-fx-zip]')) return baixarZipFotos();
  if (t.closest('#dw-pdf')) return exportAtividadePdf();
  { const dd = t.closest('.gt-d[data-dia]:not([data-sem-dia])'); if (dd){ setNight(dd.dataset.dia); return setTab('noite'); } }
  { const mb = t.closest('[data-more]'); if (mb){ const pop = $(mb.dataset.more), abrir = pop.hidden; closeMore(); pop.hidden = !abrir; mb.setAttribute('aria-expanded', String(abrir)); return; } }
  { const go = t.closest('[data-go]'); if (go){ closeMore(); return setTab(go.dataset.go); } }
  const tab = t.closest('.tab[data-tab]'); if (tab) return setTab(tab.dataset.tab);
  const cardEl = t.closest('.card[data-id], .act[data-id], .gt-r[data-id]'); if (cardEl) return openDrawer(cardEl.dataset.id);
  const chip = t.closest('.chip[data-st]'); if (chip){ const k = chip.dataset.st; S.f.status = S.f.status.includes(k) ? S.f.status.filter(x => x !== k) : [...S.f.status, k]; return renderAll(); }
  const tch = t.closest('.chip[data-tipo]'); if (tch){ const k = tch.dataset.tipo; S.f.tipo = S.f.tipo.includes(k) ? S.f.tipo.filter(x => x !== k) : [...S.f.tipo, k]; fillFilterOptions(); return renderAll(); }
  const msb = t.closest('.ms-btn'); if (msb){ const id = msb.closest('.ms').id, p = $(id).querySelector('.ms-pop'); msClose(id); p.hidden = !p.hidden; msb.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden){ $(id).querySelector('.ms-q').value = ''; msRender(id); } return; }
  const msc = t.closest('.ms-clear'); if (msc){ const id = msc.closest('.ms').id; S.f[MS[id].key] = []; msRender(id); msLabel(id); return renderAll(); }
  if (t.closest('.ms-ok')){ msClose(); return; }
  const m = t.closest('[data-mode]'); if (m && $('drawer').contains(m)) return setMode(m.dataset.mode || null);
  const cadRow = t.closest('[data-cad]'); if (cadRow){ S.cadSub = cadRow.dataset.cad; S.cadDel = null; window.scrollTo({top:0}); return renderAll(); }
  if (t.closest('[data-cad-back]')){ S.cadSub = null; S.cadDel = null; window.scrollTo({top:0}); return renderAll(); }
  const ask = t.closest('[data-del-ask]'); if (ask){ S.cadDel = ask.dataset.delAsk; return renderCadList(); }
  if (t.closest('[data-del-cancel]')){ S.cadDel = null; return renderCadList(); }
  const del = t.closest('[data-del]'); if (del){ const [key, i] = del.dataset.del.split(':'); S.cadDel = null; return saveCad({...S.cad, [key]:S.cad[key].filter((_,j) => j !== Number(i))}).then(ok => ok && toast('Item removido.')); }
  const um = t.closest('[data-umenu]'); if (um){ S.uMenu = S.uMenu === um.dataset.umenu ? null : um.dataset.umenu; return renderCadList(); }
  const pp = t.closest('[data-papel]'); if (pp){ S.uMenu = null; renderCadList(); const [uid, papel] = pp.dataset.papel.split(':'); updateDoc(doc(db, 'usuarios', uid), {papel}).then(() => toast('Acesso atualizado.'), handleWriteError); return; }
  if (t.id === 'b-seed') return saveCad(SEED);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const key = f.dataset.add, d = CAD_DEF.find(x => x.key === key);
  const vals = Object.fromEntries(d.cols.map(([c]) => [c, f.elements[c].value.trim()]));
  if (!vals[d.k]) return toast('Preencha o primeiro campo.');
  const simple = key === 'niveis', item = simple ? vals[d.k] : vals;
  const same = key === 'pilares'
    ? x => (pilarCode(x.codigo) || lc(x.codigo)) === (pilarCode(vals.codigo) || lc(vals.codigo)) && lc(x.referencia) === lc(vals.referencia)
    : key === 'locais' ? x => lc(locNome(x)) === lc(vals.nome)
    : x => String(simple ? x : x[d.k]).toLowerCase() === vals[d.k].toLowerCase();
  if ((S.cad[key]||[]).some(same)) return toast(key === 'pilares' ? 'Esse pilar com essa loja já está na lista.' : 'Esse item já está na lista.');
  if (key === 'pilares' && pilarCode(vals.codigo)) vals.codigo = pilarCode(vals.codigo);
  const next = {...S.cad, [key]:[...(S.cad[key]||[]), item]};
  if (key === 'fornecedores') next[key].sort((a,b) => a.nome.localeCompare(b.nome,'pt'));
  if (key === 'pilares') next[key].sort((a,b) => (parseInt(String(a.codigo).replace(/\D/g,'')) || 0) - (parseInt(String(b.codigo).replace(/\D/g,'')) || 0) || String(a.referencia||'').localeCompare(String(b.referencia||''),'pt'));
  saveCad(next).then(ok => { if (!ok) return; f.reset(); f.elements[0].focus(); toast('Cadastrado.'); });
});
$('n-prev').onclick = () => setNight(addDays(S.noite,-1));
$('n-next').onclick = () => setNight(addDays(S.noite,1));
$('n-today').onclick = () => { S.dia = null; window.scrollTo({top:0}); renderAll(); };
$('n-date').onchange = e => setNight(e.target.value);
$('n-date').addEventListener('click', e => { try { e.target.showPicker(); } catch {} });
$('f-q').oninput = e => { S.f.q = e.target.value.trim(); renderAll(); };
try { const t = localStorage.getItem('pn-turno'); if (t === 'diurno' || t === 'noturno') S.f.turno = t; } catch {}
$('f-turno').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.f.turno = b.dataset.t || ''; try { localStorage.setItem('pn-turno', S.f.turno); } catch {} renderAll(); };
try { const v = JSON.parse(localStorage.getItem('pn-gt') || '{}'); if (['sem','qui','mes'].includes(v.zoom)) S.gt.zoom = v.zoom; if (['local','etq'].includes(v.grp)) S.gt.grp = v.grp; if (typeof v.conc === 'boolean') S.gt.conc = v.conc; } catch {}
$('gt-prev').onclick = () => gtShift(-1);
$('gt-pdf').onclick = exportGanttPdf;
$('gt-next').onclick = () => gtShift(1);
$('gt-hoje').onclick = () => { S.gt.ref = defaultNight(); S.gt.jump = true; renderAll(); };
$('gt-zoom').onclick = e => { const b = e.target.closest('button[data-z]'); if (!b) return; S.gt.zoom = b.dataset.z; S.gt.jump = true; gtSave(); renderAll(); };
$('gt-grp').onclick = e => { const b = e.target.closest('button[data-g]'); if (!b) return; S.gt.grp = b.dataset.g; gtSave(); renderAll(); };
$('gt-turno').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.f.turno = b.dataset.t || ''; try { localStorage.setItem('pn-turno', S.f.turno); } catch {} renderAll(); };
$('gt-conc').onchange = e => { S.gt.conc = e.target.checked; gtSave(); renderAll(); };
$('gt-filt').onclick = e => { if (e.target.closest('#gt-fclear')) $('f-clear').click(); };
$('gt-wrap').addEventListener('keydown', e => { const r = e.target.closest('.gt-r[data-id]'); if (r && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openDrawer(r.dataset.id); } });
{ let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.loc && S.locView === 'cal') renderLocal(); else if (S.tab === 'gantt') renderGantt(); }, 150); }); }
$('etq-q').oninput = () => renderAll();
document.addEventListener('change', e => {
  const cs = e.target.closest('[data-cad-setor]');
  if (cs){
    const [key, i] = cs.dataset.cadSetor.split(':'), arr = [...(S.cad[key] || [])], it = arr[Number(i)];
    arr[Number(i)] = typeof it === 'string' ? {nome:it, setor:cs.value} : {...it, setor:cs.value};
    saveCad({...S.cad, [key]:arr}).then(ok => ok && toast(cs.value ? `Ligado ao Setor ${cs.value}.` : 'Setor removido.'));
    return;
  }
  const cb = e.target.closest('.ms-list input[type=checkbox]'); if (!cb) return;
  const id = cb.closest('.ms').id, k = MS[id].key, v = cb.value;
  S.f[k] = cb.checked ? [...new Set([...S.f[k], v])] : S.f[k].filter(x => x !== v);
  msLabel(id); renderAll();
});
document.addEventListener('input', e => { const q = e.target.closest('.ms-q'); if (q) msRender(q.closest('.ms').id); });
['h-dias','h-user','h-tipo'].forEach(id => { $(id).onchange = renderAll; });
$('b-new').onclick = () => openForm(null);
$('b-tools').onclick = () => { const p = $('tools-pop'); p.hidden = !p.hidden; $('b-tools').setAttribute('aria-expanded', String(!p.hidden)); };
$('b-filtros').onclick = () => { const f = $('filters'); f.hidden = !f.hidden; $('b-filtros').setAttribute('aria-expanded', String(!f.hidden)); };
$('f-clear').onclick = () => { S.f.status = []; S.f.tipo = []; S.f.loc = []; S.f.forn = []; S.f.etq = []; S.f.autor = []; msClose(); fillFilterOptions(); renderAll(); };
$('exp-ia').onclick = () => { $('tools-pop').hidden = true; openExportIA(); };
$('exp-csv').onclick = () => { $('tools-pop').hidden = true; exportCsv(); };
$('exp-crono').onclick = () => { $('tools-pop').hidden = true; openCronograma(); };
$('exp-pdf').onclick = () => { $('tools-pop').hidden = true; exportPdf(); };
$('who').onclick = () => { const p = $('who-pop'); p.hidden = !p.hidden; $('who').setAttribute('aria-expanded', String(!p.hidden)); };
$('m-perfil').onclick = () => { $('who-pop').hidden = true; openPerfil(); };
$('m-sair').onclick = () => { $('who-pop').hidden = true; signOut(auth); };
$('dw-close').onclick = closeDrawer;
$('scrim').onclick = () => { if (!$('modal').hidden) closeModal(); else closeDrawer(); };
document.addEventListener('keydown', e => { if (e.target.closest && e.target.closest('[data-loc]')) return; const gh = e.target.closest && e.target.closest('[data-grp]'); if (gh && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggleGrp(gh.dataset.grp); } });
document.addEventListener('keydown', e => { const x = e.target.closest && e.target.closest('[data-pd-open]'); if (x && (e.key === 'Enter' || e.key === ' ') && e.target === x){ e.preventDefault(); openPendForm(x.dataset.pdOpen); } });
$('pd-new').onclick = () => openPendForm(null);
$('pd-q').oninput = () => renderPend();
document.addEventListener('change', e => { if (e.target.matches('[data-lgt-conc]')){ S.lgt.conc = e.target.checked; return renderLocal(); } if (e.target.matches('[data-fx-in]')){ fxEscolher(e.target.files); e.target.value = ''; } });
document.addEventListener('input', e => { if (e.target.id === 'fx-leg' && S.fxUp) S.fxUp.legenda = e.target.value; });
$('lb-x').onclick = lbFechar; $('lb-prev').onclick = () => lbAbrir(lbI - 1); $('lb-next').onclick = () => lbAbrir(lbI + 1); $('lb-del').onclick = fotoExcluir;
$('lb').addEventListener('click', e => { if (e.target.id === 'lb' || e.target.classList.contains('lb-fig')) lbFechar(); });
{ let x0 = null; $('lb').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
  $('lb').addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && (S.dwFotos || []).length > 1) lbAbrir(lbI + (dx < 0 ? 1 : -1)); }); }
document.addEventListener('keydown', e => { if ($('lb').hidden) return; if (e.key === 'ArrowRight') lbAbrir(lbI + 1); else if (e.key === 'ArrowLeft') lbAbrir(lbI - 1); else if (e.key === 'Escape'){ e.stopImmediatePropagation(); lbFechar(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!$('modal').hidden) closeModal(); else if (S.openId) closeDrawer(); } });
const net = () => { $('offline').hidden = navigator.onLine; };
window.addEventListener('online', net); window.addEventListener('offline', net); net();

/* ================= app no celular (instalação) ================= */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
let installEvt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installDismissed = () => { try { return localStorage.getItem('pn-install-x') === '1'; } catch { return false; } };
function showInstall(){
  if (isStandalone()) return;
  const can = !!installEvt, ios = isIOS();
  $('m-install').hidden = !(can || ios);
  if (installDismissed() || !(can || ios)) { $('install').hidden = true; return; }
  $('install-tx').innerHTML = can
    ? '<b>Instale na tela inicial</b><span>Abre como aplicativo, em tela cheia.</span>'
    : '<b>Adicione à tela de início</b><span>No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</span>';
  $('install-btn').hidden = !can;
  $('install').hidden = false;
}
async function doInstall(){
  if (installEvt){ installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; if (r?.outcome === 'accepted') $('install').hidden = true; showInstall(); return; }
  if (isIOS()) toast('No Safari: toque em Compartilhar e depois em “Adicionar à Tela de Início”.');
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; $('install').hidden = true; $('m-install').hidden = true; });
$('install-btn').onclick = doInstall;
$('m-install').onclick = () => { $('who-pop').hidden = true; doInstall(); };
$('install-x').onclick = () => { $('install').hidden = true; try { localStorage.setItem('pn-install-x', '1'); } catch {} };
showInstall();
