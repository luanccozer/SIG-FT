/*
 * Gera a Knowledge base dos agentes Ligador LMR e Recuperador LMR em agente/kb/, a partir de regras_lmr.md e
 * formatos_json.md (a mesma fonte do Leitor LMR). Não edite agente/kb/ à mão: mude a fonte e rode de novo.
 * Uso: node agente/gerar_kb.js
 */
const fs = require('fs');
const path = require('path');

const ler = a => fs.readFileSync(path.join(__dirname, a), 'utf8').replace(/\r\n/g, '\n');
const secoes = texto => texto.split(/^(?=## )/m);
const REGRAS = secoes(ler('regras_lmr.md'));
const FORMATOS = secoes(ler('formatos_json.md'));
const pega = (lista, inicio) => {
  const s = lista.find(x => x.startsWith(`## ${inicio}`));
  if (!s) throw new Error(`seção não encontrada: ${inicio}`);
  return s.trimEnd();
};
const junta = (...partes) => `${partes.join('\n\n')}\n`;

const REGRAS_RECUPERADOR = `## Como procurar cada lacuna

Cada lacuna diz o material (PMIB), o campo a procurar e as páginas. Responda uma vez cada, com o mesmo id e o mesmo campo.

| Campo | O que procurar | Valor |
|---|---|---|
| \`tag\` | TAG onde o material está instalado | Lista de TAGs, copiadas como estão escritas, e \`papel\` |
| \`area\` | Conjunto onde a TAG está montada | Nome da área, se a página disser |
| \`elevacao\` | Elevação escrita para essa TAG | Número, como \`98,50\` |
| \`qtd_instalada\` | Quantidade instalada de material sem TAG | Número, de lista de material ou desenho |

- Você só preenche o que falta. Nunca altere nem revise outros dados.
- Quando a lacuna traz "valor recusado", esse valor já foi lido e não passou na conferência: não o repita sem fonte.
- Não achou nas páginas da lacuna: \`"achou": false\` e, em \`procurou\`, as páginas onde procurou.`;

const FORMATO_RECUPERADOR = `## Recuperador — resposta

\`\`\`json
{
  "etapa": "R", "parte": "1", "arquivos": [], "controle": [], "observacoes": [],
  "recuperacoes": [
    { "lacuna": "L-1", "achou": true, "campo": "area", "valor": "SKID",
      "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.5", "procurou": "" },
    { "lacuna": "L-2", "achou": false, "campo": "tag", "valor": null,
      "evidencia": "", "procurou": "#ST00=M00ABC10&MPB020 p.3" },
    { "lacuna": "L-3", "achou": true, "campo": "tag", "valor": ["GP101"], "papel": "peca",
      "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.5", "procurou": "" }
  ]
}
\`\`\`

- Um objeto por lacuna da mensagem, com o mesmo \`lacuna\` e o mesmo \`campo\`.
- \`papel\` (\`proprio\` ou \`peca\`) é obrigatório quando \`campo\` é \`tag\`.
- Os valores acima são exemplos (não são dados reais).`;

const gerados = {
  'ligador_regras.md': junta('# Regras do Ligador LMR', pega(REGRAS, '1. '), pega(REGRAS, '2. '), pega(REGRAS, '6. '), pega(REGRAS, '7. '), pega(REGRAS, '8. ')),
  'ligador_formatos.md': junta('# Formatos do Ligador LMR', pega(FORMATOS, 'Campos de todas'), pega(FORMATOS, 'Etapa 4')),
  'recuperador_regras.md': junta('# Regras do Recuperador LMR', pega(REGRAS, '1. '), pega(REGRAS, '2. '), REGRAS_RECUPERADOR, pega(REGRAS, '8. ')),
  'recuperador_formatos.md': junta('# Formatos do Recuperador LMR', FORMATO_RECUPERADOR),
};
const pasta = path.join(__dirname, 'kb');
fs.mkdirSync(pasta, { recursive: true });
for (const [nome, texto] of Object.entries(gerados)) {
  fs.writeFileSync(path.join(pasta, nome), texto);
  console.log('ok', `kb/${nome}`, texto.length, 'caracteres');
}
