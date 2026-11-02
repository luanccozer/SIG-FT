/*
 * Sistema FICTÍCIO para os testes do fluxo A enxuto (agente/teste_enxuto.js): 6 materiais, 3 PDFs (MLU, MPA, MPB).
 * Nenhum dado real. respostasBoas() devolve as respostas das etapas 1 a 4 sem nenhuma lacuna.
 */
const LMR = require('../lmr.js');
const INDICE = require('../indice/indice.js');

const statusRows = [
  ['LISTA #ST00=M00ABC10&MPB020'],
  ['ITEM', 'QTD.', 'UNID.', 'DESCRIÇÃO', 'CÓDIGO DO MATERIAL', 'CÓDIGO CMI', 'MARCA/MODELO', 'CÓDIGO PMIB', 'PDM USADO', 'STATUS'],
  ['1', 1, 'UN', 'BOMBA DE CIRCULACAO A', 'COD00001', '', 'FABRICANTE/MOD111', '4500000000.0001', '', 'OK'],
  ['2', 1, 'UN', 'BOMBA DE CIRCULACAO B', 'COD00002', '', 'FABRICANTE/MOD222', '4500000000.0002', '', 'OK'],
  ['3', 1, 'UN', 'SELO MECANICO', 'COD00003', '', 'FABRICANTE/MOD333', '4500000000.0003', '', 'OK'],
  ['4', 1, 'UN', 'TRANSMISSOR DE PRESSAO', 'COD00004', '', 'FABRICANTE/MOD444', '4500000000.0004', '', 'OK'],
  ['5', 1, 'UN', 'ELEMENTO FILTRANTE', 'COD00005', '', 'FABRICANTE/MOD555', '4500000000.0005', '', 'OK'],
  ['6', 4, 'UN', 'JUNTA DE VEDACAO', 'COD00006', '', 'FABRICANTE/MOD666', '4500000000.0006', '', 'OK'],
];
const st = LMR.lerStatusPmib(statusRows);

const DOCS = [
  ['#ST00=M00ABC10UZ010-UZ001&MLU010_layout.pdf', ['#ST00=M00ABC10UZ010-UZ001&MLU010 ARRANJO DO SKID PLANTA EL 98.500 eixo C/D #ST00=M00ABC10UZ010-UZ001 casa de força']],
  ['#ST00=M00ABC10UZ010-UZ901&MPA010_lista.pdf', [
    '#ST00=M00ABC10UZ010-UZ901&MPA010 LISTA DE MATERIAL GP101 bomba de circulação A GP102 bomba de circulação B COD00001 COD00002',
    '#ST00=M00ABC10UZ010-UZ901&MPA010 LISTA DE MATERIAL BP201 transmissor de pressão FL301 filtro COD00004 COD00005 COD00006 junta de vedação quantidade 4',
  ]],
  ['#ST00=M00ABC10&MPB020_sobressalentes.pdf', ['#ST00=M00ABC10&MPB020 LISTA DE SOBRESSALENTES 50 HZ E 60 HZ GP101 COD00001 GP102 COD00002 GP101 COD00003 BP201 COD00004 FL301 COD00005 COD00006']],
];
const indexados = () => DOCS.map(([arquivo, paginas]) => INDICE.indexaDocumento(arquivo, paginas, st.catalogo));

const cfg = { sistema: 'Fictício', escopo: 'UG', subsistema: 'FICTICIO', trechos: 'TODAS', listaTrechos: '', eixo: 'CD', frequencia: 'AMBAS',
  kits: 'TAG', pecas: 'TAG', especificacao: '', etapaDocs: '', sessao: 'lmr-teste' };

const tag = (t, area = 'SKID') => ({ tag: t, area, rds_proprio: true, elevacao: null });
const material = (n, papel, tags, extra = {}) => ({ pmib: `4500000000.000${n}`, encontrado: true, papel, kit: false, tags, pais: [], area: null, elevacao: null,
  qtd_instalada: null, frequencia: 'AMBAS', evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.1', ...extra });
const areasBoas = () => [{ nome: 'SKID', rds: '#ST00=M00ABC10UZ010-UZ001', local: 'CASA DE FORÇA', elevacao: '98,50', eixo: 'CD', trechos: [], evidencia: '#ST00=M00ABC10UZ010-UZ001&MLU010 p.1' }];
const tagsBoas = () => ['GP101', 'GP102', 'BP201', 'FL301'].map(t => ({ tag: t, descricao: t, area: 'SKID', rds_proprio: true, qtd_instalada: 1, elevacao: null, frequencia: null, pai: null, evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.1' }));
const materiaisBons = () => [
  material(1, 'proprio', [tag('GP101')]), material(2, 'proprio', [tag('GP102')]), material(3, 'peca', [tag('GP101')]),
  material(4, 'proprio', [tag('BP201')]), material(5, 'proprio', [tag('FL301')]),
  material(6, 'peca', [], { area: 'SKID', qtd_instalada: 4, evidencia: '#ST00=M00ABC10UZ010-UZ901&MPA010 p.2' }),
];
const texto = o => `\`\`\`json\n${JSON.stringify({ arquivos: [], controle: [], observacoes: [], ...o })}\n\`\`\``;
const respostasBoas = (materiais = materiaisBons()) => [
  { arquivo: 'etapa 1 parte 1', texto: texto({ etapa: 1, parte: '1', areas: areasBoas() }) },
  { arquivo: 'etapa 2 parte 1', texto: texto({ etapa: 2, parte: '1', tags: tagsBoas(), areas: [] }) },
  { arquivo: 'etapa 4 parte 1', texto: texto({ etapa: 4, parte: '1', materiais }) },
];

module.exports = { LMR, statusRows, st, indexados, cfg, materiaisBons, respostasBoas, texto, tag };
