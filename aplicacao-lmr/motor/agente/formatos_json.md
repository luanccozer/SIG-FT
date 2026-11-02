# Formatos JSON — uma resposta por etapa

Responda com UM arquivo .json com o nome dado na mensagem. Os valores abaixo são exemplos (não são dados reais).
Campos sem fonte: `null` (ou `[]`). Não acrescente campos.

## Campos de todas as etapas

```json
{
  "etapa": 1,
  "parte": "1",
  "arquivos": [
    { "arquivo": "nome do anexo.pdf", "paginas": 12, "paginas_lidas": "1-12", "paginas_ilegiveis": "" }
  ],
  "controle": [
    { "id": "E1-1", "presentes": ["XX101", "XX102A"] }
  ],
  "observacoes": ["o que você precisar explicar"]
}
```

- `parte`: o que a mensagem pedir ("1", "A", "B"…).
- `paginas_ilegiveis`: páginas que você não conseguiu ler (ex.: `"7, 12-14"`); `""` se leu todas.
- `controle`: uma resposta por pergunta de controle da mensagem, com o mesmo `id`.

## Etapa 1 — ÁREAS (`etapa1_areas.json`)

```json
{
  "etapa": 1, "parte": "1", "arquivos": [], "controle": [], "observacoes": [],
  "areas": [
    { "nome": "SKID", "rds": "#ST00=M00ABC10UZ010-UZ001", "local": "CASA DE FORÇA", "elevacao": "98,50", "eixo": "CD",
      "trechos": [], "evidencia": "#ST00=M00ABC10UZ010-UZ001&MLU010 p.1" },
    { "nome": "PWB", "rds": "#ST00=M00ABC10UH010-UH001", "local": "CASA DE FORÇA", "elevacao": null, "eixo": null,
      "trechos": [], "evidencia": "#ST00=M00ABC10UH010-UH001&EFF010 p.1" }
  ]
}
```

## Etapas 2 e 3 — CONJUNTOS e EQUIPAMENTOS (`etapa2_conjuntos.json`, `etapa3_equipamentos.json`)

```json
{
  "etapa": 2, "parte": "1", "arquivos": [], "controle": [], "observacoes": [],
  "tags": [
    { "tag": "GP101", "descricao": "bomba de circulação", "area": "SKID", "rds_proprio": true, "qtd_instalada": 1,
      "elevacao": null, "frequencia": "50", "pai": null, "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.5" },
    { "tag": "72.1", "descricao": "relé auxiliar", "area": "PWB", "rds_proprio": false, "qtd_instalada": 1,
      "elevacao": null, "frequencia": null, "pai": null, "evidencia": "#ST00=M00ABC10UH010-UH001&EFF010 p.40" },
    { "tag": null, "descricao": "mangueira 1/2\" (item 12)", "area": "SKID", "rds_proprio": false, "qtd_instalada": 4,
      "elevacao": null, "frequencia": null, "pai": "GP101", "evidencia": "#ST00=M00ABC10UZ010-UZ901&MPA010 p.9" }
  ],
  "areas": []
}
```

- `areas`: conjuntos que não estavam no `etapa1_areas.json` (mesmo formato da etapa 1). `[]` se nenhum.

## Etapa 4 — MATERIAIS (`etapa4_materiais.json` ou `etapa4_materiais_parteA.json`…)

```json
{
  "etapa": 4, "parte": "A", "arquivos": [], "controle": [], "observacoes": [],
  "materiais": [
    { "pmib": "4500000000.0001", "encontrado": true, "papel": "proprio", "kit": false,
      "tags": [ { "tag": "GP101", "area": "SKID", "rds_proprio": true, "elevacao": null } ],
      "pais": [], "area": null, "elevacao": null, "qtd_instalada": null, "frequencia": "50",
      "evidencia": "#ST00=M00ABC10&MPB020 p.3; #ST00=M00ABC10UZ010-UZ901&MPA010 p.5" },
    { "pmib": "4500000000.0002", "encontrado": true, "papel": "peca", "kit": true,
      "tags": [ { "tag": "GP101", "area": "SKID", "rds_proprio": true, "elevacao": null } ],
      "pais": [], "area": null, "elevacao": null, "qtd_instalada": null, "frequencia": null,
      "evidencia": "#ST00=M00ABC10&MPB020 p.3" },
    { "pmib": "4500000000.0003", "encontrado": true, "papel": "peca", "kit": false,
      "tags": [], "pais": ["GP101", "MA101"], "area": "SKID", "elevacao": null, "qtd_instalada": 1, "frequencia": null,
      "evidencia": "acoplamento motor-bomba: #ST00=M00ABC10UZ010-UZ901&MPA010 p.6" },
    { "pmib": "4500000000.0004", "encontrado": false, "papel": null, "kit": false,
      "tags": [], "pais": [], "area": null, "elevacao": null, "qtd_instalada": null, "frequencia": null,
      "evidencia": "não está na lista de sobressalentes nem nos outros anexos" }
  ]
}
```

- Um objeto por material da mensagem, na mesma ordem, com o `pmib` exatamente como na mensagem.
- `qtd_instalada`: só para material sem TAG e só de lista de material ou desenho (cite o documento em `evidencia`).
- `elevacao`: `"98,50"` (vírgula, 2 casas), só se diferente da elevação da área.
