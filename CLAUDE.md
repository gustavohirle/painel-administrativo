# CLAUDE.md

Contexto do projeto para o Claude Code. Leia inteiro antes de escrever código.

---

## 1. O que é este projeto

Um **painel administrativo para lojas Nuvemshop**, construído para o dono de uma
fábrica de cosméticos que fatura cerca de R$ 3 milhões/mês em várias lojas.

O objetivo dele, nas palavras do cliente: **um raio-x de tudo que acontece na
empresa** — quanto vendeu, quanto realmente entrou, quanto custou fabricar,
quanto foi para os influencers, e o que sobrou.

### Estado atual

O produto está sendo construído para valer (Next.js, banco, integração real),
mas roda em **modo demonstração** por padrão: dados fictícios determinísticos,
funcionando 100% offline. Isso existe por dois motivos:

1. O cliente ainda não aprovou o projeto. A primeira reunião é uma
   demonstração e não temos as credenciais da API dele.
2. Mesmo depois de aprovado, poder demonstrar sem expor números reais continua
   valendo.

O modo real (`FONTE_DADOS=live`) liga a API real e o Postgres. Ele roda **ao
lado** da demonstração, com o próprio `.env.live` e na porta 3001, e está
pronto esperando a chave da Nuvemshop (aplicativo "painel-de-relatrios") — ver
seção 12 e `DADOS_REAIS.md`. Nenhuma regra de negócio muda nessa troca — ver
seção 3.

### O problema do cliente

Hoje a gestão é feita em planilhas baixadas manualmente do painel da Nuvemshop.
Consequências:

- Ele enxerga o **faturamento bruto** e trata isso como receita.
- Ele paga **30% de comissão aos influencers sobre o bruto**, sem descontar
  pedidos cancelados, reembolsados, boletos/Pix nunca pagos, nem o frete.
- O custo de fabricação vive numa planilha separada, sem ligação com as vendas.
  Ninguém sabe a margem real por produto.
- Ninguém sabe a taxa de carrinho abandonado nem o ciclo de recompra.

### A tese que o painel precisa provar em 10 segundos

> "R$ 3,1 milhões faturados não são R$ 3,1 milhões recebidos — e a comissão
> está sendo calculada sobre o número errado."

Essa é a mensagem central. Se uma tela, um gráfico ou uma métrica não ajuda a
contar essa história ou a chegar no lucro real, ela não entra.

---

## 2. Quem vai olhar a tela

O cliente tem por volta de 55 anos, não é técnico, e vê o painel em dois
contextos, não em um:

1. **Tela grande, numa reunião**, por poucos minutos. É onde a tese precisa
   ser provada em 10 segundos.
2. **No celular, no dia a dia.** Confirmado pelo cliente. Deixou de ser
   "não pode passar vergonha se ele abrir no telefone" e virou requisito de
   primeira classe.

Consequências obrigatórias para a UI:

- Números grandes e legíveis à distância. Nada de fonte 12px como protagonista.
- Zero jargão técnico na interface. Escreva "não pagos", não `payment_status pending`.
- Reais formatados em pt-BR (`R$ 3.142.800`), datas em pt-BR.
- Tudo em português do Brasil, inclusive rótulos de gráfico e mensagens de erro.
- A tela precisa funcionar sem internet. Nada de CDN, nada de fonte remota,
  nada de biblioteca que baixe algo em runtime.
- Um selo discreto e permanente indicando **"Dados de demonstração"** enquanto
  `FONTE_DADOS=demo`. Não pode parecer que estamos mostrando os números reais
  dele — isso destruiria a confiança.
- Não quebra em 1366×768 (notebook comum).
- **Funciona de verdade em 390px de largura** — ver 2.1.

O código-fonte, ao contrário, é lido por mim (programador). Comentários e nomes
de variáveis em português são bem-vindos, mas priorize clareza.

**O texto que aparece na tela é escrito em português correto**, com acento e
cedilha: "Comissões", "Evolução", "não pago", "Situação", "fabricação". Isso
vale para título, rótulo, frase de apoio, mensagem de erro de formulário, nome
de produto e de marca, e para o texto dentro do PDF.

Já foi o contrário. O projeto inteiro nasceu sem acento e a regra dizia para
manter assim; o cliente olhou a tela e a primeira coisa que notou foi a
ortografia. Um painel que escreve "Comissoes" para quem fatura R$ 3 milhões por
mês parece inacabado antes de qualquer número ser lido.

**O que continua sem acento é o CÓDIGO**, e a distinção é operacional, não
estética:

| Leva acento | Não leva, nunca |
|---|---|
| Texto de JSX, rótulos, mensagens | Nome de variável, função, componente |
| `placeholder`, `title`, `alt` | Chave de objeto (`situacao:`) |
| Valores de `ROTULO_*`, `EXPLICACAO_*` | Valor gravado no banco (`"aguardando"`, `"bruto"`) |
| Nome de produto e marca | Classe de CSS (`.linha-de-edicao`) |
| Mensagem de Zod e de Server Action | Parâmetro de URL (`?situacao=`) |

Acentuar a coluna da direita quebra o cadastro, os dados já salvos e as rotas.
`situacao` é ao mesmo tempo palavra de tela e nome de campo: só a primeira muda.

### Como fazer isso sem quebrar tudo

Duas tentativas falharam antes de acertar, e as duas valem registro:

1. **Expressão regular sobre `>...<` não funciona.** O `>` de uma arrow
   function abre um falso trecho de texto; o script moveu chaves de lugar e
   corrompeu 36 arquivos de uma vez. Regex não distingue texto de código em JSX.
2. **Dicionário de palavras não basta.** `e`/`é`, `ha`/`há`, `esta`/`está`,
   `tem`/`têm`, `a`/`à` dependem da frase. Essas foram corrigidas uma a uma,
   lendo. E cuidado com o efeito colateral: `fabrica` → `fábrica` transformou
   `fabrica-los` em `fábrica-los`.

O que funcionou foi usar o **parser do próprio TypeScript** para localizar os
nós de texto (`JsxText`, atributo de exibição, string dentro de `{ternário}`,
valor de mapa de rótulos) e trocar só esses trechos. Fica em
`scripts/acentuar.mjs` (texto de tela) e `scripts/acentuar-mensagens.mjs`
(mensagens de Server Action), com o dicionario em `scripts/acentuar-palavras.json`.

Três categorias escapam da varredura e precisam de olho:

- string dentro de `{condicao ? "a" : "b"}` no meio do JSX;
- mensagem de Zod (`.min(3, "Escreva o nome")`);
- nome de produto **já gravado** em `.demo-data` — mudar a fonte não muda o
  dado salvo. Renomeie no arquivo também, preservando `chave`, `id` e `token`.

### 2.1 O que "funciona no celular" quer dizer aqui

Não basta não quebrar. Medido em 390px, o layout já não transbordava e mesmo
assim a tela era inútil — por três motivos que não aparecem olhando o HTML:

| Armadilha | Como aparecia |
|---|---|
| Texto dentro de SVG encolhe junto com o `viewBox` | Um gráfico de `viewBox` 1200 espremido em ~294px escala a fonte por 0,245: fonte 14 chegava com **3,2px** |
| `overflow-x-auto` não resolve tabela larga | A tabela rolava, mas só "Marca" e "Base do contrato" cabiam; comissão e diferença — a conversa inteira — ficavam duas telas à direita |
| Cabeçalho com tudo em `flex-wrap` | Cinco linhas empilhadas antes de qualquer conteúdo |

As três decisões que valem daqui para frente:

1. **Gráfico SVG tem dois formatos**, não um redimensionado. O estreito tem
   menos largura, menos margem e menos rótulo — ver `Formato` em
   `EvolucaoMensal.tsx`. Ao criar gráfico novo, meça a fonte resultante:
   `fontSize × (largura renderizada ÷ largura do viewBox)` precisa passar de
   ~10px.
2. **Tabela de leitura vira cartão empilhado no celular** (`sm:hidden` para os
   cartões, `hidden sm:block` para a tabela). Vale para raio-x do resultado,
   meios de pagamento e relatórios — telas em que a pessoa
   lê uma linha por vez e precisa da conclusão.
3. **O formulário de edição precisa da classe `linha-de-edicao`.** Ele mora
   numa `<tr>` com `colSpan` logo abaixo do item, e isso continua certo — mas a
   célula herda a largura da **tabela**, não a da tela. Sem a classe, o
   formulário nascia com 900px numa tela de 390 e só era alcançável arrastando
   de lado. A classe prende a largura na tela e gruda o bloco à esquerda, para
   ele não sumir quando a tabela rolar.
4. **A barra de abas rola de lado, não quebra em linhas.** São onze seções;
   em 390px elas somam ~650px. Até aqui as abas dividiam a linha do cabeçalho
   com o logo e o menu do usuário num `flex-wrap` único, e a lista quebrava no
   meio: a segunda fileira começava embaixo do logo, desalinhada de tudo. O
   problema não era o espaço — era a barra tentar ser uma linha só quando não
   cabe em uma. Agora a faixa ocupa a largura inteira, numa linha própria, e
   rola; a aba ativa é trazida para o campo de visão por `scrollLeft` na mão
   (`scrollIntoView` sobe pela árvore e rola a **página** junto, o que num
   cabeçalho grudado no topo empurra o conteúdo para baixo ao carregar).
5. **Tabela de cadastro continua tabela**, com a classe `tabela-ancorada`
   (definida em `globals.css`): a primeira coluna gruda e o resto rola. Ali o
   ponto é comparar linha com linha e achar a que está fora da curva, e cartão
   destrói essa leitura. A âncora tem teto de `42vw` — sem isso o nome do
   produto tomava metade da tela e o número que a pessoa rolou para ver ficava
   cortado.

A auditoria tinha um alarme falso escondido: ela tratava **todo**
`.overflow-x-auto` que rolasse como "tabela sem coluna âncora". Funcionou
enquanto o único rolador horizontal era tabela; a faixa de abas foi o primeiro
que não é, e passou a ser acusada em todas as rotas. O filtro agora exige um
`<table>` dentro.

A régua para conferir é `npm run celular`, que abre cada rota em 390px e falha
se houver transbordo, texto de gráfico abaixo de 9px na tela, tabela rolando sem
coluna âncora, ou formulário de edição maior que a tela. Ver seção 11.

**Ele clica em "Editar" (e em "Contar", no estoque).** A primeira versão da
auditoria media a página parada e por isso não viu o formulário de edição
estourando — o formulário nem existe no HTML inicial. Ao acrescentar checagem
nova, pergunte se o defeito aparece só depois de um clique.

### 2.2 O mês escolhido vale para todas as abas

Pedido do cliente: escolhido um mês no cabeçalho, ele fica **até ser trocado**.
Antes o mês morava só na URL (`?mes=`), os links das abas não o levavam, e
trocar de aba voltava para o último mês — setembro numa tela, julho na outra,
sem aviso.

O seletor grava a escolha num **cookie de sessão** (`painel_mes`), e toda
página decide o mês por `mesDaTela`: o da URL, depois o do cookie, depois o
mais recente (`escolherMes`, com teste). Mês que saiu da base é ignorado.

Duas decisões:

- **O mês padrão não é gravado.** Só a troca e o `?mes=` escrito no endereço
  (link compartilhado) viram cookie. Se o padrão fosse gravado, quando outubro
  começasse o painel continuaria em setembro sem ninguém ter escolhido isso.
- **Cookie de sessão, sem validade.** Fechar o navegador volta para o mês mais
  recente — que é o que a pessoa espera ao abrir o painel no dia seguinte.

Relatórios não usa esse mês: tem período próprio, na URL.

---

## 3. Decisão de arquitetura mais importante

**As funções de cálculo recebem o formato de resposta real da API da Nuvemshop,
não um formato inventado.**

Os dados fictícios são gerados já no shape de `Pedido[]` da Nuvemshop. As
funções de métricas consomem esse shape. Trocar o mock pela API real muda só a
camada de busca — nenhuma lógica de negócio é reescrita.

```
src/
  types/
    nuvemshop.ts          # tipos espelhando a API oficial (Pedido, Cliente, ...)
    dominio.ts            # o que a Nuvemshop NÃO sabe: custo e comissão
  data/
    source.ts             # interface FonteDePedidos
    mockSource.ts         # implementa FonteDePedidos com dados fictícios
    apiSource.ts          # implementa FonteDePedidos com a API real (HTTP)
    cachePedidos.ts       # copia em disco dos pedidos reais (secao 12)
    geradorPedidos.ts     # gerador determinístico (seed fixo)
    catalogo.ts           # marcas e produtos fictícios
    costRepository.ts     # interface RepositorioCadastros + dados iniciais
    demoCostRepository.ts # persiste em arquivo local (offline)
    prismaCostRepository.ts # persiste no Postgres
    index.ts              # ÚNICO lugar que decide demo vs. live
  lib/
    metrics.ts            # funções PURAS: Pedido[] -> métricas
    nuvemshop.ts          # funções PURAS: pedido cru da API -> Pedido
    costing.ts            # funções PURAS: Pedido[] + cadastros -> lucro
    format.ts             # formatação pt-BR
    config.ts             # leitura de env
    pdf.ts                # gerador de PDF escrito à mão, sem dependência
    ordens.ts             # ordem de fabricação: número, token, hash, documento
  components/
  app/                    # Next.js App Router
```

Regras:

- `lib/metrics.ts` e `lib/costing.ts` não importam React nem fazem I/O. Só
  recebem dados e devolvem números. São as peças que precisam ter testes.
- Nenhum componente calcula métrica inline. Componente só formata e exibe.
- O `if` entre demo e live existe **em um lugar só**: `src/data/index.ts`.
- Cálculo pesado roda em Server Component. O cliente recebe agregado, nunca
  a lista de 45 mil pedidos.

---

## 4. Estrutura de dados da Nuvemshop (referência)

Campos do objeto `Order` que importam aqui. Use exatamente estes nomes.

| Campo | Uso |
|---|---|
| `id`, `number` | identificação |
| `created_at` | data do pedido (ISO 8601) — usada para agrupar por mês |
| `paid_at` | data do pagamento, `null` se não pago |
| `status` | `open` \| `closed` \| `cancelled` |
| `payment_status` | `pending` \| `authorized` \| `paid` \| `voided` \| `refunded` \| `abandoned` |
| `shipping_status` | `unpacked` \| `unfulfilled` \| `fulfilled` |
| `subtotal` | valor dos produtos, string decimal |
| `total` | total incluindo frete e descontos, string decimal |
| `discount` | desconto aplicado |
| `shipping_cost_customer` | frete cobrado do cliente |
| `shipping_cost_owner` | frete que a loja paga à transportadora |
| `gateway_name` | nome do meio de pagamento |
| `payment_details.method` | `credit_card`, `boleto`, `pix`, etc. |
| `cancel_reason` | `customer` \| `fraud` \| `inventory` \| `other` |
| `customer.id`, `customer.email` | identificar cliente recorrente |
| `products[]` | `product_id`, `variant_id`, `name`, `price`, `quantity`, `sku` |

Há um campo **fora da API**: `marca`. Cada marca do cliente é uma loja
Nuvemshop separada; ao consolidar várias lojas num painel só, carimbamos a
origem nesse campo. Em modo live ele vem do `store_id` de cada credencial.

**Atenção:** valores monetários vêm como **string** (`"5190.00"`). Converta uma
vez, na borda, com `paraNumero()`. Não faça aritmética em string.

Endpoints: `GET /v1/{store_id}/orders` e `GET /v1/{store_id}/checkouts`
em `https://api.nuvemshop.com.br`, com filtros `created_at_min`,
`created_at_max`, `updated_at_min`, `updated_at_max`, `status=any`,
`payment_status=any`, `page`, `per_page` (máx. 200). Autenticação por
`Authorization: Bearer {token}` na versão nova; a `/v1` usa
`Authentication: bearer`, e o cliente manda os dois. `User-Agent` com nome do
aplicativo e contato é obrigatório (sem ele, 400).

**A versão é a `v1`, não a `2025-03`.** Na loja real, a listagem da 2025-03
veio sem `shipping_cost_customer`, sem `shipping_cost_owner` e sem `shipping_*`
— o frete foi para `fulfillments[]`, que só traz transportadora e modalidade.
O frete entraria zerado. Ver seção 12, "O que a loja real mostrou".

O exemplo da própria documentação mistura tipos: `total` vem como texto,
`shipping_cost_customer` como número, `quantity` como texto e as datas em UTC
no formato `2022-11-15T19:36:59+0000`. A conversão na borda
(`converterPedido`, seção 12) aceita todos e entrega o formato acima.

---

## 5. Regras de negócio (as contas que o painel faz)

Esta seção é a especificação. Implemente exatamente assim.

### 5.1 Reconciliação de faturamento (o gráfico principal)

```
bruto           = soma de total de TODOS os pedidos criados no período
não pago        = soma de total onde payment_status ∈ {pending, abandoned}
cancelado       = soma de total onde status = cancelled
reembolsado     = soma de total onde payment_status ∈ {refunded, voided}
recebido        = bruto − não pago − cancelado − reembolsado
frete           = soma de shipping_cost_customer dos pedidos recebidos
receita real    = recebido − frete
```

Exibida como **gráfico de pizza**, com onze fatias (doze na loja real, com a
Intelipost). É o herói da tela.

A cascata foi tentada e descartada: com a cadeia completa (ver 5.8) ela vira
onze barras em degrau, com os rótulos em alturas diferentes e os textos de
apoio se sobrepondo. Ilegível justamente numa tela de reunião, que é onde ela
precisa funcionar.

A pizza só fecha porque as parcelas **somam exatamente** o bruto:

```
bruto = não pago + cancelado + reembolsado + frete da transportadora + Intelipost
      + impostos + DIFAL + taxas (Nuvemshop, cartão e pix) + fabricação
      + influencers + sócios + lucro operacional
```

A fatia **Influencers** é comissão **mais** despesas cadastradas (5.16). As duas
saem do lucro, então a fatia precisa carregar as duas para a pizza fechar.

Se mexer nessa conta, a pizza deixa de fechar — e é o primeiro lugar onde o
erro aparece.

**O frete se divide em duas fatias.** O cliente paga, por pedido, o frete da
transportadora (`shipping_cost_owner`) mais R$ 0,73 que vão para a
**Intelipost**, a plataforma de frete da loja real (`INTERMEDIARIO_FRETE`).
Os R$ 0,73 apareceram como diferença entre `shipping_cost_customer` e
`shipping_cost_owner` em todo pedido pago desde julho/2026 (em fevereiro, zero),
e o dono confirmou de quem são. `reconciliar` devolve `freteTransportadora`
e `freteIntermediario`, que somam `frete`: nenhuma conta muda, só a leitura.
A fatia da Intelipost some quando é zero (a demonstração não tem). Custo da
transportadora ausente (`"0.00"`) deixa o frete inteiro com ela, e a loja
pagando mais que cobrou (frete grátis) não é modelado.

**A fatia de taxas é uma só**: Nuvemshop, cartão e pix juntos. O cadastro é por
meio de pagamento, e a taxa do plano da Nuvemshop, se houver, entra somada ao
percentual de cada meio. Na loja real o pix é **0,99%, só sobre pix pago**
(Nuvem Pago, informado pelo dono); o cartão ainda é a referência de 4,99%.

O **DIFAL é fatia própria**, separada dos demais impostos, porque é devido ao
estado de DESTINO e não ao de origem — decisão diferente, conversa diferente.
`dre.totalImpostos` já inclui o DIFAL, então a fatia "Impostos" é a subtração
dos dois.

A fatia do lucro sai do círculo (explodida) e os subtotais que a leitura
sequencial dava de graça — recebido e receita real — entram como dois números
abaixo da legenda: sem eles, os dois valores que sustentam a conversa sobre a
base da comissão sumiriam do gráfico.

Fatia abaixo de 4% não recebe percentual dentro dela; o número fica na legenda
e no tooltip.

**Resultado negativo muda de nome e de cor.** Com prejuízo, o quadro do
resultado na legenda, o número do topo da tela inicial e a última linha do
raio-x dizem **"Prejuízo operacional"**, em vermelho, com o valor **sem sinal**.
Antes continuavam "Lucro operacional" em verde com `-R$ 75.621` — o cliente
apontou na primeira vez que o mês fechou negativo. Verde e "lucro" afirmam o
contrário do número; e "prejuízo de −R$ 75 mil" seria dupla negação.

Precedência obrigatória para não contar o mesmo pedido duas vezes:
`cancelado > reembolsado/estornado > não pago > recebido`. Está implementada em
`classificarPedido()` e documentada lá.

### 5.1.1 O frete é do cliente

**O frete não entra em comissão nem em imposto.** Decisão do cliente: o frete é
cobrado **por fora** — num produto de R$ 100 com R$ 19 de frete o cliente paga
R$ 119 — e os R$ 19 vão para a transportadora. Não é venda do influencer nem
receita da operação.

| Conta | Base | Onde |
|---|---|---|
| Comissão, base "bruto" | faturamento **sem frete** (`brutoSemFrete`, todos os pedidos) | `calcularComissoesPorInfluencer` |
| Comissão, base "recebido" / "receita real" | receita real (recebido − frete) — as duas passam a dar o mesmo valor | idem |
| **Comissão, base "o que cai na conta"** (`liquido`, a praticada) | receita real − taxas da Nuvemshop e do pagamento (`porMarca` de `apurarTaxasPlataforma`) | idem |
| Impostos, DAS, Presumido, RBT12 | receita real | `apurarImpostos`, `calcularRBT12` |
| DIFAL | valor da operação − frete | `apurarDifal` |
| Divisão das despesas compartilhadas | faturamento sem frete | `ratearDespesas` |
| Taxa do meio de pagamento | valor pago **com** frete | o gateway cobra sobre o total |
| Participação dos sócios | recebido, **com** frete | definição do cliente: "do valor recebido" |

`Reconciliacao` ganhou `freteTotal` (frete de **todo** pedido criado, pago ou não)
e `brutoSemFrete`. A base "bruto" precisa do frete dos não pagos também, senão um
boleto nunca pago continuaria comissionando o frete dele.

**Ponto para o contador:** na legislação, o frete cobrado do destinatário
costuma integrar a base de ICMS, PIS/COFINS e a receita bruta do Simples. Tirá-lo
dos impostos foi pedido do cliente e deixa o imposto do painel **menor** do que
o que pode ser devido. Se o contador discordar, a mudança é voltar a base de
`apurarGrupo`, `calcularRBT12` e `apurarDifal` para o recebido com frete — a
comissão fica como está.

### 5.1.2 A comissão é sobre o que cai na conta

Regra do cliente, dita em 16/09/2026 ao ligar a loja real: **o influencer
ganha sobre o produto, sem o frete, sem a taxa da Nuvemshop e sem a taxa do
cartão** — "basicamente o que cai na conta da empresa, fora o frete".

```
base "liquido" = recebido − frete − taxas de plataforma e pagamento
               = receita real − taxas
```

Virou a quarta base (`liquido`, "O que cai na conta (sem frete)"), a primeira do
formulário e o padrão de contrato novo (`BASE_PADRAO_CONTRATO`) e de marca sem
contrato (`BASE_SEM_CONTRATO`). As outras três continuam, para contrato que
fuja da regra. A base da demonstração **não** mudou: os contratos semeados
seguem sobre o bruto, que é a tese da seção 1.

Três decisões:

1. **A taxa descontada é a MESMA que a DRE desconta.** `apurarTaxasPlataforma`
   devolve `porMarca`, e é esse número que `calcularComissoesPorInfluencer`
   recebe — inclusive a taxa sobre pedido não pago, quando a linha da taxa
   incide sobre todo pedido criado. Uma segunda conta de taxa só para a
   comissão seria o mesmo número por outro caminho, e um dia divergiria.
2. **A taxa sobre o frete também sai.** O gateway cobra sobre o valor pago com
   frete; "o que cai na conta, fora o frete" é o valor pago − taxa − frete.
3. **Sem as taxas, a base sai igual à receita real** — o mesmo que a DRE faz
   quando não recebe as taxas ("antes delas").

Os dois simuladores seguem a regra. No de preço, a comissão de uma venda é
`% × (preço − (preço + frete) × taxa)`, e o preço mínimo ganha o termo
`frete × (taxa + sócios − comissão × taxa)`; no de influencer,
`% × (receita real − taxa)`. Os testes de identidade com a DRE continuam
fechando — no de preço, com contrato `liquido`, a comissão bate **inteira**,
porque essa base só tem pedido pago.

### 5.2 Comissão de influencer (simulador)

**Esta tela não existe mais.** Morou na tela inicial, depois embaixo da
estimativa de contrato no Simulador (5.17), e saiu a pedido do cliente quando a
estimativa passou a funcionar: as duas respondiam a mesma conversa. O
componente (`AreaComissao`) foi apagado; as funções puras abaixo continuam em
`costing.ts`, com teste, e as regras desta seção valem se a tela voltar.

**A base é sempre a do contrato daquele influencer. O percentual é editável.**

```
comissão da marca        = pct × valor da base do contrato dela
comissão sobre real      = pct × receita real da marca
diferença mensal         = comissão do contrato − comissão sobre real
projeção anual           = diferença mensal × 12
```

Exibir a comissão sobre a receita real de quem tem contrato sobre o bruto seria
um número que **não existe em lugar nenhum** — ninguém paga e ninguém recebe
aquilo. Por isso cada linha mostra só a base que o contrato usa, e a célula
correspondente (bruto, recebido ou receita real) ganha realce: é ali que o
percentual incide.

A comparação com a receita real continua, mas como **coluna ao lado**. Ela some
quando o contrato já é sobre a receita real — ali não há duas bases para
comparar, e um zero pareceria um valor calculado. Entra um traço.

O percentual vem do **simulador**, não do contrato: o cliente vai querer testar
cenários na reunião. Quando ele foge do percentual cadastrado, a linha mostra
`contrato: 25%` em texto pequeno — senão o número da tela contradiz o cadastro
sem dizer por quê.

**O topo do simulador mostra a comissão devida por BASE DE CONTRATO**, não três
totais. Antes havia três cartões — "pelos contratos", "se todas fossem sobre a
receita real" e "diferença" — que respondiam *quanto sai no total*. Faltava a
pergunta do meio, que é a que decide a conversa: **de onde sai**. Com a quebra
fica visível de qual modalidade vem a comissão, e é ali que renegociar tem
efeito; sem ela, o total parecia um número único com uma regra única. Na base
semeada, por pedido do cliente, **todos os contratos são sobre o bruto** (a
Verte Natural era 25% sobre o recebido), então o topo mostra uma modalidade só.
A base continua escolhível no cadastro, e a quebra volta a aparecer assim que
algum contrato usar outra. Cada modalidade mostra o valor, a participação, as marcas, o valor
sobre o qual incide e quanto acrescenta em relação à receita real.

Base que nenhum contrato usa **não** vira cartão de zero: "Sobre a receita real
— R$ 0,00" afirmaria que existe uma modalidade rendendo nada, quando o que
existe é nenhuma marca nela. O agrupamento é `agruparComissoesPorBase` em
`costing.ts`, com teste de que a soma das modalidades bate com o total geral.

O total geral e a diferença do mês continuam, numa linha de fecho abaixo da
quebra — o texto de apoio antigo dizia "entre os dois números ao lado", que
além de posicional deixava de fazer sentido quando os cartões empilhavam no
celular.

**A palavra "diferença" é definida na própria tela**, num parágrafo fixo acima
da tabela. O cliente perguntou o que aquilo era: um rótulo sozinho não responde,
e a explicação tem que caber onde o número aparece.

Marca sem influencer ativo vinculado cai em `BASE_SEM_CONTRATO` = `bruto`, que é
o que se pratica hoje. Assumir a base mais favorável à empresa mostraria uma
comissão **menor** do que a que ele efetivamente paga.

O cruzamento marca × contrato roda no servidor (`cruzarMarcasComContratos`); o
navegador só multiplica quando o percentual muda (`aplicarPercentualNosContratos`).
São duas funções puras em `costing.ts`, e é por isso que o simulador responde na
hora e sem internet.

### 5.3 Por marca

Uma linha por marca: marca e influencer, **base do contrato**, bruto, recebido,
% não pago, receita real, comissão, a mesma comissão sobre a receita real, e a
diferença. Ordenada pela diferença, desempatando pela comissão.

Destaque visual quando `% não pago > 20%` — indica público de baixa qualidade
ou excesso de boleto, e é um insight de venda.

### 5.4 Meios de pagamento

Distribuição de pedidos por `payment_details.method` com a taxa de não
pagamento de cada um. Explica de onde vem o vazamento.

### 5.5 Evolução

Últimos 6 meses, bruto vs. recebido. Mostra que o gap é estrutural.

### 5.6 Sinais adicionais (rodapé, discreto)

Carrinhos abandonados e valor, taxa de recompra, ciclo médio de recompra.
Existem para abrir conversa sobre as fases seguintes. Não desenvolver.

### 5.7 Custo de fabricação e CMV

Cada produto/variante da Nuvemshop pode ter uma ficha de custo com quatro
componentes: matéria-prima, embalagem, mão de obra e custo indireto rateado.

```
custo unitário = soma dos quatro componentes
CMV            = Σ (custo unitário × quantidade) sobre os pedidos RECEBIDOS
```

Só pedidos recebidos entram: boleto nunca pago normalmente nem chega a ser
produzido, e somar o custo dele esconderia a margem real.

Ficha de variante tem precedência sobre ficha de produto inteiro
(`varianteId: null`).

**Cobertura é obrigatória na tela.** Produto sem ficha não pode desaparecer do
cálculo em silêncio: o painel mostra quantos produtos faltam e quanto de
receita eles representam.

### 5.8 Raio-x do resultado (DRE)

```
faturamento bruto
− não pago, cancelado, reembolsado
= recebido
− frete
= receita real
− impostos sobre a venda
− taxa da plataforma e do meio de pagamento
= receita líquida
− CMV
= margem de contribuição
− comissões dos contratos cadastrados
− despesas com influencers (5.16)
− participação dos sócios (6% do recebido)
= lucro operacional
```

**Participação dos sócios** é custo fixo definido pelo cliente: **6% do
recebido** (`PERCENTUAL_PARTICIPACAO_SOCIOS`, em `lib/config.ts`). Sobre o
recebido, e não sobre o bruto, porque é dinheiro que precisa ter entrado para
ser distribuído. Tem fatia própria na pizza ("Sócios") e entra em **toda** conta
que chega ao lucro, porque todas saem de `montarDemonstrativo`: tela inicial,
relatórios e margem atual da operação. Os dois simuladores repetem a mesma
regra — no de produto como carga de 6% do preço (numa venda paga, preço é o
recebido), o que também sobe o preço mínimo e o sugerido; no de influencer
como 6% do recebido estimado — e os testes de identidade com a DRE continuam
fechando.

Atenção: a comissão da DRE vem dos **contratos cadastrados** (seção 5.9), não
do percentual do simulador da 5.2. Um é a realidade, o outro é cenário.

### 5.9 Cadastro de comissões

Cada influencer tem: nome, marca, percentual, base de cálculo
(`liquido` | `bruto` | `recebido` | `receitaReal`, ver 5.1.2), **regime tributário** (ver 5.10) e
ativo/inativo. Influencer inativo não entra em nenhum cálculo, nem de comissão
nem de imposto.

Um influencer por marca. Dois influencers na mesma marca tornariam ambíguo o
regime dos produtos dela — o primeiro ativo manda. A mesma regra resolve a base
de comissão no simulador da 5.2.

Os rótulos e as explicações de cada base (`ROTULO_BASE`, `EXPLICACAO_BASE`) moram
em `types/dominio.ts`, não nos componentes: duas telas falam da mesma base, e
textos diferentes para a mesma coisa fariam parecer que são duas contas.

### 5.10 Impostos

**O regime tributário mora no influencer, não numa configuração global.**

Cada influencer tem a sua marca, a sua loja Nuvemshop e os seus produtos — um
produto nunca pertence a dois. Na prática cada um é uma operação separada, e o
enquadramento acompanha o porte: as duas marcas menores cabem no Simples
Nacional; as três maiores passariam do teto de R$ 4,8 mi/ano e ficam no Lucro
Presumido. Apurar tudo num regime só daria um número que não corresponde a
nenhuma delas.

A cadeia é: **produto → influencer → regime → impostos**. Trocar o influencer
de um produto troca o conjunto de tributos que incide sobre ele, e o formulário
faz isso na hora.

**Não existe configuração de regime da empresa** — esse conceito foi removido
por inteiro (tipo, tela, tabela e repositório). Marca sem influencer vinculado
cai em `REGIME_SEM_INFLUENCER`, uma constante em `lib/config.ts`, até alguém
vincular.

A aba `/impostos` é um **catálogo dos tributos que podem incidir sobre um
produto**, organizado pelo regime em que cada um vale — não um seletor de
regime. Cada seção mostra quais marcas estão naquele regime, e a coluna
"apurado no mês" vem da própria apuração, não de uma multiplicação sobre a
receita consolidada (um imposto por produto incide só sobre os produtos
marcados; usar o consolidado superestimava).

No Simples:

```
RBT12          = receita dos últimos 12 meses (receita real: recebido sem frete)
alíquota efetiva = (RBT12 × nominal da faixa − parcela a deduzir) / RBT12
DAS do mês     = alíquota efetiva × receita real do mês (sem frete, ver 5.1.1)
```

A alíquota **efetiva** não é a da tabela — confundir as duas erra a conta em
milhares. A repartição por tributo vem da tabela oficial do Anexo II.

**O que está dentro do DAS nunca soma no total.** A guia única já é um valor
fechado; a quebra por tributo é só leitura. Somar as duas coisas dobra o
imposto. Por isso o cadastro de impostos guarda **apenas** o que é recolhido
por fora da guia.

O painel monitora os dois limites do regime **por marca**, que são diferentes:
passar do **sublimite** (R$ 3,6 mi) tira só o ICMS da guia; passar do **teto**
(R$ 4,8 mi) desenquadra do regime. O RBT12 também é por marca — somar as cinco
jogaria uma empresa pequena numa faixa que não é a dela.

Fora do Simples, um tributo pode incidir sobre a receita ou sobre **lucro
presumido**: base = `presunção × receita − dedução mensal`. A dedução existe
por causa do adicional de IRPJ, que é 10% sobre o que exceder R$ 20 mil/mês da
base presumida — sem ela, seria cobrado desde o primeiro real.

**A marcação do produto decide o tributo sobre a RECEITA.** Desde 16/09/2026,
por pedido do cliente: um tributo de `baseIncidencia: "receita"` só incide
sobre a receita dos produtos que o marcaram; sem nenhum produto marcado, ele
não é cobrado. Antes, só quem tinha `aplicacaoPorProduto` lia a marcação e o
resto incidia sobre a marca inteira — marcar PIS ou COFINS num produto não
mudava número nenhum, o que fazia a tela prometer uma escolha que não existia.

Duas consequências que precisam continuar visíveis:

- **Tributo sobre o LUCRO (IRPJ, CSLL) não se reparte por produto**: a base é a
  presunção sobre a receita real da marca, marcado ou não. No cadastro de
  produto ele aparece sem caixa de marcar, com a razão escrita ao lado.
- **Receita sem cadastro fiscal continua declarada** (`receitaSemCadastro`): com
  a regra nova, produto fora do cadastro deixa de pagar imposto sobre receita,
  e é esse aviso que impede a lacuna de passar por "imposto baixo".

`aplicacaoPorProduto` deixou de mandar na conta e passou a significar **"já vem
marcado no produto novo"** (`idsMarcadosPorPadrao`): no Lucro Presumido, os que
dependem do NCM — ICMS, ICMS-ST e IPI. PIS e COFINS nascem desmarcados e valem
assim que alguém os marcar.

**Tributo do regime que está inativo não some em silêncio.** Ele volta em
`inativosDoRegime` e a tela diz "o ICMS não está nesta conta", em vez de exibir
um total menor sem explicar por quê.

Os tributos vêm **já cadastrados com os básicos e editáveis**. PIS, COFINS,
IRPJ e CSLL do Presumido usam as alíquotas legais e nascem confirmados. ICMS
nasce ativo com 10% e **`confirmadoPeloContador: false`** — é ordem de grandeza
típica de indústria de cosmético em D2C, não apuração: a alíquota real depende
do destino da venda e é líquida de créditos de insumo, que o painel não modela.
IPI nasce ativo em 0%, que é o ponto de partida honesto (boa parte dos NCM de
cosmético é zero).

Toda alíquota carrega `confirmadoPeloContador`, que começa `false` e aparece
na tela como aviso. O painel nunca apresenta número fiscal como definitivo.

### 5.10.1 DIFAL de ICMS

Na venda interestadual ao consumidor final — que é o caso de uma loja
Nuvemshop — o ICMS se parte em dois: a alíquota **interestadual** fica na
origem, e a diferença entre a **interna do destino** e a interestadual vai para
o estado de destino. Essa diferença é o DIFAL.

```
DIFAL = (valor da operação − frete) × (alíquota interna do destino − interestadual)
```

O estado de destino vem de `shipping_address.province` do pedido. A Nuvemshop
devolve ora a sigla, ora o nome por extenso, com ou sem acento —
`normalizarUF` resolve num lugar só; sem isso o mesmo estado vira três linhas
no relatório.

**Alíquota interestadual** (Resolução do Senado 22/1989): 12% em toda operação,
caindo para 7% **somente** quando a origem está no Sul ou Sudeste (exceto ES) e
o destino está no Norte, Nordeste, Centro-Oeste ou ES. De Goiás, portanto, é
sempre 12%.

Três regras que mudam o resultado e são fáceis de errar:

1. **Venda dentro do próprio estado não tem DIFAL.** Só operação interestadual.
2. **Optante do Simples não recolhe DIFAL como remetente** (STF, ADI 5464).
   Como o regime é por influencer, isso sai de graça: marca no Simples fica
   fora da conta, mas continua aparecendo na distribuição por estado.
3. **A apuração oficial usa base dupla** (o imposto entra na própria base). O
   painel **não** faz esse gross-up, então o valor fica um pouco abaixo do
   devido. Está dito na tela.

As 27 alíquotas internas vêm semeadas de `types/estados.ts` e são editáveis em
`/difal`. Nenhuma nasce confirmada: vários estados mexeram nas suas entre 2023
e 2025, e algumas já embutem fundo de combate à pobreza enquanto outras não.

### 5.11 Cadastro de produtos e kits

A Nuvemshop sabe o que vendeu e por quanto. Ela **não** sabe de quem é o
produto, o NCM, nem que um "Kit Barba" consome um tônico e um shampoo — ela
entrega o kit como **um** produto, com `product_id` próprio.

Cada produto aponta para **um** influencer (`influencerId`). **A loja
decide o dono**: cada influencer tem a sua loja Nuvemshop, com chave de API
própria (o cliente confirmou em 17/09/2026: são cinco), e um produto existe
numa loja só. Por isso o produto guarda a **loja de origem** (`Produto.marca`,
o mesmo texto de `Pedido.marca`), e o dono é o primeiro influencer ativo
daquela marca (`donoPelaLoja`, em `lib/donoProduto.ts`).

- **O dono continua gravado**, porque apuração, estoque e ordens leem
  `influencerId`. `aplicarDonosPelaLoja` (`data/donosPelaLoja.ts`) regrava o
  que saiu da regra, e roda ao trazer produtos e ao cadastrar, editar ou
  remover um influencer. É isso que faz o produto trazido **antes** do
  contrato da loja existir passar para o influencer quando ele é cadastrado.
- **Trocar de dono pode trocar de regime**: aí os impostos do produto voltam
  aos que nascem marcados no regime novo; mesmo regime, a marcação feita à mão
  fica (`ajustesDeDono`).
- **No formulário o dono é leitura** para produto com loja. Loja sem
  influencer mostra o aviso e segue o `REGIME_SEM_INFLUENCER` — lista de
  impostos vazia ali apagaria as marcações ao salvar. A action lê a loja do
  **cadastro gravado**, nunca do formulário (endpoint público, 5.13).
- **Produto criado à mão não tem loja**: com um influencer ativo só, é dele;
  com mais, é escolha.
- **Cadastro anterior à loja** ganha a loja no próximo "Trazer da Nuvemshop"
  (`lojasParaCompletar`), pelo catálogo e, fora dele, pelas vendas. Item que
  aparece em duas lojas fica sem loja: dar a qualquer uma delas erraria o dono
  metade das vezes.

Com mais de uma loja, a lista de produtos ganha o filtro por loja, e cada
linha diz de que loja o produto veio.

**Todo tributo sobre receita é marcável, e só é cobrado onde estiver marcado**
(5.10). O de lucro (IRPJ, CSLL) aparece na lista sem caixa: a base dele é a
marca inteira. Os que nascem marcados são os que dependem do NCM
(`idsMarcadosPorPadrao`) — no Lucro Presumido, ICMS, ICMS-ST e IPI; alíquota
zero entra marcada de propósito, para o produto já estar pronto quando o
contador informar a alíquota. PIS e COFINS nascem desmarcados, por decisão do
cliente, e passam a valer no produto assim que ele os marcar.

```
custo do kit = ficha própria, se houver
             senão, Σ (custo do componente × quantidade)
             senão, null
```

Ficha própria vence: a fábrica pode ter custo de montagem e embalagem do kit
diferente da soma das partes. Componente sem custo torna o kit **inteiro**
`null` — somar a parte conhecida daria um número que parece certo e está errado
para menos, inflando a margem.

**Com a loja real o cadastro nasce vazio**, e a tela de produtos ficava em
branco. O botão "Trazer da Nuvemshop" grava uma entrada por variante que nenhum
cadastro cobre (`produtosParaCadastrar`, em `costing.ts`). Na loja real, em
16/09/2026: 82 produtos, 33 deles kits. Quatro decisões:

1. **A lista junta o catálogo (`GET /products`, pela API) e as vendas.** O
   catálogo traz o que ainda não vendeu e o nome atual; as vendas trazem o que
   saiu do catálogo mas vendeu no período (4 na loja real, com observação
   dizendo isso). O catálogo não passa pelo cache: só o clique chama a API
   (`FonteDePedidos.listarCatalogo`; na demonstração vem de `catalogo.ts`).
   Se a API falhar, vêm só as vendas, e a mensagem diz. A action não recebe a
   lista do navegador; monta no servidor.
2. **Kit é reconhecido pelo nome** (`pareceKit`: "Kit", "Combo" ou " + "). A
   Nuvemshop não diz — `is_kit` vem falso nos 33 — nem informa a composição
   (não há endpoint de componentes). O kit entra com a composição vazia e uma
   observação; o formulário aceita salvar assim, e a lista mostra "kit ·
   montar". Até ser montado, o custo vem da ficha do próprio kit e o estoque o
   conta como item único (os dois já tratavam kit sem componente assim). Kit
   pode ser componente de outro ("Combo: Kit Golden Hour + Colônia").
3. **Cada produto já entra com dono e impostos**, pela regra da apuração: o
   primeiro influencer ativo da marca e, sem ele, `REGIME_SEM_INFLUENCER`. Com a
   lista de impostos vazia, o produto passaria a contar como "com cadastro
   fiscal" e o ICMS por produto continuaria fora — a lacuna sumiria da tela sem
   ter sido resolvida. Por isso, **cadastre o influencer antes** de trazer os
   produtos.
4. **Não é replicar catálogo** (seção 8): o registro guarda só o que a
   Nuvemshop não sabe (dono, NCM, kit, impostos); nome e SKU vão junto porque a
   tela precisa de um rótulo.

### 5.11.1 Aba Kits

Aba `/kits`, área `produtos` (a mesma da aba Produtos), pedida pelo cliente
para montar a composição dos kits trazidos da Nuvemshop. A composição **não
existe na API**: conferido nas duas versões — `is_kit` falso nos 33 kits,
`custom-fields` vazio, nenhum endpoint de componentes, metacampos ou
"bundles", e cada kit com estoque próprio (a loja não usa o recurso de kit da
Nuvemshop). Ela só aparece no **texto da descrição** de cada kit ("O kit
contém: 1 Body Splash…"), em formato livre demais para ser lido por programa
com segurança. Por isso é cadastro, escolhido à mão.

A tela lista os kits (mais vendidos no mês primeiro, filtro "A montar" /
"Montados") num cartão cada, com os itens e — para quem tem a área `custos` —
o custo do kit como o CMV o enxerga (`listarKits`, em `lib/kits.ts`, que usa o
mesmo `custoUnitarioComKit`; há teste comparando os dois). "Montar"/"Editar"
abre o editor: um campo com lista de sugestões (`<datalist>`, nativo e
offline) sobre **todos** os produtos do cadastro, com nome e SKU no rótulo
(`rotulosParaEscolha` acrescenta o número do produto quando dois rótulos
empatam — o Watermelon antigo e o novo), a quantidade e "Adicionar". Item que
não é vendido sozinho (a loção de um kit) precisa existir na aba Produtos.

Três decisões, todas em `validarComposicao`:

1. **Do formulário vêm só chave e quantidade.** O nome é resolvido no
   servidor, a partir do cadastro (Server Action é endpoint público, 5.13).
2. **Item repetido vira uma linha, com as quantidades somadas**; quantidade é
   inteira de 1 a 999 (`Number("")` vira zero e é recusado, armadilha 8).
3. **Ciclo é recusado**: um kit não pode conter a si mesmo, nem por outro kit.
   Kit dentro de kit sem ciclo é aceito ("Combo: Kit Golden Hour + Colônia").

Salvar com itens tira da observação o aviso de "falta montar"
(`AVISO_KIT_SEM_COMPOSICAO`, `limparAvisoDeKit`). Salvar sem itens é aceito e
devolve o kit ao estado "a montar". "Faltou algum kit?" marca como kit um
produto que o nome não denunciou. Desmarcar continua sendo na aba Produtos.

A auditoria de celular também clica em "Montar" (`ABRIR_EDICAO` em
`celular.mjs`), e o editor usa `.linha-de-edicao` com
`--recuo-da-tabela: 4.5rem` — mediu 318px em 390.

### 5.12 Estoque

O banco guarda **contagens com data**, não saldo:

```
saldo atual = última contagem − unidades consumidas desde a data da contagem
```

Saldo mutável exigiria processar cada pedido exatamente uma vez; se a página
recalculasse, o estoque iria a zero sozinho. Assim é função pura e idempotente.

Kit **não tem saldo próprio** — é montado sob demanda e consome os componentes.
Controlar nos dois níveis contaria a mesma unidade duas vezes.

Cobertura em dias = saldo ÷ (vendas do período ÷ dias do período).
Crítico ≤ 7 dias, baixo ≤ 21 dias.

### 5.13 Usuários e acesso

Dois perfis. `dono` vê tudo. `estoque` vê produtos, estoque e o **cadastro** de
custo de fabricação — e nenhum indicador financeiro: nem faturamento, nem preço
de venda, nem margem, nem comissão, nem lucro.

`custos` é uma área separada de `financeiro` justamente por isso: quem está na
fábrica sabe quanto custa a matéria-prima e precisa cadastrar, mas a mesma tela
esconde preço de venda e margem para esse perfil. Custo é o que o produto
consome; margem é quanto a empresa ganha.

A **ordem de fabricação** (5.15) fica na área `produtos`: os dois perfis pedem e
acompanham, porque a conversa ali é sobre unidade e prazo, não sobre dinheiro. A
tela pública de assinatura é a exceção do painel inteiro — não tem perfil, e o
que a limita é mostrar só produto, quantidade, data e saldo, nenhum valor.

A verificação acontece **no servidor**, em `exigirArea`, em dois lugares: na
página, antes de montar, e **dentro de cada Server Action**. As duas são
necessárias — Server Action é um endpoint público, dá para chamá-la sem nunca
abrir a página. Esconder link no menu é só conveniência.

Senha com scrypt e sal por usuário; sessão em cookie httpOnly **assinado** —
sem assinatura, qualquer um trocaria o próprio perfil para `dono` no cookie.

### 5.13.1 Taxa da plataforma e do meio de pagamento

O que a Nuvemshop e o gateway retêm de cada venda. **Não é tributo**, e a
distinção é deliberada: imposto se recolhe em guia e tem regime; taxa é preço
de serviço, negociável, retido no ato. Por isso mora em `types/plataforma.ts`
e não em `types/fiscal.ts`, tem fatia própria na pizza e seção própria em
`/impostos`, separada do catálogo de tributos.

**O meio de pagamento é normalizado antes de qualquer conta.** A API devolve
`payment_details.method` como texto livre, e `apiSource.ts` faz *pass-through*
do JSON — não valida nada. `normalizarMetodoPagamento` (em `types/nuvemshop.ts`)
é o `normalizarUF` desse campo: resolve caixa, espaço e separador, e traduz
apelidos conhecidos. Sem ele, `Credit Card` e `credit_card` virariam dois meios,
com duas taxas, e o total ficaria certo pelo motivo errado.

Três decisões nele, todas fáceis de errar ao contrário:

1. **Valor desconhecido NÃO vira `other`.** Passa adiante com o próprio nome, e
   aparece na tabela de taxas como lacuna declarada. Dobrar para `other`
   cobraria a taxa de "outros" sobre um meio que ninguém cadastrou.
2. **Ausência vira `nao_informado`, que é diferente de `other`.** Uma é lacuna
   de dado, a outra é escolha de pagamento.
3. **`rotuloMetodo` mostra o nome cru do que não conhece**, em vez de "Outros" —
   é o que permite mapeá-lo quando o payload real aparecer.

A base de demonstração **varia a grafia de propósito** (`GRAFIAS_DO_METODO`):
13 formas cruas que colapsam em 3 meios. Mesma razão do estado por extenso —
sem isso, um defeito na normalização não apareceria na tela, só num teste.

A escolha da grafia usa o **id do pedido**, não `rnd()`. Puxar um sorteio ali
desloca toda a sequência seguinte e muda os totais do cenário documentado —
aconteceu na primeira versão, que derrubou o bruto de R$ 3,14 mi para
R$ 3,12 mi sem ninguém ter mexido em valor nenhum.

Ao ligar `FONTE_DADOS=live`, o primeiro lugar a conferir é a aba de taxas:
método que chegar com nome desconhecido aparece lá, com a taxa em branco e o
recebido dele declarado como fora da conta.

**A taxa é por meio de pagamento**, porque é assim que é cobrada:

```
custo da transação = percentual × valor do pedido + valor fixo
```

O valor fixo existe por causa do boleto, e é o que justifica o modelo. Na base
de demonstração o boleto tem 1,99% nominal e **3,3% de carga efetiva** — o
R$ 3,49 por transação pesa mais que o percentual em pedido pequeno. Um
percentual único sobre o recebido daria um total parecido e esconderia isso,
que é justamente o insight da tela: boleto sai caro duas vezes, pela taxa e
pelo não pagamento.

**Sobre o que a taxa incide é campo do cadastro**, não regra global:

| Base | Significado | Caso típico |
|---|---|---|
| `bruto` (padrão) | todo pedido criado, pago ou não | boleto, tarifado por **registro** |
| `recebido` | só o que virou dinheiro | gateway que só tarifa transação aprovada |

A escolha existe porque a diferença é grande e **muda por meio de pagamento**.
Na base de demonstração, dos 1.320 boletos emitidos só 498 são pagos: cobrar
apenas sobre os pagos subestimaria essa linha em mais de 60%. No cartão vale o
contrário — autorização que falha não gera tarifa.

Uma regra global erraria um dos dois lados sempre. Quem tem a fatura na mão
decide, linha por linha.

**A carga efetiva é sempre medida contra o RECEBIDO**, mesmo quando a taxa
incide sobre o bruto: é do dinheiro que entrou que ela sai. Medir contra a
própria base esconderia o peso real — uma taxa sobre pedidos não pagos pesa
mais no caixa do que a alíquota sugere.

Na DRE entra ao lado dos impostos, não somada a eles: juntar as duas coisas
numa linha só esconderia a única das duas que dá para renegociar.

As alíquotas nascem semeadas com ordem de grandeza pública da Nuvemshop e
`confirmadaNaFatura: false`, que aparece como aviso na tela — o percentual real
muda com o plano, com o volume e com a antecipação de recebíveis. É o mesmo
padrão do ICMS (5.10), com o nome do campo adaptado: quem confirma taxa
comercial é a fatura, não o contador.

**Meio de pagamento sem taxa cadastrada não some da conta.** Aparece na tabela
com total zero e entra em `metodosSemTaxa`, com o quanto de receita ficou de
fora — senão o total pareceria cobrir tudo que entrou.

Na margem por produto a taxa é **rateada** pela participação do item na receita
do pedido, e vem em campo próprio (`taxaPlataforma`, `margemAposTaxa`) em vez
de já descontada. O rateio é declarado porque a cobrança é do pedido, não do
item; o critério não exige arbitragem, já que a própria cobrança é proporcional
ao valor.

### 5.14 Relatórios

Aba `/relatorios`, área `financeiro`. As mesmas contas das seções acima,
quebradas por uma dimensão escolhida na hora: **marca, influencer, estado de
destino, meio de pagamento, mês ou produto**, com um segundo nível opcional.
Filtros de período (intervalo de meses), marca, estado e meio de pagamento.

**O relatório não tem aritmética própria.** Cada métrica sai de `reconciliar`,
`calcularCMV`, `apurarImpostos` e `montarDemonstrativo` — as mesmas funções do
painel principal, aplicadas a um subconjunto de pedidos. Se tivesse conta
própria, o total por marca poderia divergir da tela inicial e o cliente
encontraria duas versões da verdade no mesmo painel. Há teste comparando o
total do relatório com `reconciliar` sobre os mesmos pedidos.

#### A regra que torna o relatório "guiado"

Nem toda métrica vale em toda dimensão, e a tela recusa o cruzamento em vez de
devolver um número errado. São duas restrições, por motivos diferentes:

1. **Comissão, imposto, lucro e margem operacional só existem por marca
   inteira.** O contrato é da marca (5.2) e o regime é do influencer dela
   (5.10). Não existe "a comissão de São Paulo" nem "o DAS do cartão de
   crédito": a guia do Simples é mensal sobre a receita real da marca, indivisível
   por destino ou por forma de pagamento. Ratear proporcionalmente daria um
   número plausível e inventado — o que a seção 8 proíbe.

2. **Produto não particiona pedidos.** Um pedido com três produtos aparece em
   três grupos, então frete, desconto e total do pedido não são atribuíveis a
   um produto sem rateio. Por isso a dimensão produto oferece só métricas de
   item: unidades, receita dos itens, CMV e margem bruta do item.

`receitaItens` existe separada de `receitaReal`, e `margemItens` separada de
`margemContribuicao`, de propósito — são contas diferentes:

```
receitaReal        = recebido − frete            (do pedido inteiro)
receitaItens       = Σ preço × quantidade        (só dos itens)
margemContribuicao = receitaLíquida − CMV        (já depois de imposto)
margemItens        = receitaItens − CMV          (antes de imposto)
```

Dar o mesmo nome às duas faria parecer que o painel tem duas versões da mesma
verdade quando os números não batessem — e eles não batem, porque uma inclui
frete e imposto e a outra não.

**O filtro também corta a marca ao meio.** Agrupar por marca com o filtro
"estado = SP" não produz linhas de marca: produz linhas de "marca dentro de
SP". Comissão e imposto caem nesse caso também — é o furo mais fácil de não
enxergar, porque a linha continua dizendo o nome da marca. Está em
`filtroCortaMarca`, com teste.

Célula sem valor é **traço, nunca zero**: zero afirma que a conta foi feita e
deu nada. O rodapé diz qual coluna ficou de fora e por quê.

#### Resto das decisões

- **A configuração inteira mora na URL.** O cálculo continua no servidor (o
  navegador recebe dezenas de linhas agregadas, não 45 mil pedidos) e um
  relatório vira um link — dá para mandar a combinação exata para o contador
  em vez de descrever quais caixinhas marcar. `lib/relatoriosUrl.ts` valida
  tudo que vem da barra de endereço contra as listas conhecidas.
- **Abre numa combinação pronta, nunca em branco.** Tela de montar relatório
  em branco não responde nada: quem abre precisa saber o que perguntar antes de
  ter a resposta. As seis combinações estão em `COMBINACOES_PRONTAS`.
- **A linha de total é calculada sobre o conjunto inteiro**, não somando as
  células. Média e percentual não se somam, e assim o total serve de conferência:
  se a soma visual das linhas não bater com ele, o agrupamento perdeu pedido.
- **Exportação é impressão/PDF**, não CSV — decisão do cliente.

#### O PDF é um documento, não uma captura de tela

Quatro decisões, todas porque o papel sai da tela e vai para outra pessoa:

1. **A folha do relatório é deitada.** Nove colunas de dinheiro não cabem num
   A4 em pé: o navegador não encolhe, ele **corta** — o primeiro PDF saiu sem
   "Lucro operacional" e sem "Margem operacional", justamente a conclusão.
   Deitado sobram ~273mm e a tabela ocupa ~982px de 1032 disponíveis.
   É uma `@page` **nomeada** (`@page deitada` + classe `.folha-deitada`), não
   um `@page` global: o painel e os cadastros são estreitos e altos, e deitados
   gastariam o dobro de folhas com metade da coluna vazia.
2. **O `min-width` que serve para rolar na tela é o que estoura a folha.** Some
   na impressão, junto com o `position: sticky` da coluna âncora — no papel não
   há rolagem, e sticky chega a deslocar a célula da coluna.
3. **A folga vem da coluna de texto, nunca do número.** O nome da marca quebra
   em duas linhas; `R$ 16.833.068,37` partido ao meio vira dois números
   diferentes na leitura.
4. **Período e filtros ficam escritos no relatório.** "45.024 pedidos no
   período" sem dizer qual período nem sobre quais marcas é um número que o
   leitor não tem como conferir. Colunas recusadas pelo mesmo motivo viram uma
   nota só — repetir a mesma explicação quatro vezes tomava um terço da folha.

Para conferir a impressão sem imprimir: emule a mídia `print` numa largura de
1032px (A4 deitado, 96dpi, margens de 12mm) e veja se a última coluna termina
antes da borda.

### 5.15 Ordem de fabricação

Aba `/ordens`, área `produtos`. Quem cuida das campanhas dos influencers pede a
fabricação de uma quantidade de produto para uma data de lançamento; o link vai
para quem toca a produção, que confere o estoque, aprova e **assina**. O
resultado é um PDF com as duas assinaturas e as duas datas, gravado no banco.

O problema que resolve: hoje isso se combina por mensagem, e quando falta
produto no dia do lançamento ninguém sabe se o pedido foi feito, se chegou nem
se foi aceito. A ordem existe para virar **prova**.

#### As cinco decisões que sustentam a tela

1. **A ordem NÃO baixa nem reserva estoque.** O saldo é
   `última contagem − vendido desde a contagem` (5.12), função pura e
   idempotente. Descontar uma ordem dali criaria um segundo mecanismo mexendo
   no mesmo número, e o estoque passaria a depender de quantas vezes a página
   rodou. O saldo aparece **ao lado** do item, como informação para quem
   decide.

2. **Uma vez aprovada, congela.** É o único registro do projeto que não é
   cadastro editável. Um documento que muda depois de assinado não prova nada.
   Por isso o repositório tem `criarOrdem` e `gravarOrdem`, e não
   `salvarOrdem(entrada, id)` como os outros.

3. **O link é a credencial.** `/assinar/[token]` é **pública** — não chama
   `exigirArea`. Quem toca a produção não tem conta no painel, e exigir que
   tivesse trocaria uma assinatura de trinta segundos no celular por um
   cadastro que ninguém faz. São 32 bytes de `randomBytes` (256 bits).
   Como Server Action é endpoint público (5.13), **tudo que protege está
   dentro da action**: o token é revalidado a cada chamada, só ordem em
   `aguardando` aceita decisão, e o formulário só consegue mandar **nome,
   traços e motivo**. Item, quantidade e data vêm do registro — se viessem do
   corpo da requisição, quem tivesse o link assinaria um documento com números
   diferentes dos que foram pedidos.

4. **O nome do produto é COPIADO no momento do pedido**, e resolvido no
   servidor a partir da chave. Renomear o produto depois não pode alterar o que
   foi assinado, e aceitar o nome que veio do formulário deixaria assinar um
   documento cujo texto não corresponde ao item.

5. **Recusa não gera PDF.** O documento existe para provar um acordo; recusa
   não é acordo, e não tem a assinatura dos dois lados que o papel afirma ter.
   Fica o registro em tela, com quem recusou, quando e por quê.

#### A assinatura é vetor, não imagem

Cada traço é uma lista `[x0, y0, x1, y1, ...]` em coordenadas de **0 a 1**
dentro do quadro. São poucos KB, viajam num campo de formulário comum, cabem no
JSON do modo demonstração e vão direto para o PDF como polilinha. Um PNG em
base64 seria dez vezes maior e obrigaria o gerador de PDF a embutir imagem — que
é justamente o que faria o projeto precisar de uma biblioteca de PDF.

**A proporção do quadro é fixa** (`PROPORCAO_ASSINATURA = 3`), e a mesma
constante governa o quadro na tela, o `<svg>` de leitura e a moldura no papel.
Proporções diferentes achatariam a assinatura no PDF, porque os pontos são
normalizados em cada eixo. Fixar elimina o problema em vez de corrigi-lo.

Três detalhes do quadro que só aparecem testando no telefone, todos em
`QuadroAssinatura.tsx`: `touch-action: none` (senão o primeiro movimento do dedo
rola a página), `setPointerCapture` (o dedo sai do quadro no meio do traço o
tempo todo) e acompanhar o `devicePixelRatio` (senão sai borrado).

**`normalizarTracos` descarta o traço INTEIRO** quando acha um valor inválido.
Não basta pular o valor ruim: `Number(null)` e `Number("")` valem **zero**, não
`NaN`, então um `null` no meio da lista virava uma coordenada válida e todos os
pontos seguintes trocavam de eixo — a assinatura saía embaralhada em vez de
faltar. Faltar é honesto; embaralhada parece assinatura de outra pessoa.

#### O gerador de PDF é escrito à mão

`lib/pdf.ts`, sem dependência. Mesma escolha dos gráficos: o painel precisa
funcionar offline e sem CDN, e um PDF de uma página com texto, linhas e
polilinha cabe em duzentas linhas. Faz texto em Helvetica nos dois pesos com
**medição real de largura**, linhas, retângulos, polilinhas e múltiplas páginas.
Não faz fonte embutida, imagem, nem unicode fora do WinAnsi — se algum dia
precisar de uma dessas, é hora de pesar uma dependência de verdade, não de
esticar o arquivo.

Quatro armadilhas que o teste cobre, todas do tipo "abre num leitor e não em
outro":

| Armadilha | O que acontece |
|---|---|
| Escrever o arquivo em utf-8 | Cada acento vira dois bytes e **todos** os deslocamentos da tabela `xref` depois dele ficam errados. Tudo é latin-1 do início ao fim, e é isso que faz `.length` valer como contagem de bytes |
| `/Length` fora do tamanho real do fluxo | O leitor lê além ou aquém do `stream` |
| Não escapar `(`, `)` e `\` | Parêntese num nome de produto fecha a string no meio e o resto do fluxo vira lixo |
| Medir texto por largura média | `R$ 2.400 un` não fica embaixo de "Quantidade". As larguras AFM da Helvetica estão na tabela; acentuada mede o mesmo que a letra base, o que é exato nessa fonte |

As coordenadas da API descem **do topo**, ao contrário do PDF, cujo eixo Y sobe
da base. A conversão acontece num lugar só, em `fluxoDaPagina`. Escrever layout
de documento de baixo para cima é fonte inesgotável de erro de um ponto.

#### Dois hashes, e eles são diferentes

- **`hashConteudo`** — SHA-256 da forma canônica dos dados, montada campo a
  campo. Sai **impresso** no rodapé do documento. `JSON.stringify(ordem)` não
  serviria: a ordem das chaves de um objeto lido do banco não é a de um
  recém-criado, e o hash mudaria sem o conteúdo mudar.
- **`sha256`** — hash dos **bytes** do arquivo, guardado ao lado. Não pode
  viver dentro do PDF: o arquivo não carrega o próprio hash.

O PDF é gerado **uma vez**, na assinatura, e nunca regenerado no download. Um
documento reconstruído a cada leitura mudaria junto com o código que o desenha,
e a assinatura deixaria de se referir a alguma coisa fixa.

#### Duas rotas de download, não uma

`/ordens/[id]/pdf` exige login; `/assinar/[token]/pdf` vai pelo token. Poderiam
ser uma só com "aceita login OU token", mas duas regras de acesso no mesmo lugar
são duas chances de a errada valer. A segunda existe porque quem aprovou assinou
pelo celular, sem conta, e sai da página com o documento na mão.

O `Content-Disposition` é `inline`, não `attachment`: no celular, `attachment`
empurra o arquivo para a pasta de downloads e a pessoa some da página. É também
o único recurso do painel com cache `immutable` — o único em que "estes bytes
nunca mudam" é verdade por definição.

#### O botão de copiar o link tem um campo de texto ao lado

Não é enfeite. `navigator.clipboard` só existe em contexto seguro (HTTPS ou
localhost), e o painel é acessado de fora por **HTTP puro** no IP fixo. Ali o
botão simplesmente não funciona, e sem o campo visível não haveria como pegar o
link de jeito nenhum. No celular esse campo ocupa a linha inteira: dividindo a
linha com os dois botões sobravam ~90px e ele mostrava `http://177.223`.

#### Endereço de IP, WhatsApp e HTTPS: um beco sem saída em HTTP puro

Três fatos medidos no mesmo dia, e juntos eles fecham uma porta:

1. **O WhatsApp não transforma IP em link.** Colado numa conversa,
   `http://177.223.44.178:3000/assinar/...` chega como texto morto — ele só
   linkifica domínio com terminação válida. Pior: pinta o IP com a **cor de
   telefone**, porque é como telefone que ele o classifica. Quem recebe toca e
   o celular tenta ligar.

2. **Dar um nome ao IP resolve isso e quebra outra coisa.** `<ip>.sslip.io` é
   DNS curinga e resolve de volta para o mesmo IP; o WhatsApp passa a
   linkificar. E aí o link para de **abrir**, com `ERR_SSL_PROTOCOL_ERROR`: o
   Chrome força HTTPS em endereço com **nome**, e o painel só fala HTTP.

3. **Endereço de IP é isento dessa conversão.** É por isso que o IP abre e o
   nome não — e é o que torna os dois requisitos incompatíveis:

   > para ser tocável no WhatsApp, precisa de nome;
   > tendo nome, o navegador exige HTTPS.

Não é HSTS: nem `sslip.io` nem `nip.io` estão na lista pré-carregada. É o
comportamento padrão do Chrome.

**A decisão, então:** o link continua sendo o IP, que ao menos **abre** colado
em qualquer navegador. A tela diz o passo que falta, e a mensagem do botão de
WhatsApp leva a instrução junto ("copie o endereço e cole no navegador") —
sem ela, quem recebe vê texto cinza que não responde ao toque e conclui que o
link está quebrado. Foi o que aconteceu na primeira vez.

A tentativa do `sslip.io` **foi revertida**. Se alguém pensar nela de novo:
ela linkifica e não abre, que é pior que não linkificar.

Link tocável exige **HTTPS de verdade** — túnel Cloudflare nomeado com domínio
próprio, ou Tailscale Funnel. Ver `DEMONSTRACAO.md`.

`localhost` ganha um aviso próprio, em vermelho: aquele link só abre na máquina
que rodou o painel, e enviá-lo não produz erro nenhum — produz uma página que
não carrega no telefone de quem recebeu.

#### Túnel rápido da Cloudflare não serve para reunião marcada

`cloudflared tunnel --url` sorteia um subdomínio **novo a cada vez que sobe**
(o próprio log diz *"Requesting new quick Tunnel"*). Reiniciar troca o
endereço e mata todo link já enviado. Funciona, dá HTTPS válido, e o fluxo de
assinatura inteiro passa por ele — inclusive as Server Actions, que foi o que
mais preocupou e foi testado ponta a ponta. Mas é conveniência, não
infraestrutura.

### 5.16 Influencers: contrato e despesas

A aba se chamava "Comissões" e virou **Influencers** (`/influencers`; o endereço
antigo `/comissoes` redireciona, com os parâmetros). A pergunta mudou de "quanto
de comissão cada contrato gera" para "quanto cada influencer custa".

Abre num **seletor de cartões** — um por contrato, com o custo do mês já escrito —
e numa "Visão geral" com os totais e o cadastro de contratos. Cartão e não
`<select>`: o nome sozinho não ajuda a escolher, e o cartão responde a primeira
pergunta antes do clique. A escolha mora na URL (`?influencer=`), como os
filtros do relatório, e o seletor de mês do cabeçalho a preserva.

Escolhido um influencer, aparece a **grade dele no mês**:

1. **A primeira linha é sempre a comissão**, calculada dos pedidos do mês e do
   contrato (5.2). Não se edita na grade e **não é gravada**: gravar faria a
   grade mostrar um número velho quando as vendas mudassem. Para mudar a
   comissão, muda-se o contrato.
2. **As linhas de baixo são despesas**: operacional, produto enviado, viagem,
   cachê, anúncio, outros. Despesa é avulsa e pertence ao mês pela data. Cachê
   fixo mensal se cadastra uma vez por mês — recorrência automática foi
   descartada para a grade mostrar exatamente o que foi gasto, sem regra
   escondida.

**Despesa compartilhada.** O formulário tem a marcação "Despesa compartilhada".
Marcada, a despesa é gravada **uma vez, sem dono** (`influencerId: null`) e com
o valor **total**; a parte de cada influencer é calculada na leitura por
`ratearDespesas`, proporcional ao **faturamento sem frete** da marca dele no mês. É
o que o cliente pediu como "atualizar a despesa toda vez proporcional ao
influencer": nada é regravado, a divisão simplesmente se refaz quando as vendas
mudam — mesma razão de a comissão não ser gravada. Gravar uma cópia por
influencer ficaria velha na primeira venda nova.

Regras da divisão, todas testadas em `rateioDespesas.test.ts`:

- a proporção é a do **mês inteiro**, por isso `ratearDespesas` recebe todos os
  pedidos, antes de qualquer filtro. As telas dividem primeiro e só então
  entregam as despesas à DRE, ao relatório e ao simulador; compartilhada não
  dividida fica fora de `despesasQueCabem` (não tem dono nem marca);
- só influencer ativo recebe parte, e por marca só o primeiro ativo (5.9);
- as partes são arredondadas em centavo e a sobra vai para a maior, para a soma
  fechar exatamente no total cadastrado;
- na grade, a linha mostra a parte e a fração ("23,4% de R$ 60.000,00");
  editar mexe no **total**, e remover diz "Remover de todos", porque remove.

O raio-x conta a compartilhada como uma despesa só (`idDeOrigem`), não uma por
influencer.

**Despesa sai do lucro operacional.** Antes dela o painel só enxergava a
comissão, e o lucro saía maior que o verdadeiro. A DRE (5.8) ganhou a linha
"Despesas com influencers", e a fatia da pizza virou **Influencers**. O campo
`totalComissoes` continua sendo **só** a comissão — o simulador e a métrica de
comissão do relatório dependem disso; o total somado é `totalInfluencers`.

**Quais despesas entram é decidido em `despesasQueCabem`**, e a DRE aplica isso
sozinha: recebe *todas* as despesas e fica com as do mês dos pedidos e das
marcas dos pedidos. É isso que faz o lucro de uma marca no relatório bater com o
do painel, e a aba usa a mesma função para os totais. Consequência assumida:
despesa num mês em que a marca não vendeu nada não entra no lucro; a grade a
mostra mesmo assim e avisa.

O mês da despesa sai da **data como texto** (`mesDaDespesa`), nunca de
`new Date`: "2026-09-01" viraria meia-noite UTC, que no Brasil ainda é 31 de
agosto.

Ao ligar a despesa no relatório apareceu um furo antigo: a DRE do relatório
**não recebia a taxa da plataforma**, e o lucro por marca saía maior que o do
painel para os mesmos pedidos. Corrigido junto, com teste que monta a DRE do
jeito do painel e exige o mesmo número.

Três detalhes de comportamento:

- Data fora do mês aberto grava normalmente, e a mensagem diz em que mês a
  despesa entrou. Sem isso ela some da grade, parece que não salvou, e a reação
  natural é cadastrar de novo — duplicando o custo.
- Remover um influencer remove as despesas dele; senão elas continuariam saindo
  do lucro sem aparecer em tela nenhuma.
- Remover despesa é em dois passos na própria linha, sem `window.confirm`, que
  some atrás de abas no celular e trava a auditoria automatizada.

### 5.17 Simulador

Aba `/simulador`, área `financeiro`, com duas abas na URL (`?aba=`, que o
seletor de mês preserva): **Preço de produto** (padrão) e **Comissão de
influencer**.

#### Preço de produto

A pergunta: **"se eu fabricar por X e
vender por Y, ganho ou perco dinheiro?"** Três campos — influencer, custo de
fabricação por unidade e preço de venda por unidade — e o botão **Simular**. O
influencer é o que traz o regime tributário (5.10) e o contrato.

O servidor monta um perfil de médias por marca (`montarPerfisDeCusto`, em
`lib/simulacaoPreco.ts`) e o navegador só multiplica (`simularPreco`) — mesmo
desenho do simulador de comissão, que responde na hora e sem internet.

```
lucro por unidade = preço × (1 − impostos − DIFAL − comissão − despesas)
                  − (preço + frete) × (taxa + sócios)
                  − custo de fabricação
preço mínimo      = (fabricação + frete × (taxa + sócios)) ÷ (1 − soma das cargas)
```

**Nenhuma alíquota é do simulador.** Impostos, DIFAL e taxa são a média do mês
da marca, medida pelas funções do painel (`apurarImpostos`,
`apurarTaxasPlataforma`). Impostos e DIFAL são fração da **receita real** (sem
frete, 5.1.1) e se aplicam ao preço; a taxa é fração do **recebido** e se aplica
ao preço mais o frete. O teste que
segura isso: simular o preço e o custo médios de cada marca reproduz o lucro
operacional da DRE dela, a menos **exatamente** da comissão e das despesas que
incidem sobre pedido não pago (escolha 1). Se alguém der ao simulador uma regra
própria, esse teste quebra.

Quatro escolhas que mudam a resposta:

1. **A comissão é o percentual do contrato sobre o preço** — numa venda paga, o
   preço é o faturamento bruto dela; com contrato sobre o que cai na conta
   (5.1.2), sobre o preço menos a taxa do valor pago. Foi decisão do cliente. A primeira versão
   usava o custo médio do contrato por venda paga (30% sobre o bruto saía ~39%,
   porque o contrato também paga pedido que nunca entrou), e ele pediu o
   percentual sobre o faturamento bruto. **Consequência assumida:** a simulação
   sai mais otimista que a DRE na medida da comissão paga sobre pedido não pago
   — com custo 30 e preço 100, a Aurora passou de prejuízo para lucro. Não
   "corrija" de volta sem falar com ele.
2. **O frete não é custo** (5.1.1): o cliente paga por fora e ele vai para a
   transportadora. Não entra em imposto, comissão nem na lista de custos; a
   tela diz isso numa frase, para ninguém achar que foi esquecido. Só a taxa
   do pagamento e os sócios incidem sobre o valor pago **com** frete. O frete
   usado é por unidade (R$ 19 ÷ ~2,1 unidades por pedido). A primeira versão o
   tratava como custo da loja; o cliente corrigiu.
3. **DIFAL é a média ponderada dos destinos**, contando as vendas dentro do
   próprio estado (que não pagam). Marca no Simples fica com zero e a linha diz
   por quê (5.10.1).
4. **Despesas com influencer entram rateadas pelo faturamento sem frete.** São custo fixo do
   mês, não da unidade, mas saem do lucro; sem elas a identidade com a DRE não
   fecha.

**Preço sugerido.** Depois de simular, o resultado mostra o preço que entrega
três margens operacionais de referência — **mínima saudável 10%, recomendada
15%, forte 20%** (`MARGENS_DE_REFERENCIA`) — e um campo para outra margem:

```
preço para a margem m = (fabricação + frete × (taxa + sócios)) ÷ (1 − soma das cargas − m)
```

A margem é a mesma do resultado (lucro por unidade sobre o preço, depois de
tudo), e com m = 0 a fórmula dá o preço mínimo — são a mesma função
(`precoParaMargem`). As faixas são **ordem de grandeza de mercado**, não estudo:
empresas de cosméticos saudáveis costumam operar entre ~10% e ~20% de margem
operacional. A tela diz isso, pelo mesmo motivo do ICMS semeado (5.10).

O preço sugerido é arredondado **para cima** até o próximo ,90
(`precoComercial`): para baixo entregaria menos margem do que a faixa promete.
O botão "Simular com este preço" preenche o campo e simula com o influencer e o
custo **da simulação que gerou a sugestão**, não com o que estiver digitado —
se a pessoa mexeu nos campos depois, a sugestão não vale para eles — e rola até
o veredito, que no celular fica fora da tela.

O mês das médias é o do seletor do cabeçalho. Influencer inativo e marca sem
venda paga no mês ficam fora da lista, **e a tela diz quem** — simular com carga
zero diria que vender ali não custa nada.

O resultado guarda os valores que o produziram. Mexer num campo depois apaga o
destaque e avisa "toque em Simular para atualizar"; senão a pessoa leria o lucro
de um preço que já não está escrito ali.

É estimativa para decidir preço, não apuração: o imposto e o DIFAL de um produto
específico mudam com o NCM e o destino, e a tela diz isso junto do número, com o
aviso de alíquota não confirmada quando houver.

#### Comissão de influencer

A pergunta: **"se eu fechar com um influencer a X% e ele faturar Y por mês,
sobra dinheiro?"** Campos: percentual (sobre o que cai na conta, sem frete — 5.1.2),
faturamento esperado por mês **sem frete** e regime (automático pelo porte, ou
escolhido). A tela não mostra linhas de recebido nem de frete: uma nota diz
quanto de frete o cliente paga à parte.
Botão **Estimar**. O simulador de base dos contratos atuais (5.2) ficava embaixo
e saiu a pedido do cliente.

O influencer ainda não existe, então não há pedido dele. A estimativa aplica ao
faturamento informado as frações médias das marcas atuais
(`montarReferencia` / `estimarInfluencer`, em `lib/simulacaoInfluencer.ts`) — a
mesma cadeia da DRE (5.8), com frações no lugar dos pedidos:

```
faturamento  = informado, SEM frete (5.1.1)
receita real = faturamento × (receita real ÷ faturamento sem frete das marcas atuais)
recebido     = receita real + frete (o cliente paga o frete por fora)
lucro        = receita real − impostos − DIFAL − taxa (sobre o recebido) − fabricação
             − comissão (% × (receita real − taxa)) − parte nas compartilhadas − sócios
```

O teste que segura isso: montada a referência com uma marca só e estimado o
faturamento dela, a conta devolve o lucro da DRE daquela marca — a menos do
custo estimado dos itens sem ficha (escolha 2).

Três escolhas:

1. **Simples é calculado, Presumido é média.** No Simples a alíquota muda muito
   com o porte, e a média das marcas atuais daria a um influencer pequeno o
   imposto de uma marca de R$ 2,7 mi/ano; por isso a guia sai de
   `apurarSimples` com o RBT12 projetado (receita sem frete × 12). No Presumido a carga
   quase não depende do porte (só o adicional de IRPJ), e a média das marcas do
   regime serve. O modo automático sugere Simples até o teto (R$ 4,8 mi
   de receita real por ano); escolher Simples acima dele mostra aviso.
2. **Custo de fabricação extrapolado pela cobertura** (`cmv ÷ cobertura`). Item
   sem ficha entra como zero no CMV das marcas atuais; aplicar essa fração a um
   influencer novo daria custo menor que o real. A tela diz quanto das vendas
   tinha ficha.
3. **O novo influencer entra na divisão do operacional:** parte = total × faturamento
   ÷ (faturamento sem frete atual + faturamento dele), que é o que `ratearDespesas` faria no mês em
   que ele começasse a vender.

O resultado mostra o lucro do mês e em 12 meses, a margem sobre a receita real
ao lado da margem atual da operação, e a **comissão máxima sem prejuízo**
(lucro antes da comissão ÷ faturamento sem frete). A tela avisa que é estimativa: público com
mais boleto ou ticket mais baixo muda a fração que vira dinheiro.

---

## 6. Dados fictícios

Cenário de referência do mês mais recente. Os totais precisam **fechar** — se a
soma não bater, o cliente percebe.

| | |
|---|---|
| Pedidos criados | ~8.400 |
| Bruto | ~R$ 3.140.000 |
| Não pago | ~14% do bruto |
| Cancelado | ~5% do bruto |
| Reembolsado | ~1,3% do bruto |
| Frete | **R$ 19 fixo por pedido** (~5% do recebido) |
| Receita real | ~R$ 2.390.000 |
| Marcas | 5 |
| Meses de histórico | 6 |

### O frete já foi de três jeitos — e por que é fixo agora

Vale registrar, porque a escolha tem consequência a três saltos de distância:

1. **R$ 22–46 sorteado**, com 48% dos pedidos em frete grátis (~4,7% do recebido).
2. **Proporcional à mercadoria**, calibrado para dar 30% do recebido. Isso
   **inflou o faturamento bruto em 39%** — `total = mercadoria + frete`, então
   frete maior é bruto maior. E como a base da maioria dos contratos é o bruto,
   a comissão subiu junto (R$ 901 mil → R$ 1,25 mi) enquanto a receita real
   ficava parada. O mês fechou **no prejuízo**.
3. **R$ 19 fixo por pedido**, que é o que vale (`FRETE_POR_PEDIDO`).

A cadeia a memorizar era **frete → bruto → comissão → lucro**: o frete atravessava
o bruto e chegava na comissão de quem tem contrato sobre o bruto. Desde a 5.1.1
a comissão e os impostos usam o faturamento sem frete, e a cadeia parou no bruto —
mexer no frete agora só muda a fatia do frete, a taxa do pagamento e a
participação dos sócios. Continua valendo olhar os três ao mexer nele. Fixo tem a vantagem de não interagir com o ticket —
mexer no valor do pedido não mexe na proporção do frete.

`shipping_cost_owner` recebe o mesmo R$ 19. Ele não aparece em métrica nenhuma
do painel, e com frete fixo cobrado do cliente a leitura menos surpreendente é
a de repasse direto.

Regimes semeados, escolhidos pelo porte de cada marca: Verte Natural e Nitro
Hair no **Simples Nacional** (~R$ 2,6–2,8 mi/ano, 5ª faixa, ~11% efetivo);
Aurora, Luma e Petra no **Lucro Presumido** (R$ 7–10 mi/ano, acima do teto do
Simples). É isso que torna o cenário de R$ 3,1 mi/mês coerente sem baixar a
escala: são cinco operações, não uma.

Taxas de não pagamento por método, que são as ordens de grandeza reais do
Brasil: cartão ~4%, Pix ~20%, boleto ~60%. Distribuição de pedidos:
cartão ~58%, Pix ~26%, boleto ~16%.

Essas taxas são aplicadas **por pedido**, e o painel mede o não pagamento em
**valor**. Os dois números não coincidem: as marcas de ticket alto são
justamente as que quase não usam boleto, o que puxa o agregado em valor para
baixo. É por isso que taxas de 4/20/60 por pedido produzem ~14% em valor.

Nomes de marcas e influencers são **claramente fictícios**. Nunca use nomes de
influencers ou marcas reais.

**`ESCALA_CENARIO` em `geradorPedidos.ts` escala o cenário inteiro.** Continua
existindo, mas deixou de ser necessária depois que o regime passou a ser por
influencer: com cinco operações separadas, cada uma cai na faixa que lhe cabe.
Só mexa nela se quiser simular a empresa inteira num CNPJ só.

As contagens de estoque iniciais são calculadas **de trás para frente**:
`quantidade = o que já saiu desde a data da contagem + cobertura desejada`.
Quantidade fixa não funciona — os itens vendem entre dezenas e milhares de
unidades por mês.

Seed fixo (`SEED_PADRAO` em `geradorPedidos.ts`). O painel mostra os mesmos
números toda vez que abre — não dá para os valores mudarem no meio da reunião.
Os rótulos de mês acompanham o calendário para a demonstração não parecer
velha; os valores não dependem da data.

Duas **ordens de fabricação** nascem semeadas: uma aguardando assinatura e uma
já assinada, com o PDF gerado no momento da semeadura — exatamente como
aconteceria numa assinatura de verdade. As duas existem porque a tela precisa se
explicar sozinha: só com a primeira o arquivo de documentos fica vazio e ninguém
vê o PDF; só com a segunda não há o que assinar na demonstração.

O token da que está em aberto é **fixo** (`TOKEN_ORDEM_DEMO`), por dois motivos,
os dois de demonstração: dá para abrir o link de assinatura na reunião sem antes
criar uma ordem, e `npm run celular --rota /assinar/<token>` consegue auditar a
tela pública, que de outro modo seria inalcançável — o token real vem de
`randomBytes(32)`. Em `FONTE_DADOS=live` as ordens começam vazias.

O rabisco das assinaturas semeadas é gerado por soma de senos, não sorteado:
o painel inteiro é determinístico (mesmos números toda vez que abre).

A única **despesa de influencer** semeada é o **Operacional**, R$ 60 mil
(`OPERACIONAL_MENSAL`), **compartilhado**, um registro por mês da base
(`despesasInfluencerIniciais`). Na grade de cada influencer ficam a comissão e a
parte dele no operacional. As dez despesas avulsas de exemplo que existiam
saíram a pedido do cliente. Datas relativas ao calendário, pelo mesmo motivo
das ordens.

Quatro produtos ficam **de propósito** sem ficha de custo
(`PRODUTOS_SEM_CUSTO_NA_DEMO`). Não é descuido: é o gancho para mostrar o aviso
de cobertura e cadastrar um ao vivo na reunião.

---

## 7. Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL local (no desktop de casa, o 18 na porta 5432) — só no modo live
- Zod para validar entrada de formulário
- Vitest
- Gráficos: SVG escrito à mão. Nenhuma biblioteca de gráfico.

Sem Docker, sem CI, sem autenticação por enquanto.

Se precisar adicionar uma dependência grande, pergunte antes.

---

## 8. O que NÃO fazer

- Não implementar OAuth da Nuvemshop nesta fase (o cliente de API por token já
  está escrito em `apiSource.ts` e basta).
- Não criar telas fora do escopo da seção 5.
- Não inventar métrica que não esteja aqui. Se achar que falta alguma,
  **sugira antes de implementar** — cada elemento a mais dilui a mensagem.
- Não replicar pedidos, clientes ou produtos no nosso banco. O banco guarda
  **exclusivamente** custo e comissão. Replicar financeiro é criar duas versões
  da verdade.
- Não usar dados que pareçam reais o suficiente para confundir. O selo de
  demonstração é obrigatório.
- Não escrever afirmação categórica na interface do tipo "você está perdendo
  R$ X". O correto é "diferença entre a comissão paga e a comissão sobre
  receita real" — o contrato dele pode legitimamente prever comissão sobre
  bruto, e acusar antes de saber seria constrangedor na reunião.

### Armadilhas que já custaram tempo aqui

Nenhuma das duas é pega por `npm run build` nem por `tsc --noEmit`. As duas
quebram só quando alguém clica.

1. **Arquivo `"use server"` só pode exportar função async.** Exportar uma
   constante junto (`ESTADO_INICIAL`, por exemplo) derruba a página com
   *"A 'use server' file can only export async functions, found object"*.
   Estado compartilhado de formulário mora em `src/types/formulario.ts`.

2. **Não guarde estado de cadastro em variável de módulo.** O Next carrega as
   Server Actions num grafo de módulos separado do que renderiza a página, então
   cada lado fica com a sua própria cópia: a action grava e a página continua
   servindo o valor antigo, inclusive depois de F5. `demoCostRepository.ts` relê
   o arquivo em toda chamada de propósito.

3. **`Buffer.from(x, "hex")` devolve buffer VAZIO para entrada inválida**, em vez
   de falhar — e `timingSafeEqual` de dois buffers vazios devolve `true`. Sem a
   guarda de formato em `verificarSenha`, um hash corrompido no banco aceitaria
   qualquer senha. Há teste cobrindo isso.

4. **`npm run build` e `npm run dev` não podem compartilhar `.next`.** Os
   formatos são incompatíveis; rodar os dois derrubava o dev com `Cannot find
   module './833.js'`. Resolvido com `distDir` separado por `NODE_ENV`.

5. **Formulário de edição vai dentro da tabela, na linha abaixo do item.** Numa
   lista de 47 produtos, renderizar o formulário depois da tabela fazia o
   clique em "Editar" parecer que não fez nada — ele abria fora da tela. Padrão:
   `<Fragment>` com a `<tr>` do item e uma `<tr>` com `colSpan` logo abaixo.

6. **O `npm install` desta máquina não roda os scripts de pós-instalação.** O
   npm os bloqueia e avisa (`allow-scripts`), então **`prisma generate` não
   roda**. Em modo demonstração não faz diferença para a tela —
   `src/data/index.ts` importa o Prisma por `import()` dinâmico, que nunca é
   avaliado nesse caminho, e `npm test` e `npm run dev` passam sem isso.

   Mas **`npm run typecheck` NÃO passa** depois de mexer em
   `prisma/schema.prisma`: o cliente gerado é a fonte dos tipos, e
   `prismaCostRepository.ts` referencia cada model pelo nome. Modelo novo no
   schema sem `npx prisma generate` dá
   *"Property 'x' does not exist on type 'PrismaClient'"* — o erro parece de
   código e é de geração. Rode `npx prisma generate` logo depois de editar o
   schema, mesmo sem banco nenhum por perto.

7. **`npm run dev` embute o `.demo-data` inteiro no HTML — inclusive os hashes
   de senha.** Medido: a mesma rota sai com **277 KB** em desenvolvimento e
   **57 KB** em produção, e a diferença é o conteúdo de `cadastros.json`
   serializado no payload, com `senhaHash`, `senhaSal`, custo de fabricação e
   percentual de comissão. Não é bug nosso: é a instrumentação de I/O do Next
   em modo dev, que manda o resultado de cada `fs.readFile` para o navegador
   junto com o rastro de pilha.

   O que isso quebra, **só em dev**:

   - o perfil `estoque` recebe comissão e hash de senha, furando a 5.13;
   - `/assinar/<qualquer-coisa>` — pública, sem login, com token inválido —
     também devolve tudo isso.

   O `SESSAO_SECRET` **não** vaza (conferido), então não dá para forjar sessão.
   E em produção nada disso aparece: verificado em quatro rotas e nos dois
   perfis, zero ocorrência.

   Regra prática: **servidor de desenvolvimento não vai para a internet.**
   Enquanto os dados forem fictícios e as senhas forem as publicadas aqui, o
   estrago é nenhum; com dados reais, é sério. Ver `DEMONSTRACAO.md`.

8. **`Number(null)` e `Number("")` valem ZERO, não `NaN`.** Filtrar entrada com
   `Number.isFinite(Number(valor))` deixa passar `null`, `""`, `false` e `[]`,
   todos virando um zero silencioso. Onde os números vêm em pares — os traços
   da assinatura são `[x0, y0, x1, y1, ...]` — um zero a mais desloca todo o
   resto e troca os eixos. Confira o `typeof` antes, e descarte a sequência
   inteira em vez de remendar: dado embaralhado é pior que dado faltando.

9. **Nome de marca é CHAVE, não só rótulo.** `Pedido.marca` sai do catálogo e
   `Influencer.marca` sai do cadastro, e comissão, regime tributário e DIFAL
   casam os dois por igualdade de texto. Ao acentuar os nomes de tela, o
   catálogo passou a dizer "Luma Cosméticos" e o contrato continuou "Luma
   Cosmeticos": a marca ficou sem contrato em silêncio — 4 de 5 comissões,
   lucro inflado, imposto no regime padrão — e nenhum teste de conta pegou,
   porque cada conta, sozinha, estava certa. `marcas.test.ts` confere que todo
   contrato semeado aponta para uma marca do catálogo. Ao renomear uma marca,
   renomeie nos dois lados **e** no `.demo-data`.

10. **Semente cara dentro de caminho quente.** O repositório de demonstração
    relê o arquivo em toda chamada (armadilha 2), e a função que completa
    chaves faltantes montava o estado inicial **antes** de olhar o arquivo:
    contagens de estoque sobre 45 mil pedidos e o scrypt das senhas, ~52 ms por
    chamada. Uma página faz umas nove chamadas, então **cada troca de aba
    esperava ~225 ms** para produzir um objeto que ia para o lixo. O cliente
    sentiu como "a aba demora a mudar". Agora `completar` só monta o estado
    inicial se alguma chave faltar — a página caiu para ~3 ms de repositório.
    Regra: nada caro roda no caminho de leitura sem ter sido medido.

    O outro lado da mesma queixa era a falta de sinal. Toda página é montada
    no servidor, e o Next só troca a tela quando a nova chega; sem nenhum
    retorno, o clique parecia não ter pegado. Duas peças resolvem sem mexer no
    cálculo: `IndicadorNavegacao` (no layout) mostra uma barra fina no topo
    assim que qualquer link interno é clicado, e a barra de abas acende a aba
    clicada na hora, antes de a página chegar.

---

## 9. Roadmap (contexto, não escopo atual)

Não implemente nada disto. Está aqui para não tomar decisões que fechem portas.

- **Fase 2 — recuperação de carrinho e recompra.** Recurso `Abandoned Checkout`
  e webhooks, com disparo por WhatsApp Business API. Vai precisar de
  persistência própria (a Nuvemshop guarda carrinho abandonado por apenas 30
  dias) e de um grupo de controle para medir incremental.
- **Fase 3 — automação do atendimento.** Triagem dos chats, começando por
  consulta de status e rastreio de pedido.
- **Multi-usuário.** Hoje não há login. Quando houver, o `RepositorioCadastros`
  ganha um escopo de organização.
- **Bling (ERP), se o cliente quiser.** Ele já usa o Bling ligado à Nuvemshop, e
  de lá sairia o que a API da loja não tem: **composição de kit**
  (`GET /produtos/estruturas/{id}` devolve `componentes[{produto, quantidade}]`),
  NCM (`tributacao.ncm`) e custo (`fornecedor.precoCusto`). É OAuth 2.0 na conta
  do cliente: autorização em `https://www.bling.com.br/Api/v3/oauth/authorize`,
  token em `/Api/v3/oauth/token` (Basic + cabeçalho `enable-jwt: 1`), refresh de
  30 dias que **gira a cada uso** — ou seja, o token precisa de lugar gravável,
  não do `.env`. O vínculo com o produto da Nuvemshop sai do SKU (`codigo`) ou
  de `GET /produtos/lojas`. Nada disso foi implementado.

Implicação prática para hoje: mantenha `lib/metrics.ts` e `lib/costing.ts`
puros, e `FonteDePedidos`/`RepositorioCadastros` como interfaces.

---

## 10. Pronto quando

- `npm run dev` sobe e mostra o painel completo sem erro no console.
- `npm test` passa.
- Os totais da cascata fecham na aritmética.
- A soma das linhas da tabela por marca bate com os totais gerais.
- O percentual de comissão é editável no Simulador e recalcula a estimativa.
- Cadastrar um custo muda o lucro operacional na tela principal.
- Funciona com a internet desligada.
- Legível numa tela de reunião, e não quebra em 1366×768.

---

## 11. Como subir e conferir

```bash
npm install     # so na primeira vez
npm run dev     # http://localhost:3000
```

Sem `.env` nenhum o painel sobe em modo demonstração. Não crie um só para
rodar: o padrão de `fonteDados()` já é `demo` e o segredo de sessão tem
fallback fixo embutido.

Login da demonstração: `dono` / `dono123`, `estoque` / `estoque123`. Os hashes
são gerados em `src/data/seeds.ts`.

### Conferir as telas sem abrir o navegador

```bash
npm run fumaca    # com o dev rodando
npm run celular   # idem, e precisa do Chrome instalado
```

`fumaca` bate em todas as rotas com os dois perfis e diz se cada página montou
no servidor. Também confirma que `estoque` leva 307 nas telas financeiras — a
garantia da 5.13, que é invisível em teste unitário — e que a rota **pública**
`/assinar/<token>` abre **sem** sessão, recusa token inválido e devolve 404 no
PDF antes de a ordem ser assinada. Ela é a única do painel em que redirecionar
para `/entrar` seria o defeito, não a proteção.

Rota nova sem área declarada em `AREA_DA_ROTA` **falha** o script de propósito:
sem isso, uma tela financeira nova entraria no ar sem ninguém conferir se o
perfil `estoque` está barrado nela.

`celular` abre cada rota em 390px num Chrome headless e falha se houver
transbordo horizontal, texto de gráfico abaixo de 9px **na tela** (não no JSX)
ou tabela rolando sem coluna âncora. Ele varre só as pastas de primeiro nível de
`src/app`; a tela de assinatura mora em `assinar/[token]/` e precisa do token no
argumento:

```bash
node scripts/celular.mjs --rota /assinar/demonstracao-aguardando-assinatura-do-gerente
```

No Git Bash isso exige `MSYS_NO_PATHCONV=1` na frente, senão o `/assinar/...` é
convertido em caminho do Windows antes de chegar ao Node. É a régua da seção 2.1. Não instala nada:
fala o protocolo do próprio Chrome por WebSocket, que o Node 24 já tem.

**Não tente fazer login por `curl`.** O formulário é uma Server Action: o
protocolo (header `Next-Action`, um id que muda a cada build, argumentos
serializados posicionalmente) não é feito para ser falado à mão, e as
tentativas voltam 500 ou 404 sem nada de errado no app. `scripts/fumaca.mjs`
pula essa etapa forjando o cookie assinado, que é o que o navegador receberia
de qualquer forma.

O que o `fumaca` **não** diz: se o número está certo, se a pizza fecha, se cabe
em 1366×768. Isso é `npm test` e olho na tela.

### Onde cada coisa é verificada

| Pergunta | Onde |
|---|---|
| A conta está certa? | `npm test` — 456 testes sobre as funções puras |
| A chave da Nuvemshop vale? Os pedidos chegam como esperado? | `npm run nuvemshop:testar` |
| A página monta? O perfil bloqueia? | `npm run fumaca` |
| Funciona no celular? | `npm run celular` |
| A tela comunica? | abrir no navegador, em tela grande e no telefone |

---

## 12. Modo real (Nuvemshop)

Roteiro de uso em `DADOS_REAIS.md`. Aqui ficam as decisões.

**Estado:** ligado à loja real desde 16/09/2026 (Tha Beauty, loja 5018407),
com os pedidos de julho/2026 em diante (`NUVEMSHOP_MESES=3`; o resto vem
depois, voltando para 13). O primeiro contato com uma loja nova continua sendo
`npm run nuvemshop:testar`, que mostra como o pedido chega antes de qualquer
número ir para a tela.

### O que a loja real mostrou

A API falsa imitava a documentação, e a loja real diferiu dela em cinco pontos:

| Achado | Consequência |
|---|---|
| A `2025-03` lista pedidos **sem frete** (`shipping_cost_*` sumiram) | padrão virou a `v1`, onde `total = subtotal − desconto + frete` fecha |
| **Nenhuma consulta passa de 10.000 registros** (422 na página 51) | a janela se divide ao meio até caber (`dividirJanela`) |
| Cada página de 200 leva **~10 s** para chegar | páginas em paralelo, 12 por vez (`SIMULTANEAS`); 3 meses (25.751 pedidos) em 5 min |
| Sem `read_customers`, o pedido vem **sem `customer`** | recompra fica errada até uma chave com essa permissão; o resto não depende dela |
| Pix não pago vira `cancelled` + `voided` + `cancel_reason: automatic` | "não pago" sai zerado e o vazamento aparece em "cancelado" |

Também apareceram `payment_status` fora da lista: `partially_refunded` e
`chargeback`, que `classificarPedido` conta como recebido. São ~11 pedidos em
25 mil; a regra para eles ainda não foi decidida.

O balde de chamadas desta loja é de **400** (`x-rate-limit-limit`), não 40.
Com páginas de 10 s, 12 simultâneas ficam abaixo de 2 por segundo de qualquer
jeito. A janela termina em "agora", nunca no fim do mês: pedido criado durante
a busca entraria no topo da lista e empurraria os outros de página. Se vierem
menos registros que o `x-total-count`, a janela é buscada uma segunda vez.

### Roda ao lado da demonstração, não no lugar dela

O `.env` continua em `demo`. O modo real lê o `.env.live` (fora do git; modelo
em `.env.live.example`, com um bloco `NUVEMSHOP_LOJA_<n>_MARCA/_STORE_ID/_TOKEN`
por loja — ver `DADOS_REAIS.md`; a linha JSON antiga `NUVEMSHOP_LOJAS` soma com
eles, e loja ou marca repetida é erro) pelos comandos `:live` (`node --env-file=.env.live`),
na porta 3001 e só em `127.0.0.1`. O Next não sobrescreve variável que já está
no ambiente, então o `.env` de demonstração não vaza para o modo real —
inclusive `PERMITIR_HTTP_SEM_TLS`, que o modo real ignora de qualquer forma.

Consequência: **login no modo real só em localhost ou HTTPS.** O Chrome aceita
cookie `Secure` em `http://127.0.0.1` (conferido); pelo IP fixo em HTTP não
entra. Acesso de fora é por túnel para `http://127.0.0.1:3001`.

### As páginas nunca esperam a API

Toda página lê a base inteira (o RBT12 precisa de 12 meses). Uma loja deste
porte tem ~100 mil pedidos por ano: a 200 por chamada e 2 chamadas por
segundo, são minutos. Por isso `cachePedidos.ts`:

1. a primeira busca traz `NUVEMSHOP_MESES` (13) meses, **mês a mês**, de
   preferência por `npm run nuvemshop:sincronizar` antes de subir. Medido na
   loja real: 25.751 pedidos e 6.925 carrinhos em 293 s. A loja tem ~240 mil
   pedidos em 13 meses (~222 MB no `pedidos.json`, perto do teto de ~512 MB de
   uma string no Node); com mais lojas, o cache precisa virar um arquivo por
   mês;
2. depois a página responde com o disco e, se a cópia passou de
   `NUVEMSHOP_ATUALIZAR_MINUTOS` (10), pede em segundo plano só o que mudou
   (`updated_at_min` com 10 minutos de sobreposição). Boleto pago e pedido
   cancelado mudam o `updated_at`;
3. carrinhos abandonados são a lista mais cara (~100 chamadas para 30 dias):
   lista inteira de hora em hora, só os novos no meio;
4. o rodapé de toda tela diz de quando é a cópia e, se a última atualização
   falhou, o motivo. Número de 10 minutos atrás, declarado, é melhor que tela
   travada.

Estado em `globalThis` e arquivo como fonte da verdade, pela armadilha 2. Uma
busca por vez por processo. Gravação em arquivo temporário + `rename`.

**Uma loja por influencer, e cada loja por conta própria** (17/09/2026). A
busca passa loja por loja, e a falha de uma — chave recusada, loja fora do
ar — não derruba as outras: a que falhou fica com a cópia anterior (ou fora
dos números, se nunca foi buscada), o rodapé diz o motivo, e a próxima
tentativa só vem depois do intervalo de atualização, senão cada página aberta
chamaria a API de novo. Só é erro inteiro quando nenhuma loja respondeu.
Conferido contra a loja real, com uma segunda loja de chave inválida.

**Loja nova não trava as telas.** Sem cópia de loja nenhuma, a página espera a
primeira busca (não há o que mostrar). Com loja nova ao lado das já copiadas,
a página abre com as que têm cópia e a busca da nova corre em segundo plano;
o rodapé lista as lojas que ainda não entraram (`lojasPendentes`). A primeira
busca de uma loja deste porte leva minutos — melhor rodar
`npm run nuvemshop:sincronizar` antes de subir.

### A conversão na borda (`lib/nuvemshop.ts`)

- **Horário de Brasília.** A API manda UTC, e `chaveMes` corta o texto da data:
  um pedido das 22h do dia 30 cairia no mês seguinte. `converterPedido`
  reescreve as datas com `-03:00` (sem horário de verão desde 2019). O
  instante não muda.
- **Sem dado pessoal.** Nenhuma conta usa nome, e-mail, telefone, documento ou
  endereço; o cache guarda só o id do cliente e o estado de destino.
- **Cliente ausente ganha id negativo próprio**, senão todos os anônimos
  viravam um cliente recorrente.
- **Campo ausente entra zerado e é contado** (`CampoVigiado`). Frete zero é
  certo para frete grátis e errado para campo renomeado; só a contagem
  distingue. `nuvemshop:testar` mostra.
- **Status desconhecido passa como veio** e é listado
  (`situacoesDesconhecidas`): `classificarPedido` trata todo pagamento fora
  da lista como recebido, o que estaria errado para um `partially_refunded`.
- **`x-rate-limit-reset` é em milissegundos.** A primeira versão do cliente lia
  segundos: um 429 esperaria horas. Com `x-rate-limit-remaining` ≤ 2 o cliente
  espera 500 ms antes de continuar, e é isso que zera as recusas.

### O banco real começa quase vazio

`prisma/seed.ts` semeia só o que vale para qualquer empresa: tributos,
alíquotas dos estados, taxas de pagamento e os dois usuários. **Nenhum
influencer, produto, custo, contagem, ordem ou despesa da demonstração** — as
marcas inventadas não casariam com pedido nenhum (armadilha 9) e o painel
mostraria custo de produto fictício ao lado de venda real. Até o cadastro ser
feito, o lucro da tela sai alto demais, e os avisos vermelhos existentes (produto
sem custo, marca sem influencer) dizem isso.

As senhas vêm de `SENHA_DONO` e `SENHA_ESTOQUE`; a semente recusa menos de
12 caracteres e as senhas publicadas aqui. `db:criar:live` cria usuário e banco
no Postgres local pedindo a senha do `postgres` na hora, sem gravar.

### Build em outra pasta

`PAINEL_DIST_DIR` troca a pasta do build. Serve para montar um build novo
(`PAINEL_DIST_DIR=.next-novo npm run build`) e testá-lo sem derrubar o
servidor que está lendo `.next` — mesma incompatibilidade da armadilha 4.

### Armadilha do teste com dados de demonstração

A base de demonstração gera o mês corrente inteiro, então tem pedidos com data
**no futuro**. Servida por uma API falsa, toda busca incremental os traz de
novo (o `updated_at` deles é "depois de agora"): 60 chamadas por rodada em vez
de meia dúzia. É artefato do teste, não do cliente real.

---

## 13. Onde o trabalho parou (16/09/2026)

Para quem continuar em outro computador. O código está todo no git; o que
está listado abaixo **não está**, de propósito.

### Situação

- **Demonstração para o cliente na segunda-feira**, com dados fictícios. Ela
  roda no desktop de casa (`npm start`, porta 3000), acessada pelo IP fixo
  `177.223.44.178:3000` ou por túnel rápido da Cloudflare (endereço muda a cada
  vez; ver `DEMONSTRACAO.md`).
- **Modo real ligado à loja Tha Beauty** (5018407), no notebook, com o
  Postgres 18 instalado ali. Marca configurada como `"Tha Beauty"` — os
  contratos precisam usar esse texto. Pedidos de julho/2026 em diante. A chave
  lê pedidos, carrinhos e produtos, mas não clientes. Influencer cadastrado:
  **Tha**, 25% sobre o que cai na conta (5.1.2), Lucro Presumido, GO — a API não informa nada
  disso; veio do dono. A razão social na Nuvemshop é CRIAR MARKETING DIGITTAL
  LTDA. Produtos já trazidos (82, com 33 kits ainda sem composição), todos do
  Tha. O dono vem mexendo no cadastro fiscal pela tela: apagou ICMS-ST e IPI,
  deixou o **ICMS em 4%** (marcado nos 82) e marcou PIS e COFINS num produto
  para testar a regra nova (5.10) — os dois passaram a incidir só sobre ele.
  Próximo passo: montar os kits na aba Kits (5.11.1) e cadastrar os custos.
- **Os custos de fabricação gravados são PROVISÓRIOS**: 35% do preço de venda,
  a pedido do dono, só para o painel ter base até os custos reais chegarem. São
  76 fichas, com o valor inteiro em "matéria-prima" e os outros três componentes
  em zero — é por aí que se acham para trocar. Com eles, setembro fechou em
  R$ 101,9 mil de lucro operacional (18% da receita real), e os dois simuladores
  batem: R$ 17,89 por R$ 100 de produto contra R$ 18,01 do simulador de
  influencer.
- **Seis produtos ficaram sem ficha porque não têm preço.** Cinco saem a R$ 0
  nos pedidos e sem preço no catálogo — são brindes ou itens que acompanham kit
  (Beauty Balm Sortido, com 7.833 unidades no período, os dois Body Splash
  "Sortido" e as versões novas do Watermelon), e o sexto nunca vendeu. Eles
  consomem estoque e custam para fabricar, e a **cobertura de custo não os
  denuncia**: ela é medida por receita, e a receita deles é zero. Quando os
  custos reais chegarem, são os primeiros a olhar.
- **São cinco lojas Nuvemshop, uma por contrato**, todas ligadas em
  17/09/2026, com pedidos de julho a setembro/2026 (40.484 pedidos, 7,5 min
  de busca, `pedidos.json` com 39 MB):

  | Marca | Loja | Contrato | Empresa na Nuvemshop | Produtos (kits) | Set/2026 bruto |
  |---|---|---|---|---|---|
  | Tha Beauty | 5018407 | Tha | CRIAR MARKETING DIGITTAL | 82 (33) | R$ 802 mil |
  | Ka Beauty | 5921304 | Ka | CRIAR MARKETING DIGITTAL | 56 (27) | R$ 137 mil |
  | Duale Beauty | 7704600 | Duale | CLIP NEGOCIOS DIGITAIS | 15 (6) | R$ 87 mil |
  | Laoli Beauty | 5900406 | Laoli | CRIAR MARKETING DIGITTAL | 29 (12) | R$ 23 mil |
  | Revenda | 7886157 | Revenda Tha Beauty | CLIP NEGOCIOS DIGITAIS | 59 (17) | R$ 100 mil |

  O id das lojas novas saiu do código da vitrine (`LS.store`, a página
  pública da loja) e foi conferido chamando `/store` com a chave — a API não
  diz o id a partir da chave. As quatro chaves novas trazem o cliente no
  pedido (a da Tha não).
- **Os quatro contratos novos são PREMISSA**: copiados da Tha (25% sobre o que
  cai na conta, Lucro Presumido, GO), porque ninguém informou os termos. Está
  escrito na observação de cada um. A Revenda é canal de revenda (ticket
  médio ~R$ 1.500) e pode nem pagar comissão.
- **Duas empresas, cinco contratos.** Tha, Ka e Laoli são do mesmo CNPJ
  (46.549.339/0001-42); Duale e Revenda, de outro (63.934.671/0001-40). O
  painel apura imposto por contrato, e no Lucro Presumido a dedução do
  adicional de IRPJ (R$ 20 mil/mês) é **por CNPJ**: aplicada por contrato, ela
  entra três vezes numa empresa e duas na outra, e o IRPJ sai menor que o
  devido. Não corrigido — pede o regime por empresa, e não por contrato.
- **Os 159 produtos novos estão sem custo** (a cobertura de custo das quatro
  lojas é 0%), então o lucro delas sai alto demais até as fichas existirem.
- Para uma chave nova: bloco preenchido, `nuvemshop:testar`,
  `nuvemshop:sincronizar` com o painel **parado** (o servidor no ar não conhece
  a loja nova e, na atualização seguinte, tiraria os pedidos dela da cópia),
  contrato na aba Influencers com a mesma marca, e "Trazer da Nuvemshop"
  (roteiro em `DADOS_REAIS.md`).
- Com cinco lojas o `pedidos.json` cresce na mesma proporção: com
  `NUVEMSHOP_MESES=13` passaria do teto de uma string no Node (seção 12,
  item 1). Antes de voltar para 13, o cache precisa virar um arquivo por loja
  ou por mês.

### O que não vem pelo git

| Arquivo | O que é | Em outro computador |
|---|---|---|
| `.env` | segredo de sessão da demonstração e `PERMITIR_HTTP_SEM_TLS=1` | sem ele o painel sobe em demo com o segredo embutido — serve para desenvolver; para expor na internet, gere um `SESSAO_SECRET` (comando em `.env.example`) |
| `.env.live` | chave da Nuvemshop, `DATABASE_URL`, segredo e senhas do modo real | copie de `.env.live.example` e gere segredo e senhas novas; **não** mande o do desktop por mensagem nem pelo git |
| `.demo-data/` | cadastros da demonstração (o que foi editado nas telas) | recriado sozinho com a semente na primeira leitura |
| `.live-data/` | cópia local dos pedidos reais | recriada por `npm run nuvemshop:sincronizar` |
| Postgres | banco `painel` do modo real | precisa de um Postgres instalado; `npm run live:preparar` cria usuário, banco e tabelas |

Depois de clonar: `npm install` e, como o npm desta configuração não roda o
pós-instalação (armadilha 6), `npx prisma generate` antes do
`npm run typecheck`.

### Conferido no fim da sessão

456 testes, tipos sem erro, `npm run fumaca:live` contra a loja real (todas as
telas, os dois perfis), sincronização de 3 meses. Ainda **não** conferido: um
mês fechado contra o relatório da própria Nuvemshop.
