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
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'portrait'});
  const W = 210, H = 297, M = 14, CW = W - 2*M;
  const fill = c => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const color = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const text = (s, x, y, o) => doc.text(t(s), x, y, o);

  const acts = ctx.acts;
  const hoje = ctx.hoje;
  const diasAberto = a => a.noite < hoje ? ctx.diasEntre(a.noite, hoje) : 0;

  // ---------- agrupamento por frente ----------
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
  const atrasadas = acts.filter(a => a.noite < hoje).length;
  const criticas = acts.filter(a => a.prioridade === 'critica').length;
  const altas = acts.filter(a => a.prioridade === 'alta').length;

  // ---------- cabeçalho da primeira página ----------
  fill(C.graf); doc.rect(0, 0, W, 38, 'F');
  fill(C.laranja); doc.rect(0, 38, W, 1.6, 'F');
  if (logo) doc.addImage(logo, 'PNG', M, 11, 44, 44 * 83 / 306);
  color(C.white); font('bold', 15); text('Relatório de atividades em aberto', W - M, 17, {align:'right'});
  color([169,173,180]); font('normal', 9.5); text('Obra 4107 · Rooftop Iguatemi SP · Programação de Atividades', W - M, 23.5, {align:'right'});
  text(`Emitido em ${ctx.emitidoEm} por ${ctx.emitidoPor}`, W - M, 29, {align:'right'});

  let y = 48;
  color(C.ink); font('bold', 20); text(`${acts.length} ${acts.length === 1 ? 'atividade' : 'atividades'} em aberto`, M, y);
  color(C.muted); font('normal', 9.5);
  text(`${ctx.turnoLabel} · situação em ${ctx.hojeLabel} · não inclui atividades concluídas nem canceladas`, M, y + 6);

  // ---------- indicadores ----------
  y += 12;
  const kpis = [
    ['Em aberto', acts.length, C.graf],
    ['Programadas', cnt.programada, ST.programada.c],
    ['Em andamento', cnt.andamento, ST.andamento.c],
    ['Parciais', cnt.parcial, ST.parcial.c],
    ['Não iniciadas', cnt.nao_iniciada, ST.nao_iniciada.c],
    ['Impedidas', cnt.impedida, ST.impedida.c],
  ];
  const kw = (CW - 5*3.5) / 6, kh = 22;
  kpis.forEach(([lab, n, c], i) => {
    const x = M + i * (kw + 3.5);
    fill(C.soft); doc.roundedRect(x, y, kw, kh, 2, 2, 'F');
    fill(c); doc.rect(x, y, kw, 1.4, 'F');
    color(C.ink); font('bold', 18); text(String(n), x + 4, y + 12);
    color(C.muted); font('normal', 7.8); text(lab, x + 4, y + 18);
  });
  y += kh + 5;
  // faixa de alerta
  fill(mix(C.laranja, .86)); doc.roundedRect(M, y, CW, 9, 2, 2, 'F');
  fill(C.laranja); doc.rect(M, y, 1.4, 9, 'F');
  color(C.laranjaTx); font('bold', 9);
  const pct = acts.length ? Math.round(atrasadas / acts.length * 100) : 0;
  text(`${atrasadas} ${atrasadas === 1 ? 'atividade atrasada' : 'atividades atrasadas'} (${pct}% do total, data anterior a hoje)   ·   ${criticas} de prioridade crítica   ·   ${altas} de prioridade alta`, M + 5, y + 5.9);
  y += 15;

  // ---------- gráfico 1: por frente (barras empilhadas) ----------
  const chartTitle = (s, x, yy) => { color(C.ink); font('bold', 10.5); text(s, x, yy); };
  const leftW = 112, rightX = M + leftW + 8, rightW = CW - leftW - 8;
  chartTitle('Atividades em aberto por setor', M, y);
  chartTitle('Distribuição por status', rightX, y);
  let cy = y + 6;
  const rows = G.map(g => ({label: g.label, by: ORDER.map(k => g.items.filter(a => a.status === k).length), total: g.items.length}));
  const maxT = Math.max(1, ...rows.map(r => r.total));
  const labW = 22, barMax = leftW - labW - 10;
  const rowH = Math.min(7.5, Math.max(4.6, 78 / Math.max(rows.length, 1)));
  rows.forEach((r, i) => {
    const ry = cy + i * rowH;
    color(C.muted); font('normal', 8); text(r.label, M, ry + rowH * .62);
    fill(C.soft); doc.rect(M + labW, ry + rowH * .18, barMax, rowH * .64, 'F');
    let x = M + labW;
    r.by.forEach((n, j) => { if (!n) return; const w = n / maxT * barMax; fill(ST[ORDER[j]].c); doc.rect(x, ry + rowH * .18, w, rowH * .64, 'F'); x += w; });
    color(C.ink); font('bold', 8); text(String(r.total), x + 1.6, ry + rowH * .62);
  });
  const barsEnd = cy + rows.length * rowH;
  // legenda
  let lx = M, ly = barsEnd + 4;
  font('normal', 7.2);
  ORDER.forEach(k => { const w = doc.getTextWidth(t(ST[k].label)) + 7; if (lx + w > M + leftW){ lx = M; ly += 4.5; } fill(ST[k].c); doc.rect(lx, ly - 2.3, 2.6, 2.6, 'F'); color(C.muted); text(ST[k].label, lx + 3.6, ly); lx += w + 2; });
  const leftEnd = ly + 2;

  // ---------- gráfico 2: rosca por status ----------
  const cx = rightX + rightW / 2, ccy = cy + 23, R = 19, r0 = 11.5;
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
  color(C.ink); font('bold', 15); text(String(acts.length), cx, ccy + 1.5, {align:'center'});
  color(C.muted); font('normal', 6.8); text('em aberto', cx, ccy + 5.4, {align:'center'});
  let dy = ccy + R + 6;
  ORDER.forEach(k => {
    fill(ST[k].c); doc.rect(rightX + 2, dy - 2.4, 2.6, 2.6, 'F');
    color(C.ink); font('normal', 8); text(ST[k].label, rightX + 6.5, dy);
    font('bold', 8); text(`${cnt[k]}  (${acts.length ? Math.round(cnt[k] / acts.length * 100) : 0}%)`, rightX + rightW - 1, dy, {align:'right'});
    dy += 4.6;
  });
  y = Math.max(leftEnd, dy) + 6;

  // ---------- gráfico 3: tempo em aberto  |  gráfico 4: motivos ----------
  const half = (CW - 8) / 2;
  chartTitle('Há quanto tempo estão em aberto', M, y);
  chartTitle('Motivos de não início e impedimento', M + half + 8, y);
  const buckets = [['Hoje ou futuras', a => diasAberto(a) === 0], ['1 a 2 dias', a => { const d = diasAberto(a); return d >= 1 && d <= 2; }], ['3 a 7 dias', a => { const d = diasAberto(a); return d >= 3 && d <= 7; }], ['Mais de 7 dias', a => diasAberto(a) > 7]];
  const bcol = [[120,128,140], [246,167,33], [214,110,40], [184,50,76]];
  const bv = buckets.map(([, f]) => acts.filter(f).length), bmax = Math.max(1, ...bv);
  const chH = 34, by0 = y + 6 + chH, bw = (half - 8) / 4;
  stroke(C.line); doc.setLineWidth(.2); doc.line(M, by0, M + half, by0);
  bv.forEach((n, i) => {
    const h = n / bmax * (chH - 7), x = M + 2 + i * (bw + 2);
    fill(bcol[i]); doc.rect(x, by0 - h, bw - 2, h, 'F');
    color(C.ink); font('bold', 9); text(String(n), x + (bw - 2) / 2, by0 - h - 1.5, {align:'center'});
    color(C.muted); font('normal', 7); text(buckets[i][0], x + (bw - 2) / 2, by0 + 4, {align:'center'});
  });
  const mot = {}; acts.filter(a => a.motivo && (a.status === 'nao_iniciada' || a.status === 'impedida')).forEach(a => { mot[a.motivo] = (mot[a.motivo] || 0) + 1; });
  const motL = Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mx = M + half + 8;
  if (!motL.length){ color(C.faint); font('italic', 8.5); text('Nenhuma atividade não iniciada ou impedida.', mx, y + 14); }
  else {
    const mmax = Math.max(...motL.map(m => m[1])), mrh = Math.min(6.2, chH / motL.length);
    motL.forEach(([m, n], i) => {
      const ry = y + 6 + i * mrh;
      color(C.muted); font('normal', 7.4); text(doc.splitTextToSize(t(m), 44)[0], mx, ry + mrh * .62);
      const bwm = (half - 52) * n / mmax; fill(ST.impedida.c); doc.rect(mx + 45, ry + mrh * .2, Math.max(bwm, .8), mrh * .6, 'F');
      color(C.ink); font('bold', 7.6); text(String(n), mx + 46 + bwm + .8, ry + mrh * .62);
    });
  }
  y = by0 + 10;

  // ---------- pontos de atenção ----------
  const atencao = acts.filter(a => a.status === 'impedida' || a.status === 'nao_iniciada' || a.prioridade === 'critica')
    .sort((a, b) => (b.prioridade === 'critica') - (a.prioridade === 'critica') || diasAberto(b) - diasAberto(a)).slice(0, 8);
  const statusCell = (data) => {
    const k = data.cell.raw && data.cell.raw.status;
    if (k && ST[k]){ data.cell.styles.fillColor = mix(ST[k].c, .85); data.cell.styles.textColor = ST[k].c.map(v => Math.round(v * .78)); data.cell.styles.fontStyle = 'bold'; }
  };
  const statusObj = a => ({content: t(ST[a.status]?.label || a.status), status: a.status});
  const tblBase = {
    theme:'plain', margin:{left:M, right:M, top:24, bottom:16},
    styles:{font:'helvetica', fontSize:7.6, cellPadding:{top:1.8, bottom:1.8, left:1.8, right:1.8}, textColor:C.ink, lineColor:C.line, lineWidth:{bottom:.15}, valign:'top', overflow:'linebreak'},
    headStyles:{fillColor:C.graf, textColor:C.white, fontStyle:'bold', fontSize:7.4, lineWidth:0},
    alternateRowStyles:{fillColor:[250,250,251]},
  };
  if (atencao.length){
    if (y > H - 42){ doc.addPage(); y = 28; }
    chartTitle('Pontos de atenção', M, y);
    color(C.muted); font('normal', 8); text('Impedidas, não iniciadas e de prioridade crítica, das mais antigas para as mais recentes.', M, y + 4.6);
    doc.autoTable({...tblBase, startY: y + 7,
      head:[['Atividade', 'Local', 'Data', 'Dias', 'Status', 'Motivo / observação']],
      body: atencao.map(a => [t(a.titulo) + (a.prioridade === 'critica' ? '\n[Prioridade crítica]' : ''), t(ctx.localLine(a)), `${ctx.fmtShort(a.noite)}\n${ctx.turnoLabelDe(a)}`, diasAberto(a) ? String(diasAberto(a)) : '-', statusObj(a), t([a.motivo, a.ultimaObs].filter(Boolean).join(' - ')) || '-']),
      columnStyles:{0:{cellWidth:46, fontStyle:'bold'}, 1:{cellWidth:32}, 2:{cellWidth:17}, 3:{cellWidth:10, halign:'center'}, 4:{cellWidth:22}, 5:{cellWidth:'auto'}},
      didParseCell: d => { if (d.section === 'body' && d.column.index === 4) statusCell(d); },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ---------- detalhamento por setor ----------
  doc.addPage(); y = 28;
  color(C.ink); font('bold', 15); text('Detalhamento por setor', M, y);
  color(C.muted); font('normal', 8.5); text('Atividades em aberto agrupadas por frente, ordenadas por prioridade e status.', M, y + 5.5);
  y += 12;
  const prRank = p => p === 'critica' ? 0 : p === 'alta' ? 1 : 2;
  for (const g of G){
    if (y > H - 50){ doc.addPage(); y = 28; }
    // cabeçalho do setor
    fill(C.soft); doc.roundedRect(M, y, CW, 13, 2, 2, 'F');
    fill(C.laranja); doc.rect(M, y, 1.6, 13, 'F');
    color(C.ink); font('bold', 11.5); text(g.label, M + 5, y + 5.6);
    color(C.muted); font('normal', 7.8); text(doc.splitTextToSize(t(g.sub), 100)[0] || '', M + 5, y + 10.2);
    // mini contadores à direita
    let px = W - M - 3;
    [...ORDER].reverse().forEach(k => {
      const n = g.items.filter(a => a.status === k).length; if (!n) return;
      const lab = `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`; font('bold', 7); const w = doc.getTextWidth(t(lab)) + 5;
      px -= w; fill(mix(ST[k].c, .82)); doc.roundedRect(px, y + 4.2, w, 5, 1.2, 1.2, 'F');
      color(ST[k].c.map(v => Math.round(v * .78))); text(lab, px + 2.5, y + 7.65); px -= 1.6;
    });
    y += 15;
    const items = [...g.items].sort((a, b) => prRank(a.prioridade) - prRank(b.prioridade) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || String(a.noite).localeCompare(String(b.noite)));
    doc.autoTable({...tblBase, startY: y,
      head:[['Atividade', 'Turno / data', 'Dias', 'Fornecedor', 'Status', 'Última observação']],
      body: items.map(a => {
        const det = [ctx.localLine(a), a.prioridade && a.prioridade !== 'normal' ? `Prioridade ${PRIOR[a.prioridade].toLowerCase()}` : '', a.responsavel ? `Resp.: ${a.responsavel}` : ''].filter(Boolean).join('\n');
        return [{content: t(a.titulo) + '\n' + t(det), titulo: t(a.titulo), det: t(det)}, `${ctx.turnoLabelDe(a)}\n${ctx.fmtShort(a.noite)}`, diasAberto(a) ? String(diasAberto(a)) : (a.noite > hoje ? 'futura' : 'hoje'), t(a.fornecedor || '-'), statusObj(a), t([a.motivo, a.ultimaObs].filter(Boolean).join(' - ')) || '-'];
      }),
      columnStyles:{0:{cellWidth:58}, 1:{cellWidth:20}, 2:{cellWidth:11, halign:'center'}, 3:{cellWidth:28}, 4:{cellWidth:22}, 5:{cellWidth:'auto'}},
      didParseCell: d => {
        if (d.section !== 'body') return;
        if (d.column.index === 4) statusCell(d);
        if (d.column.index === 0 && d.cell.raw && d.cell.raw.titulo){
          // título em negrito e detalhes em cinza: quebra de linha calculada aqui e desenhada em didDrawCell
          const wUtil = 58 - 3.6;
          font('bold', 7.6); const tl = doc.splitTextToSize(d.cell.raw.titulo, wUtil);
          font('normal', 7.6); const dl = d.cell.raw.det ? doc.splitTextToSize(d.cell.raw.det, wUtil) : [];
          d.cell.raw.nTit = tl.length; d.cell.text = [...tl, ...dl];
        }
      },
      willDrawCell: d => {
        if (d.section === 'body' && d.column.index === 0 && d.cell.raw && d.cell.raw.titulo){ d.cell.raw._lines = d.cell.text; d.cell.text = []; }
      },
      didDrawCell: d => {
        if (d.section === 'body' && d.column.index === 0 && d.cell.raw && d.cell.raw._lines){
          const pos = d.cell.getTextPos(), lh = 7.6 * 1.15 * 25.4 / 72;
          d.cell.raw._lines.forEach((ln, i) => {
            if (i < d.cell.raw.nTit){ font('bold', 7.6); color(C.ink); } else { font('normal', 7.6); color(C.muted); }
            doc.text(ln, pos.x, pos.y + i * lh, {baseline:'top'});
          });
        }
      },
    });
    y = doc.lastAutoTable.finalY + 9;
  }
  if (!G.length){ color(C.muted); font('italic', 10); text('Nenhuma atividade em aberto.', M, y + 4); }

  // ---------- cabeçalho das páginas seguintes e rodapé ----------
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++){
    doc.setPage(i);
    if (i > 1){
      fill(C.graf); doc.rect(0, 0, W, 15, 'F'); fill(C.laranja); doc.rect(0, 15, W, .9, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 4.2, 24, 24 * 83 / 306);
      color(C.white); font('bold', 9); text('Atividades em aberto', W - M, 7, {align:'right'});
      color([169,173,180]); font('normal', 7.2); text(`Obra 4107 · emitido em ${ctx.emitidoEm}`, W - M, 11.2, {align:'right'});
    }
    stroke(C.line); doc.setLineWidth(.2); doc.line(M, H - 11, W - M, H - 11);
    fill(C.laranja); doc.rect(M, H - 8.2, 2, 2, 'F');
    color(C.faint); font('normal', 7.2);
    text('SAENG Engenharia · Programação de Atividades · Obra 4107 Rooftop Iguatemi SP', M + 3.5, H - 6.6);
    text(`Página ${i} de ${N}`, W - M, H - 6.6, {align:'right'});
  }
  doc.save(ctx.arquivo);
}
