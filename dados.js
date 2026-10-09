// -----------------------------------------------------------------------------
// Camada de dados do IndyCar Comunicar — fala com o MESMO Supabase do CRM, da
// Agenda e do Atendimento. Aqui moram:
//   • clientes (tabela compartilhada: nascimento + consentimento)
//   • posvenda_config    — réguas automáticas, textos e janela de envio
//   • posvenda_envios    — fila e histórico de mensagens (com a resposta do cliente)
//   • posvenda_respostas — satisfação do cliente
//   • comunicar_regras_retorno — prazo de revisão por tipo de serviço
//   • comunicar_modelos  — biblioteca de mensagens prontas
// Os GERADORES (as réguas) também moram aqui: eles só enfileiram; quem envia é
// o server.js, pelo WhatsApp da empresa. Tudo passa pelo "porteiro": quem pediu
// para não receber não entra na fila, e ninguém recebe duas mensagens de
// relacionamento em menos de N dias.
// -----------------------------------------------------------------------------

import {
  selecionar, selecionarUm, selecionarTudo,
  inserirUm, atualizar, atualizarUm, remover, contar,
} from './supabase.js';

const T = {
  clientes: 'clientes',
  agendamentos: 'agendamentos',
  leads: 'leads',
  config: 'posvenda_config',
  envios: 'posvenda_envios',
  respostas: 'posvenda_respostas',
  perfis: 'perfis',
  regras: 'comunicar_regras_retorno',
  modelos: 'comunicar_modelos',
  v360: 'v_cliente_360',
  vigia: 'vigia_estado',
};

const LINHA_UNICA = 'id=is.true';

/** As réguas automáticas, na ordem em que aparecem na tela. */
export const REGUAS = [
  'lembrete', 'posvenda', 'avaliacao', 'retorno', 'aniversario', 'orcamento', 'nao_fechou', 'reativacao',
];
/** Tipos que contam como "relacionamento" para o intervalo mínimo entre mensagens. */
const TIPOS_RELACIONAMENTO = new Set(['aniversario', 'retorno', 'reativacao', 'orcamento', 'nao_fechou', 'campanha', 'avulsa']);
export const TIPOS_ENVIO = ['aniversario', 'posvenda', 'retorno', 'campanha', 'avulsa', 'lembrete', 'orcamento', 'nao_fechou', 'reativacao', 'avaliacao'];

// ============================================================================
// UTILIDADES PURAS (sem banco) — testáveis com `npm test`
// ============================================================================

export const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

/** Mesma normalização da coluna gerada clientes.telefone_e164 (sem DDI 55). */
export function telefoneNacional(t) {
  const d = soDigitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d || null;
}

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Data de hoje no fuso da oficina — NUNCA toISOString (UTC vira amanhã às 21h). */
export function hoje() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Agora, no fuso da oficina: data ISO, hora (0-23), minuto e dia da semana (0=dom). */
export function agoraSP(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(instante);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const semana = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: semana[p.weekday] ?? new Date().getDay(),
  };
}

/** Soma dias a uma data 'YYYY-MM-DD' sem sair do calendário (meio-dia evita virada). */
export function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Instante de uma data/hora da oficina como ISO UTC p/ o banco (SP = UTC-3 fixo). */
export function instanteSP(dataIso, horaHM = '00:00') {
  return new Date(`${dataIso}T${String(horaHM).slice(0, 5)}:00-03:00`);
}

/** Instante de hoje às HH:MM no fuso da oficina, como ISO UTC p/ o banco. */
function hojeAs(horaHM) {
  return instanteSP(hoje(), horaHM).toISOString();
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
const uuidOuNulo = (v) => (ehUuid(v) ? String(v).trim() : null);

/** Escapa o termo de busca para dentro de or=(...) do PostgREST. */
function termoBusca(q) {
  const limpo = String(q ?? '').replace(/["\\(),]/g, ' ').trim();
  return `"*${limpo}*"`;
}

/** 'YYYY-MM-DD' válida ou null (aceita DD/MM/AAAA e DD/MM da planilha). */
export function dataBanco(d) {
  if (d === null || d === undefined) return null;
  const t = String(d).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    return `${m[3]}-${p(m[2])}-${p(m[1])}`;
  }
  // só dia/mês ('12/05'): para parabéns o ano não importa. 1904 (bissexto) é o marcador.
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `1904-${p(mes)}-${p(dia)}`;
  }
  return null;
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** "hoje às 14:30" · "amanhã às 09:00" · "sexta-feira (13/10) às 09:00". */
export function quandoRelativo(dataIso, horaHM, hojeIso = hoje()) {
  const hora = String(horaHM || '').slice(0, 5);
  const as = hora ? ` às ${hora}` : '';
  if (dataIso === hojeIso) return `hoje${as}`;
  if (dataIso === somarDias(hojeIso, 1)) return `amanhã${as}`;
  const d = new Date(dataIso + 'T12:00:00');
  const [, m, dia] = dataIso.split('-');
  return `${DIAS_SEMANA[d.getDay()]} (${dia}/${m})${as}`;
}

/**
 * Qual regra de retorno casa com o serviço? Devolve { meses, regra }.
 * Compara sem acento e sem caixa; a primeira regra (por ordem) que casar vence.
 */
export function prazoDeRetorno(servico, regras = [], padraoMeses = 6) {
  const s = semAcento(servico);
  if (s) {
    for (const r of regras) {
      if (r.ativo === false) continue;
      const palavras = Array.isArray(r.palavras) ? r.palavras : String(r.palavras || '').split(',');
      if (palavras.some((p) => p && s.includes(semAcento(p)))) return { meses: Number(r.meses) || padraoMeses, regra: r };
    }
  }
  return { meses: padraoMeses, regra: null };
}

/** Substitui {nome} {primeiro_nome} {carro} {placa} {servico} {meses} {quando} … no texto. */
export function renderTemplate(corpo, ctx = {}) {
  const primeiro = String(ctx.nome || '').trim().split(/\s+/)[0] || '';
  const mapa = { ...ctx, primeiro_nome: primeiro, carro: ctx.carro || 'seu carro' };
  return String(corpo ?? '').replace(/\{(\w+)\}/g, (_, k) => (mapa[k] ?? ''))
    .replace(/[ \t]{2,}/g, ' ').trim();
}

/** Espelho em JS da classificação feita pelo gatilho do banco (para prévia e testes). */
export function classificarResposta(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return 'neutra';
  const b = (re) => new RegExp(`(^|[^\\p{L}\\p{N}])(${re})([^\\p{L}\\p{N}]|$)`, 'u').test(t);
  if (b('parar|sair|remover|cancelar|descadastr|n[aã]o quero (mais )?(receber|mensag)|stop')) return 'parar';
  if (b('n[aã]o|nao ficou|ruim|p[eé]ssim|problema|reclama|insatisf|piorou|voltou|barulho|defeito|👎|😞|😡|😠')) return 'negativa';
  if (b('sim|ok|certo|tudo certo|tudo bem|[oó]tim|excelente|perfeito|show|top|maravilh|obrigad|valeu|gostei|ficou bom|confirm|pode ser|quero|vamos|bora|beleza|👍|🙏|😀|😊|❤|🏁')) return 'positiva';
  return 'neutra';
}

/** Rótulos legíveis dos tipos — a tela e o servidor usam os mesmos. */
export const ROTULO_TIPO = {
  lembrete: 'Lembrete de horário', posvenda: 'Pós-venda', avaliacao: 'Avaliação no Google',
  retorno: 'Revisão', aniversario: 'Aniversário', orcamento: 'Orçamento parado',
  nao_fechou: 'Não fechou', reativacao: 'Reativação', campanha: 'Campanha', avulsa: 'Avulsa',
};

// ============================================================================
// CLIENTES (tabela compartilhada)
// ============================================================================

function lerCliente(r) {
  if (!r) return null;
  return {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone,
    carro: [r.carro_modelo, r.carro_ano].filter(Boolean).join(' ') || null,
    carro_modelo: r.carro_modelo ?? null,
    placa: r.placa ?? null,
    email: r.email ?? null,
    nascimento: r.nascimento ?? null,
    aceita_mensagens: r.aceita_mensagens !== false,
    aceita_mensagens_em: r.aceita_mensagens_em ?? null,
    aceita_mensagens_motivo: r.aceita_mensagens_motivo ?? null,
    observacoes: r.observacoes ?? null,
    created_at: r.created_at,
  };
}

const CAMPOS_CLIENTE = 'id,nome,telefone,carro_modelo,carro_ano,placa,email,nascimento,aceita_mensagens,aceita_mensagens_em,aceita_mensagens_motivo,observacoes,created_at';

export async function listarClientes(q, { limite = 500 } = {}) {
  const p = new URLSearchParams(`select=${CAMPOS_CLIENTE}`);
  if (q) {
    const t = termoBusca(q);
    const dig = soDigitos(q);
    const partes = [`nome.ilike.${t}`, `placa.ilike.${t}`];
    if (dig.length >= 4) partes.push(`telefone.ilike."*${dig}*"`, `telefone_e164.ilike."*${telefoneNacional(dig) || dig}*"`);
    p.set('or', `(${partes.join(',')})`);
  }
  p.set('order', 'nome.asc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.clientes, p);
  return linhas.map(lerCliente);
}

export async function obterCliente(id) {
  if (!ehUuid(id)) return null;
  return lerCliente(await selecionarUm(T.clientes, `select=${CAMPOS_CLIENTE}&id=eq.${id}`));
}

/** Só os campos que o Comunicar pode mexer — a ficha completa é do CRM. */
export async function atualizarCliente(id, dados, quem = null) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nascimento !== undefined) campos.nascimento = dataBanco(dados.nascimento);
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.email !== undefined) campos.email = dados.email || null;
  if (dados.observacoes !== undefined) campos.observacoes = dados.observacoes || null;
  if (dados.aceita_mensagens === true || dados.aceita_mensagens === false) {
    campos.aceita_mensagens = dados.aceita_mensagens;
    campos.aceita_mensagens_em = new Date().toISOString();
    campos.aceita_mensagens_motivo = dados.aceita_mensagens
      ? null
      : `desligado no painel${quem ? ` por ${quem}` : ''}${dados.motivo ? `: ${String(dados.motivo).slice(0, 120)}` : ''}`;
  }
  if (!Object.keys(campos).length) return obterCliente(id);
  return lerCliente(await atualizarUm(T.clientes, `id=eq.${id}&select=${CAMPOS_CLIENTE}`, campos));
}

/** Busca clientes por lista de ids, em lotes (a URL do PostgREST tem limite). */
async function clientesPorIds(ids) {
  const unicos = [...new Set(ids.filter(ehUuid))];
  const saida = [];
  for (let i = 0; i < unicos.length; i += 80) {
    const lote = unicos.slice(i, i + 80);
    const p = new URLSearchParams(`select=${CAMPOS_CLIENTE}`);
    p.set('id', `in.(${lote.join(',')})`);
    saida.push(...(await selecionar(T.clientes, p)).map(lerCliente));
  }
  return saida;
}

/**
 * Importação de planilha: upsert por telefone (telefone_e164). Só PREENCHE o que
 * está vazio — a planilha não sobrescreve a ficha viva; nascimento atualiza sempre.
 */
export async function importarClientes(linhas) {
  const resultado = { criados: 0, atualizados: 0, ignorados: 0, avisos: [] };
  for (const [i, l] of linhas.entries()) {
    try {
      const nome = String(l.nome ?? '').trim();
      const tel = soDigitos(l.telefone);
      if (!nome || !tel || tel.length < 8) {
        resultado.ignorados++;
        resultado.avisos.push(`Linha ${i + 1}: sem nome ou telefone válido — pulada.`);
        continue;
      }
      const nasc = l.nascimento !== undefined ? dataBanco(l.nascimento) : undefined;
      if (l.nascimento && nasc === null) {
        resultado.avisos.push(`Linha ${i + 1} (${nome}): não entendi a data "${l.nascimento}" — use DD/MM/AAAA.`);
      }

      const nacional = telefoneNacional(tel);
      const p = new URLSearchParams('select=id,nascimento,carro_modelo,placa,email');
      p.set('telefone_e164', `eq.${nacional}`);
      p.set('limit', '1');
      const existente = await selecionarUm(T.clientes, p);

      const extras = {};
      if (nasc) extras.nascimento = nasc;
      if (l.veiculo) extras.carro_modelo = String(l.veiculo).trim();
      if (l.placa) extras.placa = String(l.placa).trim().toUpperCase();
      if (l.email) extras.email = String(l.email).trim();

      if (existente) {
        const campos = {};
        for (const [k, v] of Object.entries(extras)) {
          if (existente[k] === null || existente[k] === undefined || existente[k] === '') campos[k] = v;
        }
        if (nasc) campos.nascimento = nasc;
        if (Object.keys(campos).length) {
          await atualizarUm(T.clientes, `id=eq.${existente.id}`, campos);
          resultado.atualizados++;
        } else {
          resultado.ignorados++;
        }
      } else {
        await inserirUm(T.clientes, { nome, telefone: tel, origem: 'organico', ...extras }, 'select=id');
        resultado.criados++;
      }
    } catch (e) {
      resultado.ignorados++;
      resultado.avisos.push(`Linha ${i + 1}: ${e?.message || e}`);
    }
  }
  return resultado;
}

// ============================================================================
// FICHA DO CLIENTE (o que o Comunicar sabe dele)
// ============================================================================

export async function fichaCliente(id) {
  const cliente = await obterCliente(id);
  if (!cliente) return null;
  const [v360, regras, cfg, ultimos, envios, respostas] = await Promise.all([
    selecionarUm(T.v360, `select=total_leads,total_agendamentos,servicos_feitos,faltas,total_gasto,ultimo_servico_em,proximo_horario&id=eq.${id}`),
    listarRegras(),
    obterConfig(),
    selecionar(T.agendamentos, `select=id,servico,data,hora,status,valor,veiculo&cliente_id=eq.${id}&order=data.desc,hora.desc&limit=6`),
    selecionar(T.envios, `select=id,tipo,status,corpo,enviar_em,enviado_em,respondido_em,resposta,resposta_tipo,agendou_depois_id,motivo_pulado&cliente_id=eq.${id}&order=created_at.desc&limit=10`),
    selecionar(T.respostas, `select=id,satisfeito,nota,comentario,origem,created_at&cliente_id=eq.${id}&order=created_at.desc&limit=5`),
  ]);
  const ultimoServico = ultimos.find((a) => a.status === 'concluido') || null;
  let proximaRevisao = null;
  if (ultimoServico) {
    const { meses, regra } = prazoDeRetorno(ultimoServico.servico, regras, cfg.meses_retorno);
    proximaRevisao = {
      data: somarDias(ultimoServico.data, meses * 30), meses,
      regra: regra?.rotulo || 'padrão', servico: ultimoServico.servico,
    };
  }
  return {
    cliente,
    resumo: v360 ? {
      servicos_feitos: Number(v360.servicos_feitos) || 0, faltas: Number(v360.faltas) || 0,
      total_gasto: Number(v360.total_gasto) || 0, ultimo_servico_em: v360.ultimo_servico_em,
      proximo_horario: v360.proximo_horario,
    } : null,
    ultimoServico, proximaRevisao, agendamentos: ultimos, envios, respostas,
  };
}

// ============================================================================
// CONFIGURAÇÃO (linha única)
// ============================================================================

const FAIXAS = {
  dias_posvenda: [0, 30], meses_retorno: [1, 24], horas_lembrete: [1, 72], dias_orcamento: [1, 30],
  dias_nao_fechou: [1, 60], meses_reativacao: [3, 36], intervalo_minimo_dias: [0, 60],
  janela_inicio: [0, 23], janela_fim: [1, 24],
};
const PADRAO_NUM = {
  dias_posvenda: 2, meses_retorno: 6, horas_lembrete: 20, dias_orcamento: 3, dias_nao_fechou: 7,
  meses_reativacao: 12, intervalo_minimo_dias: 7, janela_inicio: 8, janela_fim: 20,
};

export async function obterConfig() {
  const c = (await selecionarUm(T.config, `select=*&${LINHA_UNICA}`)) || {};
  const cfg = {};
  for (const r of REGUAS) {
    cfg[`ativo_${r}`] = !!c[`ativo_${r}`];
    cfg[`msg_${r}`] = c[`msg_${r}`] || '';
  }
  for (const [k, padrao] of Object.entries(PADRAO_NUM)) cfg[k] = Number(c[k] ?? padrao);
  cfg.hora_envio = String(c.hora_envio || '09:30').slice(0, 5);
  cfg.link_avaliacao = c.link_avaliacao || '';
  cfg.envia_domingo = !!c.envia_domingo;
  cfg.pausa_geral = !!c.pausa_geral;
  cfg.telefone_teste = c.telefone_teste || '';
  cfg.carteiro_configurado = !!c.runner_token;
  cfg.updated_at = c.updated_at || null;
  return cfg;
}

export async function salvarConfig(dados) {
  const campos = {};
  for (const r of REGUAS) {
    if (dados[`ativo_${r}`] !== undefined) campos[`ativo_${r}`] = dados[`ativo_${r}`] === true;
    const msg = dados[`msg_${r}`];
    if (msg !== undefined && String(msg).trim()) campos[`msg_${r}`] = String(msg).trim().slice(0, 1000);
  }
  for (const [k, [min, max]] of Object.entries(FAIXAS)) {
    if (dados[k] === undefined) continue;
    const n = Number(dados[k]);
    if (Number.isInteger(n) && n >= min && n <= max) campos[k] = n;
  }
  if (campos.janela_inicio !== undefined || campos.janela_fim !== undefined) {
    const atual = await obterConfig();
    const ini = campos.janela_inicio ?? atual.janela_inicio;
    const fim = campos.janela_fim ?? atual.janela_fim;
    if (ini >= fim) { delete campos.janela_inicio; delete campos.janela_fim; }
  }
  if (dados.hora_envio !== undefined) {
    const m = String(dados.hora_envio).match(/^(\d{1,2}):(\d{2})/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) campos.hora_envio = `${String(m[1]).padStart(2, '0')}:${m[2]}:00`;
  }
  if (dados.link_avaliacao !== undefined) {
    const l = String(dados.link_avaliacao || '').trim();
    campos.link_avaliacao = /^https?:\/\/\S+$/i.test(l) ? l.slice(0, 500) : null;
  }
  if (dados.envia_domingo !== undefined) campos.envia_domingo = dados.envia_domingo === true;
  if (dados.pausa_geral !== undefined) campos.pausa_geral = dados.pausa_geral === true;
  if (dados.telefone_teste !== undefined) {
    const t = soDigitos(dados.telefone_teste);
    campos.telefone_teste = t.length >= 10 ? t : null;
  }
  if (Object.keys(campos).length) await atualizarUm(T.config, LINHA_UNICA, campos);
  return obterConfig();
}

// ============================================================================
// REGRAS DE RETORNO (prazo por tipo de serviço) e MODELOS
// ============================================================================

function lerRegra(r) {
  return {
    id: r.id, rotulo: r.rotulo, palavras: Array.isArray(r.palavras) ? r.palavras : [],
    meses: Number(r.meses), mensagem: r.mensagem || '', ativo: r.ativo !== false, ordem: Number(r.ordem ?? 100),
  };
}
const palavrasDaEntrada = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
  .map((p) => String(p).trim().toLowerCase()).filter(Boolean).slice(0, 30);

export async function listarRegras() {
  return (await selecionar(T.regras, 'select=*&order=ordem.asc,rotulo.asc')).map(lerRegra);
}

export async function criarRegra(d) {
  const rotulo = String(d.rotulo ?? '').trim().slice(0, 80);
  const palavras = palavrasDaEntrada(d.palavras);
  const meses = Number(d.meses);
  if (!rotulo || !palavras.length) throw new Error('Dê um nome à regra e pelo menos uma palavra do serviço.');
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) throw new Error('Prazo em meses entre 1 e 36.');
  const linha = await inserirUm(T.regras, {
    rotulo, palavras, meses, mensagem: String(d.mensagem ?? '').trim().slice(0, 1000) || null,
    ativo: d.ativo !== false, ordem: Number.isInteger(Number(d.ordem)) ? Number(d.ordem) : 100,
  }, 'select=*');
  return lerRegra(linha);
}

export async function atualizarRegra(id, d) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (d.rotulo !== undefined) campos.rotulo = String(d.rotulo).trim().slice(0, 80);
  if (d.palavras !== undefined) campos.palavras = palavrasDaEntrada(d.palavras);
  if (d.meses !== undefined) {
    const n = Number(d.meses);
    if (Number.isInteger(n) && n >= 1 && n <= 36) campos.meses = n;
  }
  if (d.mensagem !== undefined) campos.mensagem = String(d.mensagem ?? '').trim().slice(0, 1000) || null;
  if (d.ativo !== undefined) campos.ativo = d.ativo === true;
  if (d.ordem !== undefined && Number.isInteger(Number(d.ordem))) campos.ordem = Number(d.ordem);
  if (!Object.keys(campos).length) return lerRegra(await selecionarUm(T.regras, `select=*&id=eq.${id}`));
  const r = await atualizarUm(T.regras, `id=eq.${id}&select=*`, campos);
  return r ? lerRegra(r) : null;
}

export async function removerRegra(id) {
  if (!ehUuid(id)) return false;
  return (await remover(T.regras, `id=eq.${id}`)).length > 0;
}

export async function listarModelos() {
  return selecionar(T.modelos, 'select=id,titulo,categoria,corpo,ordem&order=ordem.asc,titulo.asc');
}

// ============================================================================
// FILA DE ENVIOS
// ============================================================================

export async function listarEnvios({ status, tipo, q, limite = 300 } = {}) {
  const p = new URLSearchParams('select=*');
  if (status && status !== 'todas') p.set('status', `eq.${status}`);
  if (tipo && tipo !== 'todos') p.set('tipo', `eq.${tipo}`);
  if (q) {
    const t = termoBusca(q);
    const dig = soDigitos(q);
    const partes = [`nome.ilike.${t}`, `corpo.ilike.${t}`, `resposta.ilike.${t}`];
    if (dig.length >= 4) partes.push(`telefone.ilike."*${dig}*"`);
    p.set('or', `(${partes.join(',')})`);
  }
  p.set('order', 'enviar_em.desc');
  p.set('limit', String(Math.min(Number(limite) || 300, 1000)));
  return selecionar(T.envios, p);
}

/**
 * Enfileira uma mensagem. Com chave_unica repetida devolve null em silêncio —
 * é assim que os geradores podem rodar quantas vezes for sem duplicar.
 */
export async function enfileirar({
  cliente_id = null, agendamento_id = null, lead_id = null, telefone, nome = null,
  tipo, corpo, enviar_em = null, chave_unica = null, criado_por = null,
  status = 'pendente', motivo_pulado = null, lote = null,
}) {
  const tel = soDigitos(telefone);
  if (!tel || !corpo || !tipo) return null;
  try {
    return await inserirUm(T.envios, {
      cliente_id: uuidOuNulo(cliente_id),
      agendamento_id: uuidOuNulo(agendamento_id),
      lead_id: uuidOuNulo(lead_id),
      telefone: tel, nome, tipo, corpo: String(corpo).slice(0, 2000),
      enviar_em: enviar_em || new Date().toISOString(),
      chave_unica, criado_por, status, motivo_pulado, lote: uuidOuNulo(lote),
    }, 'select=*');
  } catch (e) {
    if (e?.status === 409) return null; // chave_unica repetida: já estava na fila
    throw e;
  }
}

export async function cancelarEnvio(id) {
  if (!ehUuid(id)) return null;
  // só cancela o que ainda não saiu — um enviado é história, não se reescreve
  return atualizarUm(T.envios, `id=eq.${id}&status=eq.pendente`, { status: 'cancelado' });
}

/** Falhou/cancelada/pulada volta para a fila agora. */
export async function reenfileirar(id) {
  if (!ehUuid(id)) return null;
  return atualizarUm(T.envios, `id=eq.${id}&status=in.(falhou,cancelado,pulado)`, {
    status: 'pendente', erro: null, motivo_pulado: null, enviar_em: new Date().toISOString(),
  });
}

/** Pendentes que já venceram — o carteiro do server.js chama isto. */
export async function enviosDevidos(limite = 25) {
  const p = new URLSearchParams('select=*');
  p.set('status', 'eq.pendente');
  p.set('enviar_em', `lte.${new Date().toISOString()}`);
  p.set('order', 'enviar_em.asc');
  p.set('limit', String(limite));
  return selecionar(T.envios, p);
}

export async function marcarEnvio(id, status, erro = null, tentativas = undefined) {
  const campos = {
    status, erro,
    enviado_em: status === 'enviado' ? new Date().toISOString() : null,
  };
  if (Number.isInteger(tentativas)) campos.tentativas = tentativas;
  return atualizarUm(T.envios, `id=eq.${id}`, campos);
}

// ============================================================================
// SATISFAÇÃO
// ============================================================================

export async function listarRespostas(limite = 200) {
  const p = new URLSearchParams('select=*,clientes(nome,telefone)');
  p.set('order', 'created_at.desc');
  p.set('limit', String(limite));
  const linhas = await selecionar(T.respostas, p);
  return linhas.map((r) => {
    const { clientes, ...resto } = r;
    return { ...resto, cliente_nome: clientes?.nome ?? null, cliente_telefone: clientes?.telefone ?? null };
  });
}

export async function registrarResposta({ cliente_id, envio_id = null, agendamento_id = null,
  satisfeito, nota = null, comentario = null, registrado_por = null }) {
  return inserirUm(T.respostas, {
    cliente_id: uuidOuNulo(cliente_id),
    envio_id: uuidOuNulo(envio_id),
    agendamento_id: uuidOuNulo(agendamento_id),
    satisfeito: satisfeito === true,
    nota: Number.isInteger(Number(nota)) && nota >= 1 && nota <= 5 ? Number(nota) : null,
    comentario: comentario ? String(comentario).slice(0, 1000) : null,
    registrado_por, origem: 'manual',
  }, 'select=*');
}

export async function removerResposta(id) {
  if (!ehUuid(id)) return false;
  const r = await remover(T.respostas, `id=eq.${id}`);
  return r.length > 0;
}

// ============================================================================
// PORTEIRO — consentimento e intervalo mínimo entre mensagens
// ============================================================================

export async function carregarPorteiro(cfg) {
  const optOut = await selecionarTudo(T.clientes, 'select=id,telefone_e164&aceita_mensagens=is.false');
  const idsFora = new Set(optOut.map((c) => c.id));
  const telsFora = new Set(optOut.map((c) => c.telefone_e164).filter(Boolean));

  const recentes = new Set();
  const dias = Number(cfg.intervalo_minimo_dias) || 0;
  if (dias > 0) {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const p = new URLSearchParams('select=telefone,cliente_id');
    p.set('status', 'in.(enviado,pendente)');
    p.set('enviar_em', `gte.${desde}`);
    p.set('tipo', `in.(${[...TIPOS_RELACIONAMENTO].join(',')})`);
    for (const e of await selecionarTudo(T.envios, p)) {
      const t = telefoneNacional(e.telefone);
      if (t) recentes.add(t);
      if (e.cliente_id) recentes.add(e.cliente_id);
    }
  }

  return {
    totalForaDaLista: optOut.length,
    /** { ok } ou { ok:false, motivo, definitivo } — definitivo = grava 'pulado'; senão só adia. */
    podeReceber({ cliente_id, telefone, tipo }) {
      const t = telefoneNacional(telefone);
      if ((cliente_id && idsFora.has(cliente_id)) || (t && telsFora.has(t))) {
        return { ok: false, definitivo: true, motivo: 'cliente pediu para não receber mensagens' };
      }
      if (TIPOS_RELACIONAMENTO.has(tipo) && ((cliente_id && recentes.has(cliente_id)) || (t && recentes.has(t)))) {
        return { ok: false, definitivo: false, motivo: `já recebeu mensagem há menos de ${dias} dias` };
      }
      return { ok: true };
    },
    marcar({ cliente_id, telefone }) {
      const t = telefoneNacional(telefone);
      if (t) recentes.add(t);
      if (cliente_id) recentes.add(cliente_id);
    },
  };
}

/** Passa pelo porteiro e enfileira (ou só anota, em simulação). */
async function entregarAoPorteiro(porteiro, dados, ctx) {
  const veredito = porteiro.podeReceber(dados);
  if (!veredito.ok) {
    const anotado = { ...dados, motivo: veredito.motivo, definitivo: veredito.definitivo };
    if (veredito.definitivo) {
      if (!ctx.simular) {
        const p = await enfileirar({ ...dados, status: 'pulado', motivo_pulado: veredito.motivo });
        if (!p) return null; // já estava anotado
      }
      ctx.pulados.push(anotado);
    } else {
      ctx.adiados.push(anotado);
    }
    return null;
  }
  if (ctx.simular) { ctx.previa.push(dados); return dados; }
  const criado = await enfileirar(dados);
  if (criado) { porteiro.marcar(dados); ctx.criados.push(criado); }
  return criado;
}

// ============================================================================
// GERADORES (as réguas) — olham o banco e ENFILEIRAM (não enviam nada)
// ============================================================================

const A_SEL = 'select=id,cliente_id,lead_id,cliente_nome,telefone,servico,veiculo,placa,data,hora,status';

/** Lembrete de horário: X horas antes do agendamento (aguardando/confirmado). */
export async function gerarLembretes(cfg, porteiro, ctx) {
  const h = hoje();
  const ate = somarDias(h, Math.ceil(cfg.horas_lembrete / 24));
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'in.(aguardando,confirmado)');
  p.set('data', `gte.${h}`);
  p.append('data', `lte.${ate}`);
  const agora = Date.now();
  for (const a of await selecionar(T.agendamentos, p)) {
    if (!soDigitos(a.telefone)) continue;
    const faltam = (instanteSP(a.data, a.hora || '08:00').getTime() - agora) / 36e5;
    if (faltam < 1 || faltam > cfg.horas_lembrete) continue; // tarde demais, ou ainda cedo
    const corpo = renderTemplate(cfg.msg_lembrete, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o atendimento',
      quando: quandoRelativo(a.data, a.hora, h),
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'lembrete', corpo, enviar_em: new Date().toISOString(), chave_unica: `lembrete:${a.id}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Aniversariantes de hoje → fila. Dedupe por cliente+ano. */
export async function gerarAniversarios(cfg, porteiro, ctx) {
  const d = hoje();
  const mmdd = d.slice(5);
  const ano = d.slice(0, 4);
  const clientes = await selecionarTudo(T.clientes, 'select=id,nome,telefone,carro_modelo,carro_ano,placa,nascimento&nascimento=not.is.null');
  for (const c of clientes) {
    if (String(c.nascimento || '').slice(5) !== mmdd) continue;
    if (!soDigitos(c.telefone)) continue;
    const corpo = renderTemplate(cfg.msg_aniversario, {
      nome: c.nome, carro: [c.carro_modelo, c.carro_ano].filter(Boolean).join(' '), placa: c.placa,
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: c.id, telefone: c.telefone, nome: c.nome, tipo: 'aniversario', corpo,
      enviar_em: hojeAs(cfg.hora_envio), chave_unica: `aniversario:${c.id}:${ano}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Serviços concluídos há N dias → "ficou tudo certo?". Dedupe por agendamento. */
export async function gerarPosvenda(cfg, porteiro, ctx) {
  const ate = somarDias(hoje(), -cfg.dias_posvenda);
  const desde = somarDias(ate, -5);            // janela de recuperação de 5 dias
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  for (const a of await selecionar(T.agendamentos, p)) {
    if (!soDigitos(a.telefone)) continue;
    const corpo = renderTemplate(cfg.msg_posvenda, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o serviço',
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'posvenda', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `posvenda:${a.id}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Visitas posteriores por cliente (qualquer status que não seja falta/cancelamento). */
async function ultimaVisitaDepoisDe(clientesIds, dataMinima) {
  const mapa = new Map(); // cliente_id -> maior data
  const ids = [...new Set(clientesIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 80) {
    const q = new URLSearchParams('select=cliente_id,data');
    q.set('cliente_id', `in.(${ids.slice(i, i + 80).join(',')})`);
    q.set('data', `gt.${dataMinima}`);
    q.set('status', 'not.in.(cancelado,nao_veio)');
    for (const n of await selecionarTudo(T.agendamentos, q)) {
      if (!mapa.has(n.cliente_id) || mapa.get(n.cliente_id) < n.data) mapa.set(n.cliente_id, n.data);
    }
  }
  return mapa;
}

/**
 * Revisão: cada serviço concluído tem um prazo (regra por tipo de serviço; sem
 * regra, meses_retorno). Quando o prazo vence (janela de 7 dias) e o cliente não
 * voltou depois, convida. Dedupe por agendamento.
 */
export async function gerarRetornos(cfg, porteiro, ctx, regras) {
  const h = hoje();
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${somarDias(h, -(36 * 30 + 10))}`);
  p.append('data', `lte.${somarDias(h, -25)}`);
  p.set('order', 'data.desc');
  const antigos = await selecionarTudo(T.agendamentos, p);
  if (!antigos.length) return;

  const candidatos = [];
  for (const a of antigos) {
    const { meses, regra } = prazoDeRetorno(a.servico, regras, cfg.meses_retorno);
    const vence = somarDias(a.data, meses * 30);
    if (vence > h || vence < somarDias(h, -7)) continue;
    candidatos.push({ ...a, meses, regra });
  }
  if (!candidatos.length) return;

  const voltaram = await ultimaVisitaDepoisDe(candidatos.map((a) => a.cliente_id), candidatos.reduce((m, a) => (a.data < m ? a.data : m), h));
  const jaConvidado = new Set();
  for (const a of candidatos) {
    if (!soDigitos(a.telefone)) continue;
    if (a.cliente_id && (voltaram.get(a.cliente_id) || '') > a.data) continue; // voltou depois: não convida
    const chaveCliente = a.cliente_id || telefoneNacional(a.telefone);
    if (jaConvidado.has(chaveCliente)) continue;                                   // um convite por cliente
    jaConvidado.add(chaveCliente);
    const corpo = renderTemplate(a.regra?.mensagem || cfg.msg_retorno, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o último serviço', meses: a.meses,
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'retorno', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `retorno:${a.id}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Orçamento parado há N dias no CRM → "conseguiu olhar?". Dedupe por lead. */
export async function gerarOrcamentos(cfg, porteiro, ctx) {
  const ate = new Date(Date.now() - cfg.dias_orcamento * 86400000).toISOString();
  const desde = new Date(Date.now() - (cfg.dias_orcamento + 7) * 86400000).toISOString();
  const p = new URLSearchParams('select=id,cliente_id,nome,telefone,carro_modelo,placa,servico,updated_at');
  p.set('status', 'eq.orcamento');
  p.set('updated_at', `lte.${ate}`);
  p.append('updated_at', `gte.${desde}`);
  for (const l of await selecionar(T.leads, p)) {
    if (!soDigitos(l.telefone)) continue;
    const corpo = renderTemplate(cfg.msg_orcamento, {
      nome: l.nome, carro: l.carro_modelo, placa: l.placa, servico: l.servico || 'o serviço',
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: l.cliente_id, lead_id: l.id, telefone: l.telefone, nome: l.nome,
      tipo: 'orcamento', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `orcamento:${l.id}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Veio e não fechou há N dias → "ainda posso ajudar?". Dedupe por agendamento. */
export async function gerarNaoFechou(cfg, porteiro, ctx) {
  const ate = somarDias(hoje(), -cfg.dias_nao_fechou);
  const desde = somarDias(ate, -5);
  const p = new URLSearchParams(A_SEL);
  p.set('status', 'eq.nao_fechou');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  const lista = await selecionar(T.agendamentos, p);
  if (!lista.length) return;
  const voltaram = await ultimaVisitaDepoisDe(lista.map((a) => a.cliente_id), desde);
  for (const a of lista) {
    if (!soDigitos(a.telefone)) continue;
    if (a.cliente_id && (voltaram.get(a.cliente_id) || '') > a.data) continue;
    const corpo = renderTemplate(cfg.msg_nao_fechou, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico || 'o serviço',
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: a.cliente_id, agendamento_id: a.id, lead_id: a.lead_id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'nao_fechou', corpo, enviar_em: hojeAs(cfg.hora_envio), chave_unica: `nao_fechou:${a.id}`, criado_por: 'gerador',
    }, ctx);
  }
}

/** Último serviço por cliente + última visita de qualquer tipo (lê os agendamentos uma vez). */
async function historicoPorCliente() {
  const todos = await selecionarTudo(T.agendamentos, 'select=id,cliente_id,cliente_nome,telefone,servico,veiculo,placa,data,status&cliente_id=not.is.null&order=data.asc');
  const mapa = new Map();
  for (const a of todos) {
    const h = mapa.get(a.cliente_id) || { ultimoServico: null, ultimaVisita: null, faltas30: 0 };
    if (a.status === 'concluido' && (!h.ultimoServico || h.ultimoServico.data <= a.data)) h.ultimoServico = a;
    if (!['cancelado', 'nao_veio'].includes(a.status) && (!h.ultimaVisita || h.ultimaVisita < a.data)) h.ultimaVisita = a.data;
    mapa.set(a.cliente_id, h);
  }
  return mapa;
}

/**
 * Reativação: cliente que já foi atendido, cujo último serviço foi há N meses
 * (janela de 30 dias) e que não voltou nem tem horário marcado. Uma vez por ano.
 */
export async function gerarReativacao(cfg, porteiro, ctx) {
  const h = hoje();
  const limiteSup = somarDias(h, -cfg.meses_reativacao * 30);
  const limiteInf = somarDias(limiteSup, -30);
  const historico = await historicoPorCliente();
  const alvos = [];
  for (const [clienteId, info] of historico) {
    const u = info.ultimoServico;
    if (!u || u.data > limiteSup || u.data < limiteInf) continue;
    if ((info.ultimaVisita || '') > u.data) continue; // voltou (ou tem horário) depois do último serviço
    alvos.push({ clienteId, u });
  }
  if (!alvos.length) return;
  const fichas = new Map((await clientesPorIds(alvos.map((x) => x.clienteId))).map((c) => [c.id, c]));
  for (const { clienteId, u } of alvos) {
    const c = fichas.get(clienteId);
    const telefone = c?.telefone || u.telefone;
    if (!soDigitos(telefone)) continue;
    const corpo = renderTemplate(cfg.msg_reativacao, {
      nome: c?.nome || u.cliente_nome, carro: c?.carro || u.veiculo, placa: c?.placa || u.placa, servico: u.servico,
    });
    await entregarAoPorteiro(porteiro, {
      cliente_id: clienteId, agendamento_id: u.id, telefone, nome: c?.nome || u.cliente_nome,
      tipo: 'reativacao', corpo, enviar_em: hojeAs(cfg.hora_envio),
      chave_unica: `reativacao:${clienteId}:${h.slice(0, 4)}`, criado_por: 'gerador',
    }, ctx);
  }
}

const GERADORES = {
  lembrete: gerarLembretes, posvenda: gerarPosvenda, retorno: gerarRetornos, aniversario: gerarAniversarios,
  orcamento: gerarOrcamentos, nao_fechou: gerarNaoFechou, reativacao: gerarReativacao,
  // 'avaliacao' é disparada pelo gatilho do banco quando o cliente responde bem ao pós-venda
};

/**
 * Roda as réguas. Em modo normal, só as ligadas, e enfileira de verdade.
 * Em simulação (`simular:true`) roda TODAS sem gravar nada e devolve o que
 * entraria na fila — é a "Prévia" da tela.
 */
export async function gerarTudo({ cfg = null, simular = false, so = null } = {}) {
  cfg = cfg || await obterConfig();
  const [porteiro, regras] = await Promise.all([carregarPorteiro(cfg), listarRegras()]);
  const ctx = { simular, criados: [], pulados: [], adiados: [], previa: [], erros: [] };
  const porRegua = {};
  for (const [tipo, gerar] of Object.entries(GERADORES)) {
    if (so && so !== tipo) continue;
    if (!simular && !cfg[`ativo_${tipo}`]) continue;
    const antes = { c: ctx.criados.length, p: ctx.pulados.length, a: ctx.adiados.length, v: ctx.previa.length };
    try {
      await gerar(cfg, porteiro, ctx, regras);
    } catch (e) {
      ctx.erros.push({ tipo, erro: String(e?.message || e) });
    }
    porRegua[tipo] = {
      ligada: !!cfg[`ativo_${tipo}`],
      criados: ctx.criados.length - antes.c, previa: ctx.previa.length - antes.v,
      pulados: ctx.pulados.length - antes.p, adiados: ctx.adiados.length - antes.a,
    };
  }
  return {
    simulado: simular, porRegua,
    criados: ctx.criados.length, pulados: ctx.pulados.length, adiados: ctx.adiados.length,
    previa: simular ? ctx.previa : undefined,
    puladosDetalhe: simular ? ctx.pulados : undefined,
    adiadosDetalhe: simular ? ctx.adiados : undefined,
    erros: ctx.erros,
    // compatibilidade com a tela antiga
    aniversario: porRegua.aniversario?.criados || 0,
    posvenda: porRegua.posvenda?.criados || 0,
    retorno: porRegua.retorno?.criados || 0,
  };
}

// ============================================================================
// SEGMENTOS (para campanhas) — sempre sem quem pediu para não receber
// ============================================================================

export const SEGMENTOS = [
  { id: 'todos', rotulo: 'Todos os clientes com telefone' },
  { id: 'aniversariantes_mes', rotulo: 'Aniversariantes deste mês' },
  { id: 'atendidos', rotulo: 'Atendidos nos últimos N dias', valor: 90, unidade: 'dias' },
  { id: 'sem_voltar', rotulo: 'Sem voltar há mais de N meses', valor: 6, unidade: 'meses' },
  { id: 'faltaram', rotulo: 'Faltaram nos últimos 30 dias' },
  { id: 'servico', rotulo: 'Fizeram um serviço (palavra)', valor: 'óleo', unidade: 'texto' },
];

export async function segmentar(filtro, valor) {
  const optOut = new Set((await selecionarTudo(T.clientes, 'select=id&aceita_mensagens=is.false')).map((c) => c.id));
  const limpar = (lista) => {
    const vistos = new Set();
    return lista.filter((c) => {
      if (!c || !soDigitos(c.telefone) || optOut.has(c.id) || vistos.has(c.id)) return false;
      vistos.add(c.id);
      return true;
    });
  };
  const h = hoje();

  switch (filtro) {
    case 'todos':
      return limpar((await selecionarTudo(T.clientes, `select=${CAMPOS_CLIENTE}&telefone=not.is.null&order=nome.asc`)).map(lerCliente));

    case 'aniversariantes_mes': {
      const mes = h.slice(5, 7);
      const lista = await selecionarTudo(T.clientes, `select=${CAMPOS_CLIENTE}&nascimento=not.is.null&order=nome.asc`);
      return limpar(lista.filter((c) => String(c.nascimento).slice(5, 7) === mes).map(lerCliente));
    }

    case 'atendidos': {
      const dias = Math.min(Math.max(Number(valor) || 90, 1), 3650);
      const ags = await selecionarTudo(T.agendamentos, `select=cliente_id&status=eq.concluido&data=gte.${somarDias(h, -dias)}&cliente_id=not.is.null`);
      return limpar(await clientesPorIds(ags.map((a) => a.cliente_id)));
    }

    case 'sem_voltar': {
      const meses = Math.min(Math.max(Number(valor) || 6, 1), 60);
      const limite = somarDias(h, -meses * 30);
      const historico = await historicoPorCliente();
      const ids = [];
      for (const [id, info] of historico) {
        if (info.ultimoServico && info.ultimoServico.data <= limite && (info.ultimaVisita || '') <= info.ultimoServico.data) ids.push(id);
      }
      return limpar(await clientesPorIds(ids));
    }

    case 'faltaram': {
      const ags = await selecionarTudo(T.agendamentos, `select=cliente_id&status=eq.nao_veio&data=gte.${somarDias(h, -30)}&cliente_id=not.is.null`);
      return limpar(await clientesPorIds(ags.map((a) => a.cliente_id)));
    }

    case 'servico': {
      const palavra = String(valor || '').trim();
      if (palavra.length < 2) return [];
      const p = new URLSearchParams('select=cliente_id');
      p.set('status', 'eq.concluido');
      p.set('cliente_id', 'not.is.null');
      p.set('servico', `ilike.*${palavra.replace(/[%*,()]/g, ' ')}*`);
      const ags = await selecionarTudo(T.agendamentos, p);
      return limpar(await clientesPorIds(ags.map((a) => a.cliente_id)));
    }

    default:
      throw new Error('Segmento desconhecido.');
  }
}

// ============================================================================
// RESUMO DO PAINEL
// ============================================================================

export async function resumo() {
  const d = hoje();
  const mes = d.slice(5, 7);
  const agora = Date.now();
  const inicioDia = instanteSP(d, '00:00').toISOString();
  const ini7 = new Date(agora - 7 * 86400000).toISOString();
  const ini30 = new Date(agora - 30 * 86400000).toISOString();
  const duasHorasAtras = new Date(agora - 2 * 3600000).toISOString();

  const [cfg, pendentes, vencidos, envios30, clientesComNasc, respostas, foraDaLista, proximos48h] = await Promise.all([
    obterConfig(),
    contar(T.envios, 'status=eq.pendente'),
    contar(T.envios, `status=eq.pendente&enviar_em=lte.${encodeURIComponent(duasHorasAtras)}`),
    selecionarTudo(T.envios, `select=id,tipo,status,enviado_em,respondido_em,resposta_tipo,agendou_depois_id,created_at,erro&created_at=gte.${encodeURIComponent(ini30)}`),
    selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento&nascimento=not.is.null'),
    selecionar(T.respostas, 'select=satisfeito,nota,created_at&order=created_at.desc&limit=1000'),
    contar(T.clientes, 'aceita_mensagens=is.false'),
    contar(T.agendamentos, `status=in.(aguardando,confirmado)&data=gte.${d}&data=lte.${somarDias(d, 1)}`),
  ]);

  const enviados30 = envios30.filter((e) => e.status === 'enviado');
  const enviados7 = enviados30.filter((e) => e.enviado_em >= ini7);
  const enviadosHoje = enviados30.filter((e) => e.enviado_em >= inicioDia).length;
  const respondidas30 = enviados30.filter((e) => e.respondido_em).length;
  const falhas = envios30.filter((e) => e.status === 'falhou').length;
  const ultimoErro = envios30.filter((e) => e.status === 'falhou' && e.erro).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]?.erro || null;

  // atribuição: agendamentos que vieram depois de uma mensagem (até 21 dias)
  const idsAg = enviados30.map((e) => e.agendou_depois_id).filter(Boolean);
  let agendaram = idsAg.length, receita = 0, concluidos = 0;
  if (idsAg.length) {
    const p = new URLSearchParams('select=id,valor,status');
    p.set('id', `in.(${idsAg.slice(0, 200).join(',')})`);
    for (const a of await selecionar(T.agendamentos, p)) {
      if (a.status === 'concluido') { concluidos++; receita += Number(a.valor) || 0; }
    }
  }

  const porRegua = {};
  for (const tipo of TIPOS_ENVIO) {
    const meus = enviados30.filter((e) => e.tipo === tipo);
    if (!meus.length && !cfg[`ativo_${tipo}`]) continue;
    porRegua[tipo] = {
      rotulo: ROTULO_TIPO[tipo] || tipo,
      ligada: cfg[`ativo_${tipo}`] ?? null,
      enviadas: meus.length,
      respondidas: meus.filter((e) => e.respondido_em).length,
      positivas: meus.filter((e) => e.resposta_tipo === 'positiva').length,
      negativas: meus.filter((e) => e.resposta_tipo === 'negativa').length,
      pararam: meus.filter((e) => e.resposta_tipo === 'parar').length,
      agendaram: meus.filter((e) => e.agendou_depois_id).length,
    };
  }

  const aniversariantesDoMes = clientesComNasc
    .filter((c) => String(c.nascimento).slice(5, 7) === mes)
    .map((c) => ({ nome: c.nome, telefone: c.telefone, dia: Number(String(c.nascimento).slice(8, 10)) }))
    .sort((a, b) => a.dia - b.dia);

  const total = respostas.length;
  const satisfeitos = respostas.filter((r) => r.satisfeito).length;
  const notas = respostas.map((r) => Number(r.nota)).filter((n) => n >= 1 && n <= 5);

  return {
    pendentes, vencidos, enviadosHoje, falhas, ultimoErro,
    semana: { enviadas: enviados7.length, respondidas: enviados7.filter((e) => e.respondido_em).length },
    mes30: { enviadas: enviados30.filter((e) => e.status === 'enviado').length, respondidas: respondidas30, agendaram, concluidos, receita },
    porRegua,
    reguasLigadas: REGUAS.filter((r) => cfg[`ativo_${r}`]),
    pausaGeral: cfg.pausa_geral,
    janela: { inicio: cfg.janela_inicio, fim: cfg.janela_fim, domingo: cfg.envia_domingo },
    carteiroConfigurado: cfg.carteiro_configurado,
    comNascimento: clientesComNasc.length,
    aniversariantesDoMes,
    foraDaLista,
    proximos48h,
    satisfacao: {
      total, satisfeitos, insatisfeitos: total - satisfeitos,
      pct: total ? Math.round((satisfeitos / total) * 100) : null,
      notaMedia: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null,
    },
  };
}

// ============================================================================
// SAÚDE DO SISTEMA (o vigia escreve, os painéis leem)
// ============================================================================

/** O carteiro grava o resultado da rodada no banco: o Render dorme e perde a memória do processo. */
export async function salvarUltimaRodada(resultado) {
  const compacto = { ...resultado };
  delete compacto.gerado?.previa; delete compacto.gerado?.puladosDetalhe; delete compacto.gerado?.adiadosDetalhe;
  return atualizarUm(T.config, LINHA_UNICA, { ultima_rodada: compacto, ultima_rodada_em: new Date().toISOString() }).catch(() => null);
}

export async function saude() {
  const [v, c] = await Promise.all([
    selecionarUm(T.vigia, 'select=problema,desde,checado_em,ultimo_resumo,avisado_em&id=is.true'),
    selecionarUm(T.config, `select=ultima_rodada,ultima_rodada_em&${LINHA_UNICA}`),
  ]);
  const problema = v?.problema || null;
  return {
    ultimaRodada: c?.ultima_rodada_em ? { em: c.ultima_rodada_em, resultado: c.ultima_rodada } : null,
    ok: !problema,
    problema,
    desde: v?.desde || null,
    checado_em: v?.checado_em || null,
    resumo: v?.ultimo_resumo || null,
    whatsappParado: /codewords|whatsapp/i.test(problema || ''),
  };
}

// ============================================================================
// PERFIL (porteiro — mesma tabela compartilhada)
// ============================================================================

export async function perfilAtivo(id) {
  const p = await selecionarUm(T.perfis, `select=ativo,papel,nome&id=eq.${encodeURIComponent(id)}`);
  return p?.ativo ? p : null;
}
