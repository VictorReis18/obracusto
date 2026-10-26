# ObraCusto — custeio de obras (uso interno)

App para levantar o **custo** dos produtos que vão entrar num orçamento. O orçamento para o cliente é feito depois, a partir deste custeio. **Nada daqui é para enviar ao cliente.**

## Como abrir

### Pelo site (para todos)

Abra **https://victorreis18.github.io/obracusto/** no Chrome ou no Edge.

- **Não precisa instalar nada.** Toda atualização publicada chega sozinha na próxima vez que o app for aberto.
- **Para ter o ícone na área de trabalho ou na barra de tarefas:**
  - **Chrome:** menu **⋮ → Transmitir, salvar e compartilhar → Instalar página como app…**
  - **Edge:** menu **… → Aplicativos → Instalar este site como um aplicativo**

  Ele passa a abrir numa janela própria, com o ícone do ObraCusto.
- **Primeira vez:** o app abre em **Base de preços**. Clique em **Atualizar da planilha do Google** e entre com a sua conta da empresa (precisa ter acesso à planilha de custos).

### Pelo computador (alternativa, sem internet para o app)

Dê dois cliques no atalho **ObraCusto** ou em **Abrir ObraCusto.bat**. O app abre em `http://localhost:8765`.

- O servidor do app (`servidor.py`) roda escondido, sem janela, e só atende este computador.
- **Encerra sozinho:** cerca de 3 minutos depois que você fecha a última janela do app, o servidor se encerra.
- **Se aparecer a faixa vermelha** "O ObraCusto foi encerrado neste computador", abra de novo pelo atalho. Nada se perde.
- **Para encerrar na hora:** use **Fechar ObraCusto.bat**.
- **Requisito:** precisa do Python instalado. O atalho ObraCusto guarda o caminho desta pasta; se a pasta mudar de lugar, use o .bat.

> **Custeios salvos:** cada endereço do app guarda os seus custeios separados no navegador (o site, o `localhost:8765` e o `index.html` aberto direto são endereços diferentes). Para levar custeios de um para outro:
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

**Configuração inicial no Google Cloud (uma vez só, para todos)**, feita com a conta da empresa:

1. Entre em **console.cloud.google.com** e crie um projeto (ex.: "ObraCusto"). Se aparecer que você não tem permissão para criar projetos, peça à TI.
2. Em *APIs e serviços → Biblioteca*, procure **Google Sheets API** e clique em **Ativar**.
3. Em *Google Auth Platform* (ou *Tela de permissão OAuth*), preencha o nome do app ("ObraCusto") e o seu e-mail, e escolha o público **Interno**.
4. Em *Clientes* (ou *Credenciais → Criar credenciais → ID do cliente OAuth*), escolha **Aplicativo da Web**. Em **Origens JavaScript autorizadas**, adicione:
   - `https://victorreis18.github.io` (o site);
   - `http://localhost:8765` (o app aberto pelo atalho).
5. Copie o **ID do cliente** (termina com `.apps.googleusercontent.com`) e mande para o Claude: ele deixa o ID gravado no app, assim os colegas não precisam configurar nada.
6. Clique em **Atualizar da planilha do Google**, escolha a conta da empresa e permita a leitura das planilhas.

Se a TI da empresa bloquear apps de terceiros, ela precisa liberar esse projeto. Como o público é "Interno", só contas da empresa conseguem entrar.

### Por arquivo .xlsx (alternativa)

1. No Google Planilhas: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.
2. No app: **Base de preços → Carregar arquivo .xlsx**.

Custeios antigos mantêm os preços de quando foram feitos. Ao abrir um deles, uma faixa amarela oferece **Atualizar preços**.

## Publicar atualizações do app

O código do app fica no GitHub: **https://github.com/VictorReis18/obracusto**. O site é atualizado a partir dele.

- **Para mudar algo:** peça ao Claude. Ele faz a mudança, testa e publica.
- **Depois de publicar:** em 1 ou 2 minutos o site já está atualizado para todos. Quem estiver com o app aberto vê a mudança ao recarregar a página (F5).
- **O que nunca vai para o GitHub:** preços, estruturas, custeios e planilhas. O repositório é público, mas só tem o código; os dados vêm da planilha do Google, com o login de cada pessoa.

## De onde vêm os números

- **Aba BD_Estruturas**: produto, código da matéria-prima, quantidade e valor da última compra.
- **Custo do produto**: soma de quantidade × valor (sem IPI). É o mesmo número da coluna "CUSTO" da planilha.
- **Só matéria-prima**: a planilha não traz mão de obra nem outros custos. Lance esses valores como item avulso.
- **Descrição dos produtos**: vem das abas Aux e IR_Produção. Os produtos sem descrição podem receber uma dentro do custeio.

## Cuidado

Os custeios ficam guardados **no navegador de cada computador**. Use **Meus custeios → Exportar cópia** de vez em quando. Se limpar os dados do navegador ou trocar de computador, use **Importar cópia** para recuperar tudo.

## Arquivos

| Arquivo | O que é |
|---|---|
| index.html, app.js, estilo.css | o app |
| importar.js | monta a base a partir da planilha (Google ou arquivo .xlsx) |
| google.js | login Google e leitura da planilha pela Google Sheets API |
| exportar.js | gera a planilha de custeio no formato do modelo |
| modelo.js | o Modelo.xlsx guardado dentro do app, só com a formatação (sem os dados de exemplo) |
| manifest.webmanifest | nome e ícone do app para "Instalar como app" no navegador |
| img/ | imagens geradas do ICONE.png: logo sem fundo (topo e impressão), ícone quadrado (aba e app instalado) e icone.ico (atalho do Windows) |
| ICONE.png | ícone original do app |
| lib/ | bibliotecas SheetJS (ler Excel) e JSZip (montar o Excel exportado) |
| servidor.py, Abrir/Fechar ObraCusto.bat | uso pelo computador, sem o site |
| ferramentas/ | `limpar-modelo.js` (refaz o modelo.js quando o Modelo.xlsx mudar) e `gerar-icones.py` (refaz as imagens quando o ICONE.png mudar) |
| dados.js, Modelo.xlsx, ObraCusto (atalho) | só neste computador; não vão para o GitHub |
