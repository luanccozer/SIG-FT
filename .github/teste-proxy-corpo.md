**TESTE DO PROXY DA EMPRESA — NÃO INSTALAR.** Versão 0.0.1 de propósito: o SIG-FT nunca oferece este release como atualização.

Os dois arquivos são o MESMO instalador pequeno (o `1.2.0 → 1.2.1-rc.2`, 38.419.906 bytes, SHA256 `ab1e72c4439323c77139815bd444093fe802a9527b10a27def85d530ad334811`). Muda só o tipo que o GitHub declara:

- `teste_A_octet-stream.bin` — `application/octet-stream` (como o pequeno é publicado hoje; o Zscaler cortou o fim 3 de 3 vezes)
- `teste_B_x-msdownload.bin` — `application/x-msdownload` (o tipo do instalador completo, que sempre chega inteiro)

Baixe os dois numa PC da rede da empresa e compare o tamanho (Propriedades → Tamanho: **38.419.906 bytes**). Se o B chegar inteiro e o A não, o proxy decide pelo tipo.
