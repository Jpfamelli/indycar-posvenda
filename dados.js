// -----------------------------------------------------------------------------
// Camada de dados do IndyCar Pós-venda — fala com o MESMO Supabase do CRM, da
// Agenda e do Atendimento. Aqui moram:
//   • clientes (tabela compartilhada, agora com a coluna `nascimento`)
//   • posvenda_config    — textos e regras das mensagens automáticas
//   • posvenda_envios    — fila e histórico de mensagens programadas
//   • posvenda_respostas — satisfação do cliente (satisfeito/insatisfeito)
// Os GERADORES (aniversário, pós-venda, retorno) também moram aqui: eles só
// enfileiram; quem envia é o server.js, pelo WhatsApp da empresa.
// -----------------------------------------------------------------------------

import {
  selecionar, selecionarUm, selecionarTudo,
  inserirUm, atualizar, atualizarUm, remover, contar,
} from './supabase.js';

const T = {
  clientes: 'clientes',
  agendamentos: 'agendamentos',
  config: 'posvenda_config',
  envios: 'posvenda_envios',
  respostas: 'posvenda_respostas',
  perfis: 'perfis',
};

const LINHA_UNICA = 'id=is.true';

export const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

/** Mesma normalização da coluna gerada clientes.telefone_e164 (sem DDI 55). */
export function telefoneNacional(t) {
  const d = soDigitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d || null;
}

/** Data de hoje no fuso da oficina — NUNCA toISOString (UTC vira amanhã às 21h). */
export function hoje() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Soma dias a uma data 'YYYY-MM-DD' sem sair do calendário (meio-dia evita virada). */
export function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
const uuidOuNulo = (v) => (ehUuid(v) ? String(v).trim() : null);

/** Escapa o termo de busca para dentro de or=(...) do PostgREST. */
function termoBusca(q) {
  const limpo = String(q ?? '').replace(/["\\]/g, ' ').trim();
  return `"*${limpo}*"`;
}

/** 'YYYY-MM-DD' válida ou null (aceita DD/MM/AAAA da planilha). */
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
  // planilha às vezes traz só dia/mês ('12/05') — sem ano não é aniversário válido? É:
  // para mensagem de aniversário o ano não importa. Usamos 1904 (bissexto) de marcador.
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `1904-${p(mes)}-${p(dia)}`;
  }
  return null;
}

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
    observacoes: r.observacoes ?? null,
    created_at: r.created_at,
  };
}

export async function listarClientes(q) {
  const p = new URLSearchParams('select=*');
  if (q) {
    const t = termoBusca(q);
    p.set('or', `(nome.ilike.${t},telefone.ilike.${t},telefone_e164.ilike.${t},placa.ilike.${t})`);
  }
  p.set('order', 'nome.asc');
  const linhas = await selecionarTudo(T.clientes, p);
  return linhas.map(lerCliente);
}

export async function obterCliente(id) {
  if (!ehUuid(id)) return null;
  return lerCliente(await selecionarUm(T.clientes, `select=*&id=eq.${id}`));
}

/** Só os campos que o pós-venda pode mexer — a ficha completa é do CRM. */
export async function atualizarCliente(id, dados) {
  if (!ehUuid(id)) return null;
  const campos = {};
  if (dados.nascimento !== undefined) campos.nascimento = dataBanco(dados.nascimento);
  if (dados.telefone !== undefined) campos.telefone = soDigitos(dados.telefone) || null;
  if (dados.email !== undefined) campos.email = dados.email || null;
  if (dados.observacoes !== undefined) campos.observacoes = dados.observacoes || null;
  if (!Object.keys(campos).length) return obterCliente(id);
  return lerCliente(await atualizarUm(T.clientes, `id=eq.${id}&select=*`, campos));
}

/**
 * Importação de planilha: upsert por telefone (telefone_e164, a mesma coluna
 * gerada que a Agenda usa — o CRM grava com máscara e aqui só dígitos, e as
 * duas formas normalizam para o mesmo valor).
 * Devolve o que aconteceu com CADA linha — a tela mostra o resumo.
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
        // só PREENCHE o que está vazio — a planilha não sobrescreve a ficha viva
        const campos = {};
        for (const [k, v] of Object.entries(extras)) {
          if (existente[k] === null || existente[k] === undefined || existente[k] === '') campos[k] = v;
        }
        // nascimento é a razão de ser da importação: esse atualiza sempre que vier
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
// CONFIGURAÇÃO (linha única)
// ============================================================================

export async function obterConfig() {
  const c = (await selecionarUm(T.config, `select=*&${LINHA_UNICA}`)) || {};
  return {
    ativo_aniversario: !!c.ativo_aniversario,
    ativo_posvenda: !!c.ativo_posvenda,
    ativo_retorno: !!c.ativo_retorno,
    msg_aniversario: c.msg_aniversario || '',
    msg_posvenda: c.msg_posvenda || '',
    msg_retorno: c.msg_retorno || '',
    dias_posvenda: Number(c.dias_posvenda ?? 2),
    meses_retorno: Number(c.meses_retorno ?? 6),
    hora_envio: String(c.hora_envio || '09:30').slice(0, 5),
  };
}

export async function salvarConfig(dados) {
  const campos = {};
  for (const k of ['ativo_aniversario', 'ativo_posvenda', 'ativo_retorno']) {
    if (dados[k] !== undefined) campos[k] = dados[k] === true;
  }
  for (const k of ['msg_aniversario', 'msg_posvenda', 'msg_retorno']) {
    if (dados[k] !== undefined && String(dados[k]).trim()) campos[k] = String(dados[k]).trim();
  }
  if (dados.dias_posvenda !== undefined) {
    const n = Number(dados.dias_posvenda);
    if (Number.isInteger(n) && n >= 0 && n <= 30) campos.dias_posvenda = n;
  }
  if (dados.meses_retorno !== undefined) {
    const n = Number(dados.meses_retorno);
    if (Number.isInteger(n) && n >= 1 && n <= 24) campos.meses_retorno = n;
  }
  if (dados.hora_envio !== undefined) {
    const m = String(dados.hora_envio).match(/^(\d{1,2}):(\d{2})/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) {
      campos.hora_envio = `${String(m[1]).padStart(2, '0')}:${m[2]}:00`;
    }
  }
  if (Object.keys(campos).length) await atualizarUm(T.config, LINHA_UNICA, campos);
  return obterConfig();
}

// ============================================================================
// FILA DE ENVIOS
// ============================================================================

export async function listarEnvios({ status, tipo, limite = 300 } = {}) {
  const p = new URLSearchParams('select=*');
  if (status) p.set('status', `eq.${status}`);
  if (tipo) p.set('tipo', `eq.${tipo}`);
  p.set('order', 'enviar_em.desc');
  p.set('limit', String(limite));
  return selecionar(T.envios, p);
}

/**
 * Enfileira uma mensagem. Com chave_unica repetida devolve null em silêncio —
 * é assim que os geradores podem rodar quantas vezes for sem duplicar.
 */
export async function enfileirar({
  cliente_id = null, agendamento_id = null, telefone, nome = null,
  tipo, corpo, enviar_em = null, chave_unica = null, criado_por = null,
}) {
  const tel = soDigitos(telefone);
  if (!tel || !corpo || !tipo) return null;
  try {
    return await inserirUm(T.envios, {
      cliente_id: uuidOuNulo(cliente_id),
      agendamento_id: uuidOuNulo(agendamento_id),
      telefone: tel, nome, tipo, corpo,
      enviar_em: enviar_em || new Date().toISOString(),
      chave_unica, criado_por,
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

/** Pendentes que já venceram — o carteiro do server.js chama isto. */
export async function enviosDevidos(limite = 20) {
  const p = new URLSearchParams('select=*');
  p.set('status', 'eq.pendente');
  p.set('enviar_em', `lte.${new Date().toISOString()}`);
  p.set('order', 'enviar_em.asc');
  p.set('limit', String(limite));
  return selecionar(T.envios, p);
}

export async function marcarEnvio(id, status, erro = null) {
  return atualizarUm(T.envios, `id=eq.${id}`, {
    status, erro,
    enviado_em: status === 'enviado' ? new Date().toISOString() : null,
  });
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
    comentario: comentario || null,
    registrado_por,
  }, 'select=*');
}

export async function removerResposta(id) {
  if (!ehUuid(id)) return false;
  const r = await remover(T.respostas, `id=eq.${id}`);
  return r.length > 0;
}

// ============================================================================
// GERADORES — olham o banco e ENFILEIRAM (não enviam nada)
// ============================================================================

/** Substitui {nome} {primeiro_nome} {carro} {placa} {servico} {meses} no texto. */
export function renderTemplate(corpo, ctx) {
  const primeiro = String(ctx.nome || '').trim().split(/\s+/)[0] || '';
  const mapa = { ...ctx, primeiro_nome: primeiro, carro: ctx.carro || 'seu carro' };
  return String(corpo).replace(/\{(\w+)\}/g, (_, k) => (mapa[k] ?? ''))
    .replace(/\s{2,}/g, ' ').trim();
}

/** Instante de hoje às HH:MM no fuso da oficina, como ISO UTC p/ o banco. */
function hojeAs(horaHM) {
  // São Paulo é UTC-3 fixo (sem horário de verão desde 2019)
  return new Date(`${hoje()}T${horaHM}:00-03:00`).toISOString();
}

/** Aniversariantes de hoje → fila. Dedupe por cliente+ano. */
export async function gerarAniversarios(cfg) {
  const enfileirados = [];
  const d = hoje();                    // 'YYYY-MM-DD'
  const mmdd = d.slice(5);             // 'MM-DD'
  const ano = d.slice(0, 4);
  const clientes = await selecionarTudo(T.clientes, 'select=id,nome,telefone,carro_modelo,carro_ano,placa,nascimento&nascimento=not.is.null');
  for (const c of clientes) {
    if (String(c.nascimento || '').slice(5) !== mmdd) continue;
    if (!soDigitos(c.telefone)) continue;
    const corpo = renderTemplate(cfg.msg_aniversario, {
      nome: c.nome, carro: [c.carro_modelo, c.carro_ano].filter(Boolean).join(' '), placa: c.placa,
    });
    const criado = await enfileirar({
      cliente_id: c.id, telefone: c.telefone, nome: c.nome, tipo: 'aniversario', corpo,
      enviar_em: hojeAs(cfg.hora_envio), chave_unica: `aniversario:${c.id}:${ano}`,
      criado_por: 'gerador',
    });
    if (criado) enfileirados.push(criado);
  }
  return enfileirados;
}

/** Serviços concluídos há N dias → mensagem de pós-venda. Dedupe por agendamento. */
export async function gerarPosvenda(cfg) {
  const enfileirados = [];
  const ate = somarDias(hoje(), -cfg.dias_posvenda);
  const desde = somarDias(ate, -5);            // janela de recuperação de 5 dias
  const p = new URLSearchParams('select=id,cliente_id,cliente_nome,telefone,servico,veiculo,placa,data');
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  const ags = await selecionar(T.agendamentos, p);
  for (const a of ags) {
    if (!soDigitos(a.telefone)) continue;
    const corpo = renderTemplate(cfg.msg_posvenda, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa, servico: a.servico,
    });
    const criado = await enfileirar({
      cliente_id: a.cliente_id, agendamento_id: a.id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'posvenda', corpo, enviar_em: hojeAs(cfg.hora_envio),
      chave_unica: `posvenda:${a.id}`, criado_por: 'gerador',
    });
    if (criado) enfileirados.push(criado);
  }
  return enfileirados;
}

/**
 * Serviços concluídos há N meses (ex.: troca de óleo há 6 meses) → convite de
 * retorno. Só se o cliente NÃO voltou depois. Dedupe por agendamento.
 */
export async function gerarRetornos(cfg) {
  const enfileirados = [];
  const ate = somarDias(hoje(), -cfg.meses_retorno * 30);
  const desde = somarDias(ate, -7);            // janela de 7 dias
  const p = new URLSearchParams('select=id,cliente_id,cliente_nome,telefone,servico,veiculo,placa,data');
  p.set('status', 'eq.concluido');
  p.set('data', `gte.${desde}`);
  p.append('data', `lte.${ate}`);
  const antigos = await selecionar(T.agendamentos, p);
  if (!antigos.length) return enfileirados;

  // quem já voltou depois não recebe convite — busca 1x os retornos possíveis
  const clientesIds = [...new Set(antigos.map(a => a.cliente_id).filter(Boolean))];
  const voltaram = new Set();
  if (clientesIds.length) {
    const q = new URLSearchParams('select=cliente_id,data');
    q.set('cliente_id', `in.(${clientesIds.join(',')})`);
    q.set('data', `gt.${ate}`);
    q.set('status', 'not.in.(cancelado,nao_veio)');
    const novos = await selecionarTudo(T.agendamentos, q);
    for (const n of novos) voltaram.add(n.cliente_id);
  }

  for (const a of antigos) {
    if (!soDigitos(a.telefone)) continue;
    if (a.cliente_id && voltaram.has(a.cliente_id)) continue;
    const corpo = renderTemplate(cfg.msg_retorno, {
      nome: a.cliente_nome, carro: a.veiculo, placa: a.placa,
      servico: a.servico, meses: cfg.meses_retorno,
    });
    const criado = await enfileirar({
      cliente_id: a.cliente_id, agendamento_id: a.id, telefone: a.telefone, nome: a.cliente_nome,
      tipo: 'retorno', corpo, enviar_em: hojeAs(cfg.hora_envio),
      chave_unica: `retorno:${a.id}`, criado_por: 'gerador',
    });
    if (criado) enfileirados.push(criado);
  }
  return enfileirados;
}

/** Roda os três geradores conforme a config. Devolve o que cada um enfileirou. */
export async function gerarTudo() {
  const cfg = await obterConfig();
  const r = { aniversario: 0, posvenda: 0, retorno: 0 };
  if (cfg.ativo_aniversario) r.aniversario = (await gerarAniversarios(cfg)).length;
  if (cfg.ativo_posvenda) r.posvenda = (await gerarPosvenda(cfg)).length;
  if (cfg.ativo_retorno) r.retorno = (await gerarRetornos(cfg)).length;
  return r;
}

// ============================================================================
// RESUMO DO PAINEL
// ============================================================================

export async function resumo() {
  const d = hoje();
  const mes = d.slice(5, 7);
  const inicioDia = new Date(`${d}T00:00:00-03:00`).toISOString();

  const [pendentes, enviadosHoje, falhas, clientesComNasc, respostas] = await Promise.all([
    contar(T.envios, 'status=eq.pendente'),
    contar(T.envios, `status=eq.enviado&enviado_em=gte.${encodeURIComponent(inicioDia)}`),
    contar(T.envios, 'status=eq.falhou'),
    selecionarTudo(T.clientes, 'select=id,nome,telefone,nascimento&nascimento=not.is.null'),
    selecionar(T.respostas, 'select=satisfeito&order=created_at.desc&limit=1000'),
  ]);

  const aniversariantesDoMes = clientesComNasc
    .filter(c => String(c.nascimento).slice(5, 7) === mes)
    .map(c => ({ nome: c.nome, telefone: c.telefone, dia: Number(String(c.nascimento).slice(8, 10)) }))
    .sort((a, b) => a.dia - b.dia);

  const total = respostas.length;
  const satisfeitos = respostas.filter(r => r.satisfeito).length;

  return {
    pendentes, enviadosHoje, falhas,
    comNascimento: clientesComNasc.length,
    aniversariantesDoMes,
    satisfacao: {
      total, satisfeitos, insatisfeitos: total - satisfeitos,
      pct: total ? Math.round((satisfeitos / total) * 100) : null,
    },
  };
}

// ============================================================================
// PERFIL (porteiro — mesma tabela compartilhada)
// ============================================================================

export async function perfilAtivo(id) {
  const p = await selecionarUm(T.perfis, `select=ativo,papel,nome&id=eq.${encodeURIComponent(id)}`);
  return p?.ativo ? p : null;
}
