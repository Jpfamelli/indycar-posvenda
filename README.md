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
npm test             # 35 testes (funções puras, IA falsa, carteiro) — sem banco, sem API
node scripts/conferir-banco.mjs [--ia] [--tudo]   # leituras no banco real (+ poucas chamadas reais de IA)
```

Servidor real local **sem enviar nada**: `CARTEIRO_DESLIGADO=1` (sem timers, sem
rodada, "Rodar agora" só avisa). Ex. no PowerShell:
`$env:CARTEIRO_DESLIGADO='1'; $env:PORT='3510'; node server.js`.

Teste do ciclo no banco (auto-reverte): `scripts/sql/teste-ciclo-comunicar.sql`.

No modo `mock`:
- `/?papel=atendente` mostra o modo "só olha" (não gestor: réguas travadas, 403 ao salvar);
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

- `server.js` — HTTP, porteiro (login), carteiro (gera + envia), rotas `/api/*`
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
