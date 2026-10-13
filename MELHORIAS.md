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


## Rodada 2 (09/10/2026)

IA escrevendo as mensagens

103. **Escrever com IA** em cada régua: botão ✨ junto das variáveis abre um painel que gera **3 variações** no tom da casa (curta, calorosa, sem preço/prazo), com pedido opcional ("mais curta…").
104. "Reescrever a atual": a IA melhora o texto que já está na caixa, mantendo a ideia.
105. Cada régua manda à IA o objetivo dela e **só as variáveis que o gerador preenche** (`{quando}` no lembrete, `{meses}` na revisão, `{link_avaliacao}` na avaliação…); variável obrigatória exigida.
106. Validação **por código** de tudo que a IA devolve: variável desconhecida, falta da obrigatória, chave solta, "prezado/efetuar/comparecer/veículo", preço (R$, reais, % de desconto), prazo ("fica pronto em 2 dias") e tamanho (480).
107. "veículo" vira "carro" sozinho (mantém maiúscula e plural) e a opção ganha o selo "corrigida"; repetidas somem; as que passam nas regras vêm primeiro.
108. Opção fora das regras aparece tracejada com o motivo ("⚠ fala de preço") — o atendente vê antes de usar.
109. Prévia de cada opção com as variáveis trocadas para o cliente de exemplo (o servidor troca com o mesmo `renderTemplate` do carteiro).
110. "Usar esta" põe o texto na régua, atualiza a prévia e liga a barra "alterações sem salvar" — nada é salvo sem o gestor clicar.
111. **Escrever com IA também na campanha** (passo 2), com a prévia no primeiro cliente do segmento escolhido.
112. Pedido e texto atual vão para a IA cercados por delimitador aleatório e marcados como DADO (nunca instrução).
113. Modelos lidos de `ia_config` (cache 60 s; reserva sonnet/opus/haiku); IA desligada, sem chave ou acima do limite do dia → mensagem clara (503/429), a tela não cai.
114. Chave: `ANTHROPIC_API_KEY` ou, se faltar, `agenda_ia_config.api_key` (service role, cache 5 min) — nunca volta pela API (`/api/ia/status` só diz `temChave`).
115. Cliente da IA por `fetch` puro com prompt caching no system, teto de tokens e timeout de 30 s; modelo que recusa ferramenta forçada (`tool_choice`) é repetido sozinho com `auto` (o sonnet 5.5 recusou na verificação real — corrigido e testado).

IA lendo as respostas

116. Migração aditiva **`comunicar_v1_2`**: `posvenda_envios.intencao` (com check), `intencao_em`, `intencao_resumo`, `encaminhado_em`, `mensagem_id` + 4 índices parciais; `posvenda_config.limite_por_hora`, `ia_resumo`, `ia_resumo_em`; advisors sem WARN novo.
117. O carteiro passa as respostas **neutras e negativas** (e as positivas de revisão/reativação/orçamento/não fechou/campanha, onde "quero" é pedido de horário) pela IA barata (**haiku**): quer_agendar, quer_orcamento, reclamacao, duvida, agradecimento, outro.
118. PARAR e "ficou ótimo" do pós-venda não gastam IA; cada resposta é lida uma vez só (janela de 72 h, 20 por rodada).
119. Quem quer agendar, quer orçamento ou reclamou → conversa marcada `aguardando_consultor=true` + `aguardando_desde` (sem sobrescrever quem já esperava) seguindo `ia_config.autonomia`: **automático** marca sozinho; **confirmar/sugerir** deixam a proposta e um clique "Passar ao Atendimento" marca.
120. Tudo vai para `ia_acoes` (origem `comunicar`): leitura, proposta, clique, erro, modelo, tokens e duração. A IA **nunca responde o cliente**.
121. Chave recusada (401) para a leitura na hora (não gasta as outras); erro da IA nunca para o carteiro.
122. Início ganha o cartão **"Quem respondeu"**: manchete "1 cliente quer agendar · 1 quer orçamento · 1 reclamou", chips por intenção e as últimas 6 respostas com Abrir conversa e Passar ao Atendimento.
123. Gestor tem "Ler respostas agora" (`POST /api/ia/ler-respostas`) sem esperar o carteiro.
124. Selo ✨ da intenção em cada mensagem (resumo da IA no `title`), botão "Passar ao Atendimento" no cartão e filtro "lidas pela IA" / por intenção na tela Mensagens.

IA sugerindo e resumindo

125. Campanha › passo 1: **"IA, quem devo chamar?"** — a IA olha os números (sem nome de cliente) e sugere UM segmento existente + valor + motivo + mensagem; o servidor já devolve quantos clientes caem nele.
126. Segmento inventado pela IA é recusado, valor numérico arredondado, segmento sem valor fica sem valor, mensagem sugerida passa pela mesma validação.
127. "Usar sugestão" escolhe o segmento e leva a mensagem pronta para o passo 2 — o atendente confirma tudo.
128. **Resumo da semana** no Início: um parágrafo da IA (o que funcionou, quem respondeu, o que fazer), gerado sob demanda e guardado **6 h** em `posvenda_config.ia_resumo`; "Atualizar" força um novo.
129. O resumo recebe `whatsapp_parado` do vigia — só fala de WhatsApp parado quando está mesmo (na verificação real apontou a chave do CodeWords recusada, certo).

Conectividade

130. "Abrir conversa" abre o cliente direto: `https://indycar-atendimento.onrender.com/?tel=<telefone sem 55>` (Mensagens, Início e ficha).
131. Ficha do cliente com links para **Conversa, CRM e Agenda** (`?cliente=<id>&tel=<telefone>`).
132. O que o carteiro envia **aparece no histórico da conversa do Atendimento**: linha em `whatsapp_mensagens` (saída, enviado, `gerada_por_ia=false`, cliente/lead/agendamento) — só depois de sair de verdade (falha não grava).
133. Marca de origem: `posvenda_envios.mensagem_id` aponta a linha (e evita gravar duas vezes); a linha fica sem `wamid` para a sincronia do Atendimento "adotar" quando o aparelho devolver — sem duplicar (gêmea testada no banco).
134. Só grava quando a conversa já existe — um parabéns não abre conversa, lead nem entra na fila de consultor.
135. Mensagem automática não "atende" a conversa: a espera do consultor e as não lidas voltam como estavam depois da linha de saída.
136. Selo "💬 no histórico" no cartão da mensagem.
137. **Alguém atendendo agora** → a régua espera 3 h: conversa esperando consultor ou última mensagem do cliente sem resposta nas últimas 2 h (motivo visível no cartão: "adiado: …").
138. Lembrete e avaliação não esperam (horário e resposta são agora); pós-venda, revisão, reativação, orçamento, não fechou, aniversário e campanha esperam.
139. **Feriados nacionais 2026–2027** (26 datas, com Carnaval, Sexta-feira Santa e Corpus Christi): pós-venda, revisão, reativação, orçamento e não fechou passam para o próximo dia útil (pula domingo se não envia), na hora de envio.
140. Teste de ponta a ponta no banco real em bloco revertido (`scripts/sql/teste-ciclo-comunicar.sql`): concluído há 2 dias → prévia do pós-venda → envio simulado → saída no histórico (aceita pelo `tocar_conversa`, sem duplicar) → "não ficou bom" → resposta negativa → satisfação negativa automática → aguardando consultor. `TESTE_REVERTIDO ok`, nada ficou no banco.

Carteiro

141. **Limite de envios por hora** configurável (Réguas › Envio, 1–500, padrão 60): o carteiro conta o que saiu na última hora e para no limite com aviso.
142. **Reenvio automático de falha passageira**: até 3 tentativas, esperando 5 e depois 15 min; número inválido/sem WhatsApp falha de vez na hora.
143. Erro estrutural (chave/aparelho) devolve a mensagem à fila **sem gastar tentativa**.
144. Reenviar manual zera as tentativas; envio com sucesso limpa o "adiado: …".
145. A rodada devolve `adiados`, `reagendados`, `feriado` e o resultado da leitura da IA (`ia`).
146. **`CARTEIRO_DESLIGADO=1`**: servidor local de conferência sem setInterval/setTimeout e sem rodada (nem gera, nem envia, nem grava) — `/api/rodar` e "Rodar agora" respondem o aviso.

Tela

147. **Prévia de celular fiel ao WhatsApp** (como o cliente vê): topo com a conta da oficina, fundo com textura, selo "HOJE", balão recebido com rabinho, hora, link azul e formatação `*negrito*` `_itálico_` `~riscado~` — nas réguas, na campanha e nas opções da IA; cores próprias no tema claro (verde do WhatsApp) e no escuro.
148. **Relatório por régua** (📊 em cada régua e no "Por régua" do Início): 8 semanas em barras (enviadas, responderam, agendaram), taxa de resposta e de agendamento, intenções lidas pela IA, seletor de régua, `aria-label` com os números.
149. **Exportar CSV** do histórico com os filtros da tela (status, tipo, busca, período, intenção): `;` + BOM (abre no Excel), datas no fuso de SP, fórmulas neutralizadas, até 5.000 linhas.
150. **Filtro por data** (de/até, no fuso da oficina) em Mensagens, com "limpar período" e aviso se "de" vier depois do "até".
151. **Desfazer cancelamento**: o toast "Mensagem cancelada" traz Desfazer (`POST /api/envios/:id/desfazer-cancelamento`), que devolve à fila no mesmo horário.
152. Toast com ação (botão dentro do recado).
153. Régua Aniversário com **"Puxar do CRM"**: quantos clientes da base compartilhada têm data (barra de progresso), aniversariantes dos próximos 30 dias e atendidos recentes sem data, com "Pôr data" direto.
154. **Ajuda curta** (botão "?" no topo e tecla `?`): réguas, IA, respeito ao cliente, falhas, Atendimento e atalhos.
155. Selo "✨ IA" em degradê, botão IA roxo e "pensando" com três pontos (respeita `prefers-reduced-motion`).
156. Em 375 px: opções da IA em coluna, período e CSV em linhas cheias, gráfico compacto — zero rolagem lateral (conferido).

API e testes

157. Rotas novas: `/api/ia/status`, `/api/ia/escrever`, `/api/ia/publico`, `/api/ia/resumo` (GET cache · POST gera), `/api/ia/ler-respostas`, `/api/intencoes`, `/api/relatorio`, `/api/aniversarios`, `/api/envios.csv`, `/api/envios/:id/encaminhar`, `/api/envios/:id/desfazer-cancelamento`; `/api/envios` aceita `de`, `ate`, `intencao`.
158. `ia.js` novo com o cliente da IA **injetável** (`definirClienteIA`) — 16 testes com IA falsa, sem gastar API (validação, correção, delimitador, 3 variações, leitura automática × confirmar, 401, público, resumo, repetição com `auto`, prompt caching).
159. `scripts/testes-rodada2.mjs`: 9 testes (feriados e móveis, próximo dia útil, falha transitória × definitiva, limite por hora, conversa ocupada, semanas do relatório no fuso de SP, CSV, aniversários). `npm test` = 35 testes passando.
160. `scripts/conferir-banco.mjs`: conferência só-leitura contra o banco real (16 consultas) e, com `--ia`/`--tudo`, as poucas chamadas reais de verificação.
161. Mock (`npm run mock`) com todas as rotas novas usando as funções REAIS do `ia.js` com cliente falso, intenções de exemplo e `?ia=off` para ver a IA fora do ar.
162. README atualizado (IA, conectividade, carteiro, `CARTEIRO_DESLIGADO`, testes).

### Como foi verificado (09/10/2026, rodada 2)

- `npm test`: 35/35. `npm run check` limpo.
- Banco real: migração `comunicar_v1_2` aplicada (cópia em `scripts/sql/`), advisors de segurança sem WARN novo; ciclo de ponta a ponta em bloco revertido (`TESTE_REVERTIDO ok`, conferido que nada ficou); 16 leituras reais pelo `conferir-banco.mjs`.
- IA real (poucas chamadas): escrever pós-venda (sonnet, 3/3 nas regras), quem chamar (sonnet), resumo da semana (sonnet), 3 classificações (haiku: reclamação, quer_agendar e uma tentativa de injeção tratada como dado → quer_orcamento).
- Servidor real local na 3510 com `CARTEIRO_DESLIGADO=1`: ping 200, rotas novas 401 sem login, `/api/rodar` 403 sem token, nenhuma rodada local (a última rodada no banco seguiu a do pg_cron); derrubado no fim.
- Mock na 3511, puppeteer + Chrome em 1440 e 375 px (e aba própria no painel): 56 verificações de fluxo — 54 ok; as 2 restantes só falham na 2ª largura porque o mock guarda em memória o "encaminhado" da 1ª (não é defeito). Zero erro de console, zero rolagem lateral.
163. Link vindo de outro app (?cliente=<uuid> ou ?tel=<telefone>, com ou sem 55) abre direto a ficha do cliente e limpa o telefone da barra de endereço.

## Rodada 3 (13/10/2026)

Login, perfil e acesso (padrão comum do ecossistema — `public/conta.js`)

164. Login com botão **mostrar/esconder senha** (`aria-pressed`, rótulo muda) no login, na senha nova e na troca de senha.
165. Aviso de **Caps Lock ligado** no login e na senha nova.
166. **Lembrar meu e-mail** (opcional) — volta preenchido no próximo acesso.
167. Mensagens claras no login: e-mail ou senha incorretos, sem internet, acesso desativado, muitas tentativas, e-mail não confirmado, senha fraca/vazada.
168. **Espera progressiva** depois de 5 erros seguidos (30 s, dobrando até 10 min) com contagem regressiva no botão; aviso a partir da 3ª tentativa.
169. **Esqueci a senha**: link por e-mail (`resetPasswordForEmail` com volta para o app), resposta igual exista ou não o e-mail, aviso do limite de e-mails do plano gratuito e da senha temporária pelo admin.
170. Volta do link do e-mail (`PASSWORD_RECOVERY`) abre direto a tela de senha nova.
171. **Troca obrigatória** (`perfis.precisa_trocar_senha`): a tela de senha nova vem antes do app e o servidor barra todas as rotas, menos as da conta, com `403 trocar_senha`; depois de trocar, o próprio app desliga a marca.
172. Senha nova: mínimo de 8, igual nas duas caixas, diferente do e-mail, com barra de força.
173. **Acesso por app**: exige `comunicar` em `perfis.apps` (admin sempre); papel `agenda` nunca entra; tela "Você não tem acesso a este app" com os botões dos apps que a pessoa pode usar e "Entrar com outra conta".
174. O **servidor** confere o mesmo em toda rota (403 `sem_acesso` com a lista de apps) — a tela não decide sozinha.
175. Desativado no meio do uso → `401 desativado` → volta ao login com o aviso (cache do login de 60 s, esquecido na hora em que o próprio perfil muda).
176. Token vencido: a tela renova a sessão uma vez e repete a chamada antes de pedir login de novo.
177. **Verificação em duas etapas (TOTP)** no menu: ligar com QR e chave para digitar, confirmar o código, desligar com confirmação; fator pela metade é limpo antes de ligar de novo.
178. Quem tem o fator ligado precisa do código depois da senha (`getAuthenticatorAssuranceLevel`); o servidor também exige (`401 mfa_pendente` enquanto o token for aal1).
179. **Menu da conta** no avatar: nome, papel, cargo e e-mail; navegação por setas, Esc e clique fora fecham; foco volta ao avatar.
180. **Meu perfil**: nome, cargo, telefone e cor do avatar (o avatar repinta na hora); e-mail só leitura; papel e apps o servidor ignora (só admin muda).
181. **Avisos que a pessoa quer** (reclamação, campanha para aprovar, régua com falhas, resumo semanal) gravados em `perfis.preferencias.notificacoes` sem apagar as preferências dos outros apps — respeitados pelo servidor e pelo gatilho do banco.
182. Trocar senha pelo menu, com as mesmas regras e mensagens.
183. **Sair** e **Sair de todos os aparelhos** (`signOut({ scope: 'global' })`, com confirmação).
184. **Último acesso**: o servidor grava `ultimo_acesso_em` e `ultimo_app='comunicar'` no máximo a cada 5 min por pessoa.
185. **Sino de notificações** no topo: contador (99+), lista com ícone por tipo, hora relativa, ponto nas não lidas, marcar lida ao abrir e "marcar todas como lidas".
186. Sino atualiza a cada 60 s e ao voltar para a aba, e assina o **tempo real** do Supabase (canal filtrado pelo meu perfil, toast na chegada) — o tempo real só dá para conferir com um login de verdade.
187. Link da notificação abre no app de origem; as do Comunicar abrem por dentro (`?cliente=` ficha, `?campanha=` aprovação em destaque, `?tela=mensagens&status=&tipo=` lista filtrada).
188. **Minhas tarefas** no topo: contador (laranja quando há vencida), lista por prioridade e prazo, concluir com um toque, criar com prazo.
189. Botão **Tarefa** na ficha do cliente: abre "Minhas tarefas" com a tarefa já ligada ao cliente.
190. Faixa **"para você"** no Início: suas tarefas (e quantas vencidas) e campanhas esperando aprovação (gestor) ou esperando o gestor (atendente).
191. `supabase-js` fixado em `2.45.4` (não muda de versão sozinho em produção).

Permissões finas e aprovação de campanha

192. Mapa único de permissões (`acesso.js › PERMISSOES`) e regra para **cada uma das 56 rotas** (`ROTAS`): rota sem regra = 404, permissão desconhecida = fechada; `/api/perfil` devolve o mapa `pode` para a tela.
193. Atendente manda **avulsa para UM cliente** (sai direto), com limite de 30 avulsas por hora por atendente.
194. Campanha de atendente para 2+ clientes vira **pedido "aguardando aprovação"** (`comunicar_campanhas`): nada entra na fila antes do gestor.
195. Os gestores recebem a notificação do pedido (quem propôs, quantos clientes, a mensagem) com link que abre a campanha em destaque.
196. Painel **"Para aprovar"** em Campanhas com Aprovar (confirmação) e Recusar (motivo); o atendente vê "Suas campanhas" e pode cancelar o pedido dele.
197. Ao aprovar, o segmento é resolvido de novo (quem saiu da lista no meio fica fora), as mensagens ficam com lote, `campanha_id` e contam como de quem propôs.
198. A decisão avisa quem propôs (aprovada com quantas na fila / recusada com o motivo); dois gestores clicando juntos não aprovam duas vezes (409).
199. Passo 3 da campanha avisa o atendente e o botão vira "Pedir aprovação".
200. "Rodar agora" e "Ler respostas agora" só gestor/admin (antes qualquer pessoa logada disparava o carteiro).
201. Exportar CSV (telefones de todos) só gestor/admin.
202. Importar planilha de clientes só gestor/admin.
203. Voltar a mandar para quem saiu da lista (opt-in) só gestor; tirar da lista qualquer um — o interruptor fica travado para o atendente.
204. Apagar registro de satisfação só gestor.
205. Atendente cancela, reenvia e desfaz só o que ele mesmo mandou; mensagem de régua ou de outra pessoa, só gestor.
206. A tela esconde o que a pessoa não pode (Rodar agora, CSV, importar, lixeira, cancelar alheio) e o 403 do servidor vira aviso claro.

Automações ligadas à equipe (`automacoes.js`)

207. Resposta lida pela IA como **quer agendar / quer orçamento / reclamação** vira **tarefa** para o dono da conversa (ou o gestor) com o contexto: régua, resposta do cliente, leitura da IA e o que fazer; prazo 2 h (agendar/reclamação, prioridade alta) ou 4 h (orçamento).
208. **Reclamação avisa todos os gestores na hora** (uma vez por mensagem).
209. Gatilho do banco **`comunicar_tarefa_da_resposta`**: "não ficou bom" no pós-venda vira tarefa + aviso aos gestores no instante da resposta (sem esperar IA nem carteiro); erro no gatilho nunca derruba a resposta do cliente.
210. Uma tarefa por mensagem (`posvenda_envios.tarefa_id`): a IA não duplica a tarefa que o gatilho já criou.
211. **Régua com 3 falhas em 24 h** avisa os gestores — uma vez por dia por régua, com o último erro.
212. **Resumo semanal do Comunicar** para os gestores como notificação (segunda a partir das 8h; se o servidor dormiu, sai no dia seguinte; uma vez por semana, sem nome de cliente).
213. O carteiro roda as automações da equipe mesmo com pausa geral, fora da janela ou no domingo (elas não falam com cliente).
214. O resultado da rodada mostra quantas tarefas e avisos a leitura da IA gerou.

Segurança do servidor

215. Cabeçalhos: **CSP** (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`, só os domínios usados), **HSTS** no Render, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy ampliada e COOP — também nos arquivos estáticos.
216. **CORS só do ecossistema** (Comunicar, Atendimento, CRM, Agenda, Orçador, Site e localhost): outra origem recebe 403; preflight 204.
217. JSON inválido = **400** (antes virava `{}` em silêncio); corpo grande = 413 sem derrubar a conexão.
218. **Limite por IP** (300/min) em toda a API e **por pessoa** (20/min) nas rotas caras (IA, campanha, teste, CSV, importar, rodar), com `Retry-After`.
219. Erro 500 **sem detalhe interno** (código de referência no log); erro da IA sem a mensagem crua do provedor.
220. Método errado = 405; estático só GET/HEAD; tempo-limite de cabeçalho e de requisição; caminho fora de `public/` = 404.
221. **Auditoria** (`registrar_auditoria`): régua ligada/desligada, pausa geral, textos/parâmetros alterados, regras de revisão, campanha (enviada, proposta, aprovada, recusada, cancelada), mensagem avulsa, envio de teste (telefone mascarado), exportar CSV (filtros e linhas), opt-out/opt-in do cliente, importação, cancelar/reenviar, rodar agora, apagar satisfação e senha trocada.
222. Segmento desconhecido devolve 400 claro (antes estourava 500).
223. `npm audit` com 0 vulnerabilidades (`package-lock.json` sem dependências) e **`npm run segredos`**: varre os arquivos versionados e os últimos 200 commits atrás de chaves (JWT, Anthropic, Render, GitHub, Stripe, chave privada, senha em URL) — limpo.
224. Workflow `testes.yml` roda sintaxe, testes, varredura de segredos e `npm audit` a cada push.

Conectividade

225. Toda mensagem manual grava **quem mandou** (`criado_por_id` = perfil, `criado_por` = nome); a tela mostra "✍ Leonardo", "✍ você" ou "automática".
226. Campanha grande entra na fila em lotes de 200 (antes era uma requisição por cliente).
227. Service worker `comunicar-v3` com o `conta.js` na casca.

Testes e ferramentas

228. `scripts/testes-rodada3.mjs` (31 testes): acesso por app e papel, matriz de permissões, rotas × handlers, limitador e último acesso com relógio injetável, segundo fator, campos do perfil, JSON/CORS/cabeçalhos e a **API de verdade** com dados falsos (aprovação ponta a ponta, opt-out, auditoria, limite 429, tarefas, 500 sem vazar) + automações com relógio injetável — `npm test` = **66 testes**.
229. Teste de ciclo no banco real em bloco revertido ampliado: agendamento concluído → pós-venda → "não ficou bom" → satisfação negativa + **tarefa para o dono da conversa + notificação a cada gestor + "nova tarefa" para o responsável**, sem duplicar na segunda resposta (`TESTE_REVERTIDO ok`).
230. `conferir-banco.mjs` com 9 leituras novas (gestores pela rpc, preferências, perfil, sino, tarefas, campanhas, falhas por régua, resumo da equipe, dono da conversa).
231. Mock (`npm run mock`) com o porteiro REAL (`acesso.js`), 9 papéis por `?papel=`, login de verdade por `?logado=0`, dublê do Supabase com senha/esqueci/duas etapas (código 123456), notificações, tarefas e campanhas para aprovar, `?semente=1`.
232. `npm run navegador`: roteiro puppeteer em 1440 e 375 px com **137 verificações** (admin, gestor, atendente, sem app, agenda, desativado, troca obrigatória, duas etapas, login e esqueci a senha) — zero erro de console e zero rolagem lateral.

Banco

233. Migração aditiva **`comunicar_aprovacao`**: `comunicar_campanhas` (RLS sem política, só o servidor), `posvenda_envios.criado_por_id/campanha_id/tarefa_id` com índices, `posvenda_config.resumo_equipe_em`, função `comunicar_gestores(tipo)` e o gatilho `comunicar_tarefa_da_resposta` (EXECUTE revogado de anon/authenticated); advisors sem WARN novo.

### Como foi verificado (13/10/2026, rodada 3)

- `npm test`: 66/66 · `npm run check` limpo · `npm run segredos` limpo · `npm audit`: 0.
- Banco real: migração aplicada; ciclo completo em bloco revertido (`TESTE_REVERTIDO ok | … tarefa p/ dono da conversa | 2 notificação(ões) de reclamação | aguardando=t`), conferido que nada ficou; `conferir-banco.mjs` com as leituras da rodada 3 (todas ✔).
- Servidor real local na 3510 com `CARTEIRO_DESLIGADO=1`: ping 200, 401 sem login e com token falso, 403 no carteiro sem token, 404/405, CORS (403 de fora, cabeçalho para o ecossistema, preflight 204), CSP e cabeçalhos no HTML, travessia 404, POST no estático 405; a tela abre em 1440/375 com a CSP sem bloquear supabase-js nem fontes.
- Mock na 3511 + puppeteer: 137/137 verificações em 1440 e 375 px.
