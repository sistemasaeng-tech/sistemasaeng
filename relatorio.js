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
  const COLW = {0:78, 1:36, 2:26, 3:16, 4:32, 5:26}; // a última coluna (observação) ocupa o restante
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
      head:[['Atividade', 'Etiqueta', 'Turno / período', 'Atraso', 'Fornecedor', 'Status', 'Motivo / última observação']],
      body: items.map(a => {
        const det = [ctx.localLine(a), a.prioridade && a.prioridade !== 'normal' ? `Prioridade ${PRIOR[a.prioridade].toLowerCase()}` : '', a.responsavel ? `Resp.: ${a.responsavel}` : ''].filter(Boolean).join(' · ');
        const et = Array.isArray(a.etiquetas) && a.etiquetas.length ? a.etiquetas.join('\n') : '-';
        return [{content: t(a.titulo) + '\n' + t(det), titulo: t(a.titulo), det: t(det)}, t(et), `${ctx.turnoLabelDe(a)}\n${per(a)}`, diasAberto(a) ? `${diasAberto(a)} d` : (a.noite > hoje ? 'futura' : 'no prazo'), t(a.fornecedor || '-'), statusObj(a), t([a.motivo, a.ultimaObs].filter(Boolean).join(' - ')) || '-'];
      }),
      columnStyles:{0:{cellWidth:COLW[0]}, 1:{cellWidth:COLW[1], textColor:C.muted}, 2:{cellWidth:COLW[2]}, 3:{cellWidth:COLW[3], halign:'center'}, 4:{cellWidth:COLW[4]}, 5:{cellWidth:COLW[5]}, 6:{cellWidth:'auto'}},
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
