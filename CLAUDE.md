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
4. **A barra de abas rola de lado, não quebra em linhas.** São treze seções
   (com onze, em 390px, elas já somavam ~650px). Até aqui as abas dividiam a linha do cabeçalho
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

Exibida como **gráfico de pizza**, com treze fatias (quinze na loja real, com
a Intelipost e o frete grátis do TikTok; a original dizia catorze, com
a Intelipost). É o herói da tela.

A cascata foi tentada e descartada: com a cadeia completa (ver 5.8) ela vira
treze barras em degrau, com os rótulos em alturas diferentes e os textos de
apoio se sobrepondo. Ilegível justamente numa tela de reunião, que é onde ela
precisa funcionar.

A pizza só fecha porque as parcelas **somam exatamente** o bruto:

```
bruto = não pago + cancelado + reembolsado + frete da transportadora + Intelipost
      + frete grátis que a loja bancou
      + impostos + DIFAL + taxas (Nuvemshop, cartão e pix) + fabricação
      + comissão de influencers + marketing + outras despesas
      + sócios + lucro operacional
```

**O frete grátis é a fatia que NÃO está no bruto** (25/09/2026, com o TikTok
Shop). Todas as outras saem de dentro do que o cliente pagou; essa é dinheiro
que só sai. Ela fecha assim mesmo porque sai do lucro na mesma medida:
acrescentar a fatia e tirar o mesmo valor do lucro deixa a soma igual. Some
onde ninguém banca frete — a Nuvemshop, hoje.

**O custo dos influencers vem em TRÊS fatias**, e não em uma (23/09/2026).
Antes era uma fatia só, "Influencers", com comissão e despesas dentro. Ela
escondia a pergunta que o dono faz: quanto disso é comissão — que se renegocia
no contrato —, quanto é mídia paga — que se liga e desliga no mês — e quanto é
o resto da estrutura. São três decisões diferentes, e uma fatia só não separava
nenhuma delas. As três somam `dre.totalInfluencers`, então a pizza continua
fechando; há teste.

Marketing e "Outras despesas" **somem quando são zero** (`opcional`), como a
Intelipost: na demonstração a única despesa semeada é o operacional, e uma
fatia de R$ 0,00 na legenda diria que existe uma linha de marketing rendendo
nada. O raio-x (5.8) quebra a mesma linha em duas, pelo mesmo motivo — pizza
mostrando dois números e raio-x mostrando um seriam duas versões da mesma
verdade na mesma tela.

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

A fatia de taxas se chama **"Taxas das lojas (plataforma, cartão e pix)"**
desde 25/09/2026: com o marketplace ligado, "Taxas Nuvemshop" passou a nomear
errado metade do que estava ali dentro. O rotulo nao cita loja nenhuma de
proposito -- filtrada por uma loja so (abaixo), citar a outra seria mentira.

**A tela inicial tem filtro de loja** (pedido do cliente, 25/09/2026): botoes
no topo da pizza, e a escolha mora na URL (`?loja=`). Ele filtra a TELA
INTEIRA, e nao so o grafico: pizza de um canal ao lado do raio-x de todos
mostraria dois lucros diferentes na mesma tela, que e o que a 5.14 proibe no
relatorio pelo mesmo motivo. Marca que nao vendeu no mes nao vira botao, e um
endereco com loja que nao existe volta para "todas as lojas", em silencio --
link velho nao e erro de quem esta olhando.

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

### 5.1.1 A base do imposto é o FATURADO; a da comissão não

**O imposto incide sobre o faturado, com frete. A comissão, não.** São duas
decisões do cliente, tomadas em datas diferentes, e é fácil confundi-las numa só:

- o frete é cobrado **por fora** — num produto de R$ 100 com R$ 19 de frete o
  cliente paga R$ 119 — e os R$ 19 vão para a transportadora. Não é venda do
  influencer: **fora da comissão** (16/09/2026), junto com as taxas (5.1.2);
- o imposto segue outra régua. Em **18/09/2026**, em dois pedidos seguidos do
  dono, a base de **todo tributo** — DAS, PIS, COFINS, ICMS, IRPJ, CSLL e
  DIFAL — passou a ser o **faturamento bruto, com frete**: o valor de todo
  pedido criado no mês, pago ou não. Primeiro entrou o frete (na legislação o
  frete cobrado do destinatário integra a base do ICMS, do PIS/COFINS e a
  receita bruta do Simples), depois a base saiu do recebido para o faturado.

**Ressalva registrada, e mantida pelo dono:** pedido cancelado e boleto nunca
pago normalmente **não geram nota fiscal nem saída de mercadoria**, e tributá-los
cobra imposto de venda que não aconteceu. O painel passa a **superestimar** o
imposto nessa medida — o contrário do que acontecia antes. Foi dito a ele antes
de implementar; ele manteve. Só volte atrás se ele pedir.

| Conta | Base | Onde |
|---|---|---|
| Comissão, base "bruto" | faturamento **sem frete** (`brutoSemFrete`, todos os pedidos) | `calcularComissoesPorInfluencer` |
| Comissão, base "recebido" / "receita real" | receita real (recebido − frete) — as duas passam a dar o mesmo valor | idem |
| **Comissão, base "o que cai na conta"** (`liquido`, a praticada) | receita real − taxas da Nuvemshop e do pagamento (`porMarca` de `apurarTaxasPlataforma`) | idem |
| **Impostos, DAS, Presumido, RBT12** | **faturado: todo pedido criado, com frete** | `apurarGrupo`, `calcularRBT12` |
| **Tributo por produto (PIS, COFINS, ICMS marcados)** | preço × quantidade **+ a parte do frete**, rateada pelo valor | `basesDosItens` |
| **DIFAL** | valor de todo pedido criado, **com** frete | `apurarDifal` |
| Divisão das despesas compartilhadas | faturamento sem frete | `ratearDespesas` |
| Taxa do meio de pagamento | valor pago **com** frete | o gateway cobra sobre o total |
| Participação dos sócios | recebido, **com** frete | definição do cliente: "do valor recebido" |

`Reconciliacao` ganhou `freteTotal` (frete de **todo** pedido criado, pago ou não)
e `brutoSemFrete`. A base "bruto" precisa do frete dos não pagos também, senão um
boleto nunca pago continuaria comissionando o frete dele.

O frete é do **pedido** e o tributo por produto incide sobre o **item**, então
ele é rateado pelo valor (`basesDosItens`): um item que vale metade do pedido
carrega metade do frete. É o mesmo critério da taxa de plataforma na margem por
produto (5.13.1), e não exige arbitragem porque a cobrança já é proporcional ao
valor. Pedido só de brinde (itens a R$ 0) não tem por onde ratear: ali o frete
fica fora da base. A "receita sem cadastro fiscal" usa a mesma função, senão a
lacuna declarada seria menor que a real.

**O que isso custou, medido nas cinco lojas reais em set/2026.** Foram dois
passos no mesmo dia, e vale ver os três lados a lado:

| Base | Base tributada | Imposto + DIFAL |
|---|---|---|
| Original: recebido, sem frete | R$ 847.769 | R$ 138.719 |
| Depois: recebido, com frete | R$ 973.947 | R$ 161.532 |
| **Agora: faturado, com frete** | **R$ 1.171.533** | **R$ 196.221** (+41,4%) |

São ~R$ 57,5 mil por mês a mais que no começo do dia, saindo direto do lucro
operacional. Três efeitos de segunda ordem que **não** são proporcionais e
precisam de olho:

1. **O RBT12 sobe junto**, e com ele a faixa do Simples — por isso Laoli
   (+52,6%) e Revenda (+33,7%) subiram muito mais que a própria base.
2. **A Ka Beauty passou do sublimite.** O RBT12 dela foi de R$ 3,59 mi para
   **R$ 4,22 mi**: acima do sublimite de ICMS (R$ 3,6 mi), que tira o ICMS da
   guia única — ele passa a ser recolhido por fora —, e já em "perto do teto"
   (R$ 4,8 mi), que desenquadraria do regime. É a consequência mais séria da
   mudança e vale conferir com o contador.
3. **O preço mínimo dos simuladores subiu**: cada real de frete passou a
   carregar imposto, e a carga por venda paga agora embute o imposto dos
   pedidos que nunca foram pagos. Ver 5.17.

**Ponto para o contador:** o DIFAL passou a usar **base dupla** no mesmo dia,
depois que ele mandou o demonstrativo de agosto (5.10.2) — antes o painel saía
abaixo do devido, agora sai alguns pontos acima. E o frete que a loja paga à
transportadora (`shipping_cost_owner`) não gera crédito no modelo.

### 5.1.2 A comissão é sobre o que cai na conta

Regra do cliente, dita em 16/09/2026 ao ligar a loja real: **o influencer
ganha sobre o produto, sem o frete, sem a taxa da Nuvemshop e sem a taxa do
cartão** — "basicamente o que cai na conta da empresa, fora o frete".

```
base "liquido" = recebido − frete − taxas de plataforma e pagamento
                 − frete que a LOJA bancou
               = receita real − taxas − frete grátis
```

**O frete grátis entrou na conta em 25/09/2026**, com o TikTok Shop, a pedido
do dono: ali a loja banca o frete e ele sai do **mesmo repasse**, antes de o
dinheiro chegar. "O que cai na conta" passou a ser o repasse de verdade. A
regra é uma só, e não uma exceção por canal: na Nuvemshop quem paga o frete é
o cliente, `freteAbsorvido` é zero e nada muda. Em setembro isso levou a
comissão do TikTok de R$ 16,5 mil para R$ 11,1 mil, e não mexeu em nenhuma
outra marca.

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

### 5.1.3 Fechamento do mês: valores informados

Pedido do cliente (17/09/2026): no fim do mês ele tem os números de verdade —
a guia de imposto paga, o DIFAL recolhido, a fatura das transportadoras — e
quer digitá-los **ao lado** do calculado. O informado vale na pizza e no
resultado; o calculado continua existindo e aparece junto.

Na legenda da pizza, **Frete (transportadora)**, **Impostos** (sem o DIFAL) e
**DIFAL** têm "informar valor do fechamento". Com valor informado, o item mostra
o informado e, abaixo, "calculado R$ X". Campo vazio + Salvar volta ao
calculado. Um registro por mês, para a operação inteira (`FechamentoMes`,
chave `mes`); a action lê os outros dois campos do mês e grava só o que mudou.

`fecharMes` (`lib/fechamento.ts`) faz a conta:

```
usado    = informado, se houver; senão o calculado  (por campo)
ajuste   = Σ (usado − calculado)
lucro    = lucro calculado − ajuste
```

Três decisões:

1. **Só a leitura da tela inicial muda**: pizza, os números do topo
   (impostos e lucro) e o fim do raio-x. Comissão, receita real, base de
   imposto, simuladores, relatórios e aba Influencers seguem o calculado — o
   cliente pediu que "o cálculo mantenha o número calculado". A frase de
   rodapé da pizza diz isso quando há valor informado.
2. **A pizza continua fechando no bruto**: o que sobe numa fatia desce no
   lucro (teste em `fechamento.test.ts`).
3. **O raio-x não reescreve as linhas calculadas.** Elas ficam como estão (a
   receita real é a base da comissão), e a diferença entra numa linha só,
   "Ajuste do fechamento", antes do lucro — que então bate com o da pizza.

O frete informado substitui só o da **transportadora**; a Intelipost continua
calculada (R$ 0,73 por pedido). Zero informado é informado, não vazio.

O campo lê o valor com o mesmo `lerReais` dos simuladores (`lib/format.ts`).
Ele devolve `null` tanto para vazio quanto para texto ilegível; a action
separa os dois — vazio volta ao calculado, ilegível é erro —, senão um valor
digitado errado apagaria o informado sem aviso.

### 5.1.4 Memória de cálculo: impostos e DIFAL

Pedido do cliente (17/09/2026): clicar em **Impostos** ou **DIFAL** na pizza
abre uma tela com a conta. Rota `/calculo?item=impostos|difal&mes=`, área
`fiscal`; o nome na legenda ("ver a conta →") e a própria fatia são links. Não
é aba do menu: só se chega pela pizza (ou pelo endereço).

**Nenhuma conta nova.** `memoriaDosImpostos` (`lib/memoriaCalculo.ts`)
reorganiza o que `apurarImpostos` já fez e acrescenta só o que explica cada
base: quantos produtos da marca marcaram o tributo, qual presunção e qual
dedução entraram, e a faixa e o RBT12 do Simples. Teste: a soma da tela bate
com as fatias da pizza, e cada passo é base × alíquota.

- **Impostos**, por marca: a base é o **faturamento bruto**, e ao lado dela a
  tela abre o que está dentro — quanto é frete e quanto é pedido não pago ou
  cancelado —, mais o recebido como referência. Depois uma tabela Tributo |
  Como a base foi formada | Base × Alíquota = Valor. Três origens de base:
  produtos marcados (5.10), lucro presumido (presunção × faturado − dedução) e
  DAS (alíquota efetiva pelo RBT12). O DIFAL fica fora, porque tem fatia e aba
  próprias.
- **DIFAL**, por marca: a fórmula e as regras (venda interna, 12%/7%, Simples,
  base dupla) e, por estado, pedidos | valor da operação | base de cálculo |
  interna | − interestadual | = diferença | DIFAL — as duas colunas de base
  porque é o gross-up que explica o número, e é assim que o demonstrativo do
  contador vem. Marca no Simples aparece com a distribuição e zero.
- O topo mostra o calculado e o **valor da pizza**: com fechamento informado
  (5.1.3), os dois diferem e a tela diz a diferença.

As tabelas são `tabela-ancorada` e não cartões: aqui a leitura é comparar
estado com estado — e, pela mesma razão, a lista de estados vem **em ordem
alfabética de UF** (ver 5.10.2).

### 5.1.5 Resultado oculto

Pedido do cliente (17/09/2026): o lucro ou prejuízo do mês **abre escondido** —
sem valor e sem cor — e só aparece quando ele clica em "Mostrar resultado". A
cor também some porque o verde ou o vermelho já contam a história.

Um estado só para a tela inicial (`ProvedorResultado`, em
`components/ResultadoOculto.tsx`): o número do topo, o item da legenda, a
fatia da pizza (cinza, sem percentual, sem valor no balão), o aviso de prejuízo,
as frases que dependem do sinal e a última linha do raio-x abrem e fecham
juntos — escondido num lugar e à mostra no outro não esconderia nada. Enquanto
oculto, o rótulo é "Resultado operacional", nem "lucro" nem "prejuízo". O
botão aparece no topo, na legenda e no raio-x. Toda carga da página começa
oculta; nada é gravado.

É ocultação **visual**, para a tela aberta numa reunião: o valor continua no
HTML de quem está logado, e as outras telas (relatórios, simuladores, aba
Influencers) seguem mostrando o lucro.

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

**Últimos 12 meses, uma linha por influencer mais a linha do total**
(23/09/2026, pedido do dono). Até então eram 6 meses e duas linhas — bruto vs.
recebido —, com a área sombreada entre elas mostrando que o vazamento é
estrutural. Ele trocou a pergunta: quer comparar as marcas entre si e ver quem
cresce e quem encolhe.

A distância entre faturar e receber **não sumiu do painel** — continua contada,
com mais detalhe, na pizza da tela inicial (5.1). Ela sairia daqui de qualquer
jeito: não há como mostrar duas métricas de cinco marcas no mesmo desenho sem
virar dez linhas.

Quatro decisões:

1. **A métrica é o faturamento BRUTO.** É o número que a pessoa tem na cabeça
   ao comparar uma marca com a outra, e assim a linha do total continua sendo
   exatamente a linha de bruto que o gráfico já mostrava. Há teste exigindo que
   `evolucaoPorMarca().total` seja igual ao `bruto` de `evolucaoMensal()` nos
   mesmos meses — as duas leem `reconciliar`, e se um dia divergirem é porque
   alguém passou a somar à mão num dos lados.
2. **Mês sem venda é ZERO, não um buraco.** Duale e Revenda só vendem a partir
   de julho/2026; sem o zero, a polilinha ligaria o último mês com venda ao
   primeiro seguinte e passaria por cima do período em que a loja não existia.
3. **Um eixo só, e a escala sai do total.** As marcas menores ficam baixas no
   desenho, e isso é honesto: a Revenda faz mesmo uma fração do que a Tha faz,
   e um eixo por marca esconderia justamente essa diferença.
4. **O total é preto e mais grosso**, fora da paleta das marcas: ele não é mais
   uma marca, é a soma de todas, e precisa se ler como outra categoria. A
   paleta das séries é qualitativa e não um degradê — as marcas não têm ordem
   natural, e uma escala contínua sugeriria que uma está "entre" as outras em
   alguma coisa.

Os valores sobre cada ponto saíram: com 12 meses e 6 linhas seriam 72 rótulos.
No celular os pontos somem também e o eixo mostra um mês a cada três — doze
rótulos em ~294px dariam 21px cada, e "Set/26" mede mais que isso. `npm run
celular` mede a fonte resultante e é ela que segura essa conta (seção 2.1).

`evolucaoMensal` continua em `metrics.ts`, com teste, mas **nenhuma tela a
usa**: é a única forma mensal do recebido e da receita real, e é dela que sai o
gráfico do vazamento no dia em que ele voltar. Mesmo critério da 5.2.

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

**Exceção: brinde sem ficha** (item a R$ 0 sem custo cadastrado) fica fora do
CMV, da rentabilidade por produto e da lista de vendidos da aba Custos
(`brindeSemCusto`, decisão do cliente em 17/09/2026). Não tem receita nem custo
conhecido, e só aparecia como "produto sem custo". Brinde **com** ficha conta:
o custo dele é real e sai da margem. O estoque continua baixando o brinde, se
ele tiver cadastro.

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
− marketing (5.16)
− outras despesas com influencers (5.16)
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
RBT12          = faturamento dos últimos 12 meses (todo pedido, COM frete — 5.1.1)
                 somado de TODAS as marcas do regime — ver 5.10.1
alíquota efetiva = (RBT12 × nominal da faixa − parcela a deduzir) / RBT12
DAS do mês     = alíquota efetiva × faturado do mês (com frete)
```

A fórmula da alíquota efetiva foi **conferida contra a memória de cálculo do
contador** (competência 08/2026): RBT12 de R$ 1.910.089,97 × 14,30% =
R$ 273.142,87, menos a parcela a deduzir de R$ 87.300,00 = R$ 185.842,87,
dividido pelo RBT12 = **9,7295346621814%**. O painel faz exatamente essa conta.

**O anexo é o I (Comércio), não o II (Indústria)** — corrigido em 23/09/2026,
quando o documento chegou. O painel supunha o Anexo II; a memória é do
**Anexo I, Seção 1, receitas de revenda de mercadorias não sujeitas a ST**, e
isso faz sentido: as lojas Nuvemshop **revendem** o que a fábrica produz, e a
industrialização acontece na outra empresa (5.15).

Os dois anexos continuam em `types/fiscal.ts`; quem manda na apuração é
`ANEXO_DA_APURACAO`, em `simplesNacional.ts`. O Anexo II fica ali para o dia em
que uma loja vender o que ela mesma industrializa. O campo
`Influencer.anexoSimples` existe e **continua sem efeito** — é nesse ponto que
ele passaria a ser lido.

A troca mexe em tudo: nominal, parcela a deduzir e repartição. Na 4ª faixa a
efetiva cai de 8,95% para 8,45%; na 5ª, de 12,325% para 11,875%. E o Anexo I
**não tem IPI** (comércio não industrializa) — o campo fica em zero, e a quebra
do DAS na tela descarta participação zerada.

**Quatro testes reproduzem o documento dígito a dígito** — alíquota efetiva
(9,7295346621814%), repartição, valor de cada tributo sobre os R$ 5.151,33 da
seção, e a alíquota efetiva por tributo. Se alguém mexer na tabela ou na
fórmula, eles avisam na hora.

A alíquota **efetiva** não é a da tabela — confundir as duas erra a conta em
milhares. A repartição por tributo vem da tabela oficial do Anexo II.

**O que está dentro do DAS nunca soma no total.** A guia única já é um valor
fechado; a quebra por tributo é só leitura. Somar as duas coisas dobra o
imposto. Por isso o cadastro de impostos guarda **apenas** o que é recolhido
por fora da guia.

O painel monitora os dois limites do regime, que são diferentes: passar do
**sublimite** (R$ 3,6 mi) tira só o ICMS da guia; passar do **teto**
(R$ 4,8 mi) desenquadra do regime. Os dois são medidos no RBT12 do grupo
(5.10.1), porque também são por CNPJ.

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

**A aba mostra dois regimes, não três.** O Lucro Real saiu a pedido do
cliente (17/09/2026): nenhuma marca dele está nesse regime, e a terceira seção
só embaralhava a leitura das duas que importam. O tipo `RegimeTributario`
continua com os três — o cadastro do influencer ainda aceita —, mas a tela
recusa mostrar o que não se usa:

- cada regime é um **bloco fechado**, com borda de duas marcas, faixa de título
  colorida (verde no Simples, roxo no Presumido) e espaço entre um e outro.
  Antes eram títulos com um traço embaixo e tabelas correndo uma atrás da
  outra: dava para ler a linha do Presumido achando que era do Simples, e a
  conta de um regime não vale no outro;
- tributo que só valia no Lucro Real (PIS e COFINS não cumulativos) não some:
  fica num bloco recolhido no fim, dizendo que continua cadastrado e não entra
  em conta nenhuma;
- marca em regime que a tela não mostra vira **aviso em vermelho** no topo, com
  o nome dela — senão os produtos dela ficariam sem tributo marcado e ninguém
  veria por quê;
- a nota "vale também em" cita só os regimes exibidos.

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

### 5.10.1 O RBT12 do Simples é da EMPRESA, não da marca

Decisão do dono em **23/09/2026**, invertendo o que estava aqui. Antes o RBT12
era por marca, com o argumento de que somar jogaria uma empresa pequena numa
faixa que não é a dela. Só que **as marcas do Simples são lojas Nuvemshop do
mesmo CNPJ**, e o RBT12 é apurado por CNPJ: separar por loja punha a empresa
numa faixa mais **baixa** que a devida. Quatro lojas de R$ 1 mi/ano não são
quatro empresas na 2ª faixa — são uma empresa de R$ 4 mi na 5ª.

Só que **"a empresa" é o CNPJ, e não "quem está no Simples"** — e essa segunda
metade custou uma correção no mesmo dia. A primeira versão somou as quatro
lojas do Simples numa faixa só, chegou a R$ 5,64 milhões e acusou estouro do
teto de R$ 4,8 mi. Estava errado: a Ka Beauty tem CNPJ próprio. Ver "Como a
divisão foi descoberta", abaixo.

Então: soma-se o faturamento das marcas **do mesmo CNPJ**, e todas as lojas
daquele CNPJ caem na **mesma faixa**, com a mesma alíquota efetiva.

Seis decisões de implementação, em `apurarImpostos`:

1. **O grupo é o CNPJ** (`Influencer.cnpj`, só dígitos). Loja sem CNPJ
   informado cai num grupo único, que é o comportamento de antes de o campo
   existir — e a tela **avisa em vermelho**, porque somar lojas de CNPJ
   diferente joga todas numa faixa que pode não ser a de nenhuma.
2. **O RBT12 começa na abertura do CNPJ** (`Influencer.inicioAtividade`). Mês
   anterior a ela foi faturado em outra empresa e não entra. A Ka é o caso:
   CNPJ aberto em 01/01/2026, e os R$ 902 mil que a loja faturou entre setembro
   e dezembro de 2025 são do CNPJ antigo. Divergindo entre lojas do mesmo CNPJ,
   vale a abertura **mais antiga** — a empresa começou quando a primeira loja
   dela começou.
3. **Empresa nova NÃO projeta.** Com `inicioAtividade` preenchido, o RBT12 é a
   **soma pura** dos meses desde a abertura (`origem: "abertura"`). É o que o
   demonstrativo do contador faz: na competência 08/2026 da Ka, o RBT12 é a
   soma de janeiro a julho, e não essa soma projetada para doze meses — que
   daria quase o dobro e jogaria a empresa duas faixas acima. A projeção
   continua valendo quando é a **base** que é curta: ali os meses faltantes
   existiram e o painel simplesmente não os tem.
4. **O grupo sai do CADASTRO de influencers, não dos pedidos em tela.** É o que
   faz o imposto de uma marca ser o mesmo na tela inicial e num relatório
   filtrado só nela. Se o grupo fosse montado a partir dos pedidos exibidos,
   filtrar por "marca = Ka" apuraria o RBT12 só da Ka, numa faixa mais baixa, e
   o painel teria duas versões do mesmo número (5.14). Pelo mesmo motivo,
   `historicoDe` em `relatorios.ts` **deixou de estreitar o histórico por
   marca** — quem separa é a apuração.
5. **O DAS continua saindo marca a marca**: alíquota efetiva do CNPJ × base do
   mês da marca. Como a alíquota é a mesma para todas as lojas daquele CNPJ, a
   soma das partes é exatamente o DAS da empresa — e é isso que deixa o raio-x
   e o relatório atribuírem imposto a uma marca sem inventar rateio. Há teste.
6. **Fora do Simples o RBT12 continua por marca**, e serve só de referência: no
   Lucro Presumido não há faixa nem teto, e somar marcas ali não significaria
   nada. **RBT12 informado à mão** vale para o CNPJ inteiro; divergindo entre
   duas lojas dele, vale o **maior** — subestimar a faixa cobra imposto a
   menos, que é o erro caro.

**O CNPJ é normalizado na gravação, não na leitura**, e os dígitos
verificadores são conferidos (`cnpjDigitado`, em `app/influencers/actions.ts`).
Se o mesmo CNPJ for digitado com pontuação numa loja e sem noutra, as duas
viram grupos diferentes e cada uma cai numa faixa que não é a dela — um erro
que não dá mensagem em lugar nenhum, só separa em silêncio.

#### Como a divisão foi descoberta (23/09/2026)

O contador informou RBT12 de **R$ 1.910.089,97** para o CNPJ
**30.997.734/0001-58**, competência 08/2026 — um CNPJ que não era nenhum dos
dois anotados na seção 13. Com a base de 13 meses na mão, foi possível testar
as quinze combinações de lojas contra esse número. Somando **janeiro a julho de
2026** (o CNPJ abriu em 01/01/2026, então não tem doze meses):

| Combinação | Total | Distância |
|---|---|---|
| **Ka Beauty sozinha** | **R$ 1.860.092,65** | **2,62%** |
| Ka + Revenda | R$ 1.987.967,94 | 4,08% |
| Ka + Duale | R$ 2.332.507,38 | 22,12% |
| Laoli + Ka | R$ 2.393.089,59 | 25,29% |

É a **Ka Beauty sozinha**. Os R$ 49.997,32 que faltam — a R$ 2,68 de cinquenta
mil redondos, o que já sugeria um lançamento único e não uma divergência
espalhada — são **venda por TikTok Shop e Mercado Livre**, confirmado pelo
dono. É a quarta consequência da Fase 4 (seção 9), e a primeira medida: naquele
CNPJ, os marketplaces são ~2,6% do faturamento.

Repare na direção do erro. A base do painel é o **faturado**, que inclui
cancelado e boleto nunca pago (5.1.1), então ela deveria estar **acima** da
receita bruta do contador. Estar abaixo é o que confirma que falta receita que
o painel não enxerga.

`ApuracaoDeUmInfluencer.rbt12Compartilhado` diz quando o número exibido é o da
empresa, e **a tela precisa dizer isso**: sem aviso, o RBT12 de uma loja de
R$ 23 mil/mês aparece em milhões e parece defeito. O bloco do Simples em
`/impostos` abre com a frase que explica o grupo, e a memória de cálculo
(5.1.4) diz "da empresa inteira".

**O que isso custou, medido nas quatro lojas do Simples em set/2026:**

| Marca | Base do mês | Antes (RBT12 próprio, Anexo II) | Depois (RBT12 da empresa, Anexo I) |
|---|---|---|---|
| Ka Beauty | R$ 152.472 | faixa 6 · 13,16% · R$ 20.072 | faixa 6 · 15,31% · R$ 23.345 |
| Duale Beauty | R$ 108.246 | faixa 5 · 12,30% · R$ 13.314 | faixa 6 · 15,31% · R$ 16.573 |
| Laoli Beauty | R$ 36.138 | faixa 3 · 8,06% · R$ 2.912 | faixa 6 · 15,31% · R$ 5.533 |
| Revenda | R$ 138.798 | faixa 4 · 9,87% · R$ 13.702 | faixa 6 · 15,31% · R$ 21.251 |
| **DAS do mês** | | **R$ 49.999** | **R$ 66.702** |

As duas mudanças andaram juntas e puxam para lados diferentes: o RBT12 somado
sobe a faixa, e o Anexo I é mais barato que o II na 6ª faixa (19% nominal
contra 30%). Com o RBT12 que o contador informa (R$ 1,91 mi, 5ª faixa, 9,73%)
o mesmo mês daria **R$ 42.387**.

**O alarme de teto era falso, e foi o que denunciou o agrupamento errado.**
Somando as quatro lojas, o RBT12 dava R$ 5,64 milhões — 118% do teto de
R$ 4,8 mi —, e `monitorarTeto` anunciava que a empresa estava fora do Simples.
Com o agrupamento por CNPJ, a Ka sozinha fica em R$ 1,86 milhão: **5ª faixa,
dentro do teto, alíquota de 9,73%** — exatamente o que o contador apura. São
conclusões opostas, e a diferença era só a chave do agrupamento.

**Preencha o CNPJ e a data de abertura de cada loja.** Enquanto não estiverem
preenchidos, as lojas do Simples continuam sendo somadas como uma empresa só e
a tela avisa. O caminho curto, para uma loja específica, continua sendo digitar
o RBT12 do contador no campo do contrato.

### 5.10.2 DIFAL de ICMS

Na venda interestadual ao consumidor final — que é o caso de uma loja
Nuvemshop — o ICMS se parte em dois: a alíquota **interestadual** fica na
origem, e a diferença entre a **interna do destino** e a interestadual vai para
o estado de destino. Essa diferença é o DIFAL.

```
ICMS origem = valor do pedido, com frete, pago ou não × alíquota interestadual
base dupla  = (valor − ICMS origem) ÷ (1 − alíquota interna do destino)
DIFAL       = base dupla × (alíquota interna do destino − interestadual)
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
3. **A base é DUPLA**: o imposto entra na própria base de cálculo. O painel
   não fazia esse gross-up e por isso saía abaixo do devido; passou a fazer em
   18/09/2026, quando o contador mandou o demonstrativo de agosto para AL —
   ver abaixo.

**A lista por estado é ordenada por UF, em ordem alfabética** (`porEstado`, em
`apurarDifal` e em `somarDifal`). Ela é **discriminação, não ranking**: quem a
lê está conferindo um estado específico contra a própria apuração, e procurar
"PE" numa lista ordenada por valor obriga a varrer as 27 linhas — que ainda por
cima trocam de posição de um mês para o outro. Vale para a tabela da memória de
cálculo (5.1.4) e para o cadastro de alíquotas, que já vinha assim do
repositório.

A exceção é o gráfico **"Para quais estados vai o DIFAL"**, em `/difal`: ali a
ordem por valor é o próprio assunto — o cartão promete "os maiores destinos" e
corta nos 12 primeiros. Ele reordena por conta própria, porque cortar 12 de uma
lista alfabética entregaria os estados que começam com A, e não os maiores.

#### O demonstrativo do contador (18/09/2026)

Ele mandou a apuração de **agosto/2026 para AL**, e ela fechou duas lacunas de
uma vez:

| Campo | Valor |
|---|---|
| Valor contábil | R$ 9.681,52 |
| **Base de cálculo** | **R$ 10.315,01** |
| Alíquota | **19,00%** |
| DIFAL | R$ 722,05 = base × (19% − 12%) |

Três leituras, e as três mudaram alguma coisa:

1. **A alíquota de AL era 19%, não 20%** — o painel tinha 20%, semeado e não
   confirmado. Corrigida e marcada como confirmada.
2. **A base de cálculo é MAIOR que o valor contábil**: é o gross-up. Implementado
   em `apurarDifal`, com a fórmula acima. O último passo segue o demonstrativo
   dele, que aplica a **diferença** sobre a base dupla; a outra leitura corrente
   — base × interna menos o ICMS de origem sobre o valor cheio — daria mais, e
   não é a dele.
3. **Os cancelados NÃO saem da conta.** O valor contábil dele (R$ 9.681,52) está
   a R$ 170 do nosso total **com** cancelados e **com** frete (R$ 9.851,41), e a
   R$ 1.797 do total sem cancelados. Foi o que derrubou a hipótese do dono de
   que o erro estava aí — e corroborou as duas decisões de 5.1.1 (frete na base,
   faturado em vez de recebido).

**Resíduo conhecido:** com a mesma alíquota, a base dele saiu ~2% abaixo da
nossa (fator 1,0654 contra 1,0864 da fórmula legal). Provavelmente o "valor
contábil" do relatório inclui coisa que não entra na base do ICMS, e a base de
lá é montada nota a nota. O painel ficou **R$ 749** contra os R$ 722 dele em
agosto/AL — alguns pontos percentuais **acima**, onde antes estava 9% abaixo.
Está dito na tela.

Vale pedir ao contador **as 27 alíquotas** de uma vez: se AL estava errada, as
outras provavelmente também.

#### Por que o total não bate, e por que NÃO é a alíquota

Com o resumo de **julho e agosto** na mão, o painel ficou assim contra ele:

| | Painel | Contador | |
|---|---|---|---|
| Julho | R$ 115.770 | R$ 122.536 | −5,5% |
| Agosto | R$ 97.128 | R$ 108.242 | −10,3% |

A tentação é achar a alíquota de cada estado por engenharia reversa — resolver
qual alíquota reproduziria o número dele. **Não faça isso.** O valor não é
estável entre os meses, e AL prova por quê: a implícita dá 21,33% em julho e
18,77% em agosto, enquanto a verdadeira, escrita no demonstrativo dele, é
**19,00%**. Ajustar o cadastro por um mês faria esse mês fechar por construção
e estragaria o outro.

**A causa é outra, e o dono achou em 18/09/2026: a empresa também vende por
TikTok Shop e Mercado Livre, e isso não passa pela Nuvemshop.** A apuração do
contador é do CNPJ inteiro; o painel lê só as cinco lojas. Conferido nos dados:
em jul+ago só existem dois gateways (Appmax e Nuvem Pago) e dois meios (pix e
cartão) — nenhum pedido de marketplace entra por aqui. Pela diferença de DIFAL,
são uns **R$ 100 mil em julho e R$ 160 mil em agosto** de venda fora do painel,
no CNPJ da Tha.

Isso não afeta só o imposto. Ver seção 9, "Fase 4".

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

**A coluna "impostos do produto" mostra só os do REGIME do dono**, que é o que
a apuração usa (`impostosDoRegime`). O produto guarda as marcações antigas: um
item trazido da Nuvemshop antes de o influencer existir nasce com as do regime
padrão (`REGIME_SEM_INFLUENCER`, Lucro Presumido) e continua com elas depois que
o dono é cadastrado no Simples. Na loja real, 113 dos 133 produtos das marcas do
Simples estavam assim, exibindo PIS, COFINS e ICMS do Presumido — imposto que
ninguém paga, porque a apuração já os ignorava. As marcações de fora do regime
viram uma nota discreta ("3 marcação(ões) de outro regime, sem efeito") e somem
ao salvar o produto, que regrava a lista com o que está marcado na tela.

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

1. **Só entra o que teve venda paga com preço** (decisão do cliente em
   17/09/2026, que também mandou apagar os 33 que não tinham: brindes a R$ 0,
   combos que só saíram de graça, itens que nunca venderam). O catálogo
   (`GET /products`, pela API) não acrescenta itens: dá o nome e o SKU atuais
   e diz se o item está despublicado ou saiu da loja (observação). Antes o
   catálogo trazia também o que não vendeu. O catálogo não passa pelo cache:
   só o clique chama a API (`FonteDePedidos.listarCatalogo`; na demonstração
   vem de `catalogo.ts`). Se a API falhar, vêm os nomes das vendas, e a
   mensagem diz. A action não recebe a lista do navegador; monta no servidor.
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
5. **Cada produto novo já entra com custo provisório de 35%** do preço médio
   pago (`fichasProvisorias` e `CUSTO_PROVISORIO`, em `costing.ts`), com o
   valor inteiro em matéria-prima e os outros três componentes em zero. É a
   regra do dono para o lucro não sair inflado por produto de custo zero.

   **A regra mora em `costing.ts` porque viveu no lugar errado.** Até
   24/09/2026 ela existia só no script `produtos:trazer`, que eu rodei uma vez;
   o botão "Trazer da Nuvemshop" cadastrava o produto e **não criava ficha
   nenhuma**. Todo produto trazido pela tela entrava com custo zero, e o dono
   percebeu pelos produtos novos chegando sem custo. Regra que só existe num
   script vale só enquanto alguém lembra de rodar o script.

   A função **nunca sobrescreve** ficha que já existe (da variante ou do
   produto inteiro), usa **só pedido pago** na média, e **não cria ficha sem
   preço** — brinde a R$ 0 continua sem custo, porque a lacuna a tela declara
   (5.7) e o número inventado não. E o botão aplica a regra **só aos produtos
   novos daquela leva**: produto que já estava no cadastro sem ficha pode estar
   assim de propósito — na demonstração, quatro estão, para mostrar o aviso de
   cobertura —, e não é o botão que decide isso.

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

O **processo de fabricação** (5.15) fica na área `produtos`: os dois perfis pedem e
acompanham, porque a conversa ali é sobre unidade e prazo, não sobre dinheiro. A
tela pública de assinatura é a exceção do painel inteiro — não tem perfil, e o
que a limita é mostrar só produto, quantidade, data e saldo, nenhum valor.

A verificação acontece **no servidor**, em `exigirArea`, em dois lugares: na
página, antes de montar, e **dentro de cada Server Action**. As duas são
necessárias — Server Action é um endpoint público, dá para chamá-la sem nunca
abrir a página. Esconder link no menu é só conveniência.

Senha com scrypt e sal por usuário; sessão em cookie httpOnly **assinado** —
sem assinatura, qualquer um trocaria o próprio perfil para `dono` no cookie.

### 5.13.2 Limite de tentativas de login

Sem limite, a unica defesa da senha e o tamanho dela. A regra (`lib/tentativasLogin.ts`):
as quatro primeiras falhas passam; da quinta em diante a espera cresce
(1, 2, 5, 10 e 30 minutos) e acertar zera. Uma hora sem errar recomeca a
contagem.

Quatro decisoes:

1. **A contagem e por login E por endereco, separadas**, e vale a maior espera:
   quem ataca uma conta bate na primeira; quem varre logins, na segunda. Assim
   um atacante nao tranca a conta do dono so errando de proposito de outro IP —
   ele trava o proprio endereco antes.
2. **A verificacao vem ANTES de consultar o cadastro.** Se viesse depois, cada
   tentativa rodaria scrypt, e insistir derrubaria o servidor sem acertar senha
   nenhuma (o scrypt e caro de proposito).
3. **A tela diz quanto falta esperar.** Esconder so faria a pessoa certa achar
   que o painel quebrou; quem ataca descobre na primeira tentativa.
4. **A contagem vive na memoria do processo** (`globalThis`, armadilha 2).
   Reiniciar zera, e com mais de um processo cada um teria a sua conta.
   Gravar no banco custaria uma escrita por tentativa — inclusive das
   automatizadas, que e o que nao se quer. Com mais de um processo, isso muda
   de lugar, nao de regra.

O IP vem de `origemDaRequisicao` (`x-forwarded-for`), que so vale porque ha um
nginx confiavel na frente (secao 14). Sem IP, sobra a conta por login.

### 5.13.2 Cadastro de usuarios (`/usuarios` e `/conta`)

Dois perfis, e so dois, por decisao do cliente: **Administrador** (`dono`) vê
tudo, inclusive o cadastro de usuários; **Produção** (`estoque`) vê produtos,
kits, ordens, estoque e custo de fabricação. Os valores gravados continuam
`dono` e `estoque` — trocar o que está no banco quebraria as sessões abertas e
os registros existentes; só os rótulos mudaram.

`/usuarios` é da área `usuarios`. `/conta` é a **única tela sem área**: quem
está logado entra, inclusive a produção, porque trocar a própria senha não pode
depender de pedir a alguém.

As travas vivem em `lib/usuarios.ts`, puras e com teste, e rodam **no
servidor**, dentro de cada action — desabilitar botão no navegador não impede
nada:

1. **Sempre sobra um administrador ativo.** Sem isso, um clique tira de todo
   mundo o acesso ao cadastro, para sempre: só mexendo no banco na mão.
2. **Ninguém se remove nem se rebaixa.** O caminho é outra pessoa fazer, e o
   engano continua reversível.
3. **Senha de pelo menos 8 caracteres**, nunca uma das publicadas aqui
   (`dono123`, `estoque123`), nunca igual ao login, nunca só números.

   **Era 10, e o 10 era meu — escolhido sem perguntar, e cobrou caro**
   (23/09/2026). O dono trocou a senha para uma de oito, a tela **recusou a
   troca**, ele não viu a mensagem e passou a tentar entrar com uma senha que
   nunca chegou a ser gravada. Ficou trancado do lado de fora do próprio
   painel, e só saiu de lá com uma redefinição pelo banco.

   O mínimo **não** bloqueia o login — só a gravação —, o que torna o sintoma
   pior: a senha antiga continua valendo e ninguém liga uma coisa à outra. A
   lição não é o número: **regra de segurança que o dono não escolheu ele não
   defende**, e quando ela o atrapalha o efeito não é uma senha mais forte — é
   um chamado, uma redefinição na unha e a próxima senha escolhida com raiva.
   Se for para subir de novo, pergunte antes.

   A do `prisma/seed.ts` continua em 12, e é outra conta: ali a senha inicial
   nasce num arquivo de ambiente e ninguém a digita.
4. **Trocar a própria senha exige a senha atual.** Computador deixado aberto na
   fábrica, sem isso, é conta tomada.

**Desativar ≠ remover**, e a tela diz isso: desativado não entra e o login
continua reservado; removido some. A saída de uma pessoa da empresa quase
sempre é o primeiro caso.

Três detalhes que já cobraram tempo:

- **A página monta `UsuarioNaTela`, sem hash e sem sal.** Passar o registro
  inteiro para o componente publicaria o hash da senha no HTML — é o acidente
  clássico desta tela.
- **`TAMANHO_MINIMO_SENHA` mora em `types/usuario.ts`, não em `lib/usuarios.ts`.**
  O formulário é componente de navegador; importar do `lib` traz
  `data/seeds` junto, e com ele o `node:crypto` — o build quebra com
  "Reading from node:util is not handled".
- **Trocar a senha de alguém não derruba a sessão aberta dele**: o cookie é
  assinado e só expira. Está escrito na tela para ninguém supor o contrário.
- **O LOGIN é editável, e é campo separado do nome** (23/09/2026). Era
  intocável, com o argumento de que trocá-lo deixaria a pessoa sem saber como
  entrar. O que aconteceu foi o contrário: o cliente renomeou "dono" para
  "Valmir", continuou entrando com "dono" e achou que era defeito — porque a
  tela chamava as duas coisas de nome. O risco de trocar sem avisar se resolve
  **avisando**: a mensagem de sucesso diz o login novo, e a lista escreve
  "login: dono" por extenso. A sessão aberta sobrevive, porque o cookie guarda
  o ID e não o login.

O `fumaca` entende `null` em `AREA_DA_ROTA` como "qualquer pessoa logada", que
é o caso do `/conta`.

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

**O marketplace cobra por fora do meio de pagamento** (25/09/2026). A comissão
do TikTok Shop não é percentual cadastrado: vem do **extrato financeiro**,
pedido a pedido, e por isso mora em `Pedido.taxaCanal` e sai em `porCanal` —
uma linha por marca, ao lado das linhas por meio de pagamento. Três decisões:

1. **Ela entra em `total` e em `porMarca`**, então aparece na DRE, na fatia da
   pizza e na **base da comissão** (`liquido`, 5.1.2). Era o que o dono pediu:
   o influencer de marketplace ganha sobre o que sobra depois das taxas do
   canal.
2. **É valor cobrado, não estimativa.** Pedido cujo repasse ainda não fechou
   fica **sem** `taxaCanal`, e a tela diz quantos são ("377 pedido(s) ainda sem
   repasse fechado"). Estimar pela média deixaria o número plausível e
   inventado — o que a seção 8 proíbe.
3. **Marca sem marketplace não vira linha de zero**, pela mesma razão de 5.2:
   zero ali afirmaria que o canal não cobra nada, quando o que não existe é o
   canal.

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

### 5.15 Processo de fabricação

Aba `/ordens`, área `produtos`. **Seis etapas, cada uma assinada por quem a
cumpriu**, do pedido do marketing até o estoque na Criar.

```
Pedido → Conferência de insumos → Fabricação → Contagem na Demazon
       → Envio para a Criar → Recebimento na Criar
```

São **duas empresas**: a Demazon fabrica e vende para a Criar; a Criar faz as
parcerias com influencers e vende. O processo atravessa as duas e termina
quando o estoque chega na Criar — que é o estoque que abastece as lojas
Nuvemshop do painel.

O problema que resolve, nas palavras do cliente: **decidir quando fabricar,
saber se vai ficar pronto a tempo, e saber quando um produto está acabando**.
Isso se combinava por mensagem, e quando faltava produto no dia do lançamento
ninguém sabia em que pé estava — se a fábrica aceitou, se tinha embalagem, se
chegou a ser contado.

#### As decisões que sustentam o processo

1. **Cada etapa só termina quando alguém ASSINA.** Não existe "em fabricação"
   como estado solto: estado que ninguém atualiza vira mentira na tela, e era
   esse o defeito do processo por mensagem. A assinatura é a mesma de antes —
   vetor, poucos KB, direto para o PDF como polilinha.

2. **Qualquer "não" na conferência devolve a ordem para quem abriu.** As cinco
   perguntas (tem embalagem? tem a tampa/válvula? a tampa serve nesta
   embalagem? tem a caixa? tem matéria-prima?) mais "fica pronto na data
   pedida?" decidem se a ordem anda. Com qualquer resposta negativa ela volta
   para o administrador, com a lista do que falta e a data que a fábrica
   consegue; ele aceita a nova data ou cancela. **Sem isso o checklist seria
   decoração** — foi o que faltava no pedido original, e o cliente confirmou
   ("se for não, volta pra primeira pessoa").

   É o único ponto em que o processo anda para trás. A situação chama-se
   `revisao`, e a linha do tempo mostra a conferência em **vermelho**: dizer
   "cumprida" afirmaria o contrário do que aconteceu.

3. **O recebimento na Criar vira CONTAGEM DE ESTOQUE de verdade.** A ordem
   continua **não** baixando nem reservando estoque — o saldo é `última
   contagem − vendido desde a contagem` (5.12), função pura e idempotente. Mas
   quando o estoquista conta na última etapa, aquilo é exatamente o que ele
   digitaria na aba Estoque: vira uma contagem, com data e responsável. **Um
   lançamento, não dois.** Entra depois de gravar a ordem — se a contagem
   falhar, a assinatura já está salva e o estoquista lança à mão.

4. **Cada passo é definitivo.** Não há "corrigir o passo anterior": o caminho
   de volta é o administrador retomar a ordem, e isso entra como mais um passo.
   Documento que muda depois de assinado não prova nada.

5. **O hash cobre TODOS os passos.** Um hash que cobrisse só o pedido
   continuaria valendo depois de alguém trocar quem assinou a fabricação — e é
   justamente isso que ele existe para impedir.

#### Quem assina o quê

Na **fase de teste**, quem está logado assina qualquer etapa. Decisão do
cliente: com a trava ligada, experimentar o processo de ponta a ponta exigiria
criar cinco contas antes do primeiro teste.

Quando for travar, é **um lugar só**: `TRAVAR_ETAPA_POR_PERFIL` em
`lib/processoOrdem.ts` e o mapa `PERFIL_DA_ETAPA`. O resto do painel não muda —
`podeAssinar` já é a única porta, e é conferida no servidor, dentro da action
(5.13). O desenho final é um responsável por etapa: a conferência não assina a
fabricação, e o administrador não assina pela fábrica. **Um documento em que
uma pessoa carimba todas as etapas não prova nada**, que é exatamente o
processo por mensagem que isto veio substituir.

`contagem` e `envio` são do mesmo responsável de propósito: é o mesmo
estoquista fazendo duas coisas — contou o que saiu da fábrica, e depois
despachou. Juntar num passo só perderia a data do despacho, que é o que se
procura quando a carga some no caminho.

#### A tela

Abre pela **fila**, não por filtros. A pergunta que se faz aqui todo dia é "o
que está comigo, e o que está atrasado"; filtro por influencer e por situação
respondiam outra coisa, e saíram junto com as duas etapas antigas.

- **A ordem que espera você já abre expandida**, com o formulário da etapa
  aberto. Quem entra tem uma coisa para fazer, e um clique antes do formulário
  seria um clique para chegar no único lugar em que ia.
- **A linha do tempo** (`LinhaDoTempoDaOrdem`) fica no topo da ordem aberta. Na
  tela grande é horizontal; **no celular vira vertical**, porque seis etapas em
  390px dariam 65px cada e nem o nome caberia — mesmo princípio da 2.1: no
  telefone não se encolhe, troca-se de formato.
- **Pedido × fabricado × recebido** lado a lado, na tela e no PDF, com o
  fabricado em vermelho quando saiu menos do que foi pedido. É onde a confiança
  no processo se decide.
- **O formulário de abertura lista os produtos pelo que ACABA ANTES**, com a
  cobertura em dias ao lado. É a outra metade do problema do cliente.
- **Apagar existe, em dois passos**, só para a fase de teste: experimentar de
  ponta a ponta gera ordens de mentira, e cancelar deixaria todas na lista para
  sempre. O caminho normal continua sendo **cancelar**, que preserva a
  evidência de que o pedido foi feito. Quando o processo entrar em uso, apague
  a ação `removerOrdem` e o botão.

#### O gerador de PDF é escrito à mão

`lib/pdf.ts`, sem dependência. Mesma escolha dos gráficos: o painel precisa
funcionar offline e sem CDN, e um PDF de uma página com texto, linhas e
polilinha cabe em duzentas linhas. Faz texto em Helvetica nos dois pesos com
**medição real de largura**, linhas, retângulos, polilinhas e múltiplas
páginas. Não faz fonte embutida, imagem, nem unicode fora do WinAnsi — se algum
dia precisar de uma dessas, é hora de pesar uma dependência de verdade, não de
esticar o arquivo.

Com seis etapas o documento virou uma **folha de assinaturas**: uma moldura por
etapa, em duas colunas, cada uma dizendo a etapa, quem assinou e quando. Etapa
não cumprida aparece com a moldura vazia e escrita — num documento de ordem
cancelada é isso que mostra até onde o processo chegou. O PDF é gerado **uma
vez**, quando a ordem fecha, e nunca regenerado no download.

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

#### A rota pública por token foi REMOVIDA

Existia porque "quem toca a produção não tem conta no painel", e o link era a
credencial. Com o processo de seis etapas **todo mundo loga** (decisão do
cliente), então um caminho de assinatura sem sessão virou superfície de ataque
sem uso. Saíram `/assinar/[token]`, `/assinar/[token]/pdf`, o token da ordem e
o token fixo da demonstração.

Junto com ela saiu o beco sem saída do link em HTTP puro (IP que o WhatsApp não
linkifica, `sslip.io` que linkifica e não abre). Hoje o painel tem domínio e
HTTPS, e o caminho é entrar no painel — não abrir um link.

`/ordens/[id]/pdf` continua, e exige login.

### 5.16 Influencers: contrato e despesas

A aba se chamava "Comissões" e virou **Influencers** (`/influencers`; o endereço
antigo `/comissoes` redireciona, com os parâmetros). A pergunta mudou de "quanto
de comissão cada contrato gera" para "quanto cada influencer custa".

A aba abre no **seletor de cartões** — um por contrato — e na "Visão geral"
com os totais e o cadastro de contratos. As vendas do dia moravam no topo dela
e foram para a aba **Vendas** (5.16.1). Cartão e não `<select>`: o nome sozinho não ajuda a
escolher, e o cartão responde a primeira pergunta antes do clique. A escolha
mora na URL (`?influencer=`), como os filtros do relatório, e o seletor de mês
do cabeçalho a preserva.

**O cartão traz três números, não um** (23/09/2026): **receita bruta da marca**
em cima, e **comissão** e **despesas** separadas embaixo. Era só o custo — a
comissão somada às despesas —, e isso falhava duas vezes. Custo sem a receita
ao lado não diz se é caro ou barato (R$ 50 mil é pouco sobre R$ 800 mil e muito
sobre R$ 100 mil), e comissão somada com despesa esconde qual das duas mexer:
uma se renegocia no contrato, a outra se corta. A ordem dos cartões continua
sendo pelo custo (comissão + despesas), que é a ordem em que a conversa
acontece.

**Embaixo das despesas vai o peso delas no que CAI NA CONTA** ("14,2% do que
cai na conta", 25/09/2026, pedido do dono): recebido, sem frete, sem as taxas e
sem o frete que a loja bancou — a base `liquido` da comissão (5.1.2), **seja
qual for a base do contrato** (`oQueCaiNaContaPorMarca`, em `costing.ts`, que
usa a mesma `valorDaBaseDaMarca` da comissão; há teste).

A primeira versão dividia pela **receita bruta** do cartão, e o dono corrigiu
no mesmo dia: o bruto inclui o pedido nunca pago, o frete e as taxas, e a
despesa se paga com o dinheiro que entrou. Sobre a base menor, o mesmo valor
pesa mais.

O cartão não mostra o valor da base; ele fica no `title` do percentual. Marca
sem dinheiro na conta no mês diz "nada caiu na conta no mês", e não "0,0%":
não há contra o que medir. O detalhe do influencer repete o percentual no
quadro "Despesas do mês", sobre a mesma base.

O bruto por marca sai de uma varredura só sobre os pedidos do mês
(`brutoPorMarca`), e não de um `reconciliar` por contrato dentro do `map` —
que releria os pedidos uma vez por influencer.

Escolhido um influencer, aparece primeiro o **contrato dele** (marca,
percentual, base, regime, estado e situação), com "Editar contrato", que abre o
mesmo formulário da tabela da Visão geral (`ContratoDoInfluencer`). O cliente
procurou a edição ali e não achou: ela só existia na tabela da Visão geral, que
some quando um influencer é escolhido. Abaixo do contrato vem a **grade dele no
mês**:

1. **A primeira linha é sempre a comissão**, calculada dos pedidos do mês e do
   contrato (5.2). Não se edita na grade e **não é gravada**: gravar faria a
   grade mostrar um número velho quando as vendas mudassem. Para mudar a
   comissão, muda-se o contrato.
2. **As linhas de baixo são despesas**, em **duas categorias e só duas**:
   **Marketing** e **Outras despesas**. Despesa é avulsa e pertence ao mês pela
   data. Cachê fixo mensal se cadastra uma vez por mês — recorrência automática
   foi descartada para a grade mostrar exatamente o que foi gasto, sem regra
   escondida.

#### Duas categorias, e por quê (23/09/2026)

Eram seis: operacional, produto enviado, viagem, cachê, anúncio e outros. Na
prática ninguém escolhia entre elas — os lançamentos vêm do plano de contas da
contabilidade, com o nome já escrito ("Tha Beauty - Marketing", "Folha de
pagamento"), e a categoria antiga tinha sido preenchida no palpite da
importação. A categoria só importa por causa da **pizza** (5.1), onde a
pergunta é uma só: quanto do custo do influencer é mídia paga e quanto é o
resto. Seis fatias responderiam uma pergunta que ninguém faz.

**A regra é o NOME**, não a categoria antiga: `categoriaPelaDescricao`
(`types/dominio.ts`) devolve `marketing` quando a descrição contém a palavra, e
`outros` no resto. Só a caixa é normalizada — acento não entra na conta porque
não precisa: "marketing" se escreve sem nenhum, inclusive dentro de "Automação
de Marketing".

Ela é usada em três lugares, e o terceiro é o que segura a conversão:

1. `scripts/despesas-duas-categorias.sql`, que converteu os lançamentos já
   gravados. Rodar duas vezes não muda nada;
2. o formulário, cujo padrão passou a ser "Outras despesas";
3. **a leitura dos dois repositórios.** Categoria de fora da lista — uma das
   cinco antigas, ou algo escrito direto no banco — volta a ser decidida pelo
   nome, e não empurrada para `outros` em silêncio. Sem isso, um "Ka Beauty -
   Marketing" que escapasse da conversão sumiria da fatia de marketing sem
   ninguém ver. O arquivo da demonstração não se refaz depois de editado, então
   ele precisa da mesma normalização que o Postgres.

Na produção a conversão mexeu em **15 de 88 lançamentos** (R$ 258.035,05 de
R$ 837.378,07): os sete nomes com "Marketing" das cinco marcas, mais
"Marketing e Publicidade" e "Softwares de CRM Automação de Marketing".

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
comissão, e o lucro saía maior que o verdadeiro. A DRE (5.8) e a pizza (5.1)
ganharam **duas linhas**, "Marketing" e "Outras despesas com influencers", ao
lado da comissão — `totalDespesasMarketing` e `totalDespesasOutras`.

Três campos que não se confundem: `totalComissoes` é **só** a comissão (o
simulador e a métrica de comissão do relatório dependem disso),
`totalDespesasInfluencers` é só a despesa, e `totalInfluencers` é a soma dos
dois — é ele que a aba Influencers e o relatório usam.
`totalDespesasOutras` sai **por subtração**, e não por uma segunda soma: assim
as duas parcelas fecham no total mesmo se um dia aparecer categoria nova no
banco. Há teste.

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

### 5.16.1 Aba Vendas: vendas de hoje e vendas por dia

Aba `/vendas`, área `financeiro`, logo depois de "Painel" no menu. Tem uma
coisa só: o gráfico de vendas por dia e, embaixo dele, o quadro do dia. Os dois
moravam no topo da aba Influencers e ganharam aba própria em **25/09/2026**, a
pedido do dono: acompanhar o dia é uma pergunta diferente de "quanto cada
influencer custa", e é a que ele faz mais vezes.

É sempre a **operação inteira**. Na aba Influencers o gráfico estreitava para a
marca do influencer escolhido; aqui não há influencer escolhido, e a quebra por
marca vem na lista do quadro do dia. Um filtro por loja, se fizer falta, seria
`?marca=` na URL, como o resto do painel.

Pedido do cliente (18/09/2026): quantas vendas e quanto de valor **hoje**,
"começando à meia-noite", e explicitamente **não** nas últimas 24 horas — ele
acompanha o dia enquanto ele acontece, e uma janela móvel misturaria a noite de
ontem com a manhã de hoje.

São três números: **vendas hoje** (quantidade), **valor de hoje** e **já pago
hoje**, com uma linha por marca abaixo — vendas, valor e já pago, em colunas.

**Hoje é um dia do gráfico, e não um cartão à parte** (25/09/2026, pedido do
dono). Até então "Vendas de hoje" era um cartão no topo da aba, e o gráfico de
vendas por dia, logo abaixo, abria o **mesmo** quadro para o dia clicado: dois
quadros iguais na mesma tela, e o dono pediu para tirar um. Ficou um só, o
**quadro do dia**, embaixo do gráfico (`VendasPorDia` + `NumerosDoDia`):

- com o **mês atual** no cabeçalho ele abre em **hoje**, e é o "Vendas de
  hoje" de antes, com os mesmos rótulos. Clicar numa coluna troca o dia, e
  "Voltar para hoje" (ou clicar de novo no dia aberto) volta. Hoje não tem
  "Fechar": é o número que se abre a aba para ver;
- nos **outros meses** ele só aparece com um clique, e fecha. "Hoje" olhando
  julho não responde pergunta nenhuma — foi por isso que, em 24/09/2026, o
  cartão de hoje passou a aparecer só no mês atual.

O custo, no celular: os números de hoje ficam **depois do gráfico**, uma rolada
abaixo de onde o cartão ficava. Por cima do gráfico, cada toque numa coluna
trocaria números fora da tela.

O quadro reinicia ao trocar de **mês** (`key` pelo mês, na página): em hoje, no
mês atual; fechado, nos outros.

#### Vendas por dia

Em **qualquer mês**, um gráfico de colunas com cada dia do mês escolhido
(`VendasPorDia`, dados de `vendasPorDia` em `metrics.ts`). A altura da coluna é
o valor vendido; a parte de baixo, em verde, o que já entrou; a de cima, em
cinza, o que não entrou. É a mesma dupla do quadro do dia, e a mesma tese da
seção 1.

Decisões, a maioria vinda de olhar a tela renderizada e não o código:

1. **HTML e não SVG.** Texto de SVG encolhe com o `viewBox` e obriga a dois
   formatos (2.1); aqui o texto é texto de verdade, e a mesma marcação serve do
   celular à reunião. Continua sem biblioteca.
2. **Nenhuma conta nova**: cada dia é `resumirDia`, que é `reconciliar` sobre
   os pedidos dele. Há teste exigindo que a coluna e o quadro do dia sejam o
   mesmo resumo.
3. **Todos os dias do mês entram**, com zero onde não houve venda — pular o dia
   juntaria o 9 com o 11 como vizinhos. **Dia futuro não tem barra**, mesmo com
   pedido: a demonstração gera o mês inteiro (seção 12), e uma barra no dia 30
   com hoje sendo 24 afirmaria venda que não existiu.
4. **Destaque e o resto em cinza.** O verde é o `--color-real` do "Já pago
   hoje"; o cinza (`#8a94a6`) é sem cor de propósito, para a leitura cair no que
   entrou. Validado com o `validate_palette` da skill de gráficos: contraste de
   3:1 contra o branco (o `borda-forte` não passava) e 13 pontos de separação
   para daltonismo. O único "reprovado" é o croma do cinza, que é o próprio
   papel dele.
5. **A leitura no topo é a etiqueta**: sem dia apontado, o mês inteiro; tocando
   ou passando o mouse numa coluna, aquele dia. Um valor sobre cada coluna
   seriam 30 números, e o celular não tem "passar o mouse". A coluna inteira,
   na altura toda, é o alvo do toque — num dia fraco a barra tem 3px. A leitura
   tem **altura reservada**: o texto troca entre o mês e o dia, e sem a reserva
   o gráfico subia e descia a cada toque.
6. **Tabela gêmea**, recolhida em "Ver os números dia a dia": todo número da
   leitura está ali sem precisar apontar nada.
7. **Clicar numa coluna troca o dia do quadro** (25/09/2026, pedido do dono),
   ver acima. Cinco detalhes:
   - **Troca na hora, sem voltar ao servidor.** Cada dia já chega resumido, com
     a quebra por marca — ~30 dias × 5 marcas de números agregados, nenhum
     pedido no navegador (seção 3). Por isso o dia escolhido não vai para a
     URL.
   - **Passar o mouse e clicar são estados diferentes.** O mouse muda a
     leitura do topo e apaga as outras colunas só enquanto aponta; o clique
     fixa o dia do quadro. A coluna do quadro ganha uma faixa de fundo, e só
     isso: apagar tudo em volta dela deixaria o gráfico desbotado desde o
     carregamento, porque no mês atual o quadro já abre em hoje.
   - **O quadro rola para a vista depois de um clique** (`scrollIntoView`,
     `nearest`, com `scroll-mt` para o cabeçalho grudado): no celular ele fica
     fora da tela, e sem rolar o toque pareceria não ter feito nada. **Ao
     carregar, não rola**: o quadro já nasce em hoje, e rolar até ele
     empurraria a página para baixo sozinha.
   - **No eixo do celular o dia escolhido ganha número**, com prioridade sobre
     hoje e sobre os múltiplos de 5 (`prioridadeNoEixo`); o vizinho de
     prioridade menor sai, senão "24" e "25" viram "2425".
   - **"O resto ainda pode entrar" só no dia de hoje.** Num dia que já passou,
     o que não entrou quase sempre já expirou ou foi cancelado.

Três defeitos que só apareceram na foto, e valem de aviso para o próximo
gráfico em HTML:

- **Rótulo posicionado por `bottom` centraliza com `translate-y-1/2`
  positivo.** O `-translate-y-1/2` é o par de `top`; com `bottom` ele sobe meia
  altura, e cada valor do eixo ficava ~16px acima da sua linha — o "R$ 0"
  boiando sobre a base.
- **Rótulo escondido no eixo fica `invisible`, não `hidden`.** Com `hidden`, os
  que sobram se espalham pela largura e deixam de ficar embaixo do dia deles.
- **"R$ 90,0 mil" quebra em duas linhas** numa coluna estreita. O eixo usa
  formato próprio e curto ("R$ 90 mil"), com `whitespace-nowrap`.

`npm run celular` ganhou `--foto <prefixo>`, `--foto-altura` e
`--clicar '<seletor>'` para isso: a auditoria mede, mas não vê. **Rodando o
script direto com `node`, passe `--env-file-if-exists=.env`** — sem ele o
cookie de sessão sai assinado com o segredo embutido e a foto é da tela de
login (aconteceu, e uma conferência "ok" em 1400px foi feita contra o login).

Quatro decisões:

1. **Meia-noite de BRASÍLIA, e não a do servidor** (`diaDeHoje`, com
   `paraHorarioDeBrasilia`). Produção roda em UTC: com o relógio da máquina, o
   quadro zeraria às 21h — três horas antes da hora, no meio da noite de
   trabalho. `filtrarPorDia` compara texto com texto, como `filtrarPorMes`; em
   live o `created_at` já vem em `-03:00` da borda, então o corte cai exato. Na
   demonstração as datas são UTC e o corte fica 3 horas deslocado, a mesma
   aproximação que o agrupamento por mês já tinha.
2. **Hoje só abre sozinho com o mês atual no cabeçalho** — ver acima. Nos
   outros meses, o quadro do dia só abre com um clique.
3. **O número grande é o BRUTO do dia, com o já pago ao lado.** No dia em que o
   pedido nasce quase nada está pago: boleto e pix levam horas. Só o bruto
   exagera o dia; só o recebido faria parecer que ninguém comprou. A tese da
   seção 1 vale aqui também, e por isso as duas coisas aparecem juntas.
4. **Nenhuma conta nova**: é `resumirDia`, `reconciliar` sobre os pedidos do
   dia, a mesma função da tela inicial.

O número vem da cópia em disco, que no servidor é atualizada de 5 em 5 minutos —
é o selo de sincronização do cabeçalho (seção 12) que diz de quando ela é. Os
dois foram pedidos juntos, e é assim que se lêem.

`dataPadraoDoMes` (dia sugerido para despesa nova) passou a usar o mesmo
`diaDeHoje` pelo mesmo motivo: com o relógio do servidor, despesa cadastrada às
21h nascia com a data de amanhã.

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
lucro por unidade = preço × (1 − comissão − despesas)
                  − (preço + frete) × (impostos + DIFAL + taxa + sócios)
                  − custo de fabricação
preço mínimo      = (fabricação + frete × (impostos + DIFAL + taxa + sócios))
                    ÷ (1 − soma das cargas)
```

**Nenhuma alíquota é do simulador.** Impostos, DIFAL e taxa são a média do mês
da marca, medida pelas funções do painel (`apurarImpostos`,
`apurarTaxasPlataforma`). Os três são fração do **recebido** e se aplicam ao
preço **mais o frete**, porque desde 18/09/2026 o frete integra a base de todo
tributo (5.1.1). Como o imposto passou a incidir sobre o **faturado**, essa
fração embute o imposto dos pedidos que nunca foram pagos, rateado pelas vendas
que entraram — que é o que a venda precisa cobrir para a operação fechar, e é o
mesmo espírito da escolha 1 sobre a comissão. O teste que
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
2. **O frete não é custo, mas é base** (5.1.1): o cliente paga por fora e ele
   vai para a transportadora, então não entra na lista de custos nem na
   comissão — a tela diz isso numa frase, para ninguém achar que foi
   esquecido. Mas imposto, DIFAL, taxa do pagamento e sócios incidem sobre o
   valor pago **com** frete, e por isso cada real de frete sobe o preço
   mínimo. O frete usado é por unidade (R$ 19 ÷ ~2,1 unidades por pedido). A
   primeira versão o tratava como custo da loja; o cliente corrigiu.
3. **DIFAL é a média ponderada dos destinos**, contando as vendas dentro do
   próprio estado (que não pagam). Marca no Simples fica com zero e a linha diz
   por quê (5.10.2).
4. **Despesas com influencer entram rateadas pelo faturamento sem frete.** São custo fixo do
   mês, não da unidade, mas saem do lucro; sem elas a identidade com a DRE não
   fecha.

**Preço sugerido.** Depois de simular, o resultado mostra o preço que entrega
três margens operacionais de referência — **mínima saudável 10%, recomendada
15%, forte 20%** (`MARGENS_DE_REFERENCIA`) — e um campo para outra margem:

```
preço para a margem m = (fabricação + frete × (impostos + DIFAL + taxa + sócios))
                        ÷ (1 − soma das cargas − m)
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

**O mês das médias é o do cabeçalho — a menos que ele seja o mês corrente**,
e aí é o **anterior** (25/09/2026, pedido do dono; `mesDeReferenciaDoSimulador`,
com teste). Vale para as duas abas do simulador. O mês aberto não tem as
despesas lançadas — elas chegam da contabilidade depois que ele fecha —, e com
despesa zero a venda saía mais lucrativa do que é. Três decisões:

- **Tudo sai do mês anterior, e não só as despesas.** Cada média é fração do
  faturamento daquele mês; a despesa de agosto com o imposto de setembro daria
  um perfil que não é de mês nenhum. E há um segundo motivo: o repasse do TikTok
  fecha dias depois da venda (seção 15), então a taxa do canal no mês aberto
  ainda está pela metade.
- **A tela diz**, logo abaixo da explicação: "As médias são de agosto de 2026, e
  não de setembro de 2026", com o porquê. O cabeçalho mostra um mês e a conta
  usa outro; sem a frase, alguém leria agosto achando que é setembro.
- **A URL continua com o mês do cabeçalho.** Trocar de aba não pode trocar o
  mês escolhido (2.2). Sem o mês anterior na base, fica o do cabeçalho.

Influencer inativo e marca sem venda paga no mês ficam fora da lista, **e a tela
diz quem** — simular com carga zero diria que vender ali não custa nada.

**Frete grátis, só no TikTok** (25/09/2026, pedido do dono). Na loja do TikTok
a loja banca o frete de boa parte das vendas, e isso muda muito o custo: o
cliente paga só o produto, o frete sai do repasse (`freteAbsorvido`, 5.1) e, no
contrato sobre o que cai na conta, também sai da base da comissão (5.1.2). O
formulário ganha a caixa **"Frete grátis — a loja paga o frete"**, com o
percentual das vendas do mês que saíram assim e o quanto a loja pagou por
unidade. Marcada, a escolha 2 acima se inverte:

| | Cliente paga o frete | Frete grátis |
|---|---|---|
| Frete do cliente (base de imposto, taxa e sócios) | o das vendas em que ele pagou | zero |
| Frete da loja (custo) | zero | o das vendas com frete grátis |
| Base da comissão "o que cai na conta" | preço − taxa | preço − taxa − frete da loja |

```
preço para a margem m = (fabricação + frete do cliente × (impostos + DIFAL + taxa + sócios − c × taxa)
                         + frete da loja × (1 − c))  ÷ (1 − cargas − m)
c = percentual da comissão, só no contrato sobre o que cai na conta (senão 0)
```

Quatro decisões:

1. **As duas médias são medidas em grupos separados** (`FreteGratisDaMarca`):
   o que a loja pagou, só nas vendas com frete grátis; o que o cliente pagou,
   só nas outras. Misturadas, cada uma sairia diluída na outra.
2. **Só no TikTok, pelo canal e não pelo dado** (`ehPedidoDoTikTok`, o prefixo
   "TikTok Shop" que a conversão grava no `gateway_name`). A primeira versão
   ligava a caixa em qualquer marca que tivesse frete bancado no mês, e o dono
   corrigiu na hora: uma promoção de frete grátis numa loja Nuvemshop trocaria
   o frete médio de sempre e mexeria num simulador que estava certo.
3. **A caixa nasce como aconteceu na maioria das vendas do mês.** No TikTok
   quase tudo sai com frete grátis; desmarcada por padrão, a tela abriria
   simulando o caso raro — e o raro é o barato.
4. **Há teste de identidade com a DRE**: uma marca com todo pedido em frete
   grátis, simulada no preço e no custo médios, reproduz o lucro operacional
   dela, com o frete bancado inteiro como custo e a comissão batendo inteira.

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
faturado     = faturamento × (faturado com frete ÷ faturado sem frete das marcas)
receita real = faturamento × (receita real ÷ faturamento sem frete das marcas atuais)
recebido     = receita real + frete (o cliente paga o frete por fora)
lucro        = receita real − fabricação
             − impostos − DIFAL        (sobre o FATURADO com frete — 5.1.1)
             − taxa − sócios           (sobre o recebido, com frete)
             − comissão (% × (receita real − taxa)) − parte nas compartilhadas
```

O teste que segura isso: montada a referência com uma marca só e estimado o
faturamento dela, a conta devolve o lucro da DRE daquela marca — a menos do
custo estimado dos itens sem ficha (escolha 2).

Três escolhas:

1. **Simples é calculado, Presumido é média.** No Simples a alíquota muda muito
   com o porte, e a média das marcas atuais daria a um influencer pequeno o
   imposto de uma marca de R$ 2,7 mi/ano; por isso a guia sai de
   `apurarSimples` com o RBT12 projetado (faturado, com frete, × 12). No Presumido a carga
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

Três **ordens de fabricação** nascem semeadas, uma em cada trecho do processo
(5.15): uma esperando a conferência, uma no meio do caminho, e uma concluída —
que é a única com PDF, gerado no momento da semeadura, exatamente como
aconteceria de verdade. As três existem porque a tela precisa se explicar
sozinha: com uma só, metade dela não teria o que mostrar.

A do meio tem a fabricação **abaixo do pedido** (4.850 de 5.000) de propósito.
Não é descuido de semeadura: é o caso que a tela precisa saber mostrar, porque
é onde a confiança no processo se decide.

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

   - o perfil `estoque` recebe comissão e hash de senha, furando a 5.13.

   A rota pública de assinatura, que era o outro furo, não existe mais (5.15).

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
- **Fase 4 — Shopee, TikTok Shop e Mercado Livre.** A empresa vende por esses
  canais e eles **não passam pela Nuvemshop**, então hoje estão fora do painel
  inteiro. Em 23/09/2026 o dono passou a ligar as chaves, e o painel já as
  recebe (ver abaixo) — mas **nenhuma busca existe ainda**. Enquanto isso, três
  coisas ficam sabidamente furadas, e quem for usar o painel para decidir
  precisa saber:

  1. **O estoque é otimista.** O saldo é "última contagem − vendido desde
     então" (5.12), e o vendido só conta a Nuvemshop. Venda de marketplace
     consome produto e não aparece: o painel diz que há mais do que há. É a
     consequência mais operacional das três.
  2. **O RBT12 é menor que o real**, e com ele a faixa e os limites do Simples
     (5.10). A Ka Beauty apareceu a R$ 4,22 mi contando só a Nuvemshop; com os
     outros canais, a distância do teto de R$ 4,8 mi é menor que a exibida.
  3. **Faturamento, imposto e lucro são da NUVEMSHOP, não da empresa** — e
     nenhuma tela diz isso hoje, por decisão do dono. Foi o que fez o DIFAL do
     painel não bater com o do contador (5.10.2).

  **A primeira medida do buraco** saiu em 23/09/2026: no CNPJ da Ka Beauty, a
  distância entre o RBT12 do contador e o do painel era de **R$ 49.997,32 em
  sete meses**, ~2,6% do faturamento daquele CNPJ (5.10.1). O dono atribuiu a
  diferença aos marketplaces. Fica uma ressalva anotada: ele disse depois que
  **só a Tha Beauty vende nesses canais**, e as duas coisas não se encaixam —
  vale confirmar com o contador de onde vêm aqueles R$ 50 mil.

  **As credenciais já entram** (23/09/2026), e são três canais, não dois: entrou
  a **Shopee** junto. O que existe é só o cadastro — preencher não traz pedido
  nenhum, e o script diz isso em voz alta no fim.

  Um bloco por conta no `.env.live`, numerado, no mesmo molde das lojas
  Nuvemshop (`contasDeCanal`, em `lib/config.ts`):

  ```
  CANAL_1_TIPO=mercadolivre        # shopee | tiktok | mercadolivre
  CANAL_1_MARCA="Tha Beauty"
  CANAL_1_LOJA_ID=123456789
  CANAL_1_CHAVE=...
  CANAL_1_SEGREDO=...
  ```

  Os nomes são genéricos porque os três marketplaces pedem as mesmas quatro
  coisas com nomes diferentes; `NOMES_DA_CREDENCIAL` (em `types/canais.ts`) faz
  a tradução, e é ela que as **mensagens de erro** usam — quem está com a tela
  da Shopee aberta procura "partner_key", não "SEGREDO":

  | campo | Shopee | TikTok Shop | Mercado Livre |
  |---|---|---|---|
  | `CHAVE` | `partner_id` | `app_key` | `client_id` |
  | `SEGREDO` | `partner_key` | `app_secret` | `client_secret` |
  | `LOJA_ID` | `shop_id` | `shop_cipher` | `seller_id` |

  Quatro decisões:

  1. **Bloco intocado é ignorado; bloco pela metade é ERRO.** Dá para deixar os
     três blocos prontos e preencher conforme as chaves chegam, mas um campo
     esquecido não pode virar uma conta que silenciosamente não busca — isso só
     daria sinal dias depois.
  2. **O TOKEN não mora no `.env.live`.** Nos três canais o token de acesso dura
     horas e o de renovação é **trocado a cada uso**, então a credencial que
     vale agora não é a que alguém colou uma vez. Ela fica em
     `.live-data/tokens-canais.json`, modo 600 (`data/tokensCanais.ts`) — que é
     também o único caminho gravável do serviço em produção (seção 14). O
     `.env.live` serve para a primeira autorização e para destravar uma conta
     cujo token guardado venceu; `tokenDaConta` prefere o gravado. É o mesmo
     problema já anotado para o Bling, logo abaixo.
  3. **Marca repetida entre canais é normal**, ao contrário da Nuvemshop, onde
     é erro. Lá cada loja é de uma marca; aqui **só a Tha Beauty vende nos três
     canais** (dito pelo dono em 23/09/2026), e os três blocos apontam para
     ela. A mesma loja repetida no mesmo canal continua sendo erro — as duas
     buscariam os mesmos pedidos e o faturamento sairia dobrado.
  4. **`npm run canais:conferir` mostra o que foi lido, sem chamar API.** O
     identificador do aplicativo aparece inteiro (não é segredo, e é por ele
     que se confere a conta); segredo e token saem mascarados, com os quatro
     últimos dígitos — o bastante para comparar com a tela do marketplace.

  **A decisão que falta**, e que vem junto com o primeiro conversor: hoje
  `Pedido` não tem de que canal veio. Com a Nuvemshop isso não fazia falta
  porque `marca` bastava — uma loja por marca. Com a Tha vendendo em quatro
  canais, todos carimbados "Tha Beauty", o painel some com a distinção: não dá
  para dizer quanto veio da Nuvemshop e quanto veio de marketplace. `Pedido`
  vai precisar de um campo `canal`.

  Ao integrar: cada um tem API e OAuth próprios, e o caminho é o mesmo da
  Nuvemshop — conversão na borda para `Pedido`, cache por loja e por mês, e
  `marca` ligando ao contrato. Nenhuma regra de negócio muda (seção 3).

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
garantia da 5.13, que é invisível em teste unitário — e que `/api/sincronizacao`
devolve **401** sem sessão e 200 com ela. Manipulador de rota é endereço público
como Server Action: quem confere a sessão é ele mesmo, e sem sessão tem que ser
401, não um redirecionamento — quem chama é um `fetch`, que engoliria o 307 e
receberia a página de login como se fosse resposta.

Rota nova sem área declarada em `AREA_DA_ROTA` **falha** o script de propósito:
sem isso, uma tela financeira nova entraria no ar sem ninguém conferir se o
perfil `estoque` está barrado nela.

`celular` abre cada rota em 390px num Chrome headless e falha se houver
transbordo horizontal, texto de gráfico abaixo de 9px **na tela** (não no JSX)
ou tabela rolando sem coluna âncora. Ele varre só as pastas de primeiro nível de
`src/app`. É a régua da seção 2.1. Não instala nada:
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
| A conta está certa? | `npm test` — 624 testes sobre as funções puras |
| A chave da Nuvemshop vale? Os pedidos chegam como esperado? | `npm run nuvemshop:testar` |
| A página monta? O perfil bloqueia? | `npm run fumaca` |
| Funciona no celular? | `npm run celular` |
| A tela comunica? | abrir no navegador, em tela grande e no telefone |

---

## 12. Modo real (Nuvemshop)

Roteiro de uso em `DADOS_REAIS.md`. Aqui ficam as decisões.

**Estado:** ligado à loja real desde 16/09/2026 (Tha Beauty, loja 5018407).
A janela é de **13 meses** (`NUVEMSHOP_MESES=13`) desde 23/09/2026 — antes era
3, e o RBT12 do Simples saía projetado. O primeiro contato com uma loja nova continua sendo
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

1. a primeira busca traz `NUVEMSHOP_MESES` meses, **mês a mês**, de
   preferência por `npm run nuvemshop:sincronizar` antes de subir. Medido na
   loja real: 25.751 pedidos e 6.925 carrinhos em 293 s;
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

#### Um arquivo por loja e por mês (23/09/2026)

```
.live-data/
  indice.json                        { versao, lojas, ausentes }
  loja-5018407/pedidos-2026-09.json  [ pedidos daquele mês ]
  loja-5018407/carrinhos.json        [ janela de 30 dias ]
```

O arquivo único funcionou enquanto a janela era de 3 meses (41 MB, cinco
lojas). Com 13 meses a loja maior sozinha dá **230 MB**, e o problema não é o
disco: um JSON de 230 MB vira uma string de ~460 MB na memória (o V8 guarda
texto em UTF-16) mais o grafo de objetos, e `JSON.parse` precisa dos dois ao
mesmo tempo. Num processo com 2 GB de heap isso estoura.

Por mês, o maior arquivo passa a ser o maior mês da maior loja (~30 MB), e ele
**para de crescer com a janela**: aumentar `NUVEMSHOP_MESES` acrescenta
arquivos, não engorda os que existem.

**A lição que custou caro**, e ela tem duas metades.

A causa raiz **não era memória**: era `destino.push(...origem)`. O spread passa
cada item como um **argumento** da chamada, e o limite fica na casa das dezenas
de milhares — com 239 mil pedidos dá *"Maximum call stack size exceeded"*. Não
aparece em teste pequeno nem numa loja pequena, só na maior, em produção. Hoje
o acréscimo em bloco passa por `acrescentar`, que é um laço, e há teste com
200 mil pedidos. **A divisão por mês foi feita no mesmo dia e não é o conserto
desse defeito** — ela vale por si, por tirar o pico de memória e fazer o
arquivo parar de crescer com a janela.

A segunda metade é o que transformou um erro de leitura em **perda de dado**: a
leitura de cada loja estava dentro de um `catch` que seguia com a loja vazia.
Em produção a leitura falhou, a sincronização seguinte gravou o vazio por cima,
e **239 mil pedidos de 13 meses viraram 45**. O `catch` estava errado por
inteiro:

> Cópia velha é um problema; cópia **apagada** é outro, muito maior. Ninguém
> sobrescreve o que não conseguiu ler.

Hoje a falha ao ler um mês é **fatal** (`lerDaLoja`): ela derruba a leitura, e
com ela a sincronização, então nada é gravado. Há teste que reproduz o defeito
exato. A única exceção é o arquivo de carrinhos, que se refaz de hora em hora e
é o número menos importante da tela (5.6).

Foi essa regra que salvou a base na segunda vez: com o `push` ainda quebrado, a
primeira sincronização depois do conserto **falhou e não gravou nada** — os
256 MB continuaram no disco, e bastou corrigir o `push` e rodar de novo.

Quatro decisões, além dessa:

1. **A migração roda na primeira leitura** e atravessa os dois formatos
   anteriores — o arquivo único e o de um arquivo por loja. Só apaga o antigo
   depois de gravar o novo. Há teste para cada um.
2. **O índice é gravado por último.** É ele que diz "a cópia está pronta e é
   desta hora", e é só ele que o selo do cabeçalho lê.
3. **Só as lojas que mudaram são reescritas** (`storeIdsAlterados`), e dentro
   delas só os meses que têm pedido. Mês que sai da janela leva o arquivo dele
   junto; loja que sai da configuração leva a pasta.
4. **A validade da cópia em memória** é a assinatura dos `mtime` do índice e de
   cada pasta de loja. Com um arquivo só bastava o dele.

**O heap do Node precisou crescer** nos dois serviços que leem a base:
`painel.service` e `painel-sincroniza.service` ganharam
`NODE_OPTIONS=--max-old-space-size=3072` por drop-in em
`/etc/systemd/system/<serviço>.d/10-memoria.conf`. O padrão que o Node calcula
nesta máquina é ~2 GB, e a base de 13 meses (278 mil pedidos) chega perto
demais disso. A máquina tem 5,8 GB.

#### A hora da última sincronização fica no cabeçalho

`SeloSincronizacao` ocupa, em modo live, **o mesmo lugar do selo de
demonstração** — e o par não é coincidência: os dois respondem "de onde vem o
número que estou lendo". Em demonstração, que ele é fictício; em produção, de
quando ele é. A informação existia só no rodapé, depois da tela inteira, longe
demais de quem abre o painel para conferir se a venda de agora há pouco já
entrou.

Quatro decisões:

1. **A hora é absoluta ("13:46"), nunca "há 4 minutos".** É hora de relógio,
   que a pessoa compara com o próprio. Por isso também `horaCurta` traz o
   **dia** de volta quando a cópia não é de hoje — "03:20" sozinho se lê como
   "hoje de madrugada".

2. **O selo se atualiza sozinho, de minuto em minuto.** A página é montada no
   servidor e não se refaz: até 18/09/2026 a hora só mudava ao trocar de aba ou
   recarregar, e o cliente reparou. `router.refresh()` resolveria e custaria
   **reler a base de 40 mil pedidos a cada minuto**; por isso existe
   `/api/sincronizacao`, que só olha a data do arquivo.

   Três detalhes que o defeito ensinou:

   - **Manipulador de rota é endereço público**, como Server Action (5.13): a
     sessão é conferida dentro dele, e sem sessão sai **401**, não um
     redirecionamento — quem chama é um `fetch`, que engoliria o 307 e receberia
     a página de login como se fosse resposta. O `fumaca` confere os dois casos.
   - **Com a aba escondida o intervalo para**, e a volta à aba dispara uma
     consulta na hora. Era exatamente aí que a hora velha aparecia.
   - **`agora` começa com o relógio do SERVIDOR**, passado como propriedade. Com
     `Date.now()` do navegador, o primeiro desenho poderia divergir do que veio
     pronto e o React reclamaria da hidratação — os dois relógios nunca batem ao
     segundo.

   O tipo do estado mora em `types/sincronizacao.ts`, e não em
   `data/cachePedidos.ts`: o selo é componente de navegador, e importar de lá
   traria o `node:fs` junto. Mesma armadilha do `TAMANHO_MINIMO_SENHA` (5.13.2).
3. **Vermelho acima de meia hora** (`ATRASO_QUE_PREOCUPA_MS`), e igualmente com
   loja pendente ou erro na última busca. O servidor busca de 5 em 5 minutos e
   a página tenta a cada 25 (seção 14): meia hora não é demora, é o timer
   parado, a chave recusada ou a Nuvemshop fora do ar. O `title` diz qual dos
   casos é.
4. **No celular sobra só a hora.** O rótulo "Nuvemshop" tomaria a linha do
   botão de sair. O selo é mais estreito que o de demonstração, então a
   auditoria de 390px em modo demonstração continua sendo o teto — mas ela foi
   rodada nos dois modos.
5. **Um selo por fonte** (25/09/2026, pedido do dono): ao lado do da
   Nuvemshop, um para cada canal que sincroniza por conta própria — hoje o
   **TikTok** (seção 15). `SincronizacaoNaTela.canais` traz a cópia de cada
   um, e o `/api/sincronizacao` devolve os dois juntos, então o do TikTok
   também se atualiza de minuto em minuto. Três decisões:
   - **Cada selo fica vermelho pelo próprio atraso.** O limite é do canal
     (`atrasoQuePreocupaMs`), e não do selo: o TikTok roda de hora em hora
     (`painel-tiktok.timer`), então 40 minutos ali está em dia; o vermelho
     vem com **duas horas**, uma rodada inteira perdida.
   - **A hora do TikTok é a data do ARQUIVO** (`fs.stat`), e não o
     `atualizadoEm` gravado dentro dele. O selo pergunta a cada minuto, em
     cada aba aberta, e abrir o JSON inteiro para ler um campo seria o custo
     que o endereço existe para evitar. O arquivo só é escrito por
     `gravarPedidos`, com `rename` no fim, então a data é a da gravação.
   - **No celular, com dois selos, eles empilham e mostram o nome**, menores
     (11px). Lado a lado não cabiam na linha do botão de sair, e sem o nome
     seriam duas horas soltas sem dizer qual é qual. Conferido em 390px com
     estado forjado, porque a auditoria roda em demonstração, e lá o lugar é
     do selo de demonstração.

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
- **PIS e COFINS: só no Shine Sérum Capilar 65ml** (Tha Beauty,
  `228990398:1009533981`), o produto que o dono marcou à mão em 17/09. Em
  25/09/2026 havia **220** produtos com os dois marcados: no servidor, PIS e
  COFINS tinham passado a "nascer marcados" (`aplicacaoPorProduto: true`,
  contra o `false` da semente e da decisão do cliente em 5.10), e todo lote
  trazido depois disso veio com eles — 67 da Tha, os 39 do TikTok e os de Ka,
  Revenda e Duale de quando ainda estavam no Presumido. Apareceu pelo
  simulador: o TikTok de agosto dava **14,2%** de imposto sobre o valor pago.
  O dono confirmou que só aquele produto tem os dois; a flag voltou para
  `false` e os 219 foram desmarcados (cópia de antes em
  `/var/backups/painel/pis-cofins-antes-*.json`). O TikTok de agosto caiu
  para **9,0%**. Para conferir de novo: `npm run impostos:marca -- "<marca>"
  <aaaa-mm>`. Vale perguntar ao contador se cosmético na revenda não está no
  PIS/COFINS **monofásico** (alíquota zero para quem revende) — aí nem o Shine
  Sérum pagaria.
- **Dos 9,0% do TikTok, 6,2% são o imposto sobre o faturado** (ICMS 4% +
  IRPJ e CSLL do Presumido) **e o resto é o faturado sobre o recebido** (1,44×
  em agosto: 31% do valor foi cancelado). O imposto incide sobre todo pedido
  criado (5.1.1), e o simulador o reparte pelas vendas pagas. Na Tha o fator é
  1,15×. Voltar a tributar só o recebido é decisão do dono, e ainda não foi
  tomada.
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
- **Os quatro contratos novos nasceram como PREMISSA** (cópia da Tha: 25%
  sobre o que cai na conta, Lucro Presumido, GO), e o dono já editou três pela
  tela: Ka 22%, Duale 30% e Laoli 20%, os três no **Simples Nacional** — por
  isso não têm DIFAL. A Revenda continua com a premissa (e é canal de revenda,
  ticket médio ~R$ 1.500: pode nem pagar comissão). O regime da Laoli pode ter
  vindo do formulário da Duale (defeito abaixo): confirmar com o dono.
- **Defeito corrigido em 17/09/2026**: na tela de um influencer, trocar de
  cartão com "Editar contrato" aberto mantinha os campos do anterior, e o
  contrato da Laoli foi gravado com a marca "Duale Beauty" — a loja Laoli
  ficou sem contrato e os 29 produtos sem dono. Corrigido com `key` no
  componente, uma trava na action (um contrato ativo por marca) e a marca
  devolvida para "Laoli Beauty".
- **Duas empresas, cinco contratos.** Tha, Ka e Laoli são do mesmo CNPJ
  (46.549.339/0001-42); Duale e Revenda, de outro (63.934.671/0001-40). O
  painel apura imposto por contrato, e no Lucro Presumido a dedução do
  adicional de IRPJ (R$ 20 mil/mês) é **por CNPJ**: aplicada por contrato, ela
  entra três vezes numa empresa e duas na outra, e o IRPJ sai menor que o
  devido. Não corrigido — pede o regime por empresa, e não por contrato.
- **Custos provisórios de 35% também nas lojas novas** (17/09/2026, a pedido
  do dono): 133 fichas, 35% do preço médio pago de cada variante nos pedidos
  de jul–set — a mesma regra das fichas da Tha. Cobertura de custo de 100% em
  setembro nas cinco lojas. Na **Revenda** o preço é de atacado, então os 35%
  saem abaixo do custo real do mesmo produto nas outras lojas. Os **33 produtos sem
  venda paga com preço** (brindes a R$ 0, combos que só saíram de graça, itens
  que não venderam, e o "Combo: Red Moon + Moon Black", que tinha ficha) foram
  **apagados** do cadastro, com a ficha do combo; restam 208, todos com custo.
  Nenhum era componente de kit, nem tinha contagem ou ordem.
- Para uma chave nova: bloco preenchido, `nuvemshop:testar`,
  `nuvemshop:sincronizar` com o painel **parado** (o servidor no ar não conhece
  a loja nova e, na atualização seguinte, tiraria os pedidos dela da cópia),
  contrato na aba Influencers com a mesma marca, e "Trazer da Nuvemshop"
  (roteiro em `DADOS_REAIS.md`).
- **`NUVEMSHOP_MESES` voltou para 13** em 23/09/2026, depois que o cache passou
  a ser um arquivo por loja (seção 12). Foi o que o RBT12 do Simples pediu:
  com três meses ele era projeção ×12, e a projeção dava R$ 10,2 mi contra os
  R$ 1,91 mi que o contador apura (5.10.1).

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

478 testes, tipos sem erro, `npm run fumaca:live` contra a loja real (todas as
telas, os dois perfis), sincronização de 3 meses. Ainda **não** conferido: um
mês fechado contra o relatório da própria Nuvemshop.

---

## 14. Servidor de produção (BattleHost, Ubuntu)

Desde 17/09/2026 o modo real roda num servidor, e não mais só no notebook.
Ubuntu 24.04, 3 núcleos, 6 GB, IP fixo. Endereço e chave ficam no
`.env.servidor` (fora do git; modelo em `.env.servidor.example`), porque
**este repositório é público**.

### Como está montado

| Peça | Onde |
|---|---|
| Aplicação | `/opt/painel/app`, dona pelo usuário `painel` (sem shell) |
| Serviço | `painel.service` — `next start -p 3001 -H 127.0.0.1`, `Restart=always`, sobe no boot |
| Configuração | `/opt/painel/app/.env.live`, modo 600, com as chaves das 5 lojas |
| Banco | PostgreSQL 16 local, banco `painel`, só em `127.0.0.1` |
| Cópia dos pedidos | `/opt/painel/app/.live-data` (único caminho gravável do serviço) |
| Internet | nginx na 80, repassando para a 3001 |
| HTTPS | `painel-tunel.service` (Cloudflare) até haver domínio |
| Firewall | `ufw`: 22, 80 e 443 |

O painel **escuta só em 127.0.0.1**: quem fala com a internet é o nginx. E o
serviço roda com `ProtectSystem=strict`, com `.live-data` como única pasta
gravável — se algum dia ele tentar escrever em outro lugar, falha em vez de
conseguir.

**Enquanto não houver domínio, o endereço muda a cada reinício** do túnel (é o
túnel rápido da 5.15). Com domínio apontando para o IP: certificado Let's
Encrypt no nginx, `painel-tunel` desligado, endereço fixo.

### Levar chave nova para o servidor

Quem preenche as chaves de API **não acessa o servidor**: elas são coladas no
`.env.live` local e levadas por `npm run env:enviar` (sem `--confirmar`, só
mostra o que mudaria). Foi assim com as cinco chaves da Nuvemshop, na mão, e
desde 23/09/2026 é um comando.

Ele **mescla**, nunca copia por cima, e mantém uma lista de variáveis que não
sobem (`NUNCA_ENVIAR`): `DATABASE_URL`, `SESSAO_SECRET`, as senhas semeadas,
`NUVEMSHOP_CACHE_DIR`, `PAINEL_DIST_DIR` e `NUVEMSHOP_ATUALIZAR_MINUTOS` — as
que dizem respeito à **máquina**, e não à integração. Igualar as duas pontas
nessas é exatamente o estrago que ele existe para evitar: o Postgres local, as
sessões abertas e o intervalo de 25 minutos que só vale no servidor (porque lá
o timer também busca).

O resumo antes de aplicar **é para ser lido**. Na primeira execução ele pegou
um `NUVEMSHOP_MESES=3` local contra os 13 do servidor — um envio cego teria
derrubado a base de 278 mil pedidos para 41 mil, e ninguém veria por quê até
alguém olhar um mês antigo.

Detalhes que não são estética: o arquivo viaja em **base64 pela entrada
padrão**, e não como argumento do `ssh`, onde apareceria na lista de processos
do servidor; o anterior fica em `.env.live.anterior`; e o modo 600 e o dono
`painel` são reaplicados depois de escrever, porque `ProtectSystem=strict` só
protege de fora.

### Atualizar depois de um commit

```bash
npm run deploy             # traz do GitHub, compila e reinicia
npm run deploy -- --banco  # idem, e ajusta o banco ao schema novo
npm run deploy -- --voltar # volta para o build anterior
```

O comando daqui só abre o SSH; o trabalho é de `/opt/painel/atualizar.sh`. O
servidor puxa de `origin/main` — **commit sem push não sobe**.

Quatro decisões do script:

1. **O build novo é montado em `.next-novo` e só troca no fim**
   (`PAINEL_DIST_DIR`, seção 12). Compilar por cima de `.next` derruba o painel
   que está no ar, porque o servidor lê aqueles arquivos enquanto são
   reescritos — é a armadilha 4 entre dois builds de produção. Assim a queda é
   de segundos, no `restart`.
2. **Ele confere se o painel voltou** (`/entrar` em 200, até 60 s). Se não
   voltar, restaura o build anterior e o commit anterior sozinho. O build
   anterior fica guardado em `/opt/painel/.next-anterior`, que é o que
   `--voltar` usa.
3. **Não mexe no banco por conta própria.** Se `prisma/schema.prisma` mudou,
   ele para e avisa, sem compilar: alterar tabela com dado dentro é decisão de
   quem está olhando. Com `--banco` roda `prisma db push` **sem**
   `--accept-data-loss`, então mudança que apagaria coluna com dado é recusada.
4. **`npm ci` só quando `package-lock.json` ou `package.json` mudam**, e
   `prisma generate` só quando o schema muda.

`git config --global --add safe.directory /opt/painel/app` está feito no
servidor: o script roda como `root` numa pasta do usuário `painel`, e sem isso
o git recusa ("dubious ownership").

### Deploy automático: o servidor olha o GitHub

`painel-auto-deploy.timer`, **de 3 em 3 minutos**: `git fetch`, compara
`HEAD` com `origin/main` e, se chegou coisa nova, roda o mesmo
`atualizar.sh` do `npm run deploy`.

Existe porque o `npm run deploy` precisa da chave SSH e do `.env.servidor`,
que não vão para o git — de outro computador, publicar exigiria instalar chave
antes. Com o timer, **`git push` é o deploy**, de onde quer que o commit
saia. O `npm run deploy` continua valendo para quem quer publicar na hora,
sem esperar os 3 minutos.

O resultado chega por e-mail, com o commit no assunto (senão a trava de 6
horas do aviso engoliria o segundo deploy do dia):

| Situação | Assunto |
|---|---|
| Publicou | `publicado <commit>` |
| `prisma/schema.prisma` mudou | `deploy parado em <commit>: o banco mudou` — o painel fica na versão anterior até alguém rodar `npm run deploy -- --banco` |
| Build ou conferência falhou | `deploy FALHOU em <commit>` — o `atualizar.sh` já voltou para o build e o commit anteriores |

**A exceção do git é do SISTEMA, não do root** (`git config --system --add
safe.directory /opt/painel/app`). O systemd não carrega o perfil do usuário —
`HOME` não é `/root` —, então a exceção que o `npm run deploy` usava pelo SSH
não valia aqui: o primeiro deploy automático parou em "dubious ownership".

**Consequência assumida: o que for para a `main` vai para o ar.** Trabalho pela
metade fica em outro ramo. Para desligar por um tempo — mexer no servidor na
mão, por exemplo:

```bash
ssh -i ~/.ssh/gustavo_battlehost root@188.220.168.188 'touch /opt/painel/sem-auto-deploy'
# apagar o arquivo religa
```

### Endurecimento do servidor (17/09/2026)

Feito depois de o painel entrar no ar, com o motivo de cada item:

| Medida | Por quê |
|---|---|
| SSH **só com chave** (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`) | 8 tentativas de senha nas primeiras 24 h; e rotina na internet |
| `fail2ban` no sshd (5 erros em 10 min = 1 h de banimento) | corta o custo de quem insiste |
| Cabeçalhos no nginx: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | o painel nunca é exibido dentro de iframe, e depois da primeira visita o navegador recusa `http://` sozinho |
| `server_tokens off` e `poweredByHeader: false` | não anunciar versão de nginx e de Next |
| Backup do banco diário (`painel-backup.timer`, 03h20, 14 dias em `/var/backups/painel`) | o banco é o único lugar onde contrato, custo e kit existem; pedido se refaz pela API |
| Senha do banco trocada | ela apareceu numa saída de erro durante a instalação |
| `.live-data/pedidos.json` em 600 | dado da empresa, ainda que sem dado pessoal |

O arquivo do cloud-init (`/etc/ssh/sshd_config.d/50-cloud-init.conf`) trazia
`PasswordAuthentication yes`, e no sshd **a primeira ocorrência vence** — por
isso a configuração do painel é `00-painel.conf`, e não `99-`.

**Ainda não feito, e vale um dia:** segundo fator no login, backup copiado para
fora do servidor, e alerta quando a sincronização com a Nuvemshop falhar.

### Quem atualiza os pedidos em produção

`painel-sincroniza.timer`, **de 5 em 5 minutos**, rodando
`nuvemshop.ts sincronizar` como o usuário `painel`.

Antes dele a atualização era **sob demanda**: só acontecia quando alguém abria
uma página e a cópia tinha passado de `NUVEMSHOP_ATUALIZAR_MINUTOS` (seção 12).
Num servidor que fica horas sem visita, isso significa que a primeira tela do
dia mostra os números de ontem — a busca começa em segundo plano e só a próxima
recarga vê o resultado. Medido: o cache estava com 74 minutos, exatamente o
tempo desde a última vez que uma página fora aberta.

Com o timer, o caminho da página virou plano B, e `NUVEMSHOP_ATUALIZAR_MINUTOS`
foi para **25** no servidor: se os dois buscassem ao mesmo tempo, um gravaria
por cima do outro (a trava de uma busca por vez é por processo, e são dois
processos).

Custo medido na loja real: **3 a 4 segundos** por atualização em regime, e
5min38s quando havia 74 minutos de atraso para recuperar. Uma vez por hora a
rodada é mais cara, porque a lista inteira de carrinhos abandonados é refeita
(seção 12). `Persistent=true`: servidor desligado na hora marcada busca assim
que volta.

### Backup e avisos (17/09/2026)

**Backup** (`painel-backup.timer`, 03h20): `pg_dump -Fc` para
`/var/backups/painel` (14 dias) e cópia no **Google Drive** do dono, em
`Backups/painel` (60 dias), por `rclone`. A autorização é OAuth com escopo
`drive.file` — o rclone só enxerga o que ele mesmo criou, e não lê o resto do
Drive; o token fica em `/root/.config/rclone/rclone.conf`, modo 600. O token
de autorização foi gerado no Windows (`rclone authorize "drive"`, com
`RCLONE_DRIVE_SCOPE=drive.file`), porque o retorno do Google vai para
`127.0.0.1:53682` — o navegador precisa estar na mesma máquina.

**Dump pequeno não sobe nem apaga nada.** Abaixo de 10 KB o script falha de
propósito: backup ruim sobrescrevendo backup bom é como se perde tudo.

**Avisos por e-mail** (`msmtp` pelo Gmail, senha de app revogável em
`myaccount.google.com/apppasswords`; `/etc/msmtprc` modo 600). Duas fontes:

- `OnFailure=` em `painel.service` e `painel-backup.service`: avisa **na hora**,
  com as últimas 20 linhas do log no corpo;
- `painel-vigia.timer`, de 15 em 15 minutos: painel fora do ar, cópia de
  pedidos com mais de 3 horas, backup ausente há 48 h, disco em 85% e
  certificado vencendo em menos de 10 dias.

**O mesmo aviso não repete antes de 6 horas** (marca em `/var/lib/painel-avisos`).
Um problema que dura o dia inteiro viraria 96 e-mails, e a caixa de entrada
ensina a pessoa a ignorar o aviso — é assim que um alerta de verdade passa
despercebido.

Cada checagem responde a uma pergunta que, sem ela, só se descobriria olhando:
o painel está no ar, os pedidos estão atualizando, o backup aconteceu, o disco
vai acabar, o certificado vai vencer.

### O que NÃO vem no deploy

Pedido e cadastro não estão no git. Cópia dos pedidos se atualiza sozinha
(seção 12); o banco veio do backup do notebook, convertido de PostgreSQL 18
para 16 com `pg_restore -f` (o formato custom da 18 não é lido pela 16).

---

## 15. TikTok Shop (primeiro marketplace ligado)

Desde 25/09/2026 o painel também lê o **TikTok Shop**, e não só a Nuvemshop. É
a Fase 4 da seção 9 começando pelo canal que o dono pediu primeiro.

### O canal é uma MARCA, não um pedaço da outra

O dono decidiu que o TikTok entra como contrato próprio: marca
**"Tha Beauty TikTok"**, influencer **Thay TikTok**, **10%** sobre o que cai na
conta. Regime, estado e CNPJ foram copiados do contrato da Tha Beauty (mesma
empresa) e estão escritos na observação do contrato, para ninguém confundir
premissa com informação.

Foi decisão de negócio, e não de código: a loja do TikTok vende os mesmos
produtos, e juntar tudo numa marca só esconderia quanto cada canal rende. Como
a marca é a chave que liga pedido, produto e contrato (armadilha 9), separar
aqui sai de graça no resto do painel.

### O que muda na borda (`lib/tiktok.ts`, puro e com teste)

| Achado | Decisão |
|---|---|
| Id de pedido, produto e SKU vêm com 18 ou 19 dígitos | não cabem no inteiro seguro do JS nem no `Int` do Postgres: cada um ganha um número próprio e **estável** (`data/idsTikTok.ts`, gravado em `.live-data/ids-tiktok.json`). O id verdadeiro fica no `sku` do item e no `gateway_name` |
| Frete grátis: cliente paga R$ 0 e a loja banca | vira `shipping_cost_owner` maior que `shipping_cost_customer`, e a reconciliação o separa em `freteAbsorvido` — **custo, não repasse** |
| Uma linha por unidade vendida | linhas do mesmo SKU viram um item com a quantidade somada |
| `payment_method_name` livre ("CCI") | passa pelo mesmo `normalizarMetodoPagamento` (5.13.1) e aparece na aba de taxas como lacuna, para alguém cadastrar quanto o TikTok retém |
| Situações próprias (`UNPAID`, `CANCELLED`, `DELIVERED`...) | `traduzirSituacao` mapeia para os status do painel; situação nova conta como recebida e aparece em `situacoesDesconhecidas` |
| A API devolve nome, telefone e endereço | nada disso é guardado: o cliente vira um id negativo, como o pedido sem cliente da Nuvemshop |

### O extrato financeiro: a taxa e o frete de verdade

**O pedido não traz taxa nenhuma.** Comissão da plataforma, taxa de indicação e
o frete que sobra para o vendedor só existem quando o repasse fecha, dias
depois. Por isso a sincronização tem duas etapas: os pedidos do período e,
depois, os **extratos** (`/finance/202309/statements` e, de cada um,
`statement_transactions`, uma linha por pedido).

De cada linha saem dois números, e os dois entram nas contas:

| Campo do extrato | Vira | Onde entra |
|---|---|---|
| `fee_amount` | `Pedido.taxaCanal` | fatia "Taxas das lojas", DRE, e a **base da comissão** (5.1.2) |
| `shipping_cost_amount` | `shipping_cost_owner` acima do que o cliente pagou | fatia "Frete grátis (a loja bancou)" |

**O extrato manda sobre o pedido.** No pedido, o frete grátis aparece como
`shipping_fee_seller_discount` — a promessa do momento da venda; no extrato
está o que a transportadora cobrou de fato. Em setembro os dois diferem: R$ 49
mil pela promessa contra R$ 54 mil pelo extrato.

**Pedido ainda não liquidado fica sem taxa**, e a aba de taxas diz quantos são.
Em setembro, 1.197 de 1.574 pedidos recebidos já tinham repasse fechado; os
outros ainda vão aumentar a taxa e diminuir a comissão do influencer.

### Como se sincroniza

```bash
npm run tiktok:sincronizar              # NUVEMSHOP_MESES meses
npm run tiktok:sincronizar -- --meses 3
```

Mesma divisão da Nuvemshop: o comando busca e grava
(`.live-data/tiktok-<shop_cipher>.json`), e as páginas só leem o disco —
`FonteNuvemshop.listarPedidos` junta os dois canais, e nenhuma tela sabe da
diferença. `produtos:trazer` e `resultado:mensal` também passaram a enxergar
os dois.

O **token de acesso dura 7 dias** e é trocado sozinho pelo `refresh_token`
quando falta menos de um dia — por isso ele mora em `.live-data`, e não no
`.env.live` (`tokensCanais.ts`). O primeiro token veio da autorização manual.

### O que a primeira carga mostrou (25/09/2026, 3 meses)

3.154 pedidos, R$ 409,3 mil de faturamento bruto, R$ 299,0 mil recebido,
R$ 75,0 mil de frete que a loja bancou e R$ 45,2 mil de taxas cobradas pelo
canal. Em setembro: R$ 266,5 mil de bruto, R$ 196,9 mil de receita real,
R$ 54,1 mil de frete grátis, R$ 31,4 mil de taxas e R$ 16,5 mil de comissão.
731 pedidos cancelados em 3.154 — quase um quarto do volume, que vale
investigar com o dono.

Para a empresa inteira, setembro passou de R$ 1,155 mi para R$ 1,422 mi de
faturamento bruto com o canal somado.

Entraram 39 produtos novos no cadastro (21 kits), todos com a ficha provisória
de 35% do preço médio pago, como os demais.

### Em producao (25/09/2026)

O canal foi ligado no servidor no mesmo dia:

| Peça | Como ficou |
|---|---|
| Credenciais | `CANAL_1_*` levadas por `npm run env:enviar -- --confirmar` |
| Token | `.live-data/tokens-canais.json`, copiado pelo SSH em base64, modo 600 e dono `painel` |
| Contrato | criado no banco do servidor (o banco de la e outro: o cadastro nao viaja com o deploy) |
| Produtos | `produtos:trazer -- --gravar` no servidor: 45 novos (39 do TikTok e 6 da Ka Beauty, que so vendiam em meses antigos) |
| Atualizacao | `painel-tiktok.timer`, **de hora em hora** |

O timer e de hora em hora, e nao de 5 em 5 minutos como o da Nuvemshop, porque
a busca varre os tres meses inteiros mais os extratos e leva uns dois minutos.
E ela **precisa** repetir: o extrato de um pedido so fecha dias depois da
venda, entao cada rodada preenche a taxa dos que liquidaram desde a anterior.

O painel de producao responde em **https://lucroempresarial.com** (dominio
proprio com certificado desde 17/09; o tunel Cloudflare ficou desligado, e por
isso o IP direto devolve 404 -- o nginx atende pelo nome).

### Autorização, uma vez por aplicativo

O aplicativo é **Personalizado**, criado no TikTok Shop Partner Center. Dois
tropeços que custaram tempo e vale não repetir:

1. **Escopo aprovado não vale para token já emitido.** O erro é `105005`
   ("this app has not been granted any access scope"), e a saída é autorizar a
   loja de novo depois de salvar os escopos — o token carrega as permissões que
   existiam quando foi criado.
2. **O `shop_cipher` não é o id da loja nem o do aplicativo.** Os três são
   números parecidos na tela do Partner Center. O cipher só vem de
   `GET /authorization/202309/shops`, e é ele que vai em `CANAL_1_LOJA_ID`.
