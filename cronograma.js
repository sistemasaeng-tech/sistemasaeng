// Cronograma quinzenal em Excel, no padrão do modelo SAENG
// (4107_ROOFTOP_IGSP_FORRO_ZARA_HOME_CRONOGRAMA_REV00): cabeçalho com título e faixa laranja,
// colunas ITEM / DISCIPLINA / ATIVIDADE / INÍCIO / TÉRMINO / STATUS, semanas mescladas em grafite,
// dias com fim de semana sombreado e barras do Gantt por formatação condicional (INÍCIO/TÉRMINO ou "X").
const LIB = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
function loadScript(src){
  return new Promise((ok, fail) => {
    if (window.ExcelJS) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Não foi possível carregar o gerador de Excel'));
    document.head.appendChild(s);
  });
}
async function toBase64(url){
  const b = await (await fetch(url)).blob();
  return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
}
const pad = n => String(n).padStart(2, '0');
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ddmm = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const xlDate = s => { const d = parseYmd(s); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }; // Excel grava a data sem fuso
const colL = n => { let s = ''; while (n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const LETRA = ['D','S','T','Q','Q','S','S']; // domingo..sábado

const STATUS_XL = {programada:'A INICIAR', andamento:'EM ANDAMENTO', parcial:'EM ANDAMENTO', nao_iniciada:'A INICIAR', impedida:'BLOQUEADO', concluida:'CONCLUÍDO'};
const THIN = {style:'thin', color:{argb:'FF000000'}};
const BORDER = {top:THIN, left:THIN, bottom:THIN, right:THIN};
const solid = argb => ({type:'pattern', pattern:'solid', fgColor:{argb}});

export async function gerarCronogramaXLSX(ctx){
  await loadScript(LIB);
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.emitidoPor || 'SAENG'; wb.created = new Date();
  const ws = wb.addWorksheet('CRONOGRAMA', {views:[{state:'frozen', xSplit:0, ySplit:8, showGridLines:false}]});

  // ---------- dias do período ----------
  const dias = []; for (let i = 0; i < ctx.nDias; i++){ const d = parseYmd(ctx.inicio); d.setDate(d.getDate() + i); dias.push(d); }
  const FIX = 7; // A..G (G = AVANÇO)
  const C0 = FIX + 1, CN = FIX + dias.length, LAST = colL(CN);

  // ---------- larguras (iguais ao modelo; AVANÇO acrescentado) ----------
  const widths = [6, 22, 40, 10.78, 10.78, 15, 9];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let c = C0; c <= CN; c++) ws.getColumn(c).width = 5.66;

  // ---------- título ----------
  ws.getRow(1).height = 25.5; ws.getRow(3).height = 6; ws.getRow(4).height = 4.05; ws.getRow(5).height = 8.4;
  ws.getCell('B1').value = ctx.titulo;
  ws.getCell('B1').font = {name:'Calibri', size:16, bold:true};
  ws.getCell('B2').value = ctx.subtitulo;
  ws.getCell('B2').font = {name:'Calibri', size:11};
  for (let c = 1; c <= CN; c++) ws.getCell(4, c).fill = solid('FFE6851A');

  // ---------- cabeçalho da tabela (linhas 6 a 8) ----------
  const head = ['ITEM', 'DISCIPLINA / EMPRESA', 'ATIVIDADE', 'INÍCIO', 'TÉRMINO', 'STATUS', 'AVANÇO'];
  head.forEach((h, i) => {
    const col = colL(i + 1);
    ws.mergeCells(`${col}6:${col}8`);
    const cell = ws.getCell(`${col}6`);
    cell.value = h;
    cell.font = {name:'Calibri', size:10, bold:true};
    cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    for (let r = 6; r <= 8; r++){ const x = ws.getCell(`${col}${r}`); x.fill = solid('FFD9D9D9'); x.border = BORDER; }
  });
  ws.getRow(6).height = 15;
  // semanas (segunda a domingo), mescladas na linha 6
  let gi = 0;
  while (gi < dias.length){
    let gj = gi; while (gj + 1 < dias.length && dias[gj + 1].getDay() !== 1) gj++;
    const a = colL(C0 + gi), b = colL(C0 + gj);
    if (gj > gi) ws.mergeCells(`${a}6:${b}6`);
    const cell = ws.getCell(`${a}6`);
    cell.value = `(${ddmm(dias[gi])} a ${ddmm(dias[gj])})`;
    cell.font = {name:'Calibri', size:10, bold:true, color:{argb:'FFFFFFFF'}};
    cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    for (let c = C0 + gi; c <= C0 + gj; c++){ const x = ws.getCell(6, c); x.fill = solid('FF595959'); x.border = BORDER; }
    gi = gj + 1;
  }
  dias.forEach((d, i) => {
    const c = C0 + i, fds = d.getDay() === 0 || d.getDay() === 6;
    const l = ws.getCell(7, c), dt = ws.getCell(8, c);
    l.value = LETRA[d.getDay()];
    dt.value = xlDate(ymd(d)); dt.numFmt = 'dd/mm';
    [l, dt].forEach(x => { x.font = {name:'Calibri', size:9, bold:true}; x.alignment = {horizontal:'center', vertical:'middle', wrapText:true}; x.fill = solid(fds ? 'FFD9D9D9' : 'FFF2F2F2'); x.border = BORDER; });
  });

  // ---------- linhas das atividades, agrupadas por setor ----------
  let r = 9, item = 0;
  const dataRows = [];
  for (const g of ctx.grupos){
    // linha do setor
    ws.mergeCells(r, 1, r, FIX);
    const gc = ws.getCell(r, 1);
    gc.value = g.sub ? `${g.label.toUpperCase()}  —  ${g.sub}` : g.label.toUpperCase();
    gc.font = {name:'Calibri', size:10, bold:true, color:{argb:'FF262626'}};
    gc.alignment = {horizontal:'left', vertical:'middle', indent:1};
    for (let c = 1; c <= CN; c++){ const x = ws.getCell(r, c); x.fill = solid('FFF2F2F2'); x.border = BORDER; }
    ws.getRow(r).height = 16;
    r++;
    for (const a of g.items){
      item++;
      const row = ws.getRow(r);
      row.getCell(1).value = item;
      row.getCell(2).value = a.empresa || '';
      row.getCell(3).value = a.detalhe ? {richText:[{text:a.titulo, font:{name:'Calibri', size:10}}, {text:'\n' + a.detalhe, font:{name:'Calibri', size:8, color:{argb:'FF7F7F7F'}}}]} : a.titulo;
      row.getCell(4).value = xlDate(a.inicio);
      row.getCell(5).value = xlDate(a.fim);
      row.getCell(6).value = STATUS_XL[a.status] || 'A INICIAR';
      row.getCell(7).value = (Number(a.avanco) || 0) / 100;
      for (let c = 1; c <= CN; c++){
        const x = row.getCell(c);
        x.border = BORDER;
        x.font = c === 2 ? {name:'Calibri', size:10, bold:true} : c >= C0 ? {name:'Calibri', size:9, bold:true} : {name:'Calibri', size:10};
        x.alignment = {horizontal: c === 2 || c === 3 ? 'left' : 'center', vertical:'middle', wrapText:true};
        if (c >= C0){ const d = dias[c - C0]; if (d.getDay() === 0 || d.getDay() === 6) x.fill = solid('FFF2F2F2'); }
      }
      row.getCell(3).font = {name:'Calibri', size:10};
      row.getCell(4).numFmt = 'dd/mm/yyyy'; row.getCell(5).numFmt = 'dd/mm/yyyy';
      row.getCell(7).numFmt = '0%';
      row.getCell(4).dataValidation = row.getCell(5).dataValidation = {type:'date', operator:'greaterThan', allowBlank:true, formulae:[new Date(Date.UTC(2026, 0, 1))]};
      row.getCell(6).dataValidation = {type:'list', allowBlank:true, formulae:['"A INICIAR,EM ANDAMENTO,CONCLUÍDO,BLOQUEADO"']};
      row.getCell(7).dataValidation = {type:'decimal', operator:'between', allowBlank:true, formulae:[0, 1], showErrorMessage:true, errorTitle:'Avanço', error:'Informe um valor entre 0% e 100%.'};
      // altura conforme o texto (título em 10 pt ~44 caracteres/linha; detalhe em 8 pt ~60) e a empresa em negrito (~22)
      const lt = Math.ceil(String(a.titulo).length / 44) || 1, ld = a.detalhe ? Math.ceil(a.detalhe.length / 60) : 0, le = Math.ceil(String(a.empresa || '').length / 22) || 1;
      row.height = Math.max(15, lt * 13 + ld * 11 + 4, le * 13 + 4);
      dataRows.push(r);
      r++;
    }
  }
  const R1 = 9, RN = Math.max(r - 1, 9);

  // ---------- formatação condicional (igual ao modelo) ----------
  if (dataRows.length){
    ws.addConditionalFormatting({ref:`F${R1}:F${RN}`, rules:[
      {type:'expression', priority:1, formulae:[`$F${R1}="CONCLUÍDO"`], style:{fill:{type:'pattern', pattern:'solid', bgColor:{argb:'FFC6EFCE'}}}},
      {type:'expression', priority:2, formulae:[`$F${R1}="EM ANDAMENTO"`], style:{fill:{type:'pattern', pattern:'solid', bgColor:{argb:'FFFFEB9C'}}}},
      {type:'expression', priority:3, formulae:[`$F${R1}="BLOQUEADO"`], style:{fill:{type:'pattern', pattern:'solid', bgColor:{argb:'FFFFC7CE'}}}},
    ]});
    const f = colL(C0);
    ws.addConditionalFormatting({ref:`${f}${R1}:${LAST}${RN}`, rules:[
      {type:'expression', priority:4, formulae:[`OR(AND(ISNUMBER($D${R1}),ISNUMBER($E${R1}),${f}$8>=$D${R1},${f}$8<=$E${R1}),UPPER(${f}${R1})="X")`], style:{fill:{type:'pattern', pattern:'solid', bgColor:{argb:'FF95B3D7'}}}},
    ]});
    ws.addConditionalFormatting({ref:`G${R1}:G${RN}`, rules:[
      {type:'dataBar', priority:5, cfvo:[{type:'num', value:0}, {type:'num', value:1}], color:{argb:'FF95B3D7'}, gradient:false},
    ]});
  }

  // ---------- logo no canto direito ----------
  try {
    const id = wb.addImage({base64: await toBase64(ctx.logoUrl), extension:'png'});
    ws.addImage(id, {tl:{col: CN - 3.6, row: 0.15}, ext:{width:130, height:33}, editAs:'oneCell'});
  } catch {}

  // ---------- impressão: A4 paisagem, ajustado à largura ----------
  ws.pageSetup = {paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0,
    margins:{left:0.4, right:0.4, top:0.6, bottom:0.6, header:0.3, footer:0.3}, printTitlesRow:'6:8', horizontalCentered:true};
  ws.pageSetup.printArea = `A1:${LAST}${RN}`;
  ws.headerFooter = {oddFooter:`&L&8SAENG Engenharia · Obra 4107 · Programação de Atividades&R&8Página &P de &N`};

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const el = document.createElement('a'); el.href = url; el.download = ctx.arquivo; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return {linhas: item};
}
