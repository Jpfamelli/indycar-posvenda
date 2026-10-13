# IndyCar Comunicar

Central de comunicação com o cliente da IndyCar Centro Automotivo (Taubaté).
Tudo sai pelo **WhatsApp da empresa**, o mesmo número do painel de Atendimento.

- **Réguas automáticas**: lembrete de horário, pós-venda ("ficou tudo certo?"),
  avaliação no Google, revisão por tipo de serviço, aniversário, orçamento
  parado, não fechou e reativação.
- **Campanhas** por segmento (todos, aniversariantes, atendidos há N dias, sem
  voltar há N meses, faltaram, fizeram um serviço) ou para um cliente só.
- **Opt-out**: quem responde PARAR sai da lista sozinho; dá para desligar no painel.
- **Satisfação** automática pela resposta do cliente ao pós-venda (+ registro manual).
- **Atribuição**: agendamento que vem depois de uma mensagem conta para a régua.

Node puro (sem dependências), HTML/CSS/JS puro, login Supabase igual ao CRM, à
Agenda e ao Atendimento. Porta **3500**.

## IA (rodada 2)

A IA trabalha nas mensagens, mas **nunca fala sozinha com o cliente**:

- **Escrever com IA** (réguas e campanha): 3 opções no tom da casa, validadas por
  código (variável desconhecida, palavra proibida, preço/prazo, tamanho) e com a
  prévia já trocada para um cliente de exemplo.
- **Leitura das respostas**: no carteiro, as neutras/negativas passam pelo haiku →
  quer agendar, quer orçamento, reclamou, dúvida, agradeceu. Quem pede gente vai
  para `aguardando_consultor` no Atendimento (sozinho em `autonomia=automatico`;
  com um clique em `confirmar`). Tudo em `ia_acoes` (origem `comunicar`).
- **"IA, quem devo chamar?"** na campanha e **resumo da semana** no Início (cache 6 h).
- Chave: `ANTHROPIC_API_KEY` ou `agenda_ia_config.api_key`; modelos de `ia_config`.
  Cliente injetável (`ia.js › definirClienteIA`) — os testes usam IA falsa.

## Equipe, acesso e segurança (rodada 3)

- **Quem entra**: admin sempre; gestor/atendente só com `comunicar` em `perfis.apps`;
  papel `agenda` nunca. Sem acesso → tela "Você não tem acesso a este app" com os
  apps que a pessoa pode usar (o servidor devolve 403 `sem_acesso` em toda rota).
- **Login** (`public/conta.js`): mostrar senha, Caps Lock, lembrar e-mail, espera
  progressiva depois de 5 erros, esqueci a senha (link por e-mail), troca
  obrigatória (`precisa_trocar_senha`), duas etapas (TOTP) e sair de todos os aparelhos.
- **Permissões** (`acesso.js › PERMISSOES`, uma regra para CADA rota em `ROTAS`):
  atendente vê tudo e manda avulsa para UM cliente; campanha para um grupo feita por
  atendente fica **aguardando aprovação** (`comunicar_campanhas`) e o gestor recebe o
  aviso no sino; réguas, teste, "rodar agora", CSV, importar, religar opt-out e apagar
  satisfação só gestor/admin; atendente cancela/reenvia só o que ele mandou.
- **Quem mandou**: `posvenda_envios.criado_por_id` (perfil) + `criado_por` (nome na tela).
- **Automações da equipe** (`automacoes.js`): resposta lida pela IA como quer agendar /
  quer orçamento / reclamação vira TAREFA para o dono da conversa (ou o gestor);
  reclamação avisa os gestores na hora; "não ficou bom" no pós-venda já vira tarefa +
  aviso pelo gatilho `comunicar_tarefa_da_resposta` (no banco); régua com 3 falhas em
  24 h avisa os gestores; resumo semanal para os gestores na segunda de manhã.
- **Servidor**: CSP com `frame-ancestors 'none'`, HSTS (no Render), nosniff,
  Referrer/Permissions-Policy, CORS só do ecossistema, JSON inválido = 400, corpo
  grande = 413, limite por IP (300/min) e por pessoa nas rotas caras (20/min; avulsa
  do atendente 30/h), erro 500 sem detalhe interno, auditoria (`registrar_auditoria`)
  de régua, pausa, campanha, teste, CSV, opt-out, importação, regras e satisfação.
- Migração `comunicar_aprovacao` (`scripts/sql/2026-10-13_comunicar_aprovacao.sql`).

## Conectividade

- "Abrir conversa" → `indycar-atendimento.onrender.com/?tel=<telefone>`; a ficha tem
  links para Conversa, CRM e Agenda.
- O que o carteiro envia vira linha de saída no histórico da conversa
  (`whatsapp_mensagens`), só se a conversa já existe, uma vez por envio
  (`posvenda_envios.mensagem_id`).
- Régua espera 3 h se alguém está atendendo o cliente (esperando consultor ou
  mensagem sem resposta há menos de 2 h); feriado nacional segura as réguas de
  relacionamento; limite por hora; falha passageira tenta de novo (até 3 vezes).

## Rodar

```bash
npm start            # produção local (precisa de .env com SUPABASE_*)
npm run dev          # com --watch
npm run mock         # tela com dados de MENTIRA em http://localhost:3511 — sem login
npm run check        # node --check em tudo
npm test             # 66 testes (funções puras, IA falsa, carteiro, papéis, aprovação, automações, API) — sem banco
npm run segredos     # nenhuma chave nos arquivos versionados nem no histórico
npm run navegador    # roteiro puppeteer em 1440 e 375 px contra o mock (precisa do mock no ar)
node scripts/conferir-banco.mjs [--ia] [--tudo]   # leituras no banco real (+ poucas chamadas reais de IA)
```

Servidor real local **sem enviar nada**: `CARTEIRO_DESLIGADO=1` (sem timers, sem
rodada, "Rodar agora" só avisa). Ex. no PowerShell:
`$env:CARTEIRO_DESLIGADO='1'; $env:PORT='3510'; node server.js`.

Teste do ciclo no banco (auto-reverte): `scripts/sql/teste-ciclo-comunicar.sql`.

No modo `mock` (o porteiro é o `acesso.js` de verdade):
- `/?papel=admin|gestor|atendente|atendente2|agenda|desativado|sem_app|trocar_senha|mfa`
  troca a pessoa (código de duas etapas de teste: `123456`); `/?logado=0` abre o login
  (senha `errada` simula erro); `/?semente=1` volta os dados ao começo;
- `/?papel=atendente` mostra o modo atendente (réguas travadas, campanha vira pedido de aprovação);
- `/?saude=ok` esconde a faixa de saúde e marca o WhatsApp como conectado.

## Telas

| Tela | O que faz |
| --- | --- |
| Início | Fila, enviadas, respostas, agendaram pela mensagem, satisfação; situação do WhatsApp e do carteiro; por régua; próximas 48 h; aniversariantes; **Rodar agora** e **Prévia de hoje** |
| Réguas | Faixa **Envio** (hora, janela, domingo, intervalo mínimo, telefone de teste, pausa geral) + 8 cartões com interruptor, mensagem com chips de variáveis, parâmetro, prévia, "Quem receberia hoje" e "Mandar teste para mim". A régua Revisão traz os prazos por serviço |
| Mensagens | Fila e histórico com filtros por status/tipo/busca, resposta do cliente, selo "agendou depois", cancelar/reenviar |
| Campanhas | Nova campanha em 3 passos (para quem → mensagem → quando) e histórico agrupado por mensagem e dia |
| Clientes | Busca, aniversário, interruptor "aceita mensagens", ficha em gaveta (próxima revisão, mensagens, satisfação), importar planilha |
| Satisfação | Satisfeitos/insatisfeitos/nota média, origem (WhatsApp automático ou manual), registro manual |

## Arquivos

- `server.js` — HTTP, login (token → perfil → acesso → duas etapas), WhatsApp, carteiro, estáticos
- `rotas.js` — TODAS as rotas `/api/*` e o porteiro de cada uma (testado com dados falsos)
- `acesso.js` — papéis, permissões, regra de cada rota, limites, CORS, cabeçalhos (puro)
- `automacoes.js` — tarefas e avisos para a equipe, resumo semanal (relógio injetável)
- `public/conta.js` — login, senha, duas etapas, sem acesso, menu do perfil, sino e tarefas
- `dados.js` — réguas (geradores), segmentos, porteiro de consentimento, resumo, feriados, histórico no Atendimento, relatório, CSV
- `ia.js` — IA: escrever, ler respostas, sugerir público, resumo; validação das regras da casa
- `supabase.js` — cliente REST mínimo do Supabase
- `public/` — a tela (index.html, app.js, styles.css, sw.js, manifest.json)
- `scripts/mock-server.mjs` — servidor falso para mexer na tela sem login
- `scripts/sql/` — migrações aplicadas no Supabase
- `MELHORIAS.md` — registro do que mudou e foi verificado

## Carteiro externo

O Render gratuito dorme. O GitHub Actions e o `pg_cron` do Supabase chamam
`POST /api/rodar` com o `RUNNER_TOKEN` para acordar o carteiro.
