# Formatos do Recuperador LMR

## Recuperador — resposta

```json
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
```

- Um objeto por lacuna da mensagem, com o mesmo `lacuna` e o mesmo `campo`.
- `papel` (`proprio` ou `peca`) é obrigatório quando `campo` é `tag`.
- Os valores acima são exemplos (não são dados reais).
