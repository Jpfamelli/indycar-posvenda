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

## Rodar

```bash
npm start            # produção local (precisa de .env com SUPABASE_*)
npm run dev          # com --watch
npm run mock         # tela com dados de MENTIRA em http://localhost:3511 — sem login
npm run check        # node --check em tudo
```

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
- `dados.js` — réguas (geradores), segmentos, porteiro de consentimento, resumo
- `supabase.js` — cliente REST mínimo do Supabase
- `public/` — a tela (index.html, app.js, styles.css, sw.js, manifest.json)
- `scripts/mock-server.mjs` — servidor falso para mexer na tela sem login
- `scripts/sql/` — migrações aplicadas no Supabase
- `MELHORIAS.md` — registro do que mudou e foi verificado

## Carteiro externo

O Render gratuito dorme. O GitHub Actions e o `pg_cron` do Supabase chamam
`POST /api/rodar` com o `RUNNER_TOKEN` para acordar o carteiro.
