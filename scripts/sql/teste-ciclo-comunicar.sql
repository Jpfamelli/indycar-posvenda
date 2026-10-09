-- Teste de ponta a ponta do ciclo do Comunicar no banco REAL, sem deixar rastro:
-- tudo roda dentro de um bloco DO que termina com RAISE EXCEPTION (auto-reverte).
--   concluído há 2 dias → entra na prévia do pós-venda → envio simulado →
--   linha no histórico do Atendimento (gatilho tocar_conversa aceita a saída) →
--   cliente responde "não ficou bom" → satisfação negativa → aguardando consultor.
-- Resultado esperado: ERROR "TESTE_REVERTIDO ok | ..." (o "ok" é o sucesso).
do $$
declare
  v_tel text := '12900009' || lpad((floor(random()*1000))::int::text, 3, '0');
  v_cli uuid; v_ag uuid; v_env uuid; v_conv uuid; v_msg uuid; v_n int; v_e record; v_sat record; v_c record;
begin
  insert into public.clientes (nome, telefone, origem) values ('Teste Ciclo Comunicar', v_tel, 'organico') returning id into v_cli;

  -- o cliente já conversou antes (a conversa existe no Atendimento)
  insert into public.whatsapp_mensagens (telefone, nome, corpo, direcao, status, created_at)
  values (v_tel, 'Teste Ciclo Comunicar', 'Bom dia, queria marcar uma revisão', 'entrada', 'recebido', now() - interval '3 days');
  select id into v_conv from public.conversas where telefone_e164 = public.normalizar_telefone(v_tel);
  if v_conv is null then raise exception 'FALHOU: conversa não nasceu'; end if;
  -- alguém respondeu na época (senão a conversa conta como "esperando")
  insert into public.whatsapp_mensagens (telefone, corpo, direcao, status, conversa_id, created_at)
  values (v_tel, 'Bom dia! Temos horário amanhã às 9h.', 'saida', 'enviado', v_conv, now() - interval '3 days' + interval '5 minutes');

  -- 1) serviço concluído há 2 dias
  insert into public.agendamentos (cliente_id, cliente_nome, telefone, servico, veiculo, data, hora, status)
  values (v_cli, 'Teste Ciclo Comunicar', v_tel, 'Troca de pastilha de freio', 'HB20', current_date - 2, '09:00', 'concluido')
  returning id into v_ag;

  -- 2) prévia do pós-venda: o mesmo filtro do gerador (concluído, de hoje-7 até hoje-dias_posvenda)
  select count(*) into v_n from public.agendamentos a, public.posvenda_config c
   where c.id and a.id = v_ag and a.status = 'concluido'
     and a.data between current_date - c.dias_posvenda - 5 and current_date - c.dias_posvenda;
  if v_n <> 1 then raise exception 'FALHOU: agendamento fora da prévia do pós-venda (dias_posvenda diferente de 2?)'; end if;

  -- 3) o carteiro enfileira e "envia" (simulado: só muda o status)
  insert into public.posvenda_envios (cliente_id, agendamento_id, telefone, nome, tipo, corpo, chave_unica, criado_por)
  values (v_cli, v_ag, v_tel, 'Teste Ciclo Comunicar', 'posvenda',
          'Oi Teste! Ficou tudo certo com o HB20 depois do serviço de troca de pastilha de freio?', 'posvenda:' || v_ag, 'gerador')
  returning id into v_env;
  update public.posvenda_envios set status = 'enviado', enviado_em = now(), tentativas = 1 where id = v_env;

  -- 4) a mensagem aparece no histórico da conversa do Atendimento (o que registrarNoHistorico faz)
  insert into public.whatsapp_mensagens (conversa_id, cliente_id, agendamento_id, telefone, nome, corpo, direcao, status, gerada_por_ia)
  values (v_conv, v_cli, v_ag, v_tel, 'Teste Ciclo Comunicar',
          'Oi Teste! Ficou tudo certo com o HB20 depois do serviço de troca de pastilha de freio?', 'saida', 'enviado', false)
  returning id into v_msg;
  if v_msg is null then raise exception 'FALHOU: tocar_conversa descartou a saída do Comunicar'; end if;
  update public.posvenda_envios set mensagem_id = v_msg, conversa_id = v_conv where id = v_env;
  select count(*) into v_n from public.whatsapp_mensagens where id = v_msg and conversa_id = v_conv and direcao = 'saida';
  if v_n <> 1 then raise exception 'FALHOU: saída não ficou na conversa'; end if;
  -- e não duplica: a mesma saída de novo (ex.: a sincronia do aparelho) é descartada como gêmea
  insert into public.whatsapp_mensagens (conversa_id, telefone, corpo, direcao, status)
  values (v_conv, v_tel, 'Oi Teste! Ficou tudo certo com o HB20 depois do serviço de troca de pastilha de freio?', 'saida', 'enviado');
  select count(*) into v_n from public.whatsapp_mensagens where conversa_id = v_conv and direcao = 'saida' and corpo like 'Oi Teste! Ficou tudo certo%';
  if v_n <> 1 then raise exception 'FALHOU: saída duplicou (% linhas)', v_n; end if;

  -- 5) o cliente responde "não ficou bom"
  insert into public.whatsapp_mensagens (telefone, corpo, direcao, status, conversa_id)
  values (v_tel, 'Não ficou bom, continua o barulho no freio', 'entrada', 'recebido', v_conv);

  select resposta_tipo, respondido_em is not null as respondeu into v_e from public.posvenda_envios where id = v_env;
  if v_e.resposta_tipo is distinct from 'negativa' then raise exception 'FALHOU: resposta classificada como %', v_e.resposta_tipo; end if;

  -- 6) satisfação negativa automática
  select satisfeito, origem into v_sat from public.posvenda_respostas where envio_id = v_env;
  if v_sat.satisfeito is distinct from false or v_sat.origem <> 'whatsapp' then raise exception 'FALHOU: satisfação não registrada como negativa'; end if;

  -- 7) a IA lê "reclamacao" e passa ao consultor (o que chamarConsultor + gravarIntencao fazem)
  update public.posvenda_envios set intencao = 'reclamacao', intencao_em = now(), intencao_resumo = 'barulho no freio voltou', encaminhado_em = now() where id = v_env;
  update public.conversas set aguardando_consultor = true, aguardando_desde = now() where id = v_conv and not aguardando_consultor;
  select aguardando_consultor, aguardando_desde into v_c from public.conversas where id = v_conv;
  if not v_c.aguardando_consultor or v_c.aguardando_desde is null then raise exception 'FALHOU: conversa não ficou aguardando consultor'; end if;

  raise exception 'TESTE_REVERTIDO ok | conversa % | saída % no histórico | resposta % | satisfeito=% | aguardando=%',
    v_conv, v_msg, v_e.resposta_tipo, v_sat.satisfeito, v_c.aguardando_consultor;
end $$;
