// ============================================================================
// Servidor de MENTIRA para mexer na tela do Comunicar sem login e sem dado
// real de cliente.
//
//   npm run mock   (ou  node scripts/mock-server.mjs)  → http://localhost:3511
//   abra  http://localhost:3511/?papel=atendente  para ver o modo "só olha"
//   abra  http://localhost:3511/?saude=ok         para esconder a faixa de saúde
//
// Serve a pasta public/ de verdade (o mesmo index.html, app.js e styles.css que
// vão para produção) e responde /api/* com dados inventados, guardados na
// memória. A única coisa trocada no HTML é a biblioteca do Supabase, que vira um
// dublê "já logado". NUNCA é usado em produção: o Render sobe o server.js.
//
// As funções puras vêm do dados.js REAL (renderTemplate, prazoDeRetorno…), para
// o que se vê aqui ser o que vai ao ar.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderTemplate, REGUAS, ROTULO_TIPO, SEGMENTOS, prazoDeRetorno, quandoRelativo,
  classificarResposta, hoje, somarDias, paraCSV, COLUNAS_CSV_ENVIOS, montarRelatorio, montarAniversarios,
  instanteSP, dataBanco,
} from '../dados.js';
import * as ia from '../ia.js';

/* IA de MENTIRA: o mock usa as funções REAIS do ia.js (validação, correção de
   vocabulário, prévia) com um cliente falso — nada vai para a Anthropic. */
const VARIACOES_FALSAS = {
  lembrete: ['Oi {primeiro_nome}! Passando para lembrar do seu horário {quando} para {servico}. Confirma pra mim? Se precisar remarcar, é só responder. 🏁',
    'Oi {primeiro_nome}, tudo certo? Seu horário na IndyCar é {quando}. Posso confirmar?', 'Lembrete: {quando} tem {servico} do seu veículo aqui na IndyCar. Confirma? 🔧'],
  posvenda: ['Oi {primeiro_nome}! Ficou tudo certo com o {carro} depois do {servico}? Qualquer coisa é só responder aqui. 🔧',
    'Oi {primeiro_nome}, aqui é da IndyCar! Como o {carro} está rodando depois do serviço? Me conta por aqui.', 'Prezado {nome}, como ficou o serviço?'],
  campanha: ['Oi {primeiro_nome}! Que tal um check-up no {carro} antes das férias? O diagnóstico digital é gratuito, leva uns 30 min. Quer agendar? 🏁',
    'Oi {primeiro_nome}, tudo bem? A IndyCar está com horários livres esta semana para o {carro}. Posso reservar um pra você?', 'Oi {primeiro_nome}! Troca de óleo por R$ 199 só esta semana!'],
};
let IA_LIGADA = true;
ia.definirClienteIA({
  async criar(args) {
    await new Promise((r) => setTimeout(r, 650));
    if (!IA_LIGADA) throw Object.assign(new Error('A chave da IA foi recusada (401).'), { status: 401 });
    const pedido = args.mensagens?.[0]?.content || '';
    const nome = args.escolha?.name;
    if (nome === 'propor_mensagens') {
      const regua = (pedido.match(/régua "(\w+)"/) || [])[1] || 'campanha';
      const base = VARIACOES_FALSAS[regua] || VARIACOES_FALSAS.campanha.map((t) => t.replace('{carro}', '{carro}'));
      const extra = regua === 'avaliacao' ? ['Que bom que gostou, {primeiro_nome}! 🙌 Uma avaliação rápida no Google ajuda demais: {link_avaliacao}', 'Obrigado pela confiança, {primeiro_nome}! Se puder, deixa sua nota: {link_avaliacao}', 'Valeu, {primeiro_nome}! Avalia a gente? {link_avaliacao}'] : base;
      return { conteudo: [{ type: 'tool_use', name: nome, input: { variacoes: extra } }], uso: {}, modelo: args.modelo, ms: 650 };
    }
    if (nome === 'sugerir') {
      return { conteudo: [{ type: 'tool_use', name: nome, input: { segmento: 'sem_voltar', valor: 6, motivo: '4 clientes estão há mais de 6 meses sem voltar e 2 das últimas campanhas de revisão viraram agendamento.', mensagem: 'Oi {primeiro_nome}! Faz um tempinho que o {carro} não passa aqui. Que tal um diagnóstico digital gratuito, uns 30 min com scanner? É só responder para agendar. 🏁' } }], uso: {}, modelo: args.modelo, ms: 650 };
    }
    return { conteudo: [{ type: 'text', text: 'Semana boa no Comunicar: 9 mensagens saíram e 5 clientes responderam (56%). A campanha de freios na chuva foi a que mais rendeu — um cliente já pediu horário para sábado. O ponto de atenção é o pós-venda do Donizetti, que reclamou de barulho na roda: vale ligar hoje. Para esta semana, ligue a régua Reativação: há 4 clientes sumidos há mais de 6 meses.' }], uso: {}, modelo: args.modelo, ms: 650 };
  },
});

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3511);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const agora = () => new Date().toISOString();
const horasAtras = (h) => new Date(Date.now() - h * 3600000).toISOString();
const diasAtras = (d) => new Date(Date.now() - d * 86400000).toISOString();
const hojeAs = (hm) => new Date(`${hoje()}T${hm}:00-03:00`).toISOString();
const mes = hoje().slice(5, 7);

// ---- clientes -------------------------------------------------------------
const cli = (o) => ({ id: uuid(), telefone:'12999990000', carro:null, carro_modelo:null, placa:null, email:null, nascimento:null,
  aceita_mensagens:true, aceita_mensagens_em:null, aceita_mensagens_motivo:null, observacoes:null, created_at: diasAtras(300), ...o });
const CLIENTES = [
  cli({ nome:'Maria Aparecida Souza', telefone:'12999990001', carro:'HB20 2019', carro_modelo:'HB20', placa:'FHR6F16', nascimento:`1988-${mes}-14` }),
  cli({ nome:'Carlos Eduardo Nogueira', telefone:'12999990002', carro:'Corolla 2021', carro_modelo:'Corolla', placa:'GFK3H26', nascimento:'1975-03-02' }),
  cli({ nome:'Donizetti Ferreira', telefone:'12999990003', carro:'ix35 2016', carro_modelo:'ix35', placa:'EVR2C44', nascimento:`1904-${mes}-27` }),
  cli({ nome:'Patrícia Lemos', telefone:'12999990004', carro:'Onix 2020', carro_modelo:'Onix', placa:'RKA1D23', nascimento:'1992-11-09' }),
  cli({ nome:'Diogo Barros', telefone:'12999990005', carro:'Tracker 2022', carro_modelo:'Tracker', placa:'SRT4E55' }),
  cli({ nome:'Renata Figueiredo de Albuquerque Monteiro', telefone:'12999990006', carro:'Compass 2019', carro_modelo:'Compass', placa:'FZX7A88', nascimento:`1980-${mes}-03` }),
  cli({ nome:'Vanderlei Santos', telefone:'12999990007', carro:'City 2018', carro_modelo:'City', placa:'FHR6F16', aceita_mensagens:false,
    aceita_mensagens_em: diasAtras(12), aceita_mensagens_motivo:'pediu pelo WhatsApp: PARAR' }),
  cli({ nome:'José Antônio Ribeiro', telefone:'12999990008', carro:'S10 2017', carro_modelo:'S10', placa:'DKL9B11', nascimento:'1968-07-21' }),
  cli({ nome:'Luciana Prado', telefone:'12999990009', carro:'Fit 2015', carro_modelo:'Fit', placa:'EJM3F77', nascimento:`1990-${mes}-30` }),
  cli({ nome:'Marcos Vinícius', telefone:'12999990010', carro:'Gol 2014', carro_modelo:'Gol', placa:'DTZ5G66' }),
  cli({ nome:'Sueli Martins', telefone:'12999990011', carro:'Civic 2020', carro_modelo:'Civic', placa:'RUV8H99', nascimento:'1983-05-05' }),
  cli({ nome:'Sem Telefone da Silva', telefone:null, carro:'Palio 2010', carro_modelo:'Palio' }),
  cli({ nome:'Bruno Henrique', telefone:'12999990013', carro:'Kicks 2021', carro_modelo:'Kicks', placa:'SNB2J33', aceita_mensagens:false,
    aceita_mensagens_em: diasAtras(40), aceita_mensagens_motivo:'desligado no painel por João Pedro: pediu no balcão' }),
];
const porId = (id) => CLIENTES.find((c) => c.id === id);
const C = (i) => CLIENTES[i];

// ---- config ---------------------------------------------------------------
const CFG = {
  ativo_lembrete:true, ativo_posvenda:true, ativo_avaliacao:true, ativo_retorno:true, ativo_aniversario:true,
  ativo_orcamento:false, ativo_nao_fechou:false, ativo_reativacao:false,
  msg_lembrete:'Oi {primeiro_nome}! Lembrete da IndyCar: seu horário para {servico} é {quando}. Posso confirmar? Se precisar remarcar, é só responder por aqui. 🏁',
  msg_posvenda:'Oi {primeiro_nome}! Aqui é da IndyCar. Ficou tudo certo com o {carro} depois do serviço de {servico}? Qualquer coisa, é só responder por aqui. 🔧',
  msg_avaliacao:'Que bom que ficou tudo certo, {primeiro_nome}! 🙌 Se puder, deixa uma avaliação rápida no Google, ajuda muito a gente: {link_avaliacao}',
  msg_retorno:'Oi {primeiro_nome}! Já faz {meses} meses que fizemos {servico} no {carro}. Que tal agendar a revisão? É só responder por aqui. 🏁',
  msg_aniversario:'Feliz aniversário, {primeiro_nome}! 🎂 A equipe da IndyCar deseja um dia incrível. Quem conhece, Indyca! 🏎',
  msg_orcamento:'Oi {primeiro_nome}, aqui é da IndyCar! Conseguiu dar uma olhada no orçamento do {carro}? Se ficou alguma dúvida, me chama por aqui que a gente resolve junto. 🔧',
  msg_nao_fechou:'Oi {primeiro_nome}! Passando para saber se ainda posso ajudar com o {carro}. Quando quiser retomar, é só me chamar por aqui, sem compromisso. 🏁',
  msg_reativacao:'Oi {primeiro_nome}, tudo bem? Faz um tempo que a gente não vê o {carro} por aqui. Que tal um check-up gratuito de 30 min com scanner? É só responder por aqui para agendar. 🏁',
  dias_posvenda:2, meses_retorno:6, horas_lembrete:20, dias_orcamento:3, dias_nao_fechou:7, meses_reativacao:12,
  intervalo_minimo_dias:7, janela_inicio:8, janela_fim:20, hora_envio:'09:30', link_avaliacao:'https://g.page/r/indycar-taubate/review',
  envia_domingo:false, pausa_geral:false, telefone_teste:'12988887777', carteiro_configurado:true, updated_at: diasAtras(3),
  limite_por_hora:60, ia_resumo:null, ia_resumo_em:null,
};

// ---- regras de retorno e modelos (iguais ao SQL da migração) ---------------
const regra = (rotulo, palavras, meses, ordem, extra = {}) => ({ id: uuid(), rotulo, palavras, meses, mensagem:'', ativo:true, ordem, ...extra });
let REGRAS = [
  regra('Troca de óleo do motor', ['óleo', 'oleo', 'lubrifica'], 6, 10),
  regra('Filtros', ['filtro'], 6, 20),
  regra('Alinhamento e balanceamento', ['alinhamento', 'balanceamento', 'cambagem', 'caster'], 6, 30),
  regra('Freios', ['freio', 'pastilha', 'disco', 'lona', 'sapata'], 12, 40),
  regra('Suspensão e direção', ['suspens', 'amortecedor', 'pivô', 'bucha', 'terminal', 'bandeja'], 12, 50),
  regra('Correia dentada', ['correia', 'tensor'], 24, 60, { mensagem:'Oi {primeiro_nome}! A correia dentada do {carro} já tem {meses} meses — vale conferir antes que vire dor de cabeça. Posso agendar? 🏁' }),
  regra('Pneus', ['pneu', 'rodízio', 'rodizio'], 12, 70),
  regra('Bateria', ['bateria'], 18, 80, { ativo:false }),
  regra('Revisão e diagnóstico', ['revis', 'check', 'diagn', 'scanner'], 6, 140),
];
const MODELOS = [
  ['Promoção de troca de óleo', 'promoção', 'Oi {primeiro_nome}! Essa semana a IndyCar está com condição especial na troca de óleo com filtro. Quer garantir um horário para o {carro}? É só responder por aqui. 🏁'],
  ['Check-up antes de viajar', 'sazonal', 'Oi {primeiro_nome}! Vai pegar estrada no feriado? A IndyCar faz um check-up de viagem com scanner em 30 min, sem custo. Quer reservar um horário para o {carro}? 🛣️'],
  ['Freios na época de chuva', 'sazonal', 'Oi {primeiro_nome}, com as chuvas chegando vale conferir freios e pneus do {carro}. A gente faz a avaliação gratuita e só mexe no que precisar. Posso agendar? 🌧️'],
  ['Dia do Cliente', 'datas', 'Hoje é o Dia do Cliente e a IndyCar quer agradecer você, {primeiro_nome}! Obrigado pela confiança. Quem conhece, Indyca! 🏎️'],
  ['Fim de ano', 'datas', 'Oi {primeiro_nome}! A equipe da IndyCar Centro Automotivo deseja a você e à sua família um Natal cheio de paz e um ano novo de estradas tranquilas. 🎄🏁'],
  ['Convite para avaliar no Google', 'relacionamento', 'Oi {primeiro_nome}! Se o atendimento da IndyCar foi bom para você, uma avaliação rápida no Google ajuda muito a gente a crescer. Obrigado! ⭐'],
  ['Aviso de horário especial', 'aviso', 'Oi {primeiro_nome}! Avisando que a IndyCar terá horário especial: {detalhe}. Qualquer coisa, é só chamar por aqui. 🏁'],
  ['Reagendar quem faltou', 'relacionamento', 'Oi {primeiro_nome}, sentimos sua falta no horário de hoje. Aconteceu algum imprevisto? Me diz um dia e horário bons para você que eu reservo de novo. 🏁'],
  ['Pesquisa rápida', 'relacionamento', 'Oi {primeiro_nome}! De 0 a 10, quanto você indicaria a IndyCar para um amigo? Sua resposta ajuda a gente a melhorar. 🙏'],
].map(([titulo, categoria, corpo], i) => ({ id: uuid(), titulo, categoria, corpo, ordem:(i + 1) * 10 }));

// ---- agendamentos (só para a ficha) ------------------------------------------
const AG = [
  { cliente: C(0), servico:'Troca de óleo e filtro', data: somarDias(hoje(), -170), status:'concluido', valor:380 },
  { cliente: C(0), servico:'Alinhamento 3D', data: somarDias(hoje(), -40), status:'concluido', valor:150 },
  { cliente: C(0), servico:'Revisão de freios', data: somarDias(hoje(), 1), hora:'09:00', status:'confirmado', valor:0 },
  { cliente: C(1), servico:'Troca de óleo de câmbio (diálise)', data: somarDias(hoje(), -3), status:'concluido', valor:890 },
  { cliente: C(2), servico:'Pastilha de freio', data: somarDias(hoje(), -2), status:'concluido', valor:420 },
  { cliente: C(3), servico:'Revisão de suspensão', data: somarDias(hoje(), -2), status:'nao_fechou', valor:0 },
  { cliente: C(4), servico:'Alinhamento 3D', data: somarDias(hoje(), -1), status:'nao_veio', valor:0 },
  { cliente: C(5), servico:'Correia dentada', data: somarDias(hoje(), -735), status:'concluido', valor:1250 },
  { cliente: C(7), servico:'Troca de embreagem', data: somarDias(hoje(), -400), status:'concluido', valor:2100 },
  { cliente: C(8), servico:'Troca de amortecedores', data: somarDias(hoje(), -365), status:'concluido', valor:1400 },
  { cliente: C(10), servico:'Troca de óleo de motor', data: somarDias(hoje(), -183), status:'concluido', valor:360 },
  { cliente: C(10), servico:'Diagnóstico com scanner', data: somarDias(hoje(), 0), hora:'15:30', status:'aguardando', valor:0 },
].map((a) => ({ id: uuid(), hora:'10:00', veiculo: a.cliente.carro, placa: a.cliente.placa, ...a }));

// ---- envios ---------------------------------------------------------------
const env = (c, tipo, extra = {}) => {
  const base = { id: uuid(), cliente_id: c?.id ?? null, agendamento_id:null, lead_id:null, telefone: c?.telefone ?? extra.telefone, nome: c?.nome ?? extra.nome,
    tipo, lote:null, status:'pendente', erro:null, enviado_em:null, respondido_em:null, resposta:null, resposta_tipo:null, agendou_depois_id:null,
    tentativas:0, motivo_pulado:null, criado_por:'gerador', created_at: diasAtras(1), enviar_em: hojeAs(CFG.hora_envio) };
  const e = { ...base, ...extra };
  if (!e.corpo) e.corpo = renderTemplate(CFG[`msg_${tipo}`] || 'Oi {primeiro_nome}!', { nome: e.nome, carro: c?.carro, placa: c?.placa, servico:'troca de óleo', meses: CFG.meses_retorno, quando: quandoRelativo(somarDias(hoje(), 1), '09:00'), link_avaliacao: CFG.link_avaliacao });
  if (e.resposta && !e.resposta_tipo) e.resposta_tipo = classificarResposta(e.resposta);
  return e;
};
const enviado = (h, extra = {}) => ({ status:'enviado', enviado_em: horasAtras(h), enviar_em: horasAtras(h + 0.2), created_at: horasAtras(h + 1), tentativas:1, ...extra });
let ENVIOS = [
  env(C(0), 'lembrete', { corpo: renderTemplate(CFG.msg_lembrete, { nome:C(0).nome, carro:C(0).carro, servico:'revisão de freios', quando: quandoRelativo(somarDias(hoje(), 1), '09:00') }), enviar_em: horasAtras(-2) }),
  env(C(10), 'lembrete', { corpo: renderTemplate(CFG.msg_lembrete, { nome:C(10).nome, carro:C(10).carro, servico:'diagnóstico com scanner', quando: quandoRelativo(hoje(), '15:30') }), ...enviado(3, { resposta:'Confirmado, obrigado!', respondido_em: horasAtras(2.5) }) }),
  env(C(1), 'posvenda', { corpo: renderTemplate(CFG.msg_posvenda, { nome:C(1).nome, carro:C(1).carro, servico:'troca de óleo de câmbio' }), ...enviado(26, { resposta:'Ficou ótimo, carro tá outro! 👍', respondido_em: horasAtras(25) }) }),
  env(C(1), 'avaliacao', { corpo: renderTemplate(CFG.msg_avaliacao, { nome:C(1).nome, link_avaliacao: CFG.link_avaliacao }), criado_por:'gatilho', ...enviado(24.9) }),
  env(C(2), 'posvenda', { corpo: renderTemplate(CFG.msg_posvenda, { nome:C(2).nome, carro:C(2).carro, servico:'pastilha de freio' }), ...enviado(27, { resposta:'Não ficou bom, continua com barulho na roda', respondido_em: horasAtras(26), intencao:'reclamacao', intencao_resumo:'barulho na roda voltou depois da pastilha', intencao_em: horasAtras(25.8), mensagem_id: uuid() }) }),
  env(C(3), 'nao_fechou', { ...enviado(50) }),
  env(C(5), 'retorno', { corpo: renderTemplate(REGRAS[5].mensagem, { nome:C(5).nome, carro:C(5).carro, meses:24, servico:'correia dentada' }), ...enviado(72, { agendou_depois_id: uuid() }) }),
  env(C(8), 'retorno', { corpo: renderTemplate(CFG.msg_retorno, { nome:C(8).nome, carro:C(8).carro, meses:12, servico:'troca de amortecedores' }), ...enviado(96, { agendou_depois_id: uuid() }) }),
  env(C(0), 'aniversario', { corpo: renderTemplate(CFG.msg_aniversario, { nome:C(0).nome, carro:C(0).carro }), enviar_em: hojeAs('09:30') }),
  env(C(6), 'aniversario', { status:'pulado', motivo_pulado:'cliente pediu para não receber mensagens' }),
  env(C(9), 'reativacao', { status:'falhou', erro:'O CodeWords respondeu 500: device offline', tentativas:2, enviar_em: diasAtras(1), created_at: diasAtras(1) }),
  env(C(4), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(4).nome, carro:C(4).carro }), criado_por:'João Pedro', ...enviado(120) }),
  env(C(7), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(7).nome, carro:C(7).carro }), criado_por:'João Pedro', ...enviado(120, { resposta:'Quero sim, pode ser sábado?', respondido_em: horasAtras(118), agendou_depois_id: uuid(), intencao:'quer_agendar', intencao_resumo:'quer horário no sábado', intencao_em: horasAtras(117.8), encaminhado_em: horasAtras(117.8) }) }),
  env(C(10), 'campanha', { corpo: renderTemplate(MODELOS[2].corpo, { nome:C(10).nome, carro:C(10).carro }), criado_por:'João Pedro', ...enviado(120, { resposta:'PARAR', respondido_em: horasAtras(119) }) }),
  env(C(3), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(3).nome, carro:C(3).carro }), criado_por:'Leonardo', status:'cancelado', enviar_em: diasAtras(9), created_at: diasAtras(9) }),
  env(C(8), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(8).nome, carro:C(8).carro }), criado_por:'Leonardo', ...enviado(216) }),
  env(C(1), 'campanha', { corpo: renderTemplate(MODELOS[0].corpo, { nome:C(1).nome, carro:C(1).carro }), criado_por:'Leonardo', ...enviado(216, { resposta:'Obrigado, por enquanto não', respondido_em: horasAtras(210), intencao:'agradecimento', intencao_em: horasAtras(209.8) }) }),
  env(C(9), 'retorno', { corpo: renderTemplate(CFG.msg_retorno, { nome:C(9).nome, carro:C(9).carro, meses:6, servico:'troca de óleo' }), ...enviado(30, { resposta:'Quanto fica a revisão completa?', respondido_em: horasAtras(28), intencao:'quer_orcamento', intencao_resumo:'pergunta o preço da revisão', intencao_em: horasAtras(27.9), mensagem_id: uuid() }) }),
  env(C(11), 'avulsa', { corpo:'Oi Bruno! Sua peça chegou, pode trazer o carro amanhã de manhã. 🏁', criado_por:'Leonardo', ...enviado(5) }),
  env(null, 'avulsa', { telefone:'12988887777', nome:'Teste (João Pedro)', corpo:'Teste do IndyCar Comunicar: se você recebeu isto, o WhatsApp está saindo. 🏁', criado_por:'João Pedro', ...enviado(30) }),
  env(C(10), 'orcamento', { status:'pendente', enviar_em: horasAtras(3), created_at: horasAtras(4) }),
];

// ---- satisfação -----------------------------------------------------------
let RESPOSTAS = [
  { id: uuid(), cliente_id:C(1).id, envio_id: ENVIOS[2].id, satisfeito:true, nota:null, comentario:'Ficou ótimo, carro tá outro! 👍', registrado_por:'WhatsApp (automático)', origem:'whatsapp', created_at: horasAtras(25) },
  { id: uuid(), cliente_id:C(2).id, envio_id: ENVIOS[4].id, satisfeito:false, nota:null, comentario:'Não ficou bom, continua com barulho na roda', registrado_por:'WhatsApp (automático)', origem:'whatsapp', created_at: horasAtras(26) },
  { id: uuid(), cliente_id:C(3).id, envio_id:null, satisfeito:true, nota:5, comentario:'Elogiou o atendimento do Leonardo no balcão.', registrado_por:'João Pedro', origem:'manual', created_at: diasAtras(4) },
  { id: uuid(), cliente_id:C(8).id, envio_id:null, satisfeito:true, nota:4, comentario:null, registrado_por:'Leonardo', origem:'manual', created_at: diasAtras(9) },
  { id: uuid(), cliente_id:C(0).id, envio_id:null, satisfeito:true, nota:5, comentario:'Voltou só para agradecer.', registrado_por:'Leonardo', origem:'manual', created_at: diasAtras(20) },
];

// ---- saúde e carteiro -------------------------------------------------------
let SAUDE_OK = false;
const ultimaRodada = { em: horasAtras(0.4), resultado:{ ok:true, gerado:{ criados:3, pulados:1 }, enviados:3, falhas:0 } };
let PAPEL = 'admin';
const ehGestor = () => ['admin', 'gestor'].includes(PAPEL);

const lerCliente = (c) => c && ({ ...c });
const digitos = (t) => String(t ?? '').replace(/\D/g, '');

function resumo() {
  const ini7 = diasAtras(7), ini30 = diasAtras(30), inicioDia = hojeAs('00:00');
  const env30 = ENVIOS.filter((e) => e.created_at >= ini30);
  const enviados30 = env30.filter((e) => e.status === 'enviado');
  const enviados7 = enviados30.filter((e) => e.enviado_em >= ini7);
  const porRegua = {};
  for (const tipo of [...REGUAS, 'campanha', 'avulsa']) {
    const meus = enviados30.filter((e) => e.tipo === tipo);
    if (!meus.length && !CFG[`ativo_${tipo}`]) continue;
    porRegua[tipo] = { rotulo: ROTULO_TIPO[tipo], ligada: CFG[`ativo_${tipo}`] ?? null, enviadas: meus.length,
      respondidas: meus.filter((e) => e.respondido_em).length, positivas: meus.filter((e) => e.resposta_tipo === 'positiva').length,
      negativas: meus.filter((e) => e.resposta_tipo === 'negativa').length, pararam: meus.filter((e) => e.resposta_tipo === 'parar').length,
      agendaram: meus.filter((e) => e.agendou_depois_id).length };
  }
  const notas = RESPOSTAS.map((r) => Number(r.nota)).filter((n) => n >= 1 && n <= 5);
  const sat = RESPOSTAS.filter((r) => r.satisfeito).length;
  return {
    pendentes: ENVIOS.filter((e) => e.status === 'pendente').length,
    vencidos: ENVIOS.filter((e) => e.status === 'pendente' && e.enviar_em <= horasAtras(2)).length,
    enviadosHoje: enviados30.filter((e) => e.enviado_em >= inicioDia).length,
    falhas: env30.filter((e) => e.status === 'falhou').length,
    ultimoErro: env30.find((e) => e.status === 'falhou')?.erro || null,
    semana:{ enviadas: enviados7.length, respondidas: enviados7.filter((e) => e.respondido_em).length },
    mes30:{ enviadas: enviados30.length, respondidas: enviados30.filter((e) => e.respondido_em).length,
      agendaram: enviados30.filter((e) => e.agendou_depois_id).length, concluidos:2, receita:2650 },
    porRegua, reguasLigadas: REGUAS.filter((r) => CFG[`ativo_${r}`]), pausaGeral: CFG.pausa_geral,
    janela:{ inicio: CFG.janela_inicio, fim: CFG.janela_fim, domingo: CFG.envia_domingo }, carteiroConfigurado: CFG.carteiro_configurado,
    comNascimento: CLIENTES.filter((c) => c.nascimento).length,
    aniversariantesDoMes: CLIENTES.filter((c) => c.nascimento && c.nascimento.slice(5, 7) === mes)
      .map((c) => ({ nome:c.nome, telefone:c.telefone, dia:Number(c.nascimento.slice(8, 10)) })).sort((a, b) => a.dia - b.dia),
    foraDaLista: CLIENTES.filter((c) => c.aceita_mensagens === false).length,
    proximos48h: AG.filter((a) => ['aguardando', 'confirmado'].includes(a.status)).length,
    satisfacao:{ total: RESPOSTAS.length, satisfeitos: sat, insatisfeitos: RESPOSTAS.length - sat,
      pct: RESPOSTAS.length ? Math.round((sat / RESPOSTAS.length) * 100) : null,
      notaMedia: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null },
  };
}

/* Prévia das réguas: simula o que entraria na fila agora. */
function previa(so) {
  const porRegua = {}, lista = [], pulados = [], adiados = [];
  const push = (tipo, c, corpo, extra = {}) => {
    const item = { tipo, cliente_id:c.id, telefone:c.telefone, nome:c.nome, corpo, enviar_em: hojeAs(CFG.hora_envio) };
    if (c.aceita_mensagens === false) { pulados.push({ ...item, motivo:'cliente pediu para não receber mensagens', definitivo:true }); return; }
    if (extra.recente) { adiados.push({ ...item, motivo:`já recebeu mensagem há menos de ${CFG.intervalo_minimo_dias} dias`, definitivo:false }); return; }
    lista.push(item);
  };
  const gerar = {
    lembrete: () => AG.filter((a) => ['aguardando', 'confirmado'].includes(a.status)).forEach((a) =>
      push('lembrete', a.cliente, renderTemplate(CFG.msg_lembrete, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico, quando: quandoRelativo(a.data, a.hora) }))),
    posvenda: () => AG.filter((a) => a.status === 'concluido' && a.data === somarDias(hoje(), -CFG.dias_posvenda)).forEach((a) =>
      push('posvenda', a.cliente, renderTemplate(CFG.msg_posvenda, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico }))),
    retorno: () => AG.filter((a) => a.status === 'concluido').forEach((a) => {
      const { meses, regra: r } = prazoDeRetorno(a.servico, REGRAS, CFG.meses_retorno);
      const vence = somarDias(a.data, meses * 30);
      if (vence <= hoje() && vence >= somarDias(hoje(), -7)) push('retorno', a.cliente, renderTemplate(r?.mensagem || CFG.msg_retorno, { nome:a.cliente.nome, carro:a.veiculo, placa:a.placa, servico:a.servico, meses }));
    }),
    aniversario: () => CLIENTES.filter((c) => c.telefone && c.nascimento && c.nascimento.slice(5) === hoje().slice(5)).forEach((c) =>
      push('aniversario', c, renderTemplate(CFG.msg_aniversario, { nome:c.nome, carro:c.carro, placa:c.placa }))),
    orcamento: () => push('orcamento', C(10), renderTemplate(CFG.msg_orcamento, { nome:C(10).nome, carro:C(10).carro }), { recente:true }),
    nao_fechou: () => AG.filter((a) => a.status === 'nao_fechou').forEach((a) => push('nao_fechou', a.cliente, renderTemplate(CFG.msg_nao_fechou, { nome:a.cliente.nome, carro:a.veiculo }))),
    reativacao: () => [C(6), C(7)].forEach((c) => push('reativacao', c, renderTemplate(CFG.msg_reativacao, { nome:c.nome, carro:c.carro }))),
  };
  for (const [tipo, fn] of Object.entries(gerar)) {
    if (so && so !== tipo) continue;
    const antes = [lista.length, pulados.length, adiados.length];
    fn();
    porRegua[tipo] = { ligada: !!CFG[`ativo_${tipo}`], criados:0, previa: lista.length - antes[0], pulados: pulados.length - antes[1], adiados: adiados.length - antes[2] };
  }
  return { simulado:true, porRegua, criados:0, pulados: pulados.length, adiados: adiados.length, previa: lista, puladosDetalhe: pulados, adiadosDetalhe: adiados, erros: [] };
}

function segmentar(filtro, valor) {
  const ok = (c) => c.telefone && c.aceita_mensagens !== false;
  switch (filtro) {
    case 'todos': return CLIENTES.filter(ok);
    case 'aniversariantes_mes': return CLIENTES.filter((c) => ok(c) && c.nascimento && c.nascimento.slice(5, 7) === mes);
    case 'atendidos': { const d = Number(valor) || 90; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data >= somarDias(hoje(), -d)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'sem_voltar': { const m = Number(valor) || 6; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.data <= somarDias(hoje(), -m * 30)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'faltaram': { const ids = new Set(AG.filter((a) => a.status === 'nao_veio').map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    case 'servico': { const p = String(valor || '').toLowerCase(); if (p.length < 2) return []; const ids = new Set(AG.filter((a) => a.status === 'concluido' && a.servico.toLowerCase().includes(p)).map((a) => a.cliente.id)); return CLIENTES.filter((c) => ok(c) && ids.has(c.id)); }
    default: return null;
  }
}

/** Filtros novos da fila: período (fuso de SP) e intenção lida pela IA. */
function filtrarExtra(l, sp) {
  const de = dataBanco(sp.get('de')), ate = dataBanco(sp.get('ate')), int = sp.get('intencao');
  if (de) l = l.filter((e) => e.enviar_em >= instanteSP(de, '00:00').toISOString());
  if (ate) l = l.filter((e) => e.enviar_em < instanteSP(somarDias(ate, 1), '00:00').toISOString());
  if (int && int !== 'todas') l = l.filter((e) => (int === 'qualquer' ? !!e.intencao : e.intencao === int));
  return l;
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(obj)); };
const DUBLE_SUPABASE = `<script>window.supabase={createClient:()=>({auth:{
  getSession:async()=>({data:{session:{access_token:'mock'}}}),
  signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};</script>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') {
      if (url.searchParams.has('papel')) PAPEL = url.searchParams.get('papel') === 'atendente' ? 'atendente' : 'admin';
      if (url.searchParams.has('saude')) SAUDE_OK = url.searchParams.get('saude') === 'ok';
      if (url.searchParams.has('ia')) IA_LIGADA = url.searchParams.get('ia') !== 'off';
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, DUBLE_SUPABASE);
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
    }
    if (p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end('/* sem service worker no modo de teste */'); }
    const arq = path.join(PUBLIC, path.normalize(p));
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    return fs.createReadStream(arq).pipe(res);
  }

  let body = {};
  if (m !== 'GET') { let b = ''; for await (const c of req) b += c; try { body = JSON.parse(b || '{}'); } catch {} }
  await new Promise((r) => setTimeout(r, 180));            // latência de verdade, para ver o esqueleto
  const naoGestor = () => json(res, 403, { erro:'Só gestor altera as réguas.' });
  let mm;

  if (p === '/api/config') return json(res, 200, { configurado:true, supabaseUrl:'http://mock.local', supabaseAnonKey:'mock', app:'IndyCar Comunicar', versao:'2.0.0-mock' });
  if (p === '/api/ping') return json(res, 200, { ok:true, versao:'2.0.0-mock' });
  if (p === '/api/perfil') return json(res, 200, { id:'u1', nome: PAPEL === 'atendente' ? 'Leonardo' : 'João Pedro Famelli', email:'teste@indycartaubate.com', papel:PAPEL });
  if (p === '/api/resumo') return json(res, 200, resumo());
  if (p === '/api/saude') return json(res, 200, SAUDE_OK
    ? { ok:true, problema:null, desde:null, checado_em: agora(), resumo:null, whatsappParado:false, versao:'2.0.0-mock', ultimaRodada }
    : { ok:false, problema:'codewords-fora', desde: diasAtras(8), checado_em: agora(), resumo:'CodeWords respondeu 401 nas últimas 3 checagens.', whatsappParado:true, versao:'2.0.0-mock', ultimaRodada });
  if (p === '/api/whatsapp/status') return json(res, 200, SAUDE_OK ? { ok:true, conectado:true, numero:'5512997000000' } : { ok:false, chaveRecusada:true, erro:'A chave do CodeWords foi recusada (401).' });

  if ((p === '/api/comunicar/config' || p === '/api/posvenda/config') && m === 'GET') return json(res, 200, CFG);
  if ((p === '/api/comunicar/config' || p === '/api/posvenda/config') && m === 'PUT') {
    if (!ehGestor()) return naoGestor();
    for (const [k, v] of Object.entries(body)) if (k in CFG) CFG[k] = k === 'telefone_teste' ? digitos(v) : v;
    CFG.updated_at = agora();
    return json(res, 200, CFG);
  }
  if (p === '/api/previa') return json(res, 200, previa(url.searchParams.get('regua')));
  if (p === '/api/rodar-agora' && m === 'POST') {
    const pr = previa(null);
    const novos = pr.previa.filter((x) => REGUAS.includes(x.tipo) && CFG[`ativo_${x.tipo}`]).slice(0, 2);
    for (const x of novos) ENVIOS.unshift(env(porId(x.cliente_id), x.tipo, { corpo:x.corpo, created_at: agora() }));
    const r = { ok:true, gerado:{ porRegua: pr.porRegua, criados: novos.length, pulados: pr.pulados }, enviados: CFG.pausa_geral ? 0 : 1, falhas:0,
      aviso: CFG.pausa_geral ? 'Envios pausados: a pausa geral está ligada.' : undefined };
    if (!CFG.pausa_geral) { const pend = ENVIOS.find((e) => e.status === 'pendente'); if (pend) { pend.status = 'enviado'; pend.enviado_em = agora(); pend.tentativas = 1; } }
    ultimaRodada.em = agora(); ultimaRodada.resultado = r;
    return json(res, 200, r);
  }

  // ---- fila
  if (p === '/api/envios' && m === 'GET') {
    const st = url.searchParams.get('status'), tipo = url.searchParams.get('tipo'), q = (url.searchParams.get('q') || '').toLowerCase();
    let l = ENVIOS.slice();
    if (st && st !== 'todas') l = l.filter((e) => e.status === st);
    if (tipo && tipo !== 'todos') l = l.filter((e) => e.tipo === tipo);
    if (q) l = l.filter((e) => [e.nome, e.corpo, e.telefone].some((x) => String(x || '').toLowerCase().includes(q)));
    l = filtrarExtra(l, url.searchParams);
    l.sort((a, b) => (a.enviar_em < b.enviar_em ? 1 : -1));
    return json(res, 200, l.slice(0, Number(url.searchParams.get('limite')) || 300));
  }
  if (p === '/api/envios.csv' && m === 'GET') {
    let l = filtrarExtra(ENVIOS.slice(), url.searchParams);
    const st = url.searchParams.get('status'), tipo = url.searchParams.get('tipo');
    if (st && st !== 'todas') l = l.filter((e) => e.status === st);
    if (tipo && tipo !== 'todos') l = l.filter((e) => e.tipo === tipo);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comunicar-mensagens-${hoje()}.csv"` });
    return res.end(paraCSV(l.sort((a, b) => (a.enviar_em < b.enviar_em ? 1 : -1)), COLUNAS_CSV_ENVIOS));
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/desfazer-cancelamento$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || e.status !== 'cancelado') return json(res, 400, { erro:'Essa mensagem não está cancelada.' });
    e.status = 'pendente'; return json(res, 200, e);
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/encaminhar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e) return json(res, 404, { erro:'Não encontrado' });
    e.encaminhado_em = agora(); return json(res, 200, { ok:true });
  }
  if (p === '/api/relatorio') {
    const regua = url.searchParams.get('regua');
    const l = ENVIOS.filter((e) => !regua || regua === 'todas' || e.tipo === regua);
    return json(res, 200, montarRelatorio(l, regua || null, 8));
  }
  if (p === '/api/intencoes') {
    const dias = Number(url.searchParams.get('dias')) || 7;
    const lista = ENVIOS.filter((e) => e.intencao && e.respondido_em >= diasAtras(dias)).sort((a, b) => (a.respondido_em < b.respondido_em ? 1 : -1));
    const contagem = {}; for (const e of lista) contagem[e.intencao] = (contagem[e.intencao] || 0) + 1;
    return json(res, 200, { contagem, lista });
  }
  if (p === '/api/aniversarios') {
    const ags = AG.filter((a) => a.status === 'concluido').map((a) => ({ cliente_id: a.cliente.id, data: a.data }));
    return json(res, 200, await montarAniversarios(CLIENTES.filter((c) => c.nascimento), CLIENTES.filter((c) => c.telefone).length, ags, hoje(), async (ids) => ids.map(porId).filter(Boolean)));
  }

  // ---- IA (cliente falso, funções reais)
  if (p === '/api/ia/status') return json(res, 200, { ativo: IA_LIGADA, temChave: true, autonomia: 'confirmar', chamadasHoje: 3, limite: 2000 });
  if (p === '/api/ia/escrever' && m === 'POST') {
    try {
      const regua = String(body.regua || 'campanha');
      const r = await ia.escreverMensagem({ regua, pedido: body.pedido, textoAtual: body.texto }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      const ex = { nome:'Maria Aparecida Souza', carro:'HB20 2019', placa:'FHR6F16', servico:'troca de óleo', quando:'amanhã às 09:00', meses:6, detalhe:'sábado até 12h', link_avaliacao: CFG.link_avaliacao, ...(body.exemplo || {}) };
      return json(res, 200, { variacoes: r.variacoes.map((v) => ({ ...v, previa: renderTemplate(v.texto, ex) })), modelo: r.modelo });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/publico' && m === 'POST') {
    try {
      const r = await ia.sugerirPublico({ numeros: resumo(), segmentos: SEGMENTOS }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      const l = segmentar(r.segmento, r.valor) || [];
      delete r.uso;
      return json(res, 200, { ...r, previa: { total: l.length, amostra: l.slice(0, 8).map((c) => ({ id:c.id, nome:c.nome, carro:c.carro })) } });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/resumo' && m === 'GET') return json(res, 200, { texto: CFG.ia_resumo, em: CFG.ia_resumo_em, valido: !!CFG.ia_resumo });
  if (p === '/api/ia/resumo' && m === 'POST') {
    if (!body.forcar && CFG.ia_resumo) return json(res, 200, { texto: CFG.ia_resumo, em: CFG.ia_resumo_em, valido: true, cache: true });
    try {
      const r = await ia.resumirSemana({ numeros: resumo() }, { chave:'falsa', modelos: ia.MODELOS_RESERVA });
      CFG.ia_resumo = r.texto; CFG.ia_resumo_em = agora();
      return json(res, 200, { texto: r.texto, em: CFG.ia_resumo_em, valido: true, cache: false });
    } catch (e) { return json(res, 502, { erro: `A IA não respondeu agora: ${e.message}` }); }
  }
  if (p === '/api/ia/ler-respostas' && m === 'POST') {
    if (!ehGestor()) return json(res, 403, { erro:'Só gestor dispara a leitura agora.' });
    return json(res, 200, { lidas: 0, chamaram: 0, propostas: 0, erros: 0, porIntencao: {} });
  }
  if (p === '/api/envios' && m === 'POST') {
    const corpo = String(body.corpo ?? '').trim();
    if (!corpo) return json(res, 400, { erro:'Escreva a mensagem.' });
    let destinos = Array.isArray(body.destinos) ? body.destinos : [];
    if (!destinos.length && body.segmento?.filtro) destinos = (segmentar(body.segmento.filtro, body.segmento.valor) || []).map((c) => ({ cliente_id:c.id, telefone:c.telefone, nome:c.nome, carro:c.carro, placa:c.placa }));
    if (!destinos.length) return json(res, 400, { erro:'Escolha pelo menos um cliente.' });
    const tipo = body.tipo === 'avulsa' || destinos.length === 1 ? 'avulsa' : 'campanha';
    const lote = tipo === 'campanha' ? uuid() : null;   // proposta: o servidor marca o lote da campanha
    let enfileirados = 0, pulados = 0;
    for (const d of destinos) {
      const c = porId(d.cliente_id);
      if (c?.aceita_mensagens === false) { pulados++; continue; }
      ENVIOS.unshift(env(c, tipo, { lote, telefone:d.telefone, nome:d.nome, corpo: renderTemplate(corpo, { nome:d.nome, carro:d.carro, placa:d.placa, detalhe:'' }),
        enviar_em: body.enviar_em || agora(), created_at: agora(), criado_por: PAPEL === 'atendente' ? 'Leonardo' : 'João Pedro' }));
      enfileirados++;
    }
    return json(res, 200, { ok:true, enfileirados, pulados });
  }
  if (p === '/api/envios/teste' && m === 'POST') {
    if (!ehGestor()) return json(res, 403, { erro:'Só gestor pode mandar teste.' });
    if (!SAUDE_OK) return json(res, 502, { erro:'A chave do CodeWords foi recusada (401). Gere uma nova em runtime.codewords.ai e cole em Atendimento › Configurações › Integrações.' });
    return json(res, 200, { ok:true });
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/cancelar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || e.status !== 'pendente') return json(res, 400, { erro:'Só dá para cancelar mensagem que ainda não saiu.' });
    e.status = 'cancelado'; return json(res, 200, e);
  }
  if ((mm = p.match(/^\/api\/envios\/([0-9a-f-]+)\/reenviar$/)) && m === 'POST') {
    const e = ENVIOS.find((x) => x.id === mm[1]);
    if (!e || !['falhou', 'cancelado', 'pulado'].includes(e.status)) return json(res, 400, { erro:'Só dá para reenviar mensagem que falhou, foi cancelada ou pulada.' });
    Object.assign(e, { status:'pendente', erro:null, motivo_pulado:null, enviar_em: agora() }); return json(res, 200, e);
  }

  // ---- segmentos, modelos, regras
  if (p === '/api/segmentos') return json(res, 200, SEGMENTOS);
  if (p === '/api/segmentos/previa') {
    const l = segmentar(url.searchParams.get('filtro') || 'todos', url.searchParams.get('valor'));
    if (!l) return json(res, 400, { erro:'Segmento desconhecido.' });
    return json(res, 200, { total: l.length, amostra: l.slice(0, 12).map((c) => ({ id:c.id, nome:c.nome, telefone:c.telefone, carro:c.carro })) });
  }
  if (p === '/api/modelos') return json(res, 200, MODELOS);
  if (p === '/api/regras-retorno' && m === 'GET') return json(res, 200, REGRAS.slice().sort((a, b) => a.ordem - b.ordem));
  if (p === '/api/regras-retorno' && m === 'POST') {
    if (!ehGestor()) return naoGestor();
    const palavras = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras || '').split(/[,;\n]/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!body.rotulo || !palavras.length) return json(res, 400, { erro:'Dê um nome à regra e pelo menos uma palavra do serviço.' });
    const r = regra(String(body.rotulo).trim(), palavras, Number(body.meses), 100, { mensagem: body.mensagem || '', ativo: body.ativo !== false });
    REGRAS.push(r); return json(res, 200, r);
  }
  if ((mm = p.match(/^\/api\/regras-retorno\/([0-9a-f-]+)$/))) {
    if (!ehGestor()) return naoGestor();
    const i = REGRAS.findIndex((x) => x.id === mm[1]);
    if (i < 0) return json(res, 404, { erro:'Não encontrado' });
    if (m === 'DELETE') { REGRAS.splice(i, 1); return json(res, 200, { ok:true }); }
    const r = REGRAS[i];
    if (body.rotulo !== undefined) r.rotulo = String(body.rotulo).trim();
    if (body.palavras !== undefined) r.palavras = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras).split(/[,;\n]/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (body.meses !== undefined) r.meses = Number(body.meses);
    if (body.mensagem !== undefined) r.mensagem = String(body.mensagem);
    if (body.ativo !== undefined) r.ativo = body.ativo === true;
    return json(res, 200, r);
  }

  // ---- clientes
  if (p === '/api/clientes' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase(), d = digitos(q);
    let l = CLIENTES.slice();
    if (q) l = l.filter((c) => c.nome.toLowerCase().includes(q) || (c.placa || '').toLowerCase().includes(q) || (d.length >= 4 && (c.telefone || '').includes(d)));
    return json(res, 200, l.sort((a, b) => a.nome.localeCompare(b.nome)).map(lerCliente));
  }
  if (p === '/api/clientes/importar' && m === 'POST') {
    const linhas = Array.isArray(body.linhas) ? body.linhas : [];
    let criados = 0, atualizados = 0, ignorados = 0; const avisos = [];
    linhas.forEach((l, i) => {
      const tel = digitos(l.telefone);
      if (!l.nome || tel.length < 8) { ignorados++; avisos.push(`Linha ${i + 1}: sem nome ou telefone válido — pulada.`); return; }
      const ex = CLIENTES.find((c) => digitos(c.telefone) === tel);
      if (ex) { atualizados++; if (l.nascimento) ex.nascimento = l.nascimento.includes('/') ? '1904-' + l.nascimento.split('/').reverse().slice(0, 2).join('-') : l.nascimento; }
      else { CLIENTES.push(cli({ nome:l.nome, telefone:tel, carro:l.veiculo || null, placa:l.placa || null })); criados++; }
    });
    return json(res, 200, { criados, atualizados, ignorados, avisos });
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)\/ficha$/)) && m === 'GET') {
    const c = porId(mm[1]); if (!c) return json(res, 404, { erro:'Não encontrado' });
    const ags = AG.filter((a) => a.cliente.id === c.id).sort((a, b) => (a.data < b.data ? 1 : -1));
    const ultimo = ags.find((a) => a.status === 'concluido') || null;
    let proximaRevisao = null;
    if (ultimo) { const { meses, regra: r } = prazoDeRetorno(ultimo.servico, REGRAS, CFG.meses_retorno); proximaRevisao = { data: somarDias(ultimo.data, meses * 30), meses, regra: r?.rotulo || 'padrão', servico: ultimo.servico }; }
    const feitos = ags.filter((a) => a.status === 'concluido');
    return json(res, 200, {
      cliente: lerCliente(c),
      resumo:{ servicos_feitos: feitos.length, faltas: ags.filter((a) => a.status === 'nao_veio').length, total_gasto: feitos.reduce((s, a) => s + a.valor, 0),
        ultimo_servico_em: ultimo?.data || null, proximo_horario: ags.find((a) => ['aguardando', 'confirmado'].includes(a.status))?.data || null },
      ultimoServico: ultimo ? { id: ultimo.id, servico: ultimo.servico, data: ultimo.data, status: ultimo.status, valor: ultimo.valor } : null,
      proximaRevisao,
      agendamentos: ags.slice(0, 6).map(({ cliente, ...a }) => a),
      envios: ENVIOS.filter((e) => e.cliente_id === c.id).slice(0, 10),
      respostas: RESPOSTAS.filter((r) => r.cliente_id === c.id).slice(0, 5),
    });
  }
  if ((mm = p.match(/^\/api\/clientes\/([0-9a-f-]+)$/)) && m === 'PUT') {
    const c = porId(mm[1]); if (!c) return json(res, 404, { erro:'Não encontrado' });
    if (body.nascimento !== undefined) {
      const t = String(body.nascimento).trim(); let v = null;
      let x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (x) v = `${x[3]}-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
      x = t.match(/^(\d{1,2})\/(\d{1,2})$/); if (x) v = `1904-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')}`;
      c.nascimento = v;
    }
    if (body.aceita_mensagens === true || body.aceita_mensagens === false) {
      c.aceita_mensagens = body.aceita_mensagens; c.aceita_mensagens_em = agora();
      c.aceita_mensagens_motivo = body.aceita_mensagens ? null : `desligado no painel por João Pedro${body.motivo ? `: ${body.motivo}` : ''}`;
    }
    return json(res, 200, lerCliente(c));
  }

  // ---- satisfação
  if (p === '/api/satisfacao' && m === 'GET') return json(res, 200, RESPOSTAS.map((r) => ({ ...r, cliente_nome: porId(r.cliente_id)?.nome ?? null, cliente_telefone: porId(r.cliente_id)?.telefone ?? null })));
  if (p === '/api/satisfacao' && m === 'POST') {
    if (!porId(body.cliente_id)) return json(res, 400, { erro:'Escolha o cliente.' });
    if (body.satisfeito !== true && body.satisfeito !== false) return json(res, 400, { erro:'Diga se o cliente ficou satisfeito ou não.' });
    const r = { id: uuid(), cliente_id: body.cliente_id, envio_id:null, satisfeito: body.satisfeito, nota: body.nota || null, comentario: body.comentario || null,
      registrado_por: PAPEL === 'atendente' ? 'Leonardo' : 'João Pedro', origem:'manual', created_at: agora() };
    RESPOSTAS.unshift(r); return json(res, 200, r);
  }
  if ((mm = p.match(/^\/api\/satisfacao\/([0-9a-f-]+)$/)) && m === 'DELETE') { RESPOSTAS = RESPOSTAS.filter((r) => r.id !== mm[1]); return json(res, 200, { ok:true }); }

  if (m === 'GET') return json(res, 200, []);
  return json(res, 200, { ok:true });
}).listen(PORT, () => console.log(`Comunicar (dados de MENTIRA) em http://localhost:${PORT}  ·  modo só-olha: /?papel=atendente  ·  sem alerta: /?saude=ok`));
