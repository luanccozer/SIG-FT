/*
 * Peças comuns aos workflows do A (A1 índice; A gerar Base): escolha dos arquivos do formulário, leitura do Status,
 * separação dos PDFs e o Code que indexa um documento por volta do Loop.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const MOTOR = fs.readFileSync(path.join(RAIZ, 'lmr.js'), 'utf8');
const INDICE_JS = fs.readFileSync(path.join(RAIZ, 'indice', 'indice.js'), 'utf8');

// Escolhe o arquivo pelo nome (o Status tem STATUS no nome; a Base começa com BASE).
const ACHA = cond => `Object.keys($binary).find(k => ${cond})`;
const NOME = "($binary[k].fileName || '')";
const BIN_STATUS = `={{ ${ACHA(`/STATUS/i.test(${NOME})`)} || ${ACHA(`/\\.xlsx$/i.test(${NOME}) && !/^BASE/i.test(${NOME})`)} }}`;
const BIN_BASE = `={{ ${ACHA(`/^BASE/i.test(${NOME})`)} || 'sem_base' }}`;

const LE_STATUS = `const statusRows = (() => { try { return $('Lê Status PMIB').all().filter(i => !i.json.error)
  .map(i => (Array.isArray(i.json) ? i.json : Array.isArray(i.json.row) ? i.json.row : Object.values(i.json))); } catch (e) { return []; } })();
let catalogo = [];
try { catalogo = LMR.lerStatusPmib(statusRows).catalogo; } catch (e) { catalogo = []; }`;

// Separa os PDFs do formulário: um item por arquivo, binário sempre em "data".
const SEPARA = `const b = $input.first().binary || {};
return Object.values(b).filter(x => /\\.pdf$/i.test(x.fileName || '') || /pdf/i.test(x.mimeType || ''))
  .map(x => ({ json: { arquivo: x.fileName }, binary: { data: x } }));`;

// Uma volta do Loop: o texto de um PDF → índice desse documento.
const INDEXA = `${MOTOR}
${INDICE_JS}
${LE_STATUS}
const r = [];
$input.all().forEach((item, i) => {
  const j = item.json || {};
  let arquivo = j.arquivo;
  if (!arquivo) try { arquivo = $('Lote de documentos').itemMatching(i).json.arquivo; } catch (e) { arquivo = ''; }
  arquivo = arquivo || 'documento sem nome.pdf';
  if (j.error) {
    const d = INDICE.indexaDocumento(arquivo, [], []);
    d.doc.avisos.push('PDF não lido: ' + String(j.error.message || j.error));
    r.push({ json: d });
    return;
  }
  const paginas = Array.isArray(j.text) ? j.text : String(j.text || '').split('\\n\\n');
  r.push({ json: INDICE.indexaDocumento(arquivo, paginas, catalogo) });
});
return r;`;

module.exports = { BIN_STATUS, BIN_BASE, LE_STATUS, SEPARA, INDEXA };
