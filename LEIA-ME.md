# ObraCusto — custeio de obras (uso interno)

App para levantar o **custo** dos produtos que vão entrar num orçamento. O orçamento para o cliente é feito depois, a partir deste custeio. **Nada daqui é para enviar ao cliente.**

## Como abrir

Dê dois cliques no atalho **ObraCusto** (o que tem o ícone do app) ou em **Abrir ObraCusto.bat**. O app abre no navegador em `http://localhost:8765`.

- **Área de trabalho ou barra de tarefas:** copie o atalho ObraCusto para a área de trabalho. Para fixar na barra de tarefas, clique com o botão direito → *Mostrar mais opções* → *Fixar na barra de tarefas*.
- **Se a pasta mudar de lugar ou for para outro computador**, o atalho ObraCusto deixa de funcionar, porque guarda o caminho completo. Nesse caso use o **Abrir ObraCusto.bat**, que funciona em qualquer lugar.
- **Só o navegador fica à mostra.** O servidor do app (`servidor.py`) roda escondido, sem janela, e só atende este computador. Precisa do Python instalado.
- **Encerra sozinho:** cerca de 3 minutos depois que você fecha a última janela do app, o servidor se encerra. Se aparecer a faixa vermelha "O ObraCusto foi encerrado neste computador", abra de novo pelo atalho; nada se perde.
- **Para encerrar na hora:** use **Fechar ObraCusto.bat**.
- **Sem o atalho:** ainda dá para abrir o **index.html** direto, mas aí o botão "Atualizar da planilha do Google" não funciona; só o carregamento de arquivo .xlsx.

> **Custeios salvos:** abrir pelo atalho e abrir o index.html direto são endereços diferentes, e cada um guarda os seus custeios separados no navegador. Para levar custeios de um para outro:
> 1. No endereço antigo, use **Meus custeios → Exportar cópia**.
> 2. No novo, use **Meus custeios → Importar cópia**.

## Como fazer um custeio

1. Preencha cliente, obra e contato, para saber depois a que orçamento o custeio se refere.
2. Na busca, digite o código (ex.: `F900FDGF`) ou parte da descrição (ex.: `calefator mendoza`), ajuste a **Qtd** e tecle **Enter**.
3. Clique em **▸** para ver as matérias-primas de cada produto: quantidade por unidade, quantidade total, valor da última compra e IPI.
4. A aba **Matéria-prima total** soma as matérias-primas de todos os produtos.
5. O **Resumo do custeio** mostra o custo s/ IPI, o IPI e o custo c/ IPI. Em "Custo considerado", escolha qual deles vale como **custo total**.
6. **Referência para o orçamento**: com um markup, o app sugere um preço e mostra a margem. Para testar outro preço, digite o valor direto na coluna "Preço sug. unit.".
7. **+ Item avulso** serve para custos fora da planilha: frete, instalação, mão de obra etc.
8. **Imprimir custeio / salvar PDF** gera o relatório interno. Marque "Detalhar matérias-primas de cada produto" para incluir a lista de cada produto.
9. **Exportar para Excel (modelo)** gera um .xlsx no formato do Modelo.xlsx, com um bloco por produto: REF, produto, quantidade, subtotal sem e com IPI e a tabela de matérias-primas. Detalhes:
   - **Peso Liq. Kg** e **L x A x P (mm)** saem em branco, porque a planilha de custos não tem esses dados. Preencha no Excel.
   - Os valores são fórmulas. Se você mudar uma quantidade ou um preço no Excel, os subtotais se recalculam.
   - Matérias-primas avulsas e itens avulsos (frete etc.) entram num bloco final **OUTROS ITENS**.
   - No fim vem a linha **TOTAL**, que soma subtotal × quantidade de cada bloco.

Tudo é salvo sozinho no navegador. Os custeios ficam em **Meus custeios**.

## Atualizar os preços

### Direto do Google Planilhas (recomendado)

Em **Base de preços**, clique em **Atualizar da planilha do Google** e entre com a **conta da empresa** que tem acesso à planilha. O app lê as abas BD_Estruturas, Aux e IR_Produção direto do Google:

- só com permissão de **leitura**;
- nada é gravado na planilha;
- a planilha continua privada.

**Configuração inicial no Google Cloud (uma vez só)**, feita com a conta da empresa:

1. Entre em **console.cloud.google.com** e crie um projeto (ex.: "ObraCusto"). Se aparecer que você não tem permissão para criar projetos, peça à TI.
2. Em *APIs e serviços → Biblioteca*, procure **Google Sheets API** e clique em **Ativar**.
3. Em *Google Auth Platform* (ou *Tela de permissão OAuth*), preencha o nome do app ("ObraCusto") e o seu e-mail, e escolha o público **Interno**.
4. Em *Clientes* (ou *Credenciais → Criar credenciais → ID do cliente OAuth*), escolha **Aplicativo da Web**. Em **Origens JavaScript autorizadas**, adicione `http://localhost:8765`.
5. Copie o **ID do cliente** (termina com `.apps.googleusercontent.com`). No app, cole-o em **Base de preços → Configuração do acesso ao Google**.
6. Clique em **Atualizar da planilha do Google**, escolha a conta da empresa e permita a leitura das planilhas.

Se a TI da empresa bloquear apps de terceiros, ela precisa liberar esse projeto. Como o público é "Interno", só contas da empresa conseguem entrar.

### Por arquivo .xlsx (alternativa)

1. No Google Planilhas: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.
2. No app: **Base de preços → Carregar arquivo .xlsx**.

Custeios antigos mantêm os preços de quando foram feitos. Ao abrir um deles, uma faixa amarela oferece **Atualizar preços**.

## De onde vêm os números

- **Aba BD_Estruturas**: produto, código da matéria-prima, quantidade e valor da última compra.
- **Custo do produto**: soma de quantidade × valor (sem IPI). É o mesmo número da coluna "CUSTO" da planilha.
- **Só matéria-prima**: a planilha não traz mão de obra nem outros custos. Lance esses valores como item avulso.
- **Descrição dos produtos**: vem das abas Aux e IR_Produção. Os produtos sem descrição podem receber uma dentro do custeio.

## Cuidado

Os custeios ficam guardados **no navegador deste computador**. Use **Meus custeios → Exportar cópia** de vez em quando. Se limpar os dados do navegador ou trocar de computador, use **Importar cópia** para recuperar tudo.

## Arquivos

| Arquivo | O que é |
|---|---|
| ObraCusto (atalho) | abre o app, com o ícone; vale só para esta pasta neste computador |
| Abrir ObraCusto.bat / Fechar ObraCusto.bat | abre o app de qualquer pasta / encerra o servidor do app |
| servidor.py | servidor local que o atalho liga escondido |
| index.html, app.js, estilo.css | o app |
| dados.js | preços e estruturas que vieram com o app (gerados da planilha de 22/10/2026) |
| importar.js | monta a base a partir da planilha (Google ou arquivo .xlsx) |
| google.js | login Google e leitura da planilha pela Google Sheets API |
| exportar.js | gera a planilha de custeio no formato do modelo |
| modelo.js | o Modelo.xlsx guardado dentro do app, só com a formatação |
| Modelo.xlsx | o modelo original da exportação |
| manifest.webmanifest | nome e ícone do app para o navegador |
| ICONE.png, img/ | ícone original e as versões geradas dele (logo sem fundo, ícone quadrado, icone.ico do atalho) |
| lib/ | bibliotecas SheetJS (ler Excel) e JSZip (montar o Excel exportado) |
| ferramentas/ | `limpar-modelo.js` (refaz o modelo.js quando o Modelo.xlsx mudar) e `gerar-icones.py` (refaz as imagens quando o ICONE.png mudar) |
