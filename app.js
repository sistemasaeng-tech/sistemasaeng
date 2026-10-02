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
  Timestamp, setDoc, updateDoc, getDocs,
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
const MOTIVOS = ['Equipe não compareceu','Efetivo insuficiente','Falta de material','Falta de equipamento','Frente não liberada','Liberação do shopping / cliente','PT / liberação de segurança não emitida','Interferência com outra equipe','Serviço antecessor não concluído','Chuva / condição climática','Outro'];
const PRIOR = {normal:'Normal', alta:'Alta', critica:'Crítica'};
const FUNCOES = ['Coordenador','Residente','Engenheiro','Encarregado','Mestre de obras','Técnico de segurança','Planejamento','Outro'];
const PAPEIS = {pendente:'Aguardando aprovação', visualizador:'Visualizador', usuario:'Usuário', admin:'Administrador', bloqueado:'Bloqueado'};
const FIELDS = {noite:'Data',turno:'Turno',tipoLocal:'Tipo de local',setor:'Setor',nivel:'Nível',eixo:'Eixo / complemento',pilar:'Pilar',local:'Local do shopping',titulo:'Atividade',detalhes:'Detalhes',fornecedor:'Fornecedor',responsavel:'Responsável no turno',efetivo:'Efetivo previsto',prioridade:'Prioridade'};
const TIPO_LABEL = {setor:'Setor', pilar:'Pilar', shopping:'Shopping'};
const TURNOS = {diurno:'Diurno', noturno:'Noturno'};
const turnoOf = a => a.turno === 'diurno' ? 'diurno' : 'noturno'; // atividades antigas, sem turno, contam como noturnas
const ICON_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const turnoTag = t => `<span class="turno ${t}">${t === 'diurno' ? ICON_SOL : ICON_LUA}${TURNOS[t]}</span>`;

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
  win:new Map(), open:new Map(), extra:new Map(), feed:[], dwHist:[],
  noite:defaultNight(), winFrom:addDays(defaultNight(), -35), tab:'noite',
  f:{q:'',tipo:'',setor:'',forn:'',status:'',turno:''}, cadSub:null, cadDel:null, openId:null, dwMode:null,
};
const isAdmin = () => S.perfil?.papel === 'admin';
const canWrite = () => ['usuario','admin'].includes(S.perfil?.papel);
const canRead = () => ['visualizador','usuario','admin'].includes(S.perfil?.papel);
function all(){ const m = new Map(S.extra); for (const [k,v] of S.win) m.set(k,v); for (const [k,v] of S.open) m.set(k,v); return m; }
const nameOf = u => !u ? 'Sem identificação' : (S.usuarios[u]?.nome || (u === S.uid && S.perfil?.nome) || 'Usuário');
const roleOf = u => S.usuarios[u]?.funcao || '';

function localLine(a){
  const parts = [];
  if (a.tipoLocal === 'setor') parts.push(`Setor ${a.setor||'?'}`);
  else if (a.tipoLocal === 'pilar'){ const p = S.cad.pilares.find(x => x.codigo === a.pilar); parts.push(`Pilar ${a.pilar||'?'}${p?.eixo ? ' ('+p.eixo+')' : ''}`); if (p?.referencia) parts.push(p.referencia); }
  else parts.push(a.local || 'Shopping');
  if (a.nivel) parts.push(`Nív. ${a.nivel}`);
  if (a.eixo) parts.push(a.tipoLocal === 'shopping' ? a.eixo : `Eixo ${a.eixo}`);
  return parts.join(' · ');
}
function groupKey(a){
  if (a.tipoLocal === 'setor') return {k:'s:'+(a.setor||'?'), label:`Setor ${a.setor||'?'}`, sub:(S.cad.setores.find(x => x.codigo === a.setor)||{}).descricao||''};
  if (a.tipoLocal === 'pilar') return {k:'p', label:'Pilares', sub:'Intervenções em pilares'};
  return {k:'z:'+(a.local||''), label:'Shopping', sub:a.local||''};
}
function groupRank(k){
  if (k.startsWith('s:')){ const i = S.cad.setores.findIndex(x => 's:'+x.codigo === k); return i < 0 ? 500 : i; }
  return k === 'p' ? 1000 : 2000;
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
  try { const t = localStorage.getItem('pn-tab'); if (t) S.tab = t; } catch {}
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
  S.unsubs.push(onSnapshot(query(collection(db, 'atividades'), where('aberta', '==', true), limit(1000)), s => {
    S.open = snapToMap(s); fillFilterOptions(); renderAll();
  }, fail('abertas')));
  const since = Timestamp.fromDate(new Date(Date.now() - 31*86400000));
  S.unsubs.push(onSnapshot(query(collection(db, 'historico'), where('t', '>=', since), orderBy('t', 'desc'), limit(2000)), s => {
    S.feed = s.docs.map(d => ({id:d.id, ...d.data(SNAP)})); if (S.tab === 'hist') renderAll();
  }, fail('historico')));
}
function stopApp(){
  for (const u of S.unsubs) u(); S.unsubs = [];
  if (S.unsubWin){ S.unsubWin(); S.unsubWin = null; }
  closeDrawer(); closeModal();
  S.started = false; S.win = new Map(); S.open = new Map(); S.extra = new Map(); S.feed = []; S.usuarios = {};
}
function snapToMap(s){ const m = new Map(); s.forEach(d => m.set(d.id, {id:d.id, ...d.data(SNAP)})); return m; }
function subscribeWindow(){
  if (S.unsubWin) S.unsubWin();
  S.unsubWin = onSnapshot(query(collection(db, 'atividades'), where('noite', '>=', S.winFrom), limit(2000)), s => {
    S.win = snapToMap(s); fillFilterOptions(); renderAll();
  }, err => console.warn('janela', err));
}

/* ================= filtros e listas ================= */
function matches(a){
  const f = S.f;
  if (f.tipo && a.tipoLocal !== f.tipo) return false;
  if (f.setor && !(a.tipoLocal === 'setor' && a.setor === f.setor)) return false;
  if (f.forn && a.fornecedor !== f.forn) return false;
  if (f.status && a.status !== f.status) return false;
  if (f.q){ const hay = [a.titulo,a.detalhes,a.fornecedor,a.responsavel,localLine(a),a.ultimaObs,a.motivo].join(' ').toLowerCase(); if (!hay.includes(f.q.toLowerCase())) return false; }
  return true;
}
const prRank = p => p === 'critica' ? 0 : p === 'alta' ? 1 : 2;
const sortActs = list => list.sort((x,y) => prRank(x.prioridade)-prRank(y.prioridade) || ORDER.indexOf(x.status)-ORDER.indexOf(y.status) || toDate(x.criadoEm)-toDate(y.criadoEm));

function renderNight(){
  const today = S.noite === defaultNight(), ft = S.f.turno;
  $('night-title').textContent = today ? 'Hoje' : fmtDay(S.noite);
  $('night-sub').textContent = ft === 'noturno' ? fmtNightLong(S.noite) + ' · turno noturno' : ft === 'diurno' ? fmtDay(S.noite) + ' · turno diurno' : (today ? fmtDay(S.noite) + ' · ' : '') + 'turnos diurno e noturno';
  $('night-eyebrow').textContent = ft ? `Turno ${TURNOS[ft].toLowerCase()}` : 'Todos os turnos';
  { const d = parseYmd(S.noite); $('night-label').textContent = `${DOW[d.getDay()].slice(0,3)} ${fmtShort(S.noite)}`; }
  $('n-date').value = S.noite;
  for (const b of document.querySelectorAll('#f-turno button')) b.setAttribute('aria-pressed', String((b.dataset.t || '') === ft));
  const acts = [...all().values()].filter(a => !ft || turnoOf(a) === ft);
  const tonight = acts.filter(a => a.noite === S.noite);
  const pend = acts.filter(a => a.aberta && a.noite < S.noite);
  const cnt = {}; ORDER.forEach(k => cnt[k] = 0); tonight.forEach(a => { cnt[a.status] = (cnt[a.status]||0)+1; });
  const total = tonight.length;
  const bar = total ? ORDER.filter(k => cnt[k]).map(k => `<i style="width:${(cnt[k]/total*100).toFixed(2)}%;background:${cvar(k)}" title="${esc(STATUS[k].label)}: ${cnt[k]}"></i>`).join('') : '';
  $('summary').innerHTML = `<div class="big">${cnt.concluida}<small>de ${total} concluídas</small></div>
    <div class="bar" role="img" aria-label="Distribuição por status">${bar}</div>
    <div class="chips">${ORDER.map(k => `<button type="button" class="chip" data-st="${k}" aria-pressed="${S.f.status===k}"><span class="dot" style="--c:${cvar(k)}"></span>${esc(STATUS[k].label)} <b>${cnt[k]}</b></button>`).join('')}
    ${pend.length ? `<button type="button" class="chip" data-jump="pend"><span class="dot" style="--c:var(--st-nao)"></span>Pendentes anteriores <b>${pend.length}</b></button>` : ''}</div>`;
  const t = sortActs(tonight.filter(matches)), p = pend.filter(matches).sort((x,y) => String(x.noite).localeCompare(String(y.noite)));
  $('c-tonight').textContent = t.length === tonight.length ? `${t.length}` : `${t.length} de ${tonight.length}`;
  $('c-pend').textContent = p.length === pend.length ? `${p.length}` : `${p.length} de ${pend.length}`;
  $('h-tonight').textContent = today ? 'Programadas para hoje' : `Programadas para ${fmtShort(S.noite)}`;
  let html;
  if (!tonight.length) html = `<div class="empty"><b>Nenhuma atividade ${ft ? 'no turno ' + TURNOS[ft].toLowerCase() : ''} ${today ? 'hoje' : 'neste dia'}</b>${canWrite() ? 'Use “Nova atividade” para programar o que a equipe vai executar.' : 'Quando coordenadores e residentes programarem atividades, elas aparecem aqui.'}</div>`;
  else if (!t.length) html = '<div class="empty">Nenhuma atividade com esses filtros.</div>';
  else if (ft) html = grouped(t, false);
  else html = ['diurno','noturno'].map(tr => { const l = t.filter(a => turnoOf(a) === tr); return l.length ? `<div class="turno-sec"><div class="turno-h">${turnoTag(tr)}<span class="th-d">${tr === 'diurno' ? fmtDay(S.noite) : fmtNightLong(S.noite)}</span><b>${l.length}</b></div>${grouped(l, false)}</div>` : ''; }).join('');
  $('l-tonight').innerHTML = html;
  $('l-pend').innerHTML = !pend.length ? '<div class="empty">Nada pendente de dias anteriores.</div>'
    : !p.length ? '<div class="empty">Nenhuma pendência com esses filtros.</div>' : grouped(p, true);
  $('b-export').hidden = tonight.length + pend.length === 0;
  $('b-new').hidden = !canWrite();
}
function grouped(list, isPend){
  const groups = new Map();
  for (const a of list){ const g = groupKey(a); if (!groups.has(g.k)) groups.set(g.k, {...g, items:[]}); groups.get(g.k).items.push(a); }
  return [...groups.values()].sort((a,b) => groupRank(a.k)-groupRank(b.k) || a.sub.localeCompare(b.sub))
    .map(g => `<div class="grp"><div class="grp-h"><b>${esc(g.label)}</b>${g.sub ? `<span>${esc(g.sub)}</span>` : ''}</div><div class="cards">${g.items.map(a => card(a, isPend)).join('')}</div></div>`).join('');
}
function card(a, isPend){
  const st = STATUS[a.status] || STATUS.programada, n = isPend ? nightsBetween(a.noite, S.noite) : 0, tags = [turnoTag(turnoOf(a))];
  if (a.prioridade && a.prioridade !== 'normal') tags.push(`<span class="tag ${a.prioridade}">${esc(PRIOR[a.prioridade])}</span>`);
  if (isPend) tags.push(`<span class="tag since">desde ${fmtShort(a.noite)} · ${n} ${n === 1 ? 'dia' : 'dias'}</span>`);
  const obs = a.ultimaObs || a.motivo ? `<div class="obs">${a.motivo ? `<b>${esc(a.motivo)}</b>${a.ultimaObs ? ' — ' : ''}` : ''}${esc(a.ultimaObs||'')}</div>` : '';
  return `<button type="button" class="card" data-id="${esc(a.id)}" style="--c:${cvar(a.status)}"><span class="stripe"></span>
    <span class="body"><div class="t">${esc(a.titulo)}</div><div class="m">${esc(localLine(a))}</div>
    <div class="row">${a.fornecedor ? `<span><b>${esc(a.fornecedor)}</b></span>` : '<span>Fornecedor não informado</span>'}${a.responsavel ? `<span>Resp.: ${esc(a.responsavel)}</span>` : ''}${a.efetivo ? `<span>Efetivo prev.: ${esc(a.efetivo)}</span>` : ''}${tags.join('')}</div>${obs}</span>
    <span class="side"><span class="pill" style="--c:${cvar(a.status)}">${esc(st.label)}${a.status === 'parcial' && a.pct ? ' '+esc(a.pct)+'%' : ''}</span><span class="when">${esc(nameOf(a.atualizadoPor))} · ${esc(fmtTs(a.atualizadoEm))}</span></span></button>`;
}

/* ================= histórico ================= */
function evText(ev){
  const st = k => `<span class="pill" style="--c:${cvar(k)}">${esc(STATUS[k]?.label || k)}</span>`;
  switch (ev.tipo){
    case 'criou': return `inseriu ${ev.origem ? 'uma cópia' : 'a atividade'} para ${fmtShort(ev.noite || ev.noiteAtv)}${ev.turno || ev.turnoAtv ? ' (' + (TURNOS[ev.turno || ev.turnoAtv] || '').toLowerCase() + ')' : ''}`;
    case 'status': return `mudou o status de ${st(ev.de)} para ${st(ev.para)}${ev.pct ? ` (${esc(ev.pct)}% executado)` : ''}`;
    case 'obs': return 'adicionou uma observação';
    case 'editou': return 'alterou os dados';
    case 'reprogramou': return `reprogramou de ${fmtShort(ev.de)}${ev.turnoDe ? ' (' + TURNOS[ev.turnoDe].toLowerCase() + ')' : ''} para ${fmtShort(ev.para)}${ev.turnoPara ? ' (' + TURNOS[ev.turnoPara].toLowerCase() + ')' : ''}`;
    case 'excluiu': return 'excluiu a atividade';
    default: return esc(ev.tipo);
  }
}
const fmtVal = (campo, v) => campo === 'noite' && v ? fmtShort(v) : campo === 'turno' ? (TURNOS[v] || (v ? v : 'Noturno')) : campo === 'tipoLocal' ? (TIPO_LABEL[v] || v) : campo === 'prioridade' ? (PRIOR[v] || v) : (v ?? '');
function evExtra(ev){
  let h = '';
  if (ev.mudancas?.length) h += `<div class="ch">${ev.mudancas.map(m => `${esc(FIELDS[m.campo]||m.campo)}: ${esc(fmtVal(m.campo,m.de)||'—')} → ${esc(fmtVal(m.campo,m.para)||'—')}`).join('<br>')}</div>`;
  if (ev.motivo || ev.obs) h += `<div class="q">${ev.motivo ? `<b>${esc(ev.motivo)}</b>${ev.obs ? ' — ' : ''}` : ''}${esc(ev.obs||'')}</div>`;
  return h;
}
function renderFeed(){
  const since = Date.now() - Number($('h-dias').value)*86400000, fu = $('h-user').value, ft = $('h-tipo').value;
  const sel = $('h-user'), cur = sel.value, ids = Object.keys(S.usuarios).filter(id => S.usuarios[id].papel !== 'pendente');
  sel.innerHTML = '<option value="">Todas as pessoas</option>' + ids.map(id => `<option value="${esc(id)}">${esc(nameOf(id))}${roleOf(id) ? ' · '+esc(roleOf(id)) : ''}</option>`).join('');
  sel.value = ids.includes(cur) ? cur : '';
  const evs = S.feed.filter(ev => toDate(ev.t).getTime() >= since && (!fu || ev.u === fu) && (!ft || ev.tipo === ft));
  if (!evs.length){ $('feed').innerHTML = '<div class="empty" style="margin-top:18px"><b>Sem registros no período</b>Cada inserção, alteração, observação e mudança de status aparece aqui com nome e horário.</div>'; return; }
  const days = new Map();
  for (const ev of evs){ const d = ymd(toDate(ev.t)); if (!days.has(d)) days.set(d, []); days.get(d).push(ev); }
  $('feed').innerHTML = [...days.entries()].map(([d, list]) => `<div class="feed-day"><h3>${DOW[parseYmd(d).getDay()]} ${fmtShort(d)}</h3>${list.map(ev => `
    <div class="ev"><time>${fmtHM(ev.t)}</time><div><p><b>${esc(nameOf(ev.u))}</b>${roleOf(ev.u) ? ` <span class="ro">${esc(roleOf(ev.u))}</span>` : ''} ${evText(ev)} · ${ev.tipo === 'excluiu' ? `<span>${esc(ev.titulo)}</span>` : `<button type="button" class="act" data-id="${esc(ev.atividadeId)}">${esc(ev.titulo)}</button>`} <span class="ro">${esc(ev.local||'')}</span></p>${evExtra(ev)}</div></div>`).join('')}</div>`).join('');
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
  {key:'pilares', title:'Pilares', hint:'Pilar, eixo e referência de loja ou ambiente.', cols:[['codigo','Pilar (ex.: P34)'],['eixo','Eixo (ex.: M/11)'],['referencia','Referência']], k:'codigo', v:'referencia', v2:'eixo'},
  {key:'locais', title:'Locais do shopping', hint:'Lojas, mall, estacionamento e áreas de apoio fora dos setores.', cols:[['nome','Nome do local']], k:'nome'},
];
const cadItemText = (d, it) => { const o = typeof it === 'string' ? {[d.k]:it} : it; return {o, k:o[d.k], v:[d.v2 ? o[d.v2] : '', d.v ? o[d.v] : ''].filter(Boolean).join(' · ')}; };

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
    ${!isU && admin ? `<form class="cad-add" data-add="${d.key}"><div class="cad-add-h">Novo cadastro</div><div class="cad-add-f">${d.cols.map(([c,l]) => `<input id="cad-${d.key}-${c}" name="${c}" placeholder="${l}" aria-label="${l}" autocomplete="off">`).join('')}<button class="btn pri" type="submit">Adicionar</button></div></form>` : ''}
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
    list.innerHTML = us.length ? us.map(([id,u]) => `<div class="cad-item user">
      <span class="av sm">${esc(initials(u.nome))}</span>
      <div class="ci-tx"><b>${esc(u.nome)}${id === S.uid ? ' <span class="ro">(você)</span>' : ''}</b><span>${esc([u.funcao, u.email].filter(Boolean).join(' · '))}</span></div>
      <span class="badge ${u.papel}">${esc(PAPEIS[u.papel]||u.papel)}</span>
      ${id === S.uid ? '' : `<div class="ubtns">${
        u.papel === 'pendente' ? `<button class="btn pri" type="button" data-papel="${id}:usuario">Liberar como usuário</button><button class="btn" type="button" data-papel="${id}:visualizador">Liberar como visualizador</button><button class="btn" type="button" data-papel="${id}:bloqueado">Recusar</button>`
        : u.papel === 'usuario' ? `<button class="btn" type="button" data-papel="${id}:admin">Tornar admin</button><button class="btn" type="button" data-papel="${id}:visualizador">Tornar visualizador</button><button class="btn danger" type="button" data-papel="${id}:bloqueado">Bloquear</button>`
        : u.papel === 'visualizador' ? `<button class="btn" type="button" data-papel="${id}:usuario">Tornar usuário</button><button class="btn danger" type="button" data-papel="${id}:bloqueado">Bloquear</button>`
        : u.papel === 'admin' ? `<button class="btn" type="button" data-papel="${id}:usuario">Remover admin</button>`
        : `<button class="btn" type="button" data-papel="${id}:visualizador">Reativar como visualizador</button><button class="btn" type="button" data-papel="${id}:usuario">Reativar como usuário</button>`}</div>`}
    </div>`).join('') : '<div class="empty">Ninguém encontrado.</div>';
    return;
  }
  const d = CAD_DEF.find(x => x.key === S.cadSub); if (!d) return;
  const all = (S.cad[d.key] || []).map((it, i) => ({i, ...cadItemText(d, it)}));
  const items = all.filter(x => !q || (x.k + ' ' + x.v).toLowerCase().includes(q));
  $('cad-count').textContent = q ? `${items.length} de ${all.length}` : `${all.length} ${all.length === 1 ? 'item' : 'itens'}`;
  list.innerHTML = items.length ? items.map(x => `<div class="cad-item">
      <div class="ci-tx"><b>${esc(x.k)}</b>${x.v ? `<span>${esc(x.v)}</span>` : ''}</div>
      ${admin ? (S.cadDel === `${d.key}:${x.i}` ? `<div class="ci-conf"><span>Remover?</span><button type="button" class="btn danger" data-del="${d.key}:${x.i}">Sim</button><button type="button" class="btn" data-del-cancel>Não</button></div>`
        : `<button type="button" class="x" data-del-ask="${d.key}:${x.i}" aria-label="Remover ${esc(x.k)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`) : ''}
    </div>`).join('') : `<div class="empty">${S.cadLoaded ? (q ? 'Nada encontrado com essa busca.' : 'Lista vazia.') : 'Carregando…'}</div>`;
}
async function saveCad(next){
  try { await setDoc(doc(db, 'config', 'cadastros'), {...next, atualizadoPor:S.uid, atualizadoEm:serverTimestamp()}); return true; }
  catch (e) { toast(e?.code === 'permission-denied' ? 'Só administradores alteram os cadastros.' : 'Não foi possível salvar o cadastro.'); return false; }
}
function fillFilterOptions(){
  const s = $('f-setor'), sv = s.value;
  s.innerHTML = '<option value="">Todos os setores</option>' + S.cad.setores.map(x => `<option value="${esc(x.codigo)}">Setor ${esc(x.codigo)}</option>`).join('');
  s.value = sv;
  const f = $('f-forn'), fv = f.value, used = new Set(S.cad.fornecedores.map(x => x.nome));
  for (const a of all().values()) if (a.fornecedor) used.add(a.fornecedor);
  f.innerHTML = '<option value="">Todos os fornecedores</option>' + [...used].sort((a,b) => a.localeCompare(b,'pt')).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  f.value = used.has(fv) ? fv : '';
}

/* ================= render geral ================= */
function renderAll(){
  if (!S.started) return;
  if (S.tab === 'noite') renderNight(); else if (S.tab === 'hist') renderFeed(); else renderCad();
  if (S.openId){ renderDrawerHead(); renderTimeline(); if (!S.dwMode) renderDrawerActions(); }
  renderWho();
}
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
function setTab(t){
  if (t === 'cad' && S.tab === 'cad') S.cadSub = null;
  S.tab = ['noite','hist','cad'].includes(t) ? t : 'noite';
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
  $('v-noite').hidden = S.tab !== 'noite'; $('v-hist').hidden = S.tab !== 'hist'; $('v-cad').hidden = S.tab !== 'cad';
  try { localStorage.setItem('pn-tab', S.tab); } catch {}
  window.scrollTo({top:0});
  renderAll();
}
function setNight(n){
  if (!n) return;
  S.noite = n;
  if (n < S.winFrom){ S.winFrom = addDays(n, -7); subscribeWindow(); }
  renderAll();
}

/* ================= painel da atividade ================= */
function openDrawer(id){
  S.openId = id; S.dwMode = null; S.dwHist = [];
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
  renderDrawerHead(); renderDrawerActions(); renderTimeline();
}
function closeDrawer(){
  if (S.unsubDw){ S.unsubDw(); S.unsubDw = null; } if (S.unsubDwHist){ S.unsubDwHist(); S.unsubDwHist = null; }
  if (S.openId) S.extra.delete(S.openId);
  S.openId = null; S.dwMode = null; $('drawer').hidden = true; if ($('modal').hidden) $('scrim').hidden = true;
}
function renderDrawerHead(){
  const a = all().get(S.openId);
  if (!a){ $('dw-head').innerHTML = '<p class="ro">Carregando…</p>'; $('dw-pill').innerHTML = ''; return; }
  const st = STATUS[a.status] || STATUS.programada;
  $('dw-pill').innerHTML = `<span class="pill" style="--c:${cvar(a.status)}">${esc(st.label)}${a.status === 'parcial' && a.pct ? ' '+esc(a.pct)+'%' : ''}</span>`;
  const kv = [['Turno', TURNOS[turnoOf(a)]], ['Quando', fmtWhen(a.noite, turnoOf(a))], ['Local', localLine(a)], ['Fornecedor', a.fornecedor || 'Não informado'],
    a.responsavel ? ['Responsável', a.responsavel] : null, a.efetivo ? ['Efetivo prev.', a.efetivo] : null, ['Prioridade', PRIOR[a.prioridade] || 'Normal'],
    a.motivo ? ['Motivo', a.motivo] : null, ['Inserida por', `${nameOf(a.criadoPor)} em ${fmtTs(a.criadoEm)}`], ['Última alteração', `${nameOf(a.atualizadoPor)} em ${fmtTs(a.atualizadoEm)}`]].filter(Boolean);
  $('dw-head').innerHTML = `<div class="dw-tags">${turnoTag(turnoOf(a))}<span class="ro">${esc(TIPO_LABEL[a.tipoLocal]||'')}</span></div><h2 class="dw-title">${esc(a.titulo)}</h2>
    <dl class="kv">${kv.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${a.detalhes ? `<div class="det">${esc(a.detalhes)}</div>` : ''}`;
}
function renderDrawerActions(){
  const a = all().get(S.openId); if (!a){ $('dw-actions').innerHTML = ''; return; }
  if (!canWrite()){ $('dw-actions').innerHTML = '<p class="readonly">Acesso de visualização: você consulta a atividade e o histórico, sem alterar.</p>'; return; }
  $('dw-actions').innerHTML = `<div class="lbl">Atualizar status</div>
    <div class="stbtns">${ORDER.filter(k => k !== a.status).map(k => `<button type="button" class="stb" data-mode="status:${k}" style="--c:${cvar(k)}">${esc(STATUS[k].label)}</button>`).join('')}</div>
    <div class="morebtns"><button type="button" class="btn" data-mode="obs">Adicionar observação</button><button type="button" class="btn" data-mode="reprog">Reprogramar</button>
      <button type="button" class="btn" data-mode="edit">Editar dados</button><button type="button" class="btn" data-mode="dup">Duplicar</button>
      ${isAdmin() ? '<button type="button" class="btn danger" data-mode="del">Excluir</button>' : ''}</div>`;
}
function setMode(mode){
  if (!canWrite()) return;
  if (mode === 'edit'){ openForm(S.openId); return; }
  S.dwMode = mode || null;
  const a = all().get(S.openId), p = $('dw-panel');
  if (!a || !mode){ p.innerHTML = ''; renderDrawerActions(); return; }
  const cancel = '<button type="button" class="btn ghost" data-mode="">Cancelar</button>';
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
      mutate(S.openId, cur => ({changes:{status:k, aberta:st.aberta, motivo:st.motivo ? motivo : '', pct:st.pct ? pct : '', ...(obs ? {ultimaObs:obs} : {})}, ev:{tipo:'status', de:cur.status, para:k, motivo, obs, pct}}), `Status alterado para ${st.label}.`);
    };
    (p.querySelector('#pf-motivo') || p.querySelector('#pf-obs')).focus();
  } else if (mode === 'obs'){
    p.innerHTML = `<form class="panel" id="pf"><h4>Observação</h4><div class="f"><label for="pf-obs">Texto <span class="req">*</span></label><textarea id="pf-obs"></textarea></div><div class="acts">${cancel}<button class="btn pri" type="submit">Registrar</button></div></form>`;
    $('pf').onsubmit = e => { e.preventDefault(); const obs = $('pf-obs').value.trim(); if (!obs) return toast('Escreva a observação.'); mutate(S.openId, () => ({changes:{ultimaObs:obs}, ev:{tipo:'obs', obs}}), 'Observação registrada.'); };
    $('pf-obs').focus();
  } else if (mode === 'reprog'){
    const t0 = turnoOf(a);
    p.innerHTML = `<form class="panel" id="pf"><h4>Reprogramar</h4><p class="ro" style="margin:0 0 10px">A atividade volta para “Programada” no novo dia e turno. O histórico continua junto.</p>
      <div class="frow"><div class="f"><label for="pf-date">Novo dia <span class="req">*</span></label><input id="pf-date" type="date" value="${esc(addDays(a.noite,1))}"></div>
      <div class="f"><label>Turno</label><div class="seg" id="pf-turno">${['diurno','noturno'].map(x => `<button type="button" data-t="${x}" aria-pressed="${x === t0}">${TURNOS[x]}</button>`).join('')}</div></div></div>
      <div class="f"><label for="pf-obs">Motivo da reprogramação</label><textarea id="pf-obs"></textarea></div><div class="acts">${cancel}<button class="btn pri" type="submit">Reprogramar</button></div></form>`;
    let tsel = t0;
    $('pf-turno').onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; tsel = b.dataset.t; for (const x of $('pf-turno').children) x.setAttribute('aria-pressed', String(x === b)); };
    $('pf').onsubmit = e => {
      e.preventDefault(); const d = $('pf-date').value, obs = $('pf-obs').value.trim();
      if (!d) return toast('Escolha o novo dia.'); if (d === a.noite && tsel === t0) return toast('A atividade já está nesse dia e turno.');
      mutate(S.openId, cur => ({changes:{noite:d, turno:tsel, status:'programada', aberta:true, motivo:'', pct:'', ...(obs ? {ultimaObs:obs} : {})}, ev:{tipo:'reprogramou', de:cur.noite, para:d, turnoDe:turnoOf(cur), turnoPara:tsel, obs}}), `Reprogramada para ${fmtShort(d)} (${TURNOS[tsel].toLowerCase()}).`);
    };
  } else if (mode === 'dup'){
    p.innerHTML = `<form class="panel" id="pf"><h4>Duplicar para outro dia</h4><p class="ro" style="margin:0 0 10px">Cria uma nova atividade igual, com status “Programada” e histórico próprio. A original não muda.</p>
      <div class="f"><label for="pf-date">Dia <span class="req">*</span></label><input id="pf-date" type="date" value="${esc(addDays(a.noite,1))}"></div><div class="acts">${cancel}<button class="btn pri" type="submit">Duplicar</button></div></form>`;
    $('pf').onsubmit = e => {
      e.preventDefault(); const d = $('pf-date').value; if (!d) return;
      const data = {}; for (const k of Object.keys(FIELDS)) data[k] = a[k] ?? ''; data.noite = d; data.turno = turnoOf(a);
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
function renderTimeline(){
  const a = all().get(S.openId);
  $('dw-tl').innerHTML = [...S.dwHist].reverse().map(ev => {
    const c = ev.tipo === 'status' ? cvar(ev.para) : ev.tipo === 'criou' ? 'var(--accent)' : 'var(--faint)';
    return `<li style="--c:${c}"><span class="d"></span><div class="h"><b>${esc(nameOf(ev.u))}</b>${roleOf(ev.u) ? ` <span class="ro">${esc(roleOf(ev.u))}</span>` : ''} ${evText({...ev, noiteAtv:ev.noiteAtv || a?.noite})}</div><div class="ts">${esc(fmtTs(ev.t))}</div>${evExtra(ev)}</li>`;
  }).join('') || '<li class="ro">Carregando…</li>';
}

/* ================= escrita ================= */
// Toda gravação vai num lote: a atividade + um registro novo e imutável em "historico".
// As regras do Firestore recusam qualquer alteração de atividade que não venha com o seu registro.
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
  const actRef = doc(collection(db, 'atividades')), histRef = doc(collection(db, 'historico')), b = writeBatch(db);
  b.set(actRef, {...data, status:'programada', aberta:true, motivo:'', pct:'', ultimaObs:'', criadoPor:S.uid, criadoEm:serverTimestamp(), atualizadoPor:S.uid, atualizadoEm:serverTimestamp(), ultimoEvento:histRef.id});
  b.set(histRef, evDoc(actRef.id, data, {tipo:'criou', noite:data.noite, turno:data.turno, ...(origem ? {origem} : {})}));
  return commit(b);
}

/* ================= formulário ================= */
function openForm(id){
  if (!canWrite()) return;
  const a = id ? all().get(id) : null;
  const v = a ? {...a, turno:turnoOf(a)} : {noite:S.noite, turno:S.f.turno || '', tipoLocal:S.f.tipo || 'setor', setor:S.f.setor || '', prioridade:'normal', fornecedor:S.f.forn || ''};
  $('sheet').innerHTML = `<h2>${a ? 'Editar atividade' : 'Nova atividade'}</h2>
  <form id="af" novalidate>
    <div class="frow">
      <div class="f"><label for="af-noite">Data <span class="req">*</span></label><input id="af-noite" type="date" value="${esc(v.noite)}"></div>
      <div class="f"><label>Turno <span class="req">*</span></label><div class="seg seg-turno" id="af-turno">${['diurno','noturno'].map(t => `<button type="button" data-t="${t}" aria-pressed="${v.turno === t}">${t === 'diurno' ? ICON_SOL : ICON_LUA}${TURNOS[t]}</button>`).join('')}</div></div>
      <div class="f"><label for="af-prior">Prioridade</label><select id="af-prior">${Object.entries(PRIOR).map(([k,l]) => `<option value="${k}" ${k === (v.prioridade||'normal') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="f"><label>Onde</label><div class="seg" id="af-tipo">${['setor','pilar','shopping'].map(t => `<button type="button" data-t="${t}" aria-pressed="${v.tipoLocal === t}">${TIPO_LABEL[t]}</button>`).join('')}</div></div>
    <div class="frow" id="af-loc-setor"><div class="f"><label for="af-setor">Setor <span class="req">*</span></label><select id="af-setor"><option value="">Selecione…</option>${S.cad.setores.map(x => `<option value="${esc(x.codigo)}" ${x.codigo === v.setor ? 'selected' : ''}>Setor ${esc(x.codigo)}${x.descricao ? ' — '+esc(x.descricao) : ''}</option>`).join('')}</select></div></div>
    <div class="frow" id="af-loc-pilar"><div class="f"><label for="af-pilar">Pilar <span class="req">*</span></label><input id="af-pilar" list="dl-pilar" value="${esc(v.pilar||'')}" placeholder="ex.: P34" autocomplete="off"></div></div>
    <div class="frow" id="af-loc-shop"><div class="f"><label for="af-local">Local no shopping <span class="req">*</span></label><input id="af-local" list="dl-local" value="${esc(v.local||'')}" placeholder="ex.: Mall – Escadas Centrais" autocomplete="off"></div></div>
    <div class="frow">
      <div class="f"><label for="af-nivel">Nível</label><input id="af-nivel" list="dl-nivel" value="${esc(v.nivel||'')}" placeholder="ex.: 114,30" autocomplete="off"></div>
      <div class="f"><label for="af-eixo" id="af-eixo-l">Eixo</label><input id="af-eixo" value="${esc(v.eixo||'')}" placeholder="ex.: 8 / E-H" autocomplete="off"></div>
    </div>
    <div class="f"><label for="af-titulo">Atividade <span class="req">*</span></label><input id="af-titulo" maxlength="300" value="${esc(v.titulo||'')}" placeholder="ex.: Demolição da parede do eixo 8, trecho E–F" autocomplete="off"></div>
    <div class="f"><label for="af-det">Detalhes / orientações para a equipe</label><textarea id="af-det" placeholder="Sequência, cuidados, liberações necessárias, contato no shopping…">${esc(v.detalhes||'')}</textarea></div>
    <div class="frow">
      <div class="f"><label for="af-forn">Fornecedor</label><input id="af-forn" list="dl-forn" value="${esc(v.fornecedor||'')}" placeholder="Selecione ou digite" autocomplete="off"></div>
      <div class="f"><label for="af-resp">Responsável no turno</label><input id="af-resp" value="${esc(v.responsavel||'')}" placeholder="Encarregado / técnico" autocomplete="off"></div>
      <div class="f"><label for="af-efet">Efetivo previsto</label><input id="af-efet" type="number" min="0" inputmode="numeric" value="${esc(v.efetivo||'')}"></div>
    </div>
    <datalist id="dl-forn">${S.cad.fornecedores.map(x => `<option value="${esc(x.nome)}">${esc(x.disciplina||'')}</option>`).join('')}</datalist>
    <datalist id="dl-pilar">${S.cad.pilares.map(x => `<option value="${esc(x.codigo)}">${esc([x.eixo,x.referencia].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
    <datalist id="dl-local">${S.cad.locais.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    <datalist id="dl-nivel">${S.cad.niveis.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
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
  $('af-noite').insertAdjacentHTML('afterend', '<span class="ro" id="af-noite-h"></span>'); syncTurno();
  $('af-cancel').onclick = closeModal;
  $('af').onsubmit = e => {
    e.preventDefault();
    const d = {noite:$('af-noite').value, turno, prioridade:$('af-prior').value, tipoLocal:tipo,
      setor: tipo === 'setor' ? $('af-setor').value : '', pilar: tipo === 'pilar' ? $('af-pilar').value.trim() : '', local: tipo === 'shopping' ? $('af-local').value.trim() : '',
      nivel:$('af-nivel').value.trim(), eixo:$('af-eixo').value.trim(), titulo:$('af-titulo').value.trim(), detalhes:$('af-det').value.trim(),
      fornecedor:$('af-forn').value.trim(), responsavel:$('af-resp').value.trim(), efetivo:$('af-efet').value.trim()};
    if (!d.noite) return toast('Informe a data.');
    if (!d.turno) return toast('Escolha o turno: diurno ou noturno.');
    if (tipo === 'setor' && !d.setor) return toast('Selecione o setor.');
    if (tipo === 'pilar' && !d.pilar) return toast('Informe o pilar.');
    if (tipo === 'shopping' && !d.local) return toast('Informe o local no shopping.');
    if (!d.titulo) return toast('Descreva a atividade.');
    if (!a){ createAct(d); closeModal(); if (d.noite !== S.noite) setNight(d.noite); toast('Atividade inserida.'); return; }
    const mudancas = Object.keys(FIELDS).filter(k => String((k === 'turno' ? turnoOf(a) : a[k]) ?? '') !== String(d[k] ?? '')).map(k => ({campo:k, de:String((k === 'turno' ? turnoOf(a) : a[k]) ?? ''), para:String(d[k] ?? '')}));
    closeModal();
    if (mudancas.length) mutate(a.id, () => ({changes:d, ev:{tipo:'editou', mudancas}}), 'Alterações salvas.');
  };
  showModal(); setTimeout(() => $('af-titulo').focus(), 30);
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
  const acts = [...all().values()];
  const ft = S.f.turno, inT = a => !ft || turnoOf(a) === ft;
  const rows = [...sortActs(acts.filter(a => a.noite === S.noite && inT(a))), ...acts.filter(a => a.aberta && a.noite < S.noite && inT(a)).sort((x,y) => x.noite.localeCompare(y.noite))];
  const hist = {};
  try {
    const ids = rows.map(a => a.id);
    for (let i = 0; i < ids.length; i += 30){
      const s = await getDocs(query(collection(db, 'historico'), where('atividadeId', 'in', ids.slice(i, i+30))));
      s.forEach(d => { const v = d.data(SNAP); (hist[v.atividadeId] ||= []).push(v); });
    }
  } catch (e) { console.warn(e); }
  const head = ['Data','Turno','Situação','Tipo de local','Setor','Pilar','Local shopping','Nível','Eixo/complemento','Atividade','Detalhes','Fornecedor','Responsável','Efetivo previsto','Prioridade','Status','% executado','Motivo','Última observação','Inserida por','Inserida em','Última alteração por','Última alteração em','Histórico'];
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  const histTxt = a => (hist[a.id] || []).sort((x,y) => toDate(x.t)-toDate(y.t)).map(ev => `${fmtTs(ev.t)} ${nameOf(ev.u)}: ${evText(ev).replace(/<[^>]+>/g,'')}${ev.motivo ? ' ['+ev.motivo+']' : ''}${ev.obs ? ' — '+ev.obs : ''}`).join(' | ');
  const lines = [head.map(q).join(';'), ...rows.map(a => [fmtShort(a.noite), TURNOS[turnoOf(a)], a.noite === S.noite ? 'Do dia' : 'Pendente anterior', TIPO_LABEL[a.tipoLocal]||'', a.setor, a.pilar, a.local, a.nivel, a.eixo, a.titulo, a.detalhes, a.fornecedor, a.responsavel, a.efetivo, PRIOR[a.prioridade]||'', STATUS[a.status]?.label||a.status, a.pct, a.motivo, a.ultimaObs, nameOf(a.criadoPor), fmtTs(a.criadoEm), nameOf(a.atualizadoPor), fmtTs(a.atualizadoEm), histTxt(a)].map(q).join(';'))];
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  const el = document.createElement('a'); el.href = url; el.download = `Atividades_${S.noite}${ft ? '_' + ft : ''}.csv`; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ================= eventos ================= */
document.addEventListener('click', e => {
  const t = e.target;
  if (!t.closest('.menu')) $('who-pop').hidden = true;
  const tab = t.closest('.tab'); if (tab) return setTab(tab.dataset.tab);
  const cardEl = t.closest('.card[data-id], .act[data-id]'); if (cardEl) return openDrawer(cardEl.dataset.id);
  const chip = t.closest('.chip[data-st]'); if (chip){ S.f.status = S.f.status === chip.dataset.st ? '' : chip.dataset.st; return renderAll(); }
  if (t.closest('.chip[data-jump]')) return $('l-pend').scrollIntoView({behavior:'smooth', block:'start'});
  const m = t.closest('[data-mode]'); if (m && $('drawer').contains(m)) return setMode(m.dataset.mode || null);
  const cadRow = t.closest('[data-cad]'); if (cadRow){ S.cadSub = cadRow.dataset.cad; S.cadDel = null; window.scrollTo({top:0}); return renderAll(); }
  if (t.closest('[data-cad-back]')){ S.cadSub = null; S.cadDel = null; window.scrollTo({top:0}); return renderAll(); }
  const ask = t.closest('[data-del-ask]'); if (ask){ S.cadDel = ask.dataset.delAsk; return renderCadList(); }
  if (t.closest('[data-del-cancel]')){ S.cadDel = null; return renderCadList(); }
  const del = t.closest('[data-del]'); if (del){ const [key, i] = del.dataset.del.split(':'); S.cadDel = null; return saveCad({...S.cad, [key]:S.cad[key].filter((_,j) => j !== Number(i))}).then(ok => ok && toast('Item removido.')); }
  const pp = t.closest('[data-papel]'); if (pp){ const [uid, papel] = pp.dataset.papel.split(':'); updateDoc(doc(db, 'usuarios', uid), {papel}).then(() => toast('Acesso atualizado.'), handleWriteError); return; }
  if (t.id === 'b-seed') return saveCad(SEED);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const key = f.dataset.add, d = CAD_DEF.find(x => x.key === key);
  const vals = Object.fromEntries(d.cols.map(([c]) => [c, f.elements[c].value.trim()]));
  if (!vals[d.k]) return toast('Preencha o primeiro campo.');
  const simple = key === 'niveis' || key === 'locais', item = simple ? vals[d.k] : vals;
  if ((S.cad[key]||[]).some(x => String(simple ? x : x[d.k]).toLowerCase() === vals[d.k].toLowerCase())) return toast('Esse item já está na lista.');
  const next = {...S.cad, [key]:[...(S.cad[key]||[]), item]};
  if (key === 'fornecedores') next[key].sort((a,b) => a.nome.localeCompare(b.nome,'pt'));
  saveCad(next).then(ok => { if (!ok) return; f.reset(); f.elements[0].focus(); toast('Cadastrado.'); });
});
$('n-prev').onclick = () => setNight(addDays(S.noite,-1));
$('n-next').onclick = () => setNight(addDays(S.noite,1));
$('n-today').onclick = () => setNight(defaultNight());
$('n-date').onchange = e => setNight(e.target.value);
$('n-date').addEventListener('click', e => { try { e.target.showPicker(); } catch {} });
$('f-q').oninput = e => { S.f.q = e.target.value.trim(); renderAll(); };
$('f-tipo').onchange = e => { S.f.tipo = e.target.value; renderAll(); };
try { const t = localStorage.getItem('pn-turno'); if (t === 'diurno' || t === 'noturno') S.f.turno = t; } catch {}
$('f-turno').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.f.turno = b.dataset.t || ''; try { localStorage.setItem('pn-turno', S.f.turno); } catch {} renderAll(); };
$('f-setor').onchange = e => { S.f.setor = e.target.value; renderAll(); };
$('f-forn').onchange = e => { S.f.forn = e.target.value; renderAll(); };
['h-dias','h-user','h-tipo'].forEach(id => { $(id).onchange = renderAll; });
$('b-new').onclick = () => openForm(null);
$('b-export').onclick = exportCsv;
$('who').onclick = () => { const p = $('who-pop'); p.hidden = !p.hidden; $('who').setAttribute('aria-expanded', String(!p.hidden)); };
$('m-perfil').onclick = () => { $('who-pop').hidden = true; openPerfil(); };
$('m-sair').onclick = () => { $('who-pop').hidden = true; signOut(auth); };
$('dw-close').onclick = closeDrawer;
$('scrim').onclick = () => { if (!$('modal').hidden) closeModal(); else closeDrawer(); };
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
