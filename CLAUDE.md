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

Trocar `FONTE_DADOS=demo` para `live` no `.env` liga a API real e o Postgres.
Nenhuma regra de negócio muda nessa troca — ver seção 3.

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

O cliente tem por volta de 55 anos, não é técnico, e vai ver isso em uma tela
grande numa reunião — provavelmente por poucos minutos.

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

O código-fonte, ao contrário, é lido por mim (programador). Comentários e nomes
de variáveis em português são bem-vindos, mas priorize clareza.

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
    apiSource.ts          # implementa FonteDePedidos com a API real
    geradorPedidos.ts     # gerador determinístico (seed fixo)
    catalogo.ts           # marcas e produtos fictícios
    costRepository.ts     # interface RepositorioCadastros + dados iniciais
    demoCostRepository.ts # persiste em arquivo local (offline)
    prismaCostRepository.ts # persiste no Postgres
    index.ts              # ÚNICO lugar que decide demo vs. live
  lib/
    metrics.ts            # funções PURAS: Pedido[] -> métricas
    costing.ts            # funções PURAS: Pedido[] + cadastros -> lucro
    format.ts             # formatação pt-BR
    config.ts             # leitura de env
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

Endpoints: `GET /v1/{store_id}/orders` e `GET /v1/{store_id}/checkouts`, com
filtros `created_at_min`, `created_at_max`, `page`, `per_page` (máx. 200).
Autenticação por header `Authentication: bearer {token}` + `User-Agent`.

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

Exibida como cascata descendente. É o herói da tela.

Precedência obrigatória para não contar o mesmo pedido duas vezes:
`cancelado > reembolsado/estornado > não pago > recebido`. Está implementada em
`classificarPedido()` e documentada lá.

### 5.2 Comissão de influencer (simulador)

```
comissão paga hoje    = pct × bruto
comissão sobre real   = pct × receita real
diferença mensal      = comissão paga hoje − comissão sobre real
projeção anual        = diferença mensal × 12
```

O percentual é **editável na tela**, não constante no código. O contrato varia
por marca e o cliente vai querer testar cenários na hora.

### 5.3 Por marca

Tabela com uma linha por marca: bruto, recebido, % não pago, receita real,
comissão hoje, comissão sobre real, diferença. Ordenada pela diferença.

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
− CMV
= margem de contribuição
− comissões dos contratos cadastrados
= lucro operacional
```

Atenção: a comissão da DRE vem dos **contratos cadastrados** (seção 5.9), não
do percentual do simulador da 5.2. Um é a realidade, o outro é cenário.

### 5.9 Cadastro de comissões

Cada influencer tem: nome, marca, percentual, base de cálculo
(`bruto` | `recebido` | `receitaReal`), **regime tributário** (ver 5.10) e
ativo/inativo. Influencer inativo não entra em nenhum cálculo, nem de comissão
nem de imposto.

Um influencer por marca. Dois influencers na mesma marca tornariam ambíguo o
regime dos produtos dela — o primeiro ativo manda.

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

A configuração global sobrou apenas como *fallback* para marcas ainda sem
influencer vinculado.

No Simples:

```
RBT12          = receita bruta dos últimos 12 meses (recebido, não faturado)
alíquota efetiva = (RBT12 × nominal da faixa − parcela a deduzir) / RBT12
DAS do mês     = alíquota efetiva × recebido do mês
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

**Tributo do regime que está inativo não some em silêncio.** Ele volta em
`inativosDoRegime` e a tela diz "o ICMS não está nesta conta", em vez de exibir
um total menor sem explicar por quê.

Toda alíquota carrega `confirmadoPeloContador`, que começa `false` e aparece
na tela como aviso. O painel nunca apresenta número fiscal como definitivo.

### 5.11 Cadastro de produtos e kits

A Nuvemshop sabe o que vendeu e por quanto. Ela **não** sabe de quem é o
produto, o NCM, nem que um "Kit Barba" consome um tônico e um shampoo — ela
entrega o kit como **um** produto, com `product_id` próprio.

Cada produto aponta para **um** influencer (`influencerId`). Os impostos vêm
marcados sozinhos, a partir do regime desse influencer, e continuam editáveis:
o cadastro sugere, quem entende decide. Desmarcar tira o imposto só daquele
produto.

```
custo do kit = ficha própria, se houver
             senão, Σ (custo do componente × quantidade)
             senão, null
```

Ficha própria vence: a fábrica pode ter custo de montagem e embalagem do kit
diferente da soma das partes. Componente sem custo torna o kit **inteiro**
`null` — somar a parte conhecida daria um número que parece certo e está errado
para menos, inflando a margem.

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

A verificação acontece **no servidor**, em `exigirArea`, em dois lugares: na
página, antes de montar, e **dentro de cada Server Action**. As duas são
necessárias — Server Action é um endpoint público, dá para chamá-la sem nunca
abrir a página. Esconder link no menu é só conveniência.

Senha com scrypt e sal por usuário; sessão em cookie httpOnly **assinado** —
sem assinatura, qualquer um trocaria o próprio perfil para `dono` no cookie.

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
| Frete | ~4,7% do recebido |
| Marcas | 5 |
| Meses de histórico | 6 |

Regimes semeados, escolhidos pelo porte de cada marca: Verte Natural e Nitro
Hair no **Simples Nacional** (~R$ 2,7–2,8 mi/ano, 5ª faixa, ~11% efetivo);
Aurora, Luma e Petra no **Lucro Presumido** (R$ 7–9 mi/ano, acima do teto do
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

Quatro produtos ficam **de propósito** sem ficha de custo
(`PRODUTOS_SEM_CUSTO_NA_DEMO`). Não é descuido: é o gancho para mostrar o aviso
de cobertura e cadastrar um ao vivo na reunião.

---

## 7. Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL (Neon) — só no modo live
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

### Duas armadilhas de runtime que já custaram tempo aqui

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

Implicação prática para hoje: mantenha `lib/metrics.ts` e `lib/costing.ts`
puros, e `FonteDePedidos`/`RepositorioCadastros` como interfaces.

---

## 10. Pronto quando

- `npm run dev` sobe e mostra o painel completo sem erro no console.
- `npm test` passa.
- Os totais da cascata fecham na aritmética.
- A soma das linhas da tabela por marca bate com os totais gerais.
- O percentual de comissão é editável e recalcula tudo na hora.
- Cadastrar um custo muda o lucro operacional na tela principal.
- Funciona com a internet desligada.
- Legível numa tela de reunião, e não quebra em 1366×768.
