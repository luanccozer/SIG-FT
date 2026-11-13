# Upload de Condições: os campos são preenchidos, mas o SALVAR não é clicado (2026-11-12)

Continuação de `2026-11-12-condicoes-seletores-robustos.md` (PR #63, 1.4.1-rc.6).

## O relato (Jonathan, execução REAL com a rc.6)

```
Processando 4500063671.1662...
[i] Id novo no portal: 'b10-b18-b1-Input_PackingLength' (o conhecido era 'b10-b17-b1-...').
Salvando Armazenamento...
Salvando Transporte...
[!] Não vi nenhuma mensagem de confirmação ao salvar 'Transporte'.
Salvando Manutenção...
[!] Não vi nenhuma mensagem de confirmação ao salvar 'Manutenção'.
Salvando Descarte...
Automação Web interrompida: o navegador foi fechado.
```

Jonathan: *"agora sim está preenchendo os campos mas não está apertando o botão salvar"*.

## O que este log PROVA

- **H1 confirmada:** o prefixo mudou de `b10-b17-` para `b10-b18-`. O seletor por sufixo funcionou
  para os campos (a rc.6 preenche).
- Armazenamento não reclamou de confirmação; Transporte e Manutenção sim.

## Causa (lida no código, coerente com o log)

`core/rpa/seletores_condicoes.py`:

```python
SALVAR_ARMAZENAMENTO = _c("b1", "b35-Button", "/button")          # prefixo da aba + sufixo: resolve
SALVAR_TRANSPORTE = Campo("$b3", f"{PREFIXO_CONHECIDO}$b3", None, "/div[3]/button")
SALVAR_MANUTENCAO = Campo("$b4", ...  "/div[4]/button")
SALVAR_DESCARTE   = Campo("$b5", ...  "/div[5]/button")
```

Os botões de Transporte/Manutenção/Descarte usam ids GERADOS (`$bN`, já listados em
`seletores_duplicada.IDS_GERADOS_NAO_USAR`), sem aba (`None`): no `_sel`, sem o id de hoje e sem
"exatamente um" casamento por sufixo, volta o id VELHO (`b10-b17-b1-$b3...`). O `safe_click` é
tolerante e engole a falha: o log diz "Salvando Transporte..." sem ter clicado nada, e depois só
"não vi confirmação". O plano anterior registrou exatamente isto no `PENDENCIAS.md` como não
coberto.

## Solução: o SALVAR da seção pela ÂNCORA, como o módulo de fichas duplicadas já faz

Existe, validado contra o portal real (defeito de 2026-08-20):

- `PMIBPortal.salvar_e_confirmar(nome_secao, callback_log, ancora=...)` (`core/rpa/portal.py`):
  acha o botão **pelo texto** (`button[normalize-space()='SALVAR']`) DENTRO da seção onde a
  âncora está, ou subindo dela (`XPATH_SALVAR_DENTRO_DO_BLOCO` / `XPATH_SALVAR_SUBINDO_DO_BLOCO`),
  exige que seja UM botão, clica, e só devolve `True` com o toast NOVO da seção
  (`PALAVRA_DA_SECAO`). Sem botão único, RECUSA e diz por quê.
- `duplicadas_condicoes.py` o chama com `ancora=ancora_da_subaba(nome)` — um campo da própria
  sub-aba.

### T1. As quatro sub-abas salvam por `salvar_e_confirmar` com âncora

Em `UploadAutomation` (`services/upload_conditions.py`), o salvamento de Armazenamento,
Transporte, Manutenção e Descarte passa a:

1. âncora = o 1º campo da sub-aba (`ARM_COMPRIMENTO`, `TRA_EMBALAGEM_ES`, o de Manutenção e o de
   Descarte — os mesmos do portão da aba), resolvido por `self._sel(...)` (já funciona pelo
   sufixo com o prefixo novo);
2. `self.portal.salvar_e_confirmar(nome_da_secao, callback_log, ancora=<xpath>)`.

Ler `duplicadas_condicoes.ancora_da_subaba` e o trecho ~690–715 antes: reutilizar o que der
(uma implementação por conceito). O nome da seção vai CRU ("Transporte"), porque é a chave de
`PALAVRA_DA_SECAO`.

**Armazenamento também** vai pela âncora: hoje funciona pelo id, mas é o mesmo tipo de seletor
frágil; um caminho só para as quatro.

### T2. O que se preserva de `safe_save_with_pause`

- A linha "Salvando <seção>..." no log.
- `time.sleep(PAUSA_SALVAMENTO)` depois, incondicional (ver a docstring: o ritmo do RPA não muda
  de carona).
- **A pausa para intervenção manual** (`callback_pause(section_name)`) quando o botão não é
  achado/clicado — agora com o MOTIVO no log (o `salvar_e_confirmar` já o diz: "não achei um
  SALVAR único na seção"), em vez de "Salvando..." seguido de silêncio.
- `NavegadorFechado` sobe (T4 do plano anterior); a parada nunca interrompe entre o clique e a
  confirmação.
- O valor devolvido continua `bool` e alimenta `salvas[...]`, como hoje.

### T3. Os seletores `SALVAR_*` por id saem

`SALVAR_ARMAZENAMENTO/TRANSPORTE/MANUTENCAO/DESCARTE` deixam de ser usados para clicar. Remover
as constantes (e os testes que só as cobriam), ou, se algum teste de inventário as exigir,
marcá-las como "não usar para clicar". Fechar a linha correspondente do `PENDENCIAS.md` (botões
de salvar sem contêiner conhecido) — os TÍTULOS das abas e o cabeçalho continuam como estão
(funcionaram na execução real).

## O que NÃO se sabe

- O texto do botão no Upload de Condições é o mesmo "SALVAR" que as duplicadas veem (é a MESMA
  tela de edição da ficha; o módulo de duplicadas salva estas mesmas quatro sub-abas assim).
- O log real termina em "o navegador foi fechado" durante o Descarte: não sabemos se foi a
  pessoa ou uma queda. Nada a fazer aqui além de manter o encerramento limpo.

## Testes (TDD, com os dublês de `tests/test_condicoes_*.py`)

1. as quatro sub-abas chamam `salvar_e_confirmar` com a âncora do 1º campo DA PRÓPRIA sub-aba,
   já resolvida com o prefixo novo (`b10-b18-`);
2. nenhum clique usa mais `$b3/$b4/$b5` nem `b35-Button` (o dublê falha se alguém pedir esses ids);
3. SALVAR único na seção → clica, confirma pelo toast da seção → `salvas[...] = True`;
4. sem SALVAR único → NÃO clica nada da página, loga o motivo, chama `callback_pause`, devolve
   `False` e a ficha fica INCOMPLETA;
5. toast de OUTRA seção ainda na tela não confirma esta;
6. `NavegadorFechado` durante o salvar encerra sem pausa manual;
7. a ficha só é marcada COMPLETO com as quatro confirmadas (regressão do
   `test_condicoes_completo_com_prova.py`).

## Verificação e entrega

- Suíte inteira `-n auto` em Python 3.12 e 3.10, `ruff check .`, `python -m pyflakes
  frontend.py`, `QT_QPA_PLATFORM=offscreen python frontend.py --smoke`.
- CHANGELOG (bloco `## 1.4.1`): "Upload de Condições: ..."; `docs/base-conhecimento/
  05-upload-conditions-backend.md`; `PENDENCIAS.md` (fechar a linha dos botões de salvar).
- Commits em português sem acento na branch `jonathan/condicoes-salvar`. **Sem push** (o push e
  o CI ficam com outro agente), sem PR, sem versão.
- Dizer com todas as letras que não foi exercido no portal: o aceite é a mesma ficha
  `4500063671.1662` numa rc.
