# Roteiro da demonstração

Checklist para quando o painel roda no **desktop de casa** e é acessado de
fora — o computador da reunião é só um cliente, não roda nada.

Escrito porque nesse arranjo não existe rede de segurança local: se o acesso
externo falhar durante a reunião, não há um "abre no localhost" para salvar.

---

## Antes de sair de casa

Sete minutos, na ordem. Nenhum passo é opcional.

1. **Deixe o desktop ligado e na tomada.** Suspender e hibernar já estão em
   "nunca" no plano de energia ativo (`Ultimate Performance`). A tela apaga em
   15 minutos e isso não atrapalha — a máquina e a rede continuam de pé.
   Não mude o plano de energia.

2. **Suba o painel em modo de produção**, não em desenvolvimento:

   ```bash
   npm run build
   npm start
   ```

   Não é preferência. **Em desenvolvimento o Next embute o `.demo-data`
   inteiro no HTML de cada página** — incluindo `senhaHash`, `senhaSal`, custo
   de fabricação e percentual de comissão — e faz isso até na tela pública de
   assinatura, que não exige login. Medido: 277 KB em dev contra 57 KB em
   produção, na mesma rota. É instrumentação de I/O do modo dev, não código
   nosso, e desaparece por completo em produção.

   Enquanto os dados são fictícios e as senhas são as publicadas no CLAUDE.md,
   não há estrago. Mas servidor de desenvolvimento não deveria estar na
   internet, e este está.

   `npm run dev` também recompila a cada arquivo tocado e é mais frágil para
   ficar horas sozinho. O `.env` precisa de `PERMITIR_HTTP_SEM_TLS=1` em
   produção, e ele já está lá.

3. **Confirme que responde de dentro:**

   ```bash
   npm run fumaca
   ```

   Todas as rotas em 200 e os bloqueios de perfil em 307.

4. **Confirme o IP público**, que é o endereço da reunião:

   ```bash
   curl https://api.ipify.org
   ```

   Tem que responder `177.223.44.178`. Se tiver mudado, o endereço da reunião
   muda junto — e todo link já enviado morre.

5. **Abra o endereço externo de outro aparelho**, no 4G, não no Wi-Fi de casa.
   Pelo Wi-Fi o teste passa mesmo com o encaminhamento quebrado, porque o
   roteador devolve a conexão internamente sem ela sair para a internet
   (*hairpin NAT*). Foi assim que um diagnóstico quase saiu errado uma vez.

6. **Deixe o navegador da reunião já com a aba aberta e logada**, e a tela do
   painel na aba certa. Login em reunião é tempo morto.

---

## Endereços

| Para que | Endereço |
|---|---|
| Painel, no computador da reunião | `http://177.223.44.178:3000` |
| Painel, pelo túnel (quando houver) | endereço HTTPS do túnel do dia |

O IP é **fixo** e não muda sozinho — é ele que sustenta a reunião.

---

## A parte de assinar no celular

É a única que precisa de mais que o IP, e o motivo está na seção 5.15 do
CLAUDE.md:

- O WhatsApp **não transforma IP em link** — ele lê como telefone.
- Se você der um nome ao IP para resolver isso, o Chrome passa a **forçar
  HTTPS** naquele nome, e o painel só fala HTTP. Dá `ERR_SSL_PROTOCOL_ERROR`.

Os dois não têm solução em HTTP puro. Só HTTPS de verdade resolve os dois.

**Plano A — com HTTPS (túnel):** o painel gera o link sozinho com o endereço
por onde ele foi aberto. Abra o painel **pelo endereço do túnel**, e os links
de assinatura já saem certos, clicáveis no WhatsApp.

**Plano B — sem HTTPS, e funciona hoje:** demonstre a assinatura **no próprio
computador**. Crie a ordem, copie o link, cole em outra aba e assine com o
mouse — o quadro de assinatura funciona com mouse igual funciona com o dedo. É
o caminho com zero dependência externa além do IP.

**Plano C — celular na mesma rede:** só serve se estiver em casa. `http://
192.168.1.9:3000/...` abre no celular sem nenhum aviso, porque endereço de IP
é isento da conversão forçada para HTTPS.

---

## Se cair no meio

- **Página não abre no computador da reunião:** confira o IP público de casa
  por outro caminho. Se mudou, não há conserto remoto.
- **Abre mas o botão de assinar dá erro:** o formulário é uma Server Action; um
  proxy no meio pode recusá-la. Caia no Plano B.
- **"Não seguro" na barra de endereço:** esperado em HTTP. Não é falha, mas
  aparece na tela do cliente — é o melhor argumento para o túnel HTTPS.
- **O túnel rápido (`trycloudflare.com`) caiu:** o endereço dele **não volta**.
  Ele sorteia um nome novo a cada vez que sobe, e todos os links já enviados
  morrem. Nunca dependa dele para uma reunião marcada — use como conveniência,
  não como infraestrutura.

---

## O que não fazer

- Não rode `npm run dev` e `npm run build` ao mesmo tempo (armadilha 4 do
  CLAUDE.md).
- Não mexa em `.demo-data/cadastros.json` no dia. As ordens já assinadas moram
  ali, e o PDF de uma delas é o que prova que o fluxo funciona.
- Não reinicie o túnel depois de mandar um link para alguém.
- Não apague o `.env`: sem `SESSAO_SECRET` a sessão muda de assinatura e todo
  mundo cai no login.
