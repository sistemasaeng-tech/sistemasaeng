// Relatório PDF de atividades em aberto (não inclui concluídas nem canceladas).
// Gerado no próprio aparelho com jsPDF + autotable, carregados sob demanda.
const LIBS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
];
function loadScript(src){
  return new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Não foi possível carregar ' + src));
    document.head.appendChild(s);
  });
}
async function loadLibs(){ for (const u of LIBS) await loadScript(u); return window.jspdf.jsPDF; }
async function toDataURL(url){
  const b = await (await fetch(url)).blob();
  return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
}

// ---------- paleta (identidade SAENG) ----------
const C = {
  graf:[43,45,49], graf2:[53,56,61], laranja:[246,147,33], laranjaTx:[176,92,0], ink:[29,32,37], muted:[93,99,109], faint:[138,144,153],
  line:[226,228,232], soft:[244,245,247], white:[255,255,255],
};
const ST = {
  programada:{label:'Programada', c:[79,111,153]},
  andamento:{label:'Em andamento', c:[27,132,170]},
  parcial:{label:'Parcial', c:[201,160,30]},
  nao_iniciada:{label:'Não iniciada', c:[196,86,44]},
  impedida:{label:'Impedida', c:[184,50,76]},
};
const ORDER = ['programada','andamento','parcial','nao_iniciada','impedida'];
const PRIOR = {critica:'Crítica', alta:'Alta', normal:'Normal'};
const PLURAL = {programada:['programada','programadas'], andamento:['em andamento','em andamento'], parcial:['parcial','parciais'], nao_iniciada:['não iniciada','não iniciadas'], impedida:['impedida','impedidas']};
const mix = (c, f) => c.map(v => Math.round(v + (255 - v) * f)); // clareia a cor (f=0..1)
const t = s => String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/→/g, '->').replace(/ /g, ' ');

export async function gerarRelatorioPDF(ctx){
  const jsPDF = await loadLibs();
  const logo = await toDataURL(ctx.logoUrl).catch(() => null);
  // A4 paisagem: resumo na primeira página e a lista por setor nas seguintes
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'landscape'});
  const W = 297, H = 210, M = 12, CW = W - 2*M;
  const fill = c => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const color = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);

  const acts = ctx.acts;
  const hoje = ctx.hoje;
  const fimOf = ctx.fimOf || (a => a.noite), avOf = ctx.avOf || (() => 0);
  const diasAberto = a => fimOf(a) < hoje ? ctx.diasEntre(fimOf(a), hoje) : 0; // dias de atraso após o término previsto
  const per = a => fimOf(a) === a.noite ? ctx.fmtShort(a.noite) : `${ctx.fmtShort(a.noite)} a ${ctx.fmtShort(fimOf(a))}`;

  // ---------- agrupamento por setor ----------
  const groups = new Map();
  for (const a of acts){
    let k, label, sub, rank;
    if (a.tipoLocal === 'setor'){ const i = ctx.setores.findIndex(s => s.codigo === a.setor); k = 's:' + a.setor; label = `Setor ${a.setor || '?'}`; sub = (ctx.setores[i] || {}).descricao || ''; rank = i < 0 ? 500 : i; }
    else if (a.tipoLocal === 'pilar'){ k = 'p'; label = 'Pilares'; sub = 'Intervenções em pilares'; rank = 1000; }
    else { k = 'z'; label = 'Shopping'; sub = 'Lojas, mall, estacionamento e áreas de apoio'; rank = 2000; }
    if (!groups.has(k)) groups.set(k, {k, label, sub, rank, items:[]});
    groups.get(k).items.push(a);
  }
  const G = [...groups.values()].sort((a, b) => a.rank - b.rank);
  const cnt = {}; ORDER.forEach(k => cnt[k] = 0); acts.forEach(a => { if (cnt[a.status] != null) cnt[a.status]++; });
  const atrasadas = acts.filter(a => fimOf(a) < hoje).length;
  const avMedio = acts.length ? Math.round(acts.reduce((s, a) => s + avOf(a), 0) / acts.length) : 0;
  const criticas = acts.filter(a => a.prioridade === 'critica').length;
  const altas = acts.filter(a => a.prioridade === 'alta').length;

  // ---------- cabeçalho da primeira página ----------
  fill(C.graf); doc.rect(0, 0, W, 28, 'F');
  fill(C.laranja); doc.rect(0, 28, W, 1.4, 'F');
  if (logo) doc.addImage(logo, 'PNG', M, 8, 42, 42 * 83 / 306);
  color(C.white); font('bold', 15); text('Relatório de atividades em aberto', W - M, 13, {align:'right'});
  color([169,173,180]); font('normal', 9); text(`Obra 4107 · Rooftop Iguatemi SP · emitido em ${ctx.emitidoEm} por ${ctx.emitidoPor}`, W - M, 19.5, {align:'right'});

  let y = 40;
  color(C.ink); font('bold', 17); text(`${acts.length} ${acts.length === 1 ? 'atividade' : 'atividades'} em aberto`, M, y);
  color(C.muted); font('normal', 9);
  const prio = [criticas ? `${criticas} de prioridade crítica` : '', altas ? `${altas} de prioridade alta` : ''].filter(Boolean).join(' · ');
  text(`${ctx.turnoLabel} · situação em ${ctx.hojeLabel} · não inclui concluídas nem canceladas${prio ? ' · ' + prio : ''}`, M, y + 5.5);
  if (ctx.filtros){
    font('bold', 8); const fl = t('Filtro: ' + ctx.filtros), fw = doc.getTextWidth(fl) + 6;
    fill(mix(C.laranja, .85)); doc.roundedRect(W - M - fw, y - 4.6, fw, 6.4, 1.6, 1.6, 'F'); color(C.laranjaTx); text(fl, W - M - 3, y, {align:'right'});
  }

  // ---------- indicadores ----------
  y += 10;
  const kpis = [
    ['Em aberto', acts.length, C.graf],
    ['Programadas', cnt.programada, ST.programada.c],
    ['Em andamento', cnt.andamento, ST.andamento.c],
    ['Parciais', cnt.parcial, ST.parcial.c],
    ['Não iniciadas', cnt.nao_iniciada, ST.nao_iniciada.c],
    ['Impedidas', cnt.impedida, ST.impedida.c],
    ['Atrasadas', atrasadas, [214,110,40]],
    ['Avanço médio', avMedio + '%', C.laranja],
  ];
  const gap = 3.5, kw = (CW - (kpis.length - 1) * gap) / kpis.length, kh = 19;
  kpis.forEach(([lab, n, c], i) => {
    const x = M + i * (kw + gap);
    fill(C.soft); doc.roundedRect(x, y, kw, kh, 2, 2, 'F');
    fill(c); doc.rect(x, y, kw, 1.3, 'F');
    color(C.ink); font('bold', 17); text(String(n), x + 4, y + 10.5);
    color(C.muted); font('normal', 7.8); text(lab, x + 4, y + 16);
  });
  y += kh + 9;

  // ---------- gráficos em três colunas ----------
  const chartTitle = (s, x, yy) => { color(C.ink); font('bold', 10); text(s, x, yy); };
  const colGap = 10, c1W = 118, c2W = 62, c3W = CW - c1W - c2W - 2 * colGap;
  const c1X = M, c2X = c1X + c1W + colGap, c3X = c2X + c2W + colGap;
  const topY = y, botLimit = H - 16;

  // coluna 1: atividades por setor (barras empilhadas)
  chartTitle('Atividades em aberto por setor', c1X, topY);
  const rows = G.map(g => ({label: g.label, by: ORDER.map(k => g.items.filter(a => a.status === k).length), total: g.items.length}));
  const maxT = Math.max(1, ...rows.map(r => r.total));
  const labW = 22, barMax = c1W - labW - 9;
  const rowH = Math.min(8, Math.max(4.4, (botLimit - topY - 20) / Math.max(rows.length, 1)));
  const cy = topY + 5;
  rows.forEach((r, i) => {
    const ry = cy + i * rowH;
    color(C.muted); font('normal', 8); text(r.label, c1X, ry + rowH * .62);
    fill(C.soft); doc.rect(c1X + labW, ry + rowH * .18, barMax, rowH * .64, 'F');
    let x = c1X + labW;
    r.by.forEach((n, j) => { if (!n) return; const w = n / maxT * barMax; fill(ST[ORDER[j]].c); doc.rect(x, ry + rowH * .18, w, rowH * .64, 'F'); x += w; });
    color(C.ink); font('bold', 8); text(String(r.total), x + 1.6, ry + rowH * .62);
  });
  let lx = c1X, ly = cy + rows.length * rowH + 5;
  font('normal', 7.2);
  ORDER.forEach(k => { const w = doc.getTextWidth(t(ST[k].label)) + 7; if (lx + w > c1X + c1W){ lx = c1X; ly += 4.5; } fill(ST[k].c); doc.rect(lx, ly - 2.3, 2.6, 2.6, 'F'); color(C.muted); text(ST[k].label, lx + 3.6, ly); lx += w + 2; });

  // coluna 2: rosca por status
  chartTitle('Distribuição por status', c2X, topY);
  const R = 21, r0 = 13, cx = c2X + c2W / 2, ccy = topY + 7 + R;
  const total = acts.length || 1;
  let ang = -Math.PI / 2;
  ORDER.forEach(k => {
    const n = cnt[k]; if (!n) return;
    const a1 = ang + n / total * Math.PI * 2; fill(ST[k].c);
    // fatia desenhada como um único polígono (sem emendas)
    const steps = Math.max(2, Math.ceil((a1 - ang) / 0.04));
    const pts = [[cx, ccy]];
    for (let s = 0; s <= steps; s++){ const p = ang + (a1 - ang) * s / steps; pts.push([cx + R * Math.cos(p), ccy + R * Math.sin(p)]); }
    const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
    ang = a1;
  });
  if (!acts.length){ fill(C.soft); doc.circle(cx, ccy, R, 'F'); }
  fill(C.white); doc.circle(cx, ccy, r0, 'F');
  color(C.ink); font('bold', 16); text(String(acts.length), cx, ccy + 1.6, {align:'center'});
  color(C.muted); font('normal', 6.8); text('em aberto', cx, ccy + 5.6, {align:'center'});
  let dy = ccy + R + 8;
  ORDER.forEach(k => {
    fill(ST[k].c); doc.rect(c2X, dy - 2.4, 2.6, 2.6, 'F');
    color(C.ink); font('normal', 8); text(ST[k].label, c2X + 4.5, dy);
    font('bold', 8); text(`${cnt[k]}  (${acts.length ? Math.round(cnt[k] / acts.length * 100) : 0}%)`, c2X + c2W, dy, {align:'right'});
    dy += 5;
  });

  // coluna 3: atraso (em cima) e motivos (embaixo)
  chartTitle('Atraso em relação ao término previsto', c3X, topY);
  const buckets = [['No prazo', a => diasAberto(a) === 0], ['1 a 2 dias', a => { const d = diasAberto(a); return d >= 1 && d <= 2; }], ['3 a 7 dias', a => { const d = diasAberto(a); return d >= 3 && d <= 7; }], ['Mais de 7 dias', a => diasAberto(a) > 7]];
  const bcol = [[120,128,140], [246,167,33], [214,110,40], [184,50,76]];
  const bv = buckets.map(([, f]) => acts.filter(f).length), bmax = Math.max(1, ...bv);
  const chH = 38, by0 = topY + 5 + chH, bw = c3W / 4;
  stroke(C.line); doc.setLineWidth(.2); doc.line(c3X, by0, c3X + c3W, by0);
  bv.forEach((n, i) => {
    const h = n / bmax * (chH - 8), x = c3X + i * bw + 2;
    fill(bcol[i]); doc.rect(x, by0 - h, bw - 4, h, 'F');
    color(C.ink); font('bold', 9); text(String(n), x + (bw - 4) / 2, by0 - h - 1.5, {align:'center'});
    color(C.muted); font('normal', 7); text(buckets[i][0], x + (bw - 4) / 2, by0 + 4, {align:'center'});
  });
  const my = by0 + 15;
  chartTitle('Motivos de não início e impedimento', c3X, my);
  const mot = {}; acts.filter(a => a.motivo && (a.status === 'nao_iniciada' || a.status === 'impedida')).forEach(a => { mot[a.motivo] = (mot[a.motivo] || 0) + 1; });
  const motL = Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!motL.length){ color(C.faint); font('italic', 8.5); text('Nenhuma atividade não iniciada ou impedida.', c3X, my + 8); }
  else {
    const mmax = Math.max(...motL.map(m => m[1])), mrh = Math.min(6.4, (botLimit - my - 6) / motL.length), labM = 50;
    motL.forEach(([m, n], i) => {
      const ry = my + 4 + i * mrh;
      color(C.muted); font('normal', 7.4); text(doc.splitTextToSize(t(m), labM - 1)[0], c3X, ry + mrh * .62);
      const bwm = (c3W - labM - 8) * n / mmax; fill(ST.impedida.c); doc.rect(c3X + labM, ry + mrh * .2, Math.max(bwm, .8), mrh * .6, 'F');
      color(C.ink); font('bold', 7.6); text(String(n), c3X + labM + bwm + 1.6, ry + mrh * .62);
    });
  }

  // ---------- lista por setor ----------
  const statusCell = (data) => {
    const k = data.cell.raw && data.cell.raw.status;
    if (k && ST[k]){ data.cell.styles.fillColor = mix(ST[k].c, .85); data.cell.styles.textColor = ST[k].c.map(v => Math.round(v * .78)); data.cell.styles.fontStyle = 'bold'; }
  };
  const statusObj = a => ({content: t(ST[a.status]?.label || a.status) + `\n${avOf(a)}% executado`, status: a.status});
  const TOP = 22;
  const tblBase = {
    theme:'plain', margin:{left:M, right:M, top:TOP, bottom:15},
    styles:{font:'helvetica', fontSize:7.8, cellPadding:{top:1.8, bottom:1.8, left:2, right:2}, textColor:C.ink, lineColor:C.line, lineWidth:{bottom:.15}, valign:'top', overflow:'linebreak'},
    headStyles:{fillColor:C.graf, textColor:C.white, fontStyle:'bold', fontSize:7.6, lineWidth:0},
    alternateRowStyles:{fillColor:[250,250,251]},
  };
  const COLW = {0:70, 1:32, 2:24, 3:14, 4:30, 5:25, 6:28}; // a última coluna (observação) ocupa o restante
  const nomeDe = ctx.nomeDe || (() => '-');
  doc.addPage(); y = TOP + 6;
  color(C.ink); font('bold', 14); text('Atividades por setor', M, y);
  color(C.muted); font('normal', 8.5); text('Atividades em aberto agrupadas por setor, ordenadas por prioridade, status e data.', M, y + 5.2);
  y += 11;
  const prRank = p => p === 'critica' ? 0 : p === 'alta' ? 1 : 2;
  for (const g of G){
    if (y > H - 45){ doc.addPage(); y = TOP + 2; }
    // cabeçalho do setor
    fill(C.soft); doc.roundedRect(M, y, CW, 11, 2, 2, 'F');
    fill(C.laranja); doc.rect(M, y, 1.6, 11, 'F');
    color(C.ink); font('bold', 11); text(g.label, M + 5, y + 7.1);
    font('bold', 11); const lw = doc.getTextWidth(t(g.label));
    color(C.muted); font('normal', 8); text(doc.splitTextToSize(t(g.sub), 140)[0] || '', M + 5 + lw + 4, y + 7.1);
    // contadores à direita
    let px = W - M - 3;
    [...ORDER].reverse().forEach(k => {
      const n = g.items.filter(a => a.status === k).length; if (!n) return;
      const lab = `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`; font('bold', 7); const w = doc.getTextWidth(t(lab)) + 5;
      px -= w; fill(mix(ST[k].c, .82)); doc.roundedRect(px, y + 3, w, 5, 1.2, 1.2, 'F');
      color(ST[k].c.map(v => Math.round(v * .78))); text(lab, px + 2.5, y + 6.45); px -= 1.6;
    });
    y += 13;
    const items = [...g.items].sort((a, b) => prRank(a.prioridade) - prRank(b.prioridade) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || String(a.noite).localeCompare(String(b.noite)));
    doc.autoTable({...tblBase, startY: y,
      head:[['Atividade', 'Etiqueta', 'Turno / período', 'Atraso', 'Fornecedor', 'Status', 'Inserida por', 'Motivo / última observação']],
      body: items.map(a => {
        const det = [ctx.localLine(a), a.prioridade && a.prioridade !== 'normal' ? `Prioridade ${PRIOR[a.prioridade].toLowerCase()}` : '', a.responsavel ? `Resp.: ${a.responsavel}` : ''].filter(Boolean).join(' · ');
        const et = Array.isArray(a.etiquetas) && a.etiquetas.length ? a.etiquetas.join('\n') : '-';
        return [{content: t(a.titulo) + '\n' + t(det), titulo: t(a.titulo), det: t(det)}, t(et), `${ctx.turnoLabelDe(a)}\n${per(a)}`, diasAberto(a) ? `${diasAberto(a)} d` : (a.noite > hoje ? 'futura' : 'no prazo'), t(a.fornecedor || '-'), statusObj(a), t(nomeDe(a.criadoPor)) + (a.criadoEm && ctx.fmtTs ? '\n' + ctx.fmtTs(a.criadoEm) : ''), t([a.motivo, a.ultimaObs].filter(Boolean).join(' - ')) || '-'];
      }),
      columnStyles:{0:{cellWidth:COLW[0]}, 1:{cellWidth:COLW[1], textColor:C.muted}, 2:{cellWidth:COLW[2]}, 3:{cellWidth:COLW[3], halign:'center'}, 4:{cellWidth:COLW[4]}, 5:{cellWidth:COLW[5]}, 6:{cellWidth:COLW[6]}, 7:{cellWidth:'auto'}},
      didParseCell: d => {
        if (d.section !== 'body') return;
        if (d.column.index === 3 && /\d+ d/.test(String(d.cell.raw))){ d.cell.styles.textColor = [196,86,44]; d.cell.styles.fontStyle = 'bold'; }
        if (d.column.index === 5) statusCell(d);
        if (d.column.index === 0 && d.cell.raw && d.cell.raw.titulo){
          // título em negrito e detalhes em cinza: quebra de linha calculada aqui e desenhada em didDrawCell
          const wUtil = COLW[0] - 4;
          font('bold', 7.8); const tl = doc.splitTextToSize(d.cell.raw.titulo, wUtil);
          font('normal', 7.2); const dl = d.cell.raw.det ? doc.splitTextToSize(d.cell.raw.det, wUtil) : [];
          d.cell.raw.nTit = tl.length; d.cell.text = [...tl, ...dl];
        }
      },
      willDrawCell: d => {
        if (d.section === 'body' && d.column.index === 0 && d.cell.raw && d.cell.raw.titulo){ d.cell.raw._lines = d.cell.text; d.cell.text = []; }
      },
      didDrawCell: d => {
        if (d.section === 'body' && d.column.index === 0 && d.cell.raw && d.cell.raw._lines){
          const pos = d.cell.getTextPos(), lh = 7.8 * 1.15 * 25.4 / 72;
          d.cell.raw._lines.forEach((ln, i) => {
            if (i < d.cell.raw.nTit){ font('bold', 7.8); color(C.ink); } else { font('normal', 7.2); color(C.muted); }
            doc.text(ln, pos.x, pos.y + i * lh, {baseline:'top'});
          });
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  if (!G.length){ color(C.muted); font('italic', 10); text('Nenhuma atividade em aberto.', M, y + 4); }

  // ---------- cabeçalho das páginas seguintes e rodapé ----------
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++){
    doc.setPage(i);
    if (i > 1){
      fill(C.graf); doc.rect(0, 0, W, 14, 'F'); fill(C.laranja); doc.rect(0, 14, W, .9, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 3.8, 24, 24 * 83 / 306);
      color(C.white); font('bold', 9); text('Relatório de atividades em aberto', W - M, 6.6, {align:'right'});
      color([169,173,180]); font('normal', 7.2); text(`Obra 4107 · ${ctx.turnoLabel} · emitido em ${ctx.emitidoEm}`, W - M, 10.8, {align:'right'});
    }
    stroke(C.line); doc.setLineWidth(.2); doc.line(M, H - 10, W - M, H - 10);
    fill(C.laranja); doc.rect(M, H - 7.4, 2, 2, 'F');
    color(C.faint); font('normal', 7.2);
    text('SAENG Engenharia · Programação de Atividades · Obra 4107 Rooftop Iguatemi SP', M + 3.5, H - 5.8);
    text(`Página ${i} de ${N}`, W - M, H - 5.8, {align:'right'});
  }
  doc.save(ctx.arquivo);
}

// ======================================================================
// Calendário (Gantt) em PDF: o mesmo período, agrupamento e filtros da tela
// ======================================================================
export async function gerarGanttPDF(ctx){
  const jsPDF = await loadLibs();
  const logo = await toDataURL(ctx.logoUrl).catch(() => null);
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'landscape'});
  const W = 297, H = 210, M = 10;
  const fill = c => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const color = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);
  const fit = (s, w) => { s = t(s); if (doc.getTextWidth(s) <= w) return s; while (s.length > 1 && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1); return s.trimEnd() + '...'; };
  const hex = h => { const m = String(h).replace('#', ''); return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]; };
  const COR = {...Object.fromEntries(Object.entries(ST).map(([k, v]) => [k, v.c])), concluida:[46,160,100], cancelada:[122,133,151]};
  const NAO = ST.nao_iniciada.c, LAR = C.laranja;
  const {ini, n, hoje, G} = ctx;
  const days = Array.from({length:n}, (_, i) => ctx.addDays(ini, i));
  const di = s => ctx.nightsBetween(ini, s), ti = di(hoje);
  const we = d => { const x = ctx.parseYmd(d).getDay(); return x === 0 || x === 6; };
  const DOW = ['dom','seg','ter','qua','qui','sex','sáb'];
  const labelW = 80, gx = M + labelW, gw = W - M - gx, cw = gw / n;
  const headH = 10, rowH = 7.4, grpH = 6.4, bottom = H - 17;

  // linhas do gráfico, já paginadas
  const rows = [];
  for (const gr of G){ rows.push({k:'g', gr}); for (const a of gr.items) rows.push({k:'a', a, gr}); }
  const pages = []; let cur = null, y = 0;
  const topOf = p => p === 0 ? (ctx.filtros ? 40 : 34) : 20;
  rows.forEach(r => {
    const h = r.k === 'g' ? grpH : rowH;
    if (!cur || y + h > bottom || (r.k === 'g' && y + grpH + rowH > bottom)){ cur = {rows:[], top: topOf(pages.length)}; pages.push(cur); y = cur.top + headH; }
    // grupo que continua na página seguinte repete o título
    if (r.k === 'a' && cur.rows.length === 0){ cur.rows.push({k:'g', gr:r.gr, cont:true, y}); y += grpH; }
    cur.rows.push({...r, y}); y += h; cur.end = y;
  });

  pages.forEach((pg, pi) => {
    if (pi) doc.addPage();
    // cabeçalho
    if (pi === 0){
      fill(C.graf); doc.rect(0, 0, W, 24, 'F'); fill(LAR); doc.rect(0, 24, W, 1.2, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 7, 38, 38 * 83 / 306);
      color(C.white); font('bold', 14); text(ctx.titulo, W - M, 11, {align:'right'});
      color([169,173,180]); font('normal', 8.5); text(`${ctx.sub}  ·  ${ctx.acts.length} ${ctx.acts.length === 1 ? 'atividade' : 'atividades'}`, W - M, 17, {align:'right'});
      if (ctx.filtros){
        font('bold', 7.6); const fl = t('Filtro: ' + ctx.filtros), fw = doc.getTextWidth(fl) + 6;
        fill(mix(LAR, .85)); doc.roundedRect(M, 28.5, fw, 6, 1.5, 1.5, 'F'); color(C.laranjaTx); text(fl, M + 3, 32.6);
      }
    } else {
      fill(C.graf); doc.rect(0, 0, W, 13, 'F'); fill(LAR); doc.rect(0, 13, W, .8, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 3.6, 22, 22 * 83 / 306);
      color(C.white); font('bold', 8.6); text(ctx.titulo, W - M, 6.2, {align:'right'});
      color([169,173,180]); font('normal', 7); text(ctx.sub, W - M, 10.2, {align:'right'});
    }
    const top = pg.top, gy = top + headH, end = pg.end;
    // fundo: fins de semana e linhas dos dias
    days.forEach((d, i) => { if (we(d)){ fill([245,246,248]); doc.rect(gx + i * cw, top, cw, end - top, 'F'); } });
    stroke(C.line); doc.setLineWidth(.12);
    for (let i = 0; i <= n; i++) doc.line(gx + i * cw, top, gx + i * cw, end);
    // cabeçalho dos dias
    color(C.laranjaTx); font('bold', 7.4);
    const m1 = ctx.parseYmd(ini);
    text(ctx.mesLbl.toUpperCase(), M + 1, top + 6.6);
    days.forEach((d, i) => {
      const dt = ctx.parseYmd(d), cx = gx + i * cw + cw / 2;
      if (d === hoje){ fill(LAR); doc.circle(cx, top + 7.1, Math.min(2.2, cw / 2 - .3), 'F'); }
      color(we(d) ? C.faint : C.muted); font('normal', cw < 7 ? 4.6 : 5.4); text(cw < 7 ? DOW[dt.getDay()][0] : DOW[dt.getDay()], cx, top + 3.2, {align:'center'});
      color(d === hoje ? C.white : we(d) ? C.faint : C.ink); font('bold', cw < 7 ? 6 : 7.4); text(String(dt.getDate()), cx, top + 8.1, {align:'center'});
      if (dt.getDate() === 1 && i){ stroke(C.muted); doc.setLineWidth(.3); doc.line(gx + i * cw, top, gx + i * cw, end); }
    });
    stroke(C.line); doc.setLineWidth(.3); doc.line(M, gy, W - M, gy);
    // linhas
    pg.rows.forEach(r => {
      if (r.k === 'g'){
        const gr = r.gr, isE = gr.k.startsWith('e:');
        fill([238,240,243]); doc.rect(M, r.y, W - 2 * M, grpH, 'F');
        if (isE){ fill(hex(ctx.tagCor(gr.label))); doc.circle(M + 2.6, r.y + grpH / 2, 1.1, 'F'); }
        color(C.ink); font('bold', 7.2);
        const lab = fit((isE ? gr.label : gr.label.toUpperCase()) + (r.cont ? ' (continuação)' : ''), labelW - 18 - (isE ? 4 : 0));
        text(lab, M + (isE ? 5 : 2), r.y + 4.3);
        if (gr.sub && !r.cont){ const lw = doc.getTextWidth(lab); color(C.faint); font('normal', 6); text(fit(gr.sub, labelW - 20 - lw - (isE ? 4 : 0)), M + (isE ? 5 : 2) + lw + 2, r.y + 4.3); }
        const done = gr.items.filter(a => a.status === 'concluida').length;
        color(C.muted); font('bold', 6.4); text(`${done}/${gr.items.length}`, gx - 2, r.y + 4.3, {align:'right'});
        // barra-resumo do grupo
        const gs = Math.max(0, Math.min(...gr.items.map(a => di(a.noite))));
        const ge = Math.min(n - 1, Math.max(...gr.items.map(a => Math.max(di(ctx.fimOf(a)), a.aberta && ctx.fimOf(a) < hoje ? ti : -1))));
        if (ge >= gs){ const x0 = gx + gs * cw + .8, x1 = gx + (ge + 1) * cw - .8, yy = r.y + grpH / 2; fill([150,156,166]); doc.rect(x0, yy - .55, x1 - x0, 1.1, 'F'); doc.rect(x0, yy - .55, .6, 2, 'F'); doc.rect(x1 - .6, yy - .55, .6, 2, 'F'); }
        return;
      }
      const a = r.a, av = ctx.avOf(a), i0 = di(a.noite), i1 = di(ctx.fimOf(a)), s0 = Math.max(0, i0), e0 = Math.min(n - 1, i1), c = COR[a.status] || COR.programada;
      stroke(C.line); doc.setLineWidth(.12); doc.line(M, r.y + rowH, W - M, r.y + rowH);
      // rótulo
      let lx = M + 2;
      if (a.prioridade === 'critica' || a.prioridade === 'alta'){ fill(a.prioridade === 'critica' ? ST.impedida.c : ST.parcial.c); doc.circle(lx + .8, r.y + 2.7, .8, 'F'); lx += 2.6; }
      color(C.ink); font('bold', 6.6); text(fit(a.titulo, gx - lx - 2), lx, r.y + 3.3);
      const meta = [ctx.turnoDe(a) === 'diurno' ? 'Diurno' : 'Noturno', a.fornecedor, ctx.nomeDe(a.criadoPor)].filter(Boolean).join(' · ');
      color(C.faint); font('normal', 5.4); text(fit(meta, gx - M - 4), M + 2, r.y + 6.2);
      const bh = 4.4, by = r.y + (rowH - bh) / 2;
      // atraso: faixa até hoje
      if (a.aberta && ctx.fimOf(a) < hoje){
        const t0 = Math.max(0, i1 + 1), t1 = Math.min(n - 1, ti);
        if (t1 >= t0){
          const x0 = gx + t0 * cw - (i1 + 1 >= 0 ? .6 : -.6), w = (t1 - t0 + 1) * cw - .6;
          fill(mix(NAO, .78)); doc.rect(x0, by + .7, w, bh - 1.4, 'F');
          stroke(NAO); doc.setLineWidth(.2); doc.setLineDashPattern([.8, .6], 0); doc.rect(x0, by + .7, w, bh - 1.4, 'S'); doc.setLineDashPattern([], 0);
          const d = ctx.nightsBetween(ctx.fimOf(a), hoje);
          if (w > 8){ color(NAO.map(v => Math.round(v * .8))); font('bold', 5.2); text(`+${d}d`, x0 + w - 1, by + bh / 2 + .9, {align:'right'}); }
        }
      }
      // barra planejada com o avanço
      if (e0 >= s0){
        const x0 = gx + s0 * cw + .6, w = (e0 - s0 + 1) * cw - 1.2;
        fill(mix(c, .72)); doc.roundedRect(x0, by, w, bh, 1, 1, 'F');
        if (av > 0){ fill(c); doc.roundedRect(x0, by, Math.max(1.2, w * av / 100), bh, 1, 1, 'F'); }
        const lab = w > 34 ? `${ctx.statusLabel(a.status)} · ${av}%` : w > 8 ? `${av}%` : '';
        if (lab){ font('bold', 5.6); color(av >= 45 ? C.white : c.map(v => Math.round(v * .55))); text(lab, x0 + 1.4, by + bh / 2 + 1); }
      }
    });
    // hoje
    if (ti >= 0 && ti < n){ fill(LAR); doc.rect(gx + (ti + .5) * cw - .25, gy, .5, end - gy, 'F'); }
    // legenda
    let lx = M; const ly = H - 12.5; font('normal', 6.4);
    ['programada','andamento','parcial','nao_iniciada','impedida','concluida'].forEach(k => {
      fill(COR[k]); doc.roundedRect(lx, ly - 2, 5, 2.4, .6, .6, 'F'); color(C.muted);
      const lab = {programada:'Programada', andamento:'Em andamento', parcial:'Parcial', nao_iniciada:'Não iniciada', impedida:'Impedida', concluida:'Concluída'}[k];
      text(lab, lx + 6.2, ly); lx += 8 + doc.getTextWidth(t(lab)) + 3;
    });
    fill(mix(NAO, .78)); doc.rect(lx, ly - 2, 5, 2.4, 'F'); stroke(NAO); doc.setLineWidth(.2); doc.setLineDashPattern([.8, .6], 0); doc.rect(lx, ly - 2, 5, 2.4, 'S'); doc.setLineDashPattern([], 0);
    color(C.muted); text('Atraso (até hoje)', lx + 6.2, ly); lx += 8 + doc.getTextWidth('Atraso (até hoje)') + 3;
    fill(LAR); doc.rect(lx + 2, ly - 2.6, .6, 3.4, 'F'); text('Hoje', lx + 4, ly); lx += 14;
    color(C.faint); text('Parte escura da barra = avanço executado.', lx, ly);
  });
  // rodapé
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++){
    doc.setPage(i);
    stroke(C.line); doc.setLineWidth(.2); doc.line(M, H - 8.5, W - M, H - 8.5);
    color(C.faint); font('normal', 6.8);
    text(`SAENG Engenharia · Programação de Atividades · Obra 4107 Rooftop Iguatemi SP · emitido em ${ctx.emitidoEm} por ${ctx.emitidoPor}`, M, H - 4.8);
    text(`Página ${i} de ${N}`, W - M, H - 4.8, {align:'right'});
  }
  doc.save(ctx.arquivo);
}
