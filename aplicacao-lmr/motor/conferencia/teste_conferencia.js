/*
 * Testes do A0 (conferência dos materiais do Status nos documentos), com material fictício.
 * Uso: node conferencia/teste_conferencia.js
 */
const assert = require('assert');
const LMR = require('../lmr.js');
const C = require('./conferencia.js');

const STATUS = [
  ['GERENCIAMENTO'],
  ['ITEM', 'QTD.', 'UNID.', 'DESCRIÇÃO', 'CÓDIGO DO MATERIAL', 'CÓDIGO CMI', 'MARCA/MODELO', 'CÓDIGO PMIB', 'PDM usado', 'STATUS', 'TIPO DE ENTREGA'],
  [1, null, null, 'Conjunto', null, null, null, null, null, null, null],
  [1.1, 2, 'UN', 'Bomba', 1000001, null, 'Fab A / F1015U-717', '1111111111.0001', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.2, 1, 'UN', 'Transmissor', 1000002, 'GE77001', 'Fab B / VTV122', '1111111111.0002', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.3, 1, 'UN', 'Sensor', 1000003, null, 'Fab C / SX-4410', '1111111111.0003', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.4, 1, 'UN', 'Junta', null, null, 'Fab D / X', '1111111111.0004', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.5, 1, 'UN', 'Válvula', 1000005, null, 'Fab E / V-9', '1111111111.0005', '', 'EM ELABORAÇÃO', 'FÍSICA'],
  [1.6, 1, 'UN', 'Repetido', 1000006, null, 'Fab F / R-1', '1111111111.0006', '', 'DUPLICADO', 'FÍSICA'],
];
const catalogo = LMR.lerStatusPmib(STATUS).catalogo;
assert.strictEqual(catalogo.length, 5, 'o DUPLICADO sai do catálogo');

// 1. um documento: achado pelo código do material, pelo CMI/GE e pelo modelo; código colado não conta
const d1 = C.confereDocumento('Lista.pdf', [
  'LISTA DE SOBRESSALENTES\n1000001 Bomba\nGE77001 Transmissor',
  'modelo sx-4410 do sensor\n10000051 e A1000005',
  '   ',
], catalogo);
assert.strictEqual(d1.paginas, 3);
assert.deepStrictEqual(d1.semTexto, [3]);
const de = pmib => d1.materiais.filter(m => m.pmib === pmib).map(m => `${m.de} p.${m.pagina}`);
assert.deepStrictEqual(de('1111111111.0001'), ['código do material p.1']);
assert.deepStrictEqual(de('1111111111.0002'), ['código CMI/GE p.1']);
assert.deepStrictEqual(de('1111111111.0003'), ['modelo p.2'], 'modelo em minúsculas também acha');
assert.deepStrictEqual(de('1111111111.0005'), [], 'chave colada em outro dígito não conta');
assert.deepStrictEqual(d1.avisos, []);
console.log('T1 ok  achado por código, CMI/GE e modelo; código colado não conta');

// 2. PDF escaneado e PDF que não abriu
const d2 = C.confereDocumento('Diagrama.pdf', ['', ' \n ', 'o o'], catalogo);
assert.deepStrictEqual(d2.semTexto, [1, 2, 3]);
assert.deepStrictEqual(d2.avisos, ['sem texto: escaneado?']);
const d3 = C.confereDocumento('Protegido.pdf', [], catalogo, 'arquivo protegido por senha');
assert.strictEqual(d3.paginas, 0);
assert.deepStrictEqual(d3.avisos, ['PDF não lido: arquivo protegido por senha']);
console.log('T2 ok  PDF escaneado e PDF não lido viram aviso');

// 3. ONDE com mais de 10 lugares
const muitas = Array.from({ length: 12 }, (_, i) => `página ${i + 1} da lista cita o material 1000001`);
const d4 = C.confereDocumento('Muitas.pdf', muitas, catalogo);

// 4. a conferência inteira
const { abas, resumo } = C.montaConferencia({ documentos: [d1, d2, d3, d4], catalogo, sistema: 'Sistema X', ignorados: ['nota.txt'] });
assert.deepStrictEqual(abas.map(a => a.nome), ['MATERIAIS', 'DOCUMENTOS']);
const mat = Object.fromEntries(abas[0].linhas.map(l => [l.PMIB, l]));
assert.deepStrictEqual(abas[0].linhas.map(l => l.PMIB), catalogo.map(c => c.pmib), 'ordem do Status');
assert.strictEqual(mat['1111111111.0001'].ACHADO, 'SIM');
assert.strictEqual(mat['1111111111.0001'].ONDE, 'Lista.pdf p.1; Muitas.pdf p.1; Muitas.pdf p.2; Muitas.pdf p.3; Muitas.pdf p.4; '
  + 'Muitas.pdf p.5; Muitas.pdf p.6; Muitas.pdf p.7; Muitas.pdf p.8; Muitas.pdf p.9 (+ 3)');
assert.strictEqual(mat['1111111111.0001']['ACHADO POR'], 'código do material');
assert.strictEqual(mat['1111111111.0002']['ACHADO POR'], 'código CMI/GE');
assert.strictEqual(mat['1111111111.0003'].ACHADO, 'SIM');
assert.strictEqual(mat['1111111111.0004'].ACHADO, 'SEM CHAVE');
assert.strictEqual(mat['1111111111.0005'].ACHADO, 'NÃO');
assert.strictEqual(mat['1111111111.0005'].ONDE, '');
const doc = Object.fromEntries(abas[1].linhas.map(l => [l.ARQUIVO, l]));
assert.strictEqual(doc['Lista.pdf']['PÁGINAS SEM TEXTO'], '3');
assert.strictEqual(doc['Lista.pdf']['MATERIAIS ACHADOS'], 3);
assert.strictEqual(doc['Diagrama.pdf']['PÁGINAS SEM TEXTO'], '1-3');
assert.strictEqual(doc['Protegido.pdf'].AVISO, 'PDF não lido: arquivo protegido por senha');
assert.strictEqual(resumo.arquivo, 'CONFERÊNCIA MATERIAIS - Sistema X.xlsx');
assert.deepStrictEqual([resumo.materiais, resumo.achados, resumo.semChave, resumo.documentos, resumo.paginas, resumo.semTexto],
  [5, 3, 1, 4, 18, 4]);
assert.deepStrictEqual(resumo.naoAchados, ['1111111111.0005']);
assert.match(resumo.mensagem, /^3 de 5 materiais achados nos documentos/);
assert.match(resumo.mensagem, /Não achados \(1\): 1111111111\.0005/);
assert.match(resumo.mensagem, /Sem código no Status para procurar \(1\): 1111111111\.0004/);
assert.match(resumo.mensagem, /Documentos com aviso \(2\): Diagrama\.pdf, Protegido\.pdf/);
assert.match(resumo.mensagem, /Arquivos ignorados \(não são PDF\): nota\.txt/);
console.log('T3 ok  abas MATERIAIS e DOCUMENTOS, ONDE limitado a 10, mensagem final');

// 5. lista de não achados cortada em 20; Status sem materiais
const vinte5 = Array.from({ length: 25 }, (_, i) => ({ secao: '', item: String(i + 1), pmib: `2222222222.${String(i + 1).padStart(4, '0')}`,
  descricao: 'x', codigoMaterial: `90000${String(i + 10)}`, codigoCmi: '', marcaModelo: '' }));
const r5 = C.montaConferencia({ documentos: [d2], catalogo: vinte5, sistema: 'Y' }).resumo;
assert.match(r5.mensagem, /Não achados \(25\): (2222222222\.\d{4}, ){19}2222222222\.0020 \(\+ 5\)/);
const r6 = C.montaConferencia({ documentos: [d1], catalogo: [], sistema: 'Z' });
assert.deepStrictEqual(r6.abas.map(a => a.nome), ['DOCUMENTOS']);
assert.match(r6.resumo.mensagem, /^O Status PMIB não tem materiais válidos/);
console.log('T4 ok  não achados cortados em 20; Status sem materiais');

// 6. vários códigos numa célula do Status (Água Pura 0851): cada um é uma chave
const multi = [{ secao: '', item: '9', pmib: '3333333333.0001', descricao: 'Kit', codigoMaterial: '1000111 / 1000222; 1000333',
  codigoCmi: 'GE1, GE88001', marcaModelo: '' }];
const d7 = C.confereDocumento('Lista.pdf', ['LISTA DE SOBRESSALENTES\nitem 9 kit 1000222 un 1'], multi);
assert.deepStrictEqual(d7.materiais.map(m => m.de), ['código do material']);
const d8 = C.confereDocumento('Lista.pdf', ['LISTA DE SOBRESSALENTES\nitem 9 kit GE88001 un 1'], multi);
assert.deepStrictEqual(d8.materiais.map(m => m.de), ['código CMI/GE']);
console.log('T5 ok  vários códigos numa célula: cada um vira chave');

console.log('TUDO OK');
