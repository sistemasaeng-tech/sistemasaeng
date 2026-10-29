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
    if (ctx.grupoDe){ ({k, label, sub, rank} = ctx.grupoDe(a)); if (k.startsWith('z:')){ label = sub || 'Shopping'; sub = 'Shopping'; } }
    else if (a.tipoLocal === 'setor'){ const i = ctx.setores.findIndex(s => s.codigo === a.setor); k = 's:' + a.setor; label = `Setor ${a.setor || '?'}`; sub = (ctx.setores[i] || {}).descricao || ''; rank = i < 0 ? 500 : i; }
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
      head:[['Atividade', 'Etiqueta', 'Turno / período', 'Atraso', 'Fornecedor', 'Status', 'Dono', 'Motivo / última observação']],
      body: items.map(a => {
        const det = [ctx.localLine(a), a.prioridade && a.prioridade !== 'normal' ? `Prioridade ${PRIOR[a.prioridade].toLowerCase()}` : '', a.responsavel ? `Resp.: ${a.responsavel}` : ''].filter(Boolean).join(' · ');
        const et = Array.isArray(a.etiquetas) && a.etiquetas.length ? a.etiquetas.join('\n') : '-';
        return [{content: t(a.titulo) + '\n' + t(det), titulo: t(a.titulo), det: t(det)}, t(et), `${ctx.turnoLabelDe(a)}\n${per(a)}`, diasAberto(a) ? `${diasAberto(a)} d` : (a.noite > hoje ? 'futura' : 'no prazo'), t(a.fornecedor || '-'), statusObj(a), t(nomeDe(a.dono || a.criadoPor)) + (a.criadoEm && ctx.fmtTs ? '\n' + ctx.fmtTs(a.criadoEm) : ''), t([a.motivo, a.ultimaObs].filter(Boolean).join(' - ')) || '-'];
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
  // período longo: um bloco de até 31 dias por página
  const partes = ctx.partes && ctx.partes.length ? ctx.partes : [ctx];
  partes.forEach((p, i) => desenharGantt(doc, {...p, emitidoEm: ctx.emitidoEm, emitidoPor: ctx.emitidoPor}, logo, i === 0));
  rodapeGantt(doc, ctx);
  doc.save(ctx.arquivo);
}
// rodapé das páginas em paisagem (calendário)
function rodapeGantt(doc, ctx, so = null){
  const W = 297, H = 210, M = 10, N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++){
    if (so && !so.has(i)) continue;
    doc.setPage(i);
    doc.setDrawColor(C.line[0], C.line[1], C.line[2]); doc.setLineWidth(.2); doc.line(M, H - 8.5, W - M, H - 8.5);
    doc.setTextColor(C.faint[0], C.faint[1], C.faint[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text(t(`SAENG Engenharia · Programação de Atividades · Obra 4107 Rooftop Iguatemi SP · emitido em ${ctx.emitidoEm} por ${ctx.emitidoPor}`), M, H - 4.8);
    doc.text(t(`Página ${i} de ${N}`), W - M, H - 4.8, {align:'right'});
  }
}
// desenha o calendário (uma ou mais páginas em paisagem); devolve os números das páginas usadas
function desenharGantt(doc, ctx, logo, primeiraNaPaginaAtual){
  const usadas = [];
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
  let lastP = '';
  for (const gr of G){
    if (gr.parent && gr.parent !== lastP){ const kids = G.filter(x => x.parent === gr.parent); rows.push({k:'p', name:gr.parent, kids}); }
    lastP = gr.parent || '';
    rows.push({k:'g', gr}); for (const a of gr.items) rows.push({k:'a', a, gr});
  }
  const pages = []; let cur = null, y = 0;
  const topOf = p => p === 0 ? (ctx.filtros ? 40 : 34) : 20;
  rows.forEach(r => {
    const h = r.k === 'a' ? rowH : grpH;
    if (!cur || y + h > bottom || (r.k !== 'a' && y + grpH * (r.k === 'p' ? 2 : 1) + rowH > bottom)){ cur = {rows:[], top: topOf(pages.length)}; pages.push(cur); y = cur.top + headH; }
    // grupo que continua na página seguinte repete o título
    if (r.k === 'a' && cur.rows.length === 0){ cur.rows.push({k:'g', gr:r.gr, cont:true, y}); y += grpH; }
    cur.rows.push({...r, y}); y += h; cur.end = y;
  });

  pages.forEach((pg, pi) => {
    if (pi || !primeiraNaPaginaAtual) doc.addPage('a4', 'landscape');
    usadas.push(doc.getNumberOfPages());
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
    const spanOf = items => [Math.max(0, Math.min(...items.map(a => di(a.noite)))), Math.min(n - 1, Math.max(...items.map(a => Math.max(di(ctx.fimOf(a)), a.aberta && ctx.fimOf(a) < hoje ? ti : -1))))];
    pg.rows.forEach(r => {
      if (r.k === 'p'){
        const all_ = r.kids.flatMap(x => x.items), [ps, pe] = spanOf(all_);
        fill([222,225,230]); doc.rect(M, r.y, W - 2 * M, grpH, 'F');
        color(C.ink); font('bold', 7.6); text(r.name.toUpperCase(), M + 2, r.y + 4.4);
        const lw = doc.getTextWidth(t(r.name.toUpperCase()));
        color(C.muted); font('normal', 6); text(`${r.kids.length} ${r.kids.length === 1 ? 'pilar' : 'pilares'}`, M + 4 + lw, r.y + 4.4);
        color(C.muted); font('bold', 6.4); text(`${all_.filter(a => a.status === 'concluida').length}/${all_.length}`, gx - 2, r.y + 4.4, {align:'right'});
        if (pe >= ps){ const x0 = gx + ps * cw + .8, x1 = gx + (pe + 1) * cw - .8, yy = r.y + grpH / 2; fill([110,116,126]); doc.rect(x0, yy - .8, x1 - x0, 1.6, 'F'); }
        return;
      }
      if (r.k === 'g'){
        const gr = r.gr, isE = gr.k.startsWith('e:');
        fill([238,240,243]); doc.rect(M, r.y, W - 2 * M, grpH, 'F');
        if (isE){ fill(hex(ctx.tagCor(gr.label))); doc.circle(M + 2.6, r.y + grpH / 2, 1.1, 'F'); }
        color(C.ink); font('bold', 7.2);
        const lab = fit((isE ? gr.label : gr.label.toUpperCase()) + (r.cont ? ' (continuação)' : ''), labelW - 18 - (isE ? 4 : 0));
        const ind = (isE ? 5 : 2) + (gr.parent ? 4 : 0);
        text(lab, M + ind, r.y + 4.3);
        if (gr.sub && !r.cont){ const lw = doc.getTextWidth(lab); color(C.faint); font('normal', 6); text(fit(gr.sub, labelW - 18 - lw - ind), M + ind + lw + 2, r.y + 4.3); }
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
      const ix = r.gr && r.gr.parent ? 4 : 0;
      let lx = M + 2 + ix;
      if (a.prioridade === 'critica' || a.prioridade === 'alta'){ fill(a.prioridade === 'critica' ? ST.impedida.c : ST.parcial.c); doc.circle(lx + .8, r.y + 2.7, .8, 'F'); lx += 2.6; }
      color(C.ink); font('bold', 6.6); text(fit(a.titulo, gx - lx - 2), lx, r.y + 3.3);
      const meta = [ctx.lojaDe ? ctx.lojaDe(a) : '', ctx.turnoDe(a) === 'diurno' ? 'Diurno' : 'Noturno', a.fornecedor, ctx.nomeDe(a.dono || a.criadoPor)].filter(Boolean).join(' · ');
      color(C.faint); font('normal', 5.4); text(fit(meta, gx - M - 4 - ix), M + 2 + ix, r.y + 6.2);
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
  return usadas;
}

// ======================================================================
// Ficha de atividade (dados, fotos e histórico) — usada no PDF de uma atividade
// e, repetida por atividade, no PDF de um local (setor, pilar ou loja)
// ======================================================================
const STC = {programada:[79,111,153], andamento:[27,132,170], parcial:[201,160,30], nao_iniciada:[196,86,44], impedida:[184,50,76], concluida:[46,150,96], cancelada:[122,133,151]};
const PG = {W:210, H:297, M:14, TOP:22, BOT:297 - 16};
function kit(doc){
  const fill = c => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const color = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);
  const wrap = (s, w) => doc.splitTextToSize(t(s), w);
  return {fill, stroke, color, font, text, wrap};
}
// desenha a ficha a partir de st.y; devolve o y final
function fichaAtividade(doc, ctx, st, opt = {}){
  const {fill, stroke, color, font, text, wrap} = kit(doc), {W, M, TOP, BOT} = PG, CW = W - 2*M;
  let y = st.y;
  const novaPagina = () => { doc.addPage('a4', 'portrait'); y = TOP + 6; };
  const garante = h => { if (y + h > BOT) novaPagina(); };
  const secao = (titulo, extra) => {
    garante(14); y += 3;
    fill(C.laranja); doc.rect(M, y - 3.6, 1.6, 4.6, 'F');
    color(C.ink); font('bold', 11.5); text(titulo, M + 4, y); const tw = doc.getTextWidth(t(titulo));
    if (extra){ color(C.faint); font('normal', 8.5); text(extra, M + 4 + tw + 3, y); }
    y += 5;
  };
  if (opt.rotulo){ color(C.laranjaTx); font('bold', 8); text(opt.rotulo.toUpperCase(), M, y); y += 5.5; }
  color(C.ink); font('bold', 16);
  for (const l of wrap(ctx.titulo, CW)){ doc.text(l, M, y); y += 6.6; }
  y += 1;
  const sc = STC[ctx.status] || C.graf, sl = t(ctx.statusLabel);
  font('bold', 8.6); const pw = doc.getTextWidth(sl) + 8;
  fill(mix(sc, .84)); doc.roundedRect(M, y - 4.4, pw, 6.6, 3.3, 3.3, 'F'); fill(sc); doc.circle(M + 3.2, y - 1.1, 1.05, 'F');
  color(sc); text(sl, M + 5.4, y);
  const bx = M + pw + 8, bw = 60;
  color(C.muted); font('bold', 8.6); text('Avanço', bx, y);
  const bx2 = bx + 14; fill(C.soft); doc.roundedRect(bx2, y - 3, bw, 3.6, 1.8, 1.8, 'F');
  if (ctx.avanco > 0){ fill(C.laranja); doc.roundedRect(bx2, y - 3, Math.max(3.6, bw * ctx.avanco / 100), 3.6, 1.8, 1.8, 'F'); }
  color(C.ink); font('bold', 9.5); text(`${ctx.avanco}%`, bx2 + bw + 3, y);
  y += 8;
  // informações (2 colunas)
  stroke(C.line); doc.setLineWidth(.25);
  const colW = (CW - 8) / 2, rows = [];
  for (let i = 0; i < ctx.info.length; i += 2) rows.push([ctx.info[i], ctx.info[i + 1]]);
  font('normal', 9);
  const altLinha = par => Math.max(...par.filter(Boolean).map(([k, v]) => 4.2 + wrap(v, colW - 6).length * 4.4)) + 3;
  const totalH = rows.reduce((s2, r) => s2 + altLinha(r), 0) + 4;
  garante(totalH);
  const y0 = y; fill(C.soft); doc.roundedRect(M, y, CW, totalH, 2.5, 2.5, 'F');
  y += 6;
  for (const par of rows){
    const h = altLinha(par);
    par.forEach((kv, j) => { if (!kv) return; const x = M + 4 + j * (colW + 8);
      color(C.faint); font('bold', 7); text(kv[0].toUpperCase(), x, y);
      color(C.ink); font('normal', 9); let yy = y + 4.4; for (const l of wrap(kv[1], colW - 6)){ doc.text(l, x, yy); yy += 4.4; } });
    y += h;
  }
  y = y0 + totalH + 6;
  const bloco = (titulo, corpo, cor) => {
    if (!corpo) return;
    font('normal', 9.2); const ls = wrap(corpo, CW - 10), h = 8 + ls.length * 4.6;
    garante(h + 2);
    fill(cor ? mix(cor, .9) : C.white); stroke(cor ? mix(cor, .55) : C.line); doc.roundedRect(M, y, CW, h, 2, 2, 'FD');
    color(cor || C.faint); font('bold', 7); text(titulo.toUpperCase(), M + 5, y + 5);
    color(C.ink); font('normal', 9.2); let yy = y + 9.6; for (const l of ls){ doc.text(l, M + 5, yy); yy += 4.6; }
    y += h + 4;
  };
  bloco('Detalhes / orientações para a equipe', ctx.detalhes);
  bloco('Motivo', ctx.motivo, STC.nao_iniciada);
  bloco('Última observação', ctx.obs);
  if (opt.fotos !== false){
    if (ctx.fotos.length) garante((CW - 6) / 2 * .72 + 26); // título junto com a 1ª linha de fotos
    secao('Fotos', ctx.fotos.length ? `${ctx.fotos.length} ${ctx.fotos.length === 1 ? 'registro' : 'registros'}` : 'nenhuma foto registrada');
    if (ctx.fotos.length){
      const gap = 6, fw = (CW - gap) / 2, fh = fw * .72;
      for (let i = 0; i < ctx.fotos.length; i += 2){
        const par = ctx.fotos.slice(i, i + 2);
        font('bold', 8.4);
        const capH = Math.max(...par.map(f => { font('bold', 8.4); const a = f.legenda ? wrap(f.legenda, fw).length * 3.8 : 0; font('normal', 7.8); const b = f.obs ? wrap(f.obs, fw).length * 3.5 + 1 : 0; return a + b + 4.4; }));
        garante(fh + capH + 4);
        par.forEach((f, j) => {
          const x = M + j * (fw + gap);
          fill(C.soft); doc.roundedRect(x, y, fw, fh, 1.8, 1.8, 'F');
          try {
            const r = Math.min(fw / (f.w || 4), fh / (f.h || 3)), iw = (f.w || 4) * r, ih = (f.h || 3) * r;
            doc.addImage(f.img, 'JPEG', x + (fw - iw) / 2, y + (fh - ih) / 2, iw, ih, undefined, 'FAST');
          } catch (e) { color(C.faint); font('normal', 8); text('imagem indisponível', x + fw / 2, y + fh / 2, {align:'center'}); }
          let yy = y + fh + 4.2;
          if (f.legenda){ color(C.ink); font('bold', 8.4); for (const l of wrap(f.legenda, fw)){ doc.text(l, x, yy); yy += 3.8; } }
          if (f.obs){ color(C.muted); font('normal', 7.8); for (const l of wrap(f.obs, fw)){ doc.text(l, x, yy); yy += 3.5; } yy += 1; }
          color(C.faint); font('normal', 7.4); text(f.sub, x, yy);
        });
        y += fh + capH + 6;
      }
    }
  }
  if (opt.hist !== false){
    if (ctx.hist.length) garante(34); // título junto com as primeiras linhas
    secao('Histórico', `${ctx.hist.length} ${ctx.hist.length === 1 ? 'registro' : 'registros'}`);
    if (ctx.hist.length){
      doc.autoTable({
        startY: y, margin:{left:M, right:M, top:TOP + 4, bottom:PG.H - BOT + 2},
        head:[['Data / hora', 'Quem', 'Registro']],
        body: ctx.hist.map(h => [t(h.quando), t(h.quem), t(h.texto)]),
        styles:{font:'helvetica', fontSize:8.2, cellPadding:{top:2.2, bottom:2.2, left:2.4, right:2.4}, textColor:C.ink, lineColor:C.line, lineWidth:.15, valign:'top'},
        headStyles:{fillColor:C.graf, textColor:C.white, fontStyle:'bold', fontSize:8},
        alternateRowStyles:{fillColor:[250,250,251]},
        columnStyles:{0:{cellWidth:26, textColor:C.muted}, 1:{cellWidth:38, fontStyle:'bold'}, 2:{cellWidth:'auto'}},
      });
      y = doc.lastAutoTable.finalY + 6;
    }
  }
  return y;
}
function cabecalhoRodape(doc, logo, tituloPg1, linhaPgN, emitidoEm, pular = new Set()){
  const {fill, stroke, color, font, text, wrap} = kit(doc), {W, H, M} = PG;
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++){
    if (pular.has(i)) continue;
    doc.setPage(i);
    if (i > 1){
      fill(C.graf); doc.rect(0, 0, W, 14, 'F'); fill(C.laranja); doc.rect(0, 14, W, .9, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 3.8, 24, 24 * 83 / 306);
      color(C.white); font('bold', 8.6); const ls = wrap(tituloPg1, 120); text(ls[0] + (ls.length > 1 ? '...' : ''), W - M, 6.6, {align:'right'});
      color([169,173,180]); font('normal', 7); text(`${linhaPgN} · emitido em ${emitidoEm}`, W - M, 10.8, {align:'right'});
    }
    stroke(C.line); doc.setLineWidth(.2); doc.line(M, H - 10, W - M, H - 10);
    fill(C.laranja); doc.rect(M, H - 7.4, 2, 2, 'F');
    color(C.faint); font('normal', 7.2);
    text('SAENG Engenharia · Programação de Atividades · Obra 4107 Rooftop Iguatemi SP', M + 3.5, H - 5.8);
    text(`Página ${i} de ${N}`, W - M, H - 5.8, {align:'right'});
  }
}
function capa(doc, logo, titulo, emitidoEm, emitidoPor){
  const {fill, color, font, text} = kit(doc), {W, M} = PG;
  fill(C.graf); doc.rect(0, 0, W, 30, 'F'); fill(C.laranja); doc.rect(0, 30, W, 1.3, 'F');
  if (logo) doc.addImage(logo, 'PNG', M, 9.5, 40, 40 * 83 / 306);
  color(C.white); font('bold', 13.5); text(titulo, W - M, 14, {align:'right'});
  color([169,173,180]); font('normal', 8.2); text('Obra 4107 · Rooftop Iguatemi SP', W - M, 19.5, {align:'right'});
  text(`Emitido em ${emitidoEm} por ${emitidoPor}`, W - M, 24, {align:'right'});
}
export async function gerarAtividadePDF(ctx){
  const jsPDF = await loadLibs();
  const logo = await toDataURL(ctx.logoUrl).catch(() => null);
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'portrait'});
  capa(doc, logo, 'Relatório da atividade', ctx.emitidoEm, ctx.emitidoPor);
  fichaAtividade(doc, ctx, {y:42});
  cabecalhoRodape(doc, logo, ctx.titulo, 'Relatório da atividade', ctx.emitidoEm);
  doc.save(ctx.arquivo);
}
// PDF de um local: capa com resumo e lista, depois uma ficha por atividade (cada uma começa numa página)
export async function gerarLocalPDF(ctx){
  const jsPDF = await loadLibs();
  const logo = await toDataURL(ctx.logoUrl).catch(() => null);
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'portrait'});
  const {fill, color, font, text, wrap} = kit(doc), {W, M, TOP} = PG, CW = W - 2*M;
  capa(doc, logo, ctx.tituloCapa || 'Relatório do local', ctx.emitidoEm, ctx.emitidoPor);
  let y = 42;
  color(C.laranjaTx); font('bold', 8); text(ctx.tipo.toUpperCase(), M, y); y += 7;
  color(C.ink); font('bold', 20); for (const l of wrap(ctx.nome, CW)){ doc.text(l, M, y); y += 8; }
  if (ctx.sub){ color(C.muted); font('normal', 10); for (const l of wrap(ctx.sub, CW)){ doc.text(l, M, y); y += 5; } }
  color(C.faint); font('normal', 8.4); text(ctx.escopo, M, y + 1); y += 9;
  // indicadores
  const k = ctx.kpis, kw = (CW - 4 * 4) / 5;
  k.forEach((x, i) => { const xx = M + i * (kw + 4);
    fill(C.soft); doc.roundedRect(xx, y, kw, 17, 2, 2, 'F');
    color(C.faint); font('bold', 6.8); text(x[0].toUpperCase(), xx + 4, y + 5.5);
    color(x[2] || C.ink); font('bold', 15); text(String(x[1]), xx + 4, y + 13.4); });
  y += 24;
  // lista das atividades
  fill(C.laranja); doc.rect(M, y - 3.6, 1.6, 4.6, 'F'); color(C.ink); font('bold', 11.5); text('Atividades deste relatório', M + 4, y); y += 4;
  doc.autoTable({
    startY: y, margin:{left:M, right:M, top:TOP + 4, bottom:20},
    head:[['#', 'Atividade', 'Período', 'Status', 'Avanço', 'Fornecedor', 'Fotos']],
    body: ctx.itens.map((a, i) => [String(i + 1), t(a.titulo), t(a.periodo), t(a.statusLabel), `${a.avanco}%`, t(a.fornecedor), String(a.fotos)]),
    styles:{font:'helvetica', fontSize:8, cellPadding:{top:2, bottom:2, left:2.2, right:2.2}, textColor:C.ink, lineColor:C.line, lineWidth:.15, valign:'top'},
    headStyles:{fillColor:C.graf, textColor:C.white, fontStyle:'bold', fontSize:7.8},
    alternateRowStyles:{fillColor:[250,250,251]},
    columnStyles:{0:{cellWidth:8, textColor:C.muted}, 1:{cellWidth:'auto', fontStyle:'bold'}, 2:{cellWidth:28}, 3:{cellWidth:24}, 4:{cellWidth:15, halign:'right'}, 5:{cellWidth:32}, 6:{cellWidth:12, halign:'right'}},
    didParseCell: d => { if (d.section === 'body' && d.column.index === 3){ const c = STC[ctx.itens[d.row.index].status]; if (c) d.cell.styles.textColor = c; } },
  });
  // fichas
  // calendário (paisagem), um bloco por período
  const paisagem = new Set();
  for (const g of (ctx.gantts || [])) for (const pg of desenharGantt(doc, {...g, emitidoEm: ctx.emitidoEm, emitidoPor: ctx.emitidoPor}, logo, false)) paisagem.add(pg);
  // fichas: a primeira começa numa página nova; as seguintes continuam na mesma página se couber o começo da ficha
  let yf = null;
  ctx.fichas.forEach((f, i) => {
    if (yf === null || yf > PG.BOT - 95){ doc.addPage('a4', 'portrait'); yf = TOP + 8; }
    else { doc.setDrawColor(C.line[0], C.line[1], C.line[2]); doc.setLineWidth(.4); doc.line(M, yf + 2, W - M, yf + 2); yf += 12; }
    yf = fichaAtividade(doc, f, {y: yf}, {rotulo:`Atividade ${i + 1} de ${ctx.fichas.length} · ${ctx.nome}`, fotos: ctx.comFotos, hist: ctx.comHist});
  });
  cabecalhoRodape(doc, logo, ctx.nome, ctx.tituloCapa || 'Relatório do local', ctx.emitidoEm, paisagem);
  if (paisagem.size) rodapeGantt(doc, {emitidoEm: ctx.emitidoEm, emitidoPor: ctx.emitidoPor}, paisagem);
  doc.save(ctx.arquivo);
}
