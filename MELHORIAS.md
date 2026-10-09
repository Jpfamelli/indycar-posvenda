# Melhorias — IndyCar Comunicar

Só o que ficou feito e verificado. Cada linha é uma melhoria.

## Tela (09/10/2026)

Marca e PWA

1. App vira **IndyCar Comunicar** em tudo: título da aba, topo ("Central de comunicação com o cliente" + "Quem conhece, Indyca! 🏎"), tela de login, manifest e descrição.
2. `manifest.json` novo: nome, short_name "Comunicar", scope, idioma e atalhos (Nova campanha, Mensagens).
3. `sw.js` com cache `comunicar-v1`: nunca guarda `/api`, só guarda resposta boa do próprio domínio, inclui o logo na casca.

Casca, navegação e acessibilidade

4. Barra lateral com as 6 telas (Início, Réguas, Mensagens, Campanhas, Clientes, Satisfação), `aria-label` em cada item (o texto some no celular) e `aria-current` na tela ativa.
5. Seletor **Ecossistema IndyCar** (Agenda, CRM, Atendimento, Comunicar "você está aqui", Orçador, Site) em popover: abre pelo botão Apps, fecha com Esc ou clique fora e devolve o foco.
6. Faixa de saúde no topo de **todas** as telas quando `GET /api/saude` traz problema (texto pronto para `codewords-fora` + link "Abrir Atendimento"), rechecada a cada 5 min.
7. Faixa "sem internet" enquanto o navegador estiver offline, com recado quando voltar.
8. Selo na aba Mensagens com a quantidade na fila (99+ quando passa).
9. Esqueleto por tela enquanto carrega + entrada suave dos cartões; os números dos cartões sobem de 0 até o valor (respeita `prefers-reduced-motion`).
10. Atalhos de teclado: **N** abre nova campanha, **/** foca a busca da tela, **Esc** fecha popover, modal ou gaveta (nessa ordem).
11. Modal com foco preso (Tab e Shift+Tab não saem), foco no primeiro campo ao abrir e devolvido a quem abriu ao fechar; botão × com `aria-label`; `aria-labelledby` no título.
12. Gaveta lateral (ficha do cliente) com a mesma disciplina de foco, Esc e clique fora; trava a rolagem do fundo enquanto aberta.
13. Toast novo (ícone, barra de tempo, erro em vermelho), sempre por `textContent` — nome de cliente nunca vira HTML.
14. Tema claro/escuro mantido (`indycar_tema`, `data-trocando-tema`, body sem transition) e balão de WhatsApp com cor própria em cada tema.
15. `[hidden]{display:none!important}`, `esc()` em todo dado que vira HTML (inclui aspas simples) e 375 px sem rolagem lateral em todas as telas e modais.
16. Visual da família: numerais em Barlow Condensed (cartões, Por régua, 48 h, ficha, campanhas), cartões com barra colorida e brilho, hover que levanta o cartão.

Início

17. Abertura com a data por extenso e manchete que muda: "N mensagens na fila · X saíram hoje", "Fila limpa" ou "Envios pausados".
18. Faixa de situação: WhatsApp conectado / desconectado / **chave recusada** / sem resposta (chega depois de a tela pintar, com "verificando…"), última rodada do carteiro ("há 27 min · 3 enviadas"), janela de envio e domingo, falhas em 30 dias (último erro no `title`), chips das réguas ligadas; fica vermelha com a pausa geral.
19. Cinco cartões: Na fila (com atrasadas há +2 h), Enviadas 7 dias (quantas hoje), Responderam 7 dias (% das enviadas), Agendaram pela mensagem 30 dias (receita em R$ quando houver) e Satisfação % (nota média · respostas).
20. "Por régua" em grade com enviadas / responderam / agendaram, chip ligada/desligada e "N pediu p/ parar"; no celular os cabeçalhos encurtam (Env. · Resp. · Agend.) e nada rola de lado.
21. "Próximas 48 h" com o número grande, se a régua de lembrete está ligada, e quantos clientes pediram para não receber.
22. "Aniversariantes do mês" (dia, nome, telefone), até 8 com atalho "ver todos em Clientes".
23. **Rodar agora** (`POST /api/rodar-agora`): resumo em toast (novas na fila, enviadas, falhas, puladas, aviso) e tela atualizada sem piscar.
24. **Prévia de hoje** (`GET /api/previa`) em modal: chips por régua com contagem (marca as desligadas), lista nome/telefone/corpo, seções Pulados e Adiados com o motivo, erros do servidor.

Réguas

25. Faixa **Envio**: hora de envio, janela início/fim (0–24 h), intervalo mínimo com explicação de uma linha, telefone de teste com máscara, domingo e **Pausa geral** em vermelho destacado.
26. Oito cartões na ordem pedida, cada um com cor, ícone, interruptor animado (Ligada/Desligada) — desligado fica apagado.
27. Parâmetro numérico inline em cada régua ("Mandar **20** horas antes do horário · 1–72"); fora da faixa o campo fica destacado e o salvar é barrado.
28. Mensagem com chips de variáveis clicáveis (comuns + específicas `{quando}`, `{meses}`, `{link_avaliacao}`) inseridos onde está o cursor.
29. Prévia em balão de WhatsApp com cliente de exemplo, atualizada a cada letra, com a hora de envio e ✓✓ — usa a mesma troca de variáveis do servidor.
30. "Quem receberia hoje" por régua (`GET /api/previa?regua=`) e "Mandar teste para mim" (`POST /api/envios/teste`), com o erro do servidor (502) em toast.
31. Régua **Avaliação**: campo do link do Google e explicação de uma linha ("dispara sozinha quando o cliente responde bem ao pós-venda; sem o link, não sai").
32. Régua **Revisão**: prazos por serviço com edição inline (nome, palavras, meses, ativo), mensagem própria opcional (lápis), apagar com confirmação e linha para adicionar — salva na hora (`GET/POST/PUT/DELETE /api/regras-retorno`).
33. Só o que mudou vai no `PUT /api/comunicar/config`; barra flutuante "N alterações sem salvar" com Descartar/Salvar, cartão alterado ganha borda, Salvar também no topo.
34. Validações antes de salvar: janela começa antes de terminar, link começa com `https://`, telefone de teste com 10+ dígitos.
35. Papel não gestor: aviso "só gestor altera as réguas", campos travados e 403 do servidor vira aviso claro.

Mensagens

36. Pílulas de status (todas, na fila, enviadas, falharam, canceladas, puladas) + filtro por tipo + busca por nome/telefone/texto (`GET /api/envios?status&tipo&q`) e contador "N na lista".
37. Filtros e busca atualizam só a lista — o campo mantém o foco e o cursor de quem digita.
38. Cartão com ícone e rótulo do tipo, nome (abre a ficha) e telefone, corpo, "sai/programada/enviada em", tentativas, erro, motivo pulado e selo "agendou depois".
39. Resposta do cliente em balão colorido pelo tom: positiva (gostou), negativa (reclamou), parar (pediu para parar), neutra — com a hora.
40. Ações: Cancelar (na fila), Reenviar (falhou/cancelada/pulada) e Abrir conversa (Atendimento).

Campanhas

41. Modal **Nova campanha** em 3 passos com indicador (Para quem → Mensagem → Quando), Voltar/Avançar e validação por passo.
42. Passo 1: grupo por segmento (`GET /api/segmentos`) com valor editável quando houver e prévia ao vivo (total + amostra), ou um cliente específico com busca e sugestões (bloqueia quem pediu para parar).
43. Passo 2: modelos prontos por categoria (`GET /api/modelos`) para começar, chips de variáveis (inclui `{detalhe}`), contador de caracteres (alerta acima de 700) e prévia com o primeiro cliente da amostra.
44. Passo 3: agora (dentro da janela) ou dia e hora, resumo (para quem, tamanho, quando) e `POST /api/envios` por segmento ou por destinos; toast com enfileirados e pulados.
45. Histórico agrupado por mensagem e dia (ou por `lote`, quando o servidor mandar) com enviadas / responderam / agendaram, "na fila" e falhas.
46. "Nova campanha" no topo da tela e na barra superior; a ficha do cliente abre a campanha já com ele escolhido.

Clientes

47. Busca por nome, telefone ou placa (`GET /api/clientes?q`) sem perder o foco; contadores (total, com aniversário, fora da lista).
48. Linha do cliente: avatar com iniciais, nome (abre a ficha), telefone formatado, carro + placa, aniversário com lápis e interruptor "Mensagens"; selo "não quer mensagens"; no celular vira duas linhas sem esmagar o nome.
49. Desligar mensagens pede confirmação com motivo opcional (`PUT {aceita_mensagens:false, motivo}`); religar é direto; o interruptor volta se cancelar.
50. Aniversário aceita DD/MM/AAAA ou só DD/MM (ano 1904 aparece como dia/mês).
51. Ficha em gaveta: próxima revisão em destaque (vencida fica laranja), serviços / faltas / satisfação, últimas mensagens com resposta e selo "agendou depois", satisfação com origem, últimos agendamentos com status legível; interruptor e aniversário na própria ficha; botão "Mandar mensagem".
52. Importar planilha continua (CSV ou colar do Excel), com prévia e avisos do servidor.

Satisfação

53. Quatro cartões: Satisfeitos (quantos vieram do WhatsApp sozinhos), Insatisfeitos, Satisfação % e Nota média.
54. Lista com origem (💬 WhatsApp automático ou ✍️ manual), estrelas, comentário, quem registrou e apagar.
55. Registro manual com busca de cliente (sugestões), botões Satisfeito/Insatisfeito, estrelas clicáveis (radiogroup) e comentário.

Ferramentas

56. `scripts/mock-server.mjs` (`npm run mock`, porta 3511): serve o `public/` real, dublê do Supabase já logado, todas as rotas com dados coerentes, modos `?papel=atendente` e `?saude=ok`; usa `renderTemplate`, `REGUAS`, `ROTULO_TIPO`, `SEGMENTOS`, `prazoDeRetorno`, `quandoRelativo` e `classificarResposta` do `dados.js` real.
57. `package.json` com `mock`, `dev` e `check`; README reescrito para o Comunicar.

### Como foi verificado (09/10/2026)

- `node --check` em app.js, sw.js, mock-server.mjs, server.js e dados.js; manifest e package.json parseados.
- Capturas com puppeteer-core + Chrome (desktop 1366×900 e celular 375×812 @2x): 30 telas/estados (as 6 telas, prévia, campanha nos 3 passos, ficha, aniversário, filtro de mensagens, tema claro) — zero rolagem lateral, zero erro de console.
- 50 fluxos automatizados contra o mock limpo: rodar agora, ecossistema, tema, atalhos, Tab preso, prévia por régua, teste de WhatsApp (sucesso e 502), chips, faixa numérica, descartar, regras inline (editar/adicionar), pausa geral, filtros/busca/cancelar/reenviar, ficha pela mensagem, campanha completa (segmento com valor, modelo, contador, sem data, na fila, histórico), clientes (busca, opt-out com motivo, religar, aniversário DD/MM, ficha → mandar mensagem, importar), satisfação manual, papel atendente (travas + 403), faixa de saúde + chave recusada, celular (pílulas, nome legível, grade sem rolagem).

## Motor e banco (09/10/2026) — Claude, coordenador

### Banco (migrações `comunicar_v1`, `comunicar_v1_1`, `endurecimento_indycar_2026_10_09`; cópias em `scripts/sql/`)
58. Consentimento do cliente: `clientes.aceita_mensagens` (+ data e motivo); quem responde PARAR no WhatsApp sai da lista sozinho.
59. Índice de aniversário por mês/dia (expressão IMMUTABLE com `extract`; `to_char` não serve).
60. Cinco réguas novas na configuração (lembrete, orçamento parado, não fechou, reativação, avaliação) com textos padrão no tom da casa.
61. Janela de envio configurável (início/fim), domingo opcional, pausa geral, intervalo mínimo entre mensagens de relacionamento e telefone de teste.
62. Fila guarda a resposta do cliente (texto, tom, quando), a conversa e o lead ligados, o agendamento que veio depois, tentativas e motivo de pulo; status novo `pulado`.
63. Checks de status/tipo ampliados e seis índices novos na fila (telefone, agendamento, lead, conversa, tipo, respondidas).
64. Satisfação com origem (manual × WhatsApp automático) e texto original da resposta.
65. Tabela `comunicar_regras_retorno`: prazo de revisão por tipo de serviço, 13 regras prontas (óleo 6 m, freios 12 m, correia 24 m…).
66. Tabela `comunicar_modelos`: 10 mensagens prontas (promoção, viagem, chuva, datas, avaliação…).
67. Gatilho `comunicar_registrar_resposta`: a resposta do cliente fecha o ciclo da mensagem (positiva/negativa/parar/neutra, com emojis).
68. PARAR desliga o cliente e pula na hora tudo o que estava na fila para ele.
69. Resposta ao pós-venda vira registro de satisfação automático (sem ninguém digitar).
70. Satisfeito + régua ligada → convite de avaliação no Google 3 minutos depois (dedupe por envio).
71. Gatilho `comunicar_atribuir_agendamento`: agendamento novo é atribuído à última mensagem enviada (até 21 dias) → métrica "agendaram pela mensagem" e receita.
72. pg_cron `comunicar-carteiro` acorda o servidor a cada 15 min (o GitHub Actions throttla para ~3 vezes/dia); token guardado no banco por script, nunca no chat.
73. Lote de campanha (`posvenda_envios.lote`) e última rodada do carteiro gravada no banco (o Render dorme e perde a memória).
74. Endurecimento: EXECUTE revogado de anon/authenticated em 14 funções SECURITY DEFINER que ainda estavam abertas via /rest/v1/rpc (gatilhos continuam disparando — testado como `authenticated` com JWT simulado).
75. `search_path` fixo nas 12 funções auxiliares de texto do banco.
76. 13 índices para chaves estrangeiras sem índice (conversas, leads, perfis, mensagens, etapas…).
77. Gatilhos testados em produção com bloco `DO` + `RAISE EXCEPTION` (auto-reverte): resposta positiva → satisfação; PARAR → opt-out + campanha pulada.

### Camada de dados (`dados.js`)
78. Utilidades puras: `agoraSP`, `instanteSP`, `quandoRelativo` ("hoje às 14:30", "amanhã às 09:00", "sexta-feira (13/10) às 09:00"), `prazoDeRetorno` (sem acento, por ordem), `classificarResposta` (espelho do gatilho), `semAcento`.
79. `renderTemplate` com `{quando}`, `{meses}`, `{link_avaliacao}`, `{detalhe}` e limpeza de espaços.
80. Porteiro de consentimento: opt-out grava `pulado` com motivo (transparência); intervalo mínimo só adia, nunca consome a chave única.
81. Régua lembrete de horário: X horas antes, só agendamentos aguardando/confirmado, nunca com menos de 1 h.
82. Régua orçamento parado: leads em `orcamento` sem movimento há N dias (janela de 7 dias, uma vez por lead).
83. Régua não fechou: N dias depois, só se o cliente não voltou.
84. Régua reativação: último serviço há N meses, sem voltar nem horário marcado, uma vez por ano.
85. Régua revisão refeita: vencimento por regra de serviço, janela de 7 dias, um convite por cliente, mensagem própria por regra.
86. Prévia/simulação de todas as réguas sem gravar nada (`gerarTudo({simular:true})`, também por régua) — é o "Quem receberia hoje" da tela.
87. Segmentos para campanhas (todos, aniversariantes do mês, atendidos em N dias, sem voltar há N meses, faltaram em 30 dias, fizeram um serviço) sempre sem quem pediu para não receber.
88. Ficha do cliente para o Comunicar: resumo 360, último serviço, próxima revisão prevista, últimas mensagens com resposta, satisfação, agendamentos.
89. Resumo do painel ampliado: 7 e 30 dias, respondidas, agendaram e receita atribuída, por régua, fila atrasada, próximas 48 h, fora da lista, nota média.
90. Reenviar mensagem que falhou, foi cancelada ou pulada; cancelar continua só para pendente.
91. Busca na fila por nome, telefone (com ou sem 55), texto e resposta; limite configurável.
92. Busca de clientes por telefone com/sem 55 e por placa; `fichaCliente`; regras de retorno e modelos com CRUD validado.
93. Histórico por cliente lido uma vez só (último serviço + última visita) para reativação e segmento "sem voltar" — sem N consultas.
94. Teste a seco de todas as consultas contra o banco real (nenhuma gravação) + 10 testes puros (`npm test`) + workflow `testes.yml`.

### Servidor (`server.js`)
95. Carteiro respeita janela, domingo e pausa geral; para a rodada em erro estrutural (chave/aparelho) devolvendo a mensagem à fila em vez de marcar tudo como falha; conta tentativas.
96. 401/403 do CodeWords vira texto claro ("chave recusada… troque em Atendimento › Integrações") em envio e em status; "HTTP 200 sem success" não é entrega.
97. Chave do CodeWords lida primeiro de `codewords_config` (quem o Atendimento atualiza) com `agenda_ia_config` de reserva; cache de 5 min; status do WhatsApp com cache de 60 s.
98. Rotas novas: `/api/saude` (vigia + última rodada), `/api/ping` público, `/api/previa`, `/api/segmentos(+/previa)`, `/api/envios/:id/reenviar`, `/api/envios/teste` (gestor, fora da fila), `/api/clientes/:id/ficha`, `/api/regras-retorno` CRUD, `/api/modelos`, `/api/comunicar/config` (o caminho antigo continua).
99. Campanha por segmento resolvida no servidor (não trafega 2 mil ids) com contagem de pulados e lote.
100. Só gestor/admin altera réguas, regras e manda teste (403 claro); papel `agenda` continua sem entrar.
101. Cabeçalhos de segurança, 413 para corpo grande, erros sempre em JSON, log só de chamadas lentas/erros, encerramento limpo em SIGTERM.
102. Estáticos: arquivo inexistente não vira index.html; imagens com cache de 1 dia, HTML/JS/SW sem cache; serviço no Render renomeado para "indycar-comunicar" (URL mantida).
