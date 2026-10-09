// IndyCar Comunicar — servidor HTTP (somente módulos nativos do Node)
// A central de comunicação da oficina: réguas automáticas (lembrete de horário,
// pós-venda, avaliação, revisão por tipo de serviço, aniversário, orçamento
// parado, não fechou, reativação), campanhas por segmento e satisfação —
// tudo saindo pelo WhatsApp DA EMPRESA.
// Banco: o MESMO Supabase do CRM, da Agenda e do Atendimento.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dados from './dados.js';
import * as ia from './ia.js';
import { selecionarUm, conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3500;
export const VERSAO = '2.1.0';

/* Token do carteiro externo (GitHub Actions e o pg_cron do Supabase chamam
   /api/rodar de fora, para o caso do servidor gratuito do Render estar dormindo). */
const RUNNER_TOKEN = (process.env.RUNNER_TOKEN || '').trim();

const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';
const LIMITE_CORPO = 2_000_000; // importação de planilha pode ser grande

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const CABECALHOS_SEGUROS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECALHOS_SEGUROS, ...headers });
  res.end(body);
}
const ok = (res, data) => send(res, 200, data);
const bad = (res, msg) => send(res, 400, { erro: msg });
const notFound = (res) => send(res, 404, { erro: 'Não encontrado' });

function readBody(req, limite = LIMITE_CORPO) {
  return new Promise((resolve) => {
    let raw = '';
    let estourou = false;
    req.on('data', (c) => {
      raw += c;
      if (raw.length > limite) { estourou = true; raw = ''; req.destroy(); }
    });
    req.on('end', () => {
      if (estourou) return resolve({ __grande: true });
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function telefoneInternacional(telefone) {
  let num = dados.soDigitos(telefone);
  if (num && num.length <= 11) num = '55' + num;
  return num;
}

// ============================================================================
// WHATSAPP DA EMPRESA — mesma fonte dos outros painéis:
//   • chave e serviço do CodeWords: agenda_ia_config (linha única)
//   • aparelho conectado: codewords_config (o Atendimento mantém atualizado)
// ============================================================================

const ERRO_CHAVE_RECUSADA = 'A chave do CodeWords foi recusada (401). Gere uma nova em runtime.codewords.ai e cole em Atendimento › Configurações › Integrações.';

let _cacheCw = { valor: null, em: 0 };
async function configWhatsapp(forcar = false) {
  if (!forcar && _cacheCw.valor && Date.now() - _cacheCw.em < 5 * 60_000) return _cacheCw.valor;
  const [ia, central] = await Promise.all([
    selecionarUm('agenda_ia_config', 'select=cw_api_key,cw_connect_service_id,cw_base_url&id=is.true'),
    selecionarUm('codewords_config', 'select=api_key,device_id&limit=1'),
  ]);
  const cfg = {
    api_key: central?.api_key || ia?.cw_api_key || null,
    servico: ia?.cw_connect_service_id || 'whatsapp_device_manager',
    base: (ia?.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, ''),
    device_id: central?.device_id || null,
  };
  _cacheCw = { valor: cfg, em: Date.now() };
  return cfg;
}

/** Erro "estrutural": com ele TODOS os envios falhariam igual — o carteiro para a rodada. */
const erroEstrutural = (erro) => /chave|conectado|CodeWords|401|aparelho/i.test(String(erro || ''));

/* Envia pelo número conectado (proxy GOWA). `phone_id`, não `device_id`:
   o CodeWords renomeou o parâmetro quando trocou /devices por /connections. */
async function enviarWhatsApp(telefone, mensagem) {
  const cfg = await configWhatsapp();
  if (!cfg.api_key) return { ok: false, erro: 'CodeWords sem chave (Atendimento › Configurações › Integrações).' };
  if (!cfg.device_id) return { ok: false, erro: 'Nenhum WhatsApp conectado — reconecte no painel de atendimento.' };
  const url = `${cfg.base}/run/${cfg.servico}/proxy/send/message?phone_id=${encodeURIComponent(cfg.device_id)}`;
  const body = new URLSearchParams({ phone: telefoneInternacional(telefone), message: mensagem }).toString();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: cfg.api_key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body, signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    let data = {};
    try { data = JSON.parse(texto); } catch { /* resposta sem JSON */ }
    if (r.status === 401 || r.status === 403) return { ok: false, erro: ERRO_CHAVE_RECUSADA };
    // HTTP 200 não é entrega: o proxy responde 200 com "skip"/"error" também.
    if (r.ok && /success/i.test(texto)) return { ok: true };
    return { ok: false, erro: data?.message || data?.detail || `O CodeWords respondeu ${r.status}: ${texto.slice(0, 120)}` };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}

/** Situação da conexão — só leitura, para a tela mostrar (cache de 60 s: a chamada leva até 15 s). */
let _cacheStatus = { valor: null, em: 0 };
async function statusWhatsapp() {
  if (_cacheStatus.valor && Date.now() - _cacheStatus.em < 60_000) return _cacheStatus.valor;
  const r = await statusWhatsappAgora();
  _cacheStatus = { valor: r, em: Date.now() };
  return r;
}
async function statusWhatsappAgora() {
  const cfg = await configWhatsapp();
  if (!cfg.api_key) return { ok: false, erro: 'CodeWords não configurado.' };
  try {
    const r = await fetch(`${cfg.base}/run/${cfg.servico}/connections`, {
      headers: { Authorization: cfg.api_key }, signal: AbortSignal.timeout(15000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, chaveRecusada: true, erro: ERRO_CHAVE_RECUSADA };
    if (!r.ok) return { ok: false, erro: `O CodeWords respondeu ${r.status}.` };
    const lista = await r.json();
    const viva = (Array.isArray(lista) ? lista : [])
      .find((c) => c.phone_id === cfg.device_id && /logged_in|connected/i.test(String(c.status || '')));
    return viva
      ? { ok: true, conectado: true, numero: viva.phone_number || null }
      : { ok: true, conectado: false };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}

// ============================================================================
// CARTEIRO — gera o que as réguas mandam e envia o que venceu
// ============================================================================

let carteiroRodando = false;
const ultimaRodada = { em: null, resultado: null };
/* CARTEIRO_DESLIGADO=1: servidor local de conferência — sem timers e sem rodada
   (nada é gerado, nada é enviado, nada é gravado na fila). */
const CARTEIRO_DESLIGADO = /^(1|true|sim)$/i.test(String(process.env.CARTEIRO_DESLIGADO || '').trim());

async function rodarCarteiro() {
  if (CARTEIRO_DESLIGADO) return { ok: false, desligado: true, enviados: 0, falhas: 0, aviso: 'Carteiro desligado neste servidor (CARTEIRO_DESLIGADO=1): nada foi gerado nem enviado.' };
  if (carteiroRodando) return { ok: false, erro: 'já está rodando' };
  carteiroRodando = true;
  try {
    const cfg = await dados.obterConfig();
    const gerado = await dados.gerarTudo({ cfg });
    const base = { ok: true, gerado, enviados: 0, falhas: 0, adiados: 0, reagendados: 0, versao: VERSAO };

    // a IA lê as respostas novas (independe da janela: ninguém recebe nada por isso)
    base.ia = await lerRespostasComIA().catch((e) => ({ erro: String(e?.message || e) }));

    if (cfg.pausa_geral) return anotar({ ...base, aviso: 'Envios pausados: a pausa geral está ligada.' });
    const { hora, diaSemana, data } = dados.agoraSP();
    if (hora < cfg.janela_inicio || hora >= cfg.janela_fim) {
      return anotar({ ...base, aviso: `Fora da janela de envio (${cfg.janela_inicio}h–${cfg.janela_fim}h).` });
    }
    if (diaSemana === 0 && !cfg.envia_domingo) return anotar({ ...base, aviso: 'Domingo: envios automáticos pausados.' });

    // limite por hora: nunca passa do configurado (padrão 60)
    const vagas = dados.vagasNestaRodada(cfg.limite_por_hora, await dados.enviadasNaUltimaHora().catch(() => 0));
    if (!vagas) return anotar({ ...base, aviso: `Limite de ${cfg.limite_por_hora} mensagens por hora atingido — o resto sai na próxima rodada.` });

    const nomeFeriado = dados.feriado(data);
    const fila = await dados.enviosDevidos(Math.min(vagas + 10, 40)); // folga: alguns serão adiados
    let enviados = 0, falhas = 0, adiados = 0, reagendados = 0, parouPor = null;
    for (const envio of fila) {
      if (enviados >= vagas) break;
      // feriado nacional: régua de relacionamento espera o próximo dia útil
      if (nomeFeriado && dados.TIPOS_SEGURAM_NO_FERIADO.has(envio.tipo)) {
        await dados.adiarEnvio(envio.id, dados.proximoDiaDeEnvio(data, cfg.hora_envio, cfg.envia_domingo), `feriado (${nomeFeriado})`).catch(() => {});
        adiados++; continue;
      }
      // alguém está atendendo o cliente agora → espera 3 h
      let ocup = { ocupada: false, conversa: undefined };
      try { ocup = await dados.ocupacaoDaConversa(envio.telefone); } catch { /* sem leitura: segue */ }
      if (ocup.ocupada && dados.TIPOS_ESPERAM_ATENDIMENTO.has(envio.tipo)) {
        await dados.adiarEnvio(envio.id, new Date(Date.now() + 3 * 3600000).toISOString(), ocup.motivo).catch(() => {});
        adiados++; continue;
      }

      const r = await enviarWhatsApp(envio.telefone, envio.corpo);
      const tentativas = (Number(envio.tentativas) || 0) + 1;
      if (r.ok) {
        await dados.marcarEnvio(envio.id, 'enviado', null, tentativas, { motivo_pulado: null });
        enviados++;
        // aparece no histórico da conversa do Atendimento (só depois de sair de verdade)
        await dados.registrarNoHistorico(envio, ocup.conversa).catch((e) => console.error(`Histórico do envio ${envio.id}:`, e?.message || e));
      } else {
        console.error(`Envio ${envio.id} falhou: ${r.erro}`);
        if (erroEstrutural(r.erro)) {
          /* Sem aparelho/chave TODOS falhariam igual: a mensagem volta para a
             fila (sem gastar tentativa) e a rodada para aqui, com o aviso claro. */
          await dados.marcarEnvio(envio.id, 'pendente', r.erro, Number(envio.tentativas) || 0).catch(() => {});
          falhas++;
          parouPor = r.erro;
          break;
        }
        // falha transitória: até 3 tentativas, com espera (5 e 15 min)
        const d = dados.decidirFalha(r.erro, tentativas);
        if (d.status === 'pendente') {
          await dados.marcarEnvio(envio.id, 'pendente', r.erro, tentativas, { enviar_em: d.enviar_em });
          reagendados++;
        } else {
          await dados.marcarEnvio(envio.id, 'falhou', r.erro, tentativas);
          falhas++;
        }
      }
      await new Promise((r2) => setTimeout(r2, 1200)); // 1 msg/1,2 s — sem rajada
    }
    return anotar({ ...base, enviados, falhas, adiados, reagendados, feriado: nomeFeriado || undefined, aviso: parouPor || undefined });
  } finally {
    carteiroRodando = false;
  }
}

function anotar(resultado) {
  ultimaRodada.em = new Date().toISOString();
  ultimaRodada.resultado = resultado;
  dados.salvarUltimaRodada(resultado).catch(() => {}); // o Render dorme: a memória do processo não basta
  return resultado;
}

// ============================================================================
// IA — contexto (chave, modelos, limite do dia) e leitura das respostas
// ============================================================================

/** Contexto da IA ou erro claro (desligada, sem chave, passou do limite do dia). */
async function contextoIA() {
  const cfg = await dados.iaConfig();
  if (!cfg.ativo) { const e = new Error('A IA está desligada (Atendimento › Configurações › IA).'); e.status = 503; throw e; }
  const chave = await dados.chaveIA();
  if (!chave) { const e = new Error('A IA está sem chave configurada.'); e.status = 503; throw e; }
  if ((await dados.chamadasIAHoje()) >= cfg.limite) { const e = new Error(`Limite de ${cfg.limite} chamadas de IA por dia atingido.`); e.status = 429; throw e; }
  return { chave, modelos: cfg.modelos, autonomia: cfg.autonomia };
}

let lendoRespostas = false;
async function lerRespostasComIA() {
  if (lendoRespostas) return { pulou: 'já estava lendo' };
  lendoRespostas = true;
  try {
    const ctx = await contextoIA();
    return await ia.lerRespostas({ loja: dados.lojaRespostas, ctx, autonomia: ctx.autonomia, limite: 20 });
  } catch (e) {
    return { erro: String(e?.message || e) };
  } finally { lendoRespostas = false; }
}

/** Uma chamada de IA da tela: mede, registra em ia_acoes e nunca derruba a rota. */
async function chamadaIA(res, usuario, tipo, resumo, fn) {
  const inicio = Date.now();
  let ctx;
  try { ctx = await contextoIA(); } catch (e) { return send(res, e.status || 503, { erro: e.message }); }
  try {
    const r = await fn(ctx);
    await dados.registrarAcaoIA({
      tipo, status: 'proposta', perfil_id: usuario?.id, resumo: typeof resumo === 'function' ? resumo(r) : resumo,
      saida: r.__log ?? null, modelo: r.modelo, tokens_entrada: r.uso?.input_tokens ?? null,
      tokens_saida: r.uso?.output_tokens ?? null, duracao_ms: Date.now() - inicio,
    });
    delete r.__log; delete r.uso;
    return ok(res, r);
  } catch (e) {
    await dados.registrarAcaoIA({ tipo, status: 'erro', perfil_id: usuario?.id, resumo: 'Falhou', erro: String(e?.message || e), duracao_ms: Date.now() - inicio });
    const status = e?.status === 401 ? 502 : (e?.name === 'TimeoutError' ? 504 : 502);
    return send(res, status, { erro: e?.name === 'TimeoutError' ? 'A IA demorou demais. Tente de novo.' : `A IA não respondeu agora: ${e?.message || e}` });
  }
}

/** Cliente de exemplo para a prévia das variações da IA. */
const EXEMPLO_PREVIA = { nome: 'Maria Aparecida Souza', carro: 'HB20 2019', placa: 'FHR6F16', servico: 'troca de óleo', quando: 'amanhã às 09:00', meses: 6, detalhe: 'sábado até 12h' };

// ============================================================================
// PORTEIRO — mesmo login do CRM, da Agenda e do Atendimento
// ============================================================================

const SUPA_URL  = process.env.SUPABASE_URL || '';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || '';
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CACHE_LOGIN = new Map();

function validadeDoToken(token) {
  try {
    const [, carga] = token.split('.');
    const { exp } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

async function usuarioLogado(req) {
  const auth = req.headers['authorization'] || '';
  const achado = /^\s*bearer\s+(\S+)\s*$/i.exec(auth);
  const token = achado ? achado[1] : null;
  if (!token || !SUPA_URL || !SUPA_ANON || !SUPA_SRV) return null;

  const lembrado = CACHE_LOGIN.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.negado ? null : lembrado.usuario;

  const vence = validadeDoToken(token);
  if (vence && vence <= Date.now()) return null;

  const negar = () => {
    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { negado: true, expira: Date.now() + 30_000 });
    return null;
  };

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return negar();
    const usuario = await r.json();
    if (!usuario?.id) return negar();

    const perfil = await dados.perfilAtivo(usuario.id);
    if (!perfil) return negar();
    /* Papel 'agenda' (ex.: Franklin): só marca presença na Agenda. Aqui no
       Comunicar ele não entra — nada de mensagens nem lista de clientes. */
    if (perfil.papel === 'agenda') return negar();
    usuario.papel = perfil.papel;
    usuario.nome = perfil.nome;

    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { usuario, expira: Math.min(Date.now() + 60_000, vence || Infinity) });
    return usuario;
  } catch { return null; }
}

const ROTAS_SEM_LOGIN = new Set(['/api/config', '/api/rodar', '/api/ping']);
const ehGestor = (u) => ['admin', 'gestor'].includes(u?.papel);

// ============================================================================
// API
// ============================================================================

async function api(req, res, url) {
  const { pathname, searchParams } = url;
  const m = req.method;

  if (pathname === '/api/config' && m === 'GET') {
    return ok(res, {
      supabaseUrl: SUPA_URL,
      supabaseAnonKey: SUPA_ANON,
      configurado: !!(SUPA_URL && SUPA_ANON && SUPA_SRV),
      app: 'IndyCar Comunicar', versao: VERSAO,
    });
  }
  if (pathname === '/api/ping' && m === 'GET') return ok(res, { ok: true, versao: VERSAO });

  /* Carteiro externo (GitHub Actions / pg_cron): token próprio, sem login de pessoa.
     Sem RUNNER_TOKEN configurado a rota fica FECHADA — nunca aberta por engano. */
  if (pathname === '/api/rodar' && m === 'POST') {
    const t = req.headers['x-runner-token'] || searchParams.get('t') || '';
    if (!RUNNER_TOKEN || t !== RUNNER_TOKEN) return send(res, 403, { erro: 'Token do carteiro inválido.' });
    return ok(res, await rodarCarteiro());
  }

  let usuario = null;
  if (!ROTAS_SEM_LOGIN.has(pathname)) {
    usuario = await usuarioLogado(req);
    if (!usuario) return send(res, 401, { erro: 'Faça login para usar o Comunicar.' });
  }

  const body = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? await readBody(req) : {};
  if (body.__grande) return send(res, 413, { erro: 'Conteúdo grande demais.' });
  const quem = usuario?.nome || usuario?.email || null;

  // ---- painel
  if (pathname === '/api/resumo' && m === 'GET') return ok(res, await dados.resumo());
  if (pathname === '/api/saude' && m === 'GET') {
    const s = await dados.saude();
    return ok(res, { ...s, versao: VERSAO, ultimaRodada: ultimaRodada.em ? ultimaRodada : s.ultimaRodada });
  }
  if (pathname === '/api/whatsapp/status' && m === 'GET') return ok(res, await statusWhatsapp());
  if (pathname === '/api/perfil' && m === 'GET')
    return ok(res, { id: usuario.id, nome: usuario.nome || '', email: usuario.email, papel: usuario.papel });

  // ---- clientes (base compartilhada)
  if (pathname === '/api/clientes' && m === 'GET')
    return ok(res, await dados.listarClientes(searchParams.get('q') || undefined));
  let mm;
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}$`))) && m === 'PUT') {
    const c = await dados.atualizarCliente(mm[1], body, quem);
    return c ? ok(res, c) : notFound(res);
  }
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}/ficha$`))) && m === 'GET') {
    const f = await dados.fichaCliente(mm[1]);
    return f ? ok(res, f) : notFound(res);
  }
  if (pathname === '/api/clientes/importar' && m === 'POST') {
    const linhas = Array.isArray(body.linhas) ? body.linhas.slice(0, 2000) : [];
    if (!linhas.length) return bad(res, 'Nenhuma linha para importar.');
    return ok(res, await dados.importarClientes(linhas));
  }

  // ---- segmentos (para campanhas)
  if (pathname === '/api/segmentos' && m === 'GET') return ok(res, dados.SEGMENTOS);
  if (pathname === '/api/segmentos/previa' && m === 'GET') {
    const lista = await dados.segmentar(searchParams.get('filtro') || 'todos', searchParams.get('valor'));
    return ok(res, { total: lista.length, amostra: lista.slice(0, 12).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, carro: c.carro })) });
  }

  // ---- fila de mensagens
  if (pathname === '/api/envios' && m === 'GET') {
    return ok(res, await dados.listarEnvios({
      status: searchParams.get('status') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      q: searchParams.get('q') || undefined,
      de: searchParams.get('de') || undefined,
      ate: searchParams.get('ate') || undefined,
      intencao: searchParams.get('intencao') || undefined,
      limite: Math.min(Number(searchParams.get('limite')) || 300, 1000),
    }));
  }

  /* Campanha / avulsa: cada destino vira uma linha na fila, com o template já
     renderizado. Destinos podem vir listados (`destinos`) ou por segmento
     (`segmento: {filtro, valor}`) — aí o servidor resolve a lista, sem quem
     pediu para não receber. */
  if (pathname === '/api/envios' && m === 'POST') {
    const corpo = String(body.corpo ?? '').trim();
    if (!corpo) return bad(res, 'Escreva a mensagem.');
    if (corpo.length > 2000) return bad(res, 'Mensagem longa demais (máximo 2.000 caracteres).');
    let destinos = Array.isArray(body.destinos) ? body.destinos.slice(0, 2000) : [];
    if (!destinos.length && body.segmento?.filtro) {
      destinos = await dados.segmentar(body.segmento.filtro, body.segmento.valor);
    }
    if (!destinos.length) return bad(res, 'Escolha pelo menos um cliente.');
    const tipo = body.tipo === 'avulsa' || destinos.length === 1 ? 'avulsa' : 'campanha';
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date();
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');

    const porteiro = await dados.carregarPorteiro({ intervalo_minimo_dias: 0 });
    const lote = destinos.length > 1 ? randomUUID() : null; // agrupa a campanha na tela
    let enfileirados = 0, pulados = 0;
    for (const d of destinos) {
      const veredito = porteiro.podeReceber({ cliente_id: d.cliente_id ?? d.id ?? null, telefone: d.telefone, tipo });
      if (!veredito.ok) { pulados++; continue; }
      const criado = await dados.enfileirar({
        cliente_id: d.cliente_id ?? d.id ?? null,
        telefone: d.telefone, nome: d.nome ?? null, tipo,
        corpo: dados.renderTemplate(corpo, { nome: d.nome, carro: d.carro, placa: d.placa, detalhe: body.detalhe || '' }),
        enviar_em: enviarEm.toISOString(), criado_por: quem, lote,
      });
      if (criado) enfileirados++;
    }
    return ok(res, { ok: true, enfileirados, pulados, lote });
  }

  if ((mm = pathname.match(new RegExp(`^/api/envios/${UUID}/cancelar$`))) && m === 'POST') {
    const r = await dados.cancelarEnvio(mm[1]);
    return r ? ok(res, r) : bad(res, 'Só dá para cancelar mensagem que ainda não saiu.');
  }
  if ((mm = pathname.match(new RegExp(`^/api/envios/${UUID}/reenviar$`))) && m === 'POST') {
    const r = await dados.reenfileirar(mm[1]);
    return r ? ok(res, r) : bad(res, 'Só dá para reenviar mensagem que falhou, foi cancelada ou pulada.');
  }

  /* Teste real: manda AGORA para o telefone de teste (ou o informado), fora da
     fila e fora da janela — é o jeito de conferir que o WhatsApp está saindo. */
  if (pathname === '/api/envios/teste' && m === 'POST') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor pode mandar teste.' });
    const cfg = await dados.obterConfig();
    const telefone = dados.soDigitos(body.telefone || cfg.telefone_teste);
    if (telefone.length < 10) return bad(res, 'Informe um telefone de teste (em Réguas › Envio).');
    const corpo = dados.renderTemplate(String(body.corpo || 'Teste do IndyCar Comunicar: se você recebeu isto, o WhatsApp está saindo. 🏁'),
      { nome: usuario.nome || 'Equipe', carro: 'seu carro' });
    const r = await enviarWhatsApp(telefone, corpo);
    await dados.enfileirar({
      telefone, nome: `Teste (${quem || 'gestor'})`, tipo: 'avulsa', corpo, criado_por: quem,
      status: r.ok ? 'enviado' : 'falhou',
    }).then((e) => e && r.ok && dados.marcarEnvio(e.id, 'enviado', null, 1)).catch(() => {});
    return r.ok ? ok(res, { ok: true }) : send(res, 502, { erro: r.erro });
  }

  // gera (todas as réguas ligadas) e envia o que venceu — botão da tela
  if (pathname === '/api/rodar-agora' && m === 'POST') return ok(res, await rodarCarteiro());

  // prévia: o que as réguas enfileirariam agora, sem gravar nada
  if (pathname === '/api/previa' && m === 'GET') {
    const so = searchParams.get('regua') || null;
    return ok(res, await dados.gerarTudo({ simular: true, so }));
  }

  // ---- configuração (o caminho antigo /api/posvenda/config continua valendo)
  if ((pathname === '/api/comunicar/config' || pathname === '/api/posvenda/config') && m === 'GET')
    return ok(res, await dados.obterConfig());
  if ((pathname === '/api/comunicar/config' || pathname === '/api/posvenda/config') && m === 'PUT') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor altera as réguas.' });
    return ok(res, await dados.salvarConfig(body));
  }

  // ---- regras de retorno (prazo por serviço)
  if (pathname === '/api/regras-retorno' && m === 'GET') return ok(res, await dados.listarRegras());
  if (pathname === '/api/regras-retorno' && m === 'POST') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor altera as regras.' });
    try { return ok(res, await dados.criarRegra(body)); } catch (e) { return bad(res, e.message); }
  }
  if ((mm = pathname.match(new RegExp(`^/api/regras-retorno/${UUID}$`))) && m === 'PUT') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor altera as regras.' });
    const r = await dados.atualizarRegra(mm[1], body);
    return r ? ok(res, r) : notFound(res);
  }
  if ((mm = pathname.match(new RegExp(`^/api/regras-retorno/${UUID}$`))) && m === 'DELETE') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor altera as regras.' });
    return ok(res, { ok: await dados.removerRegra(mm[1]) });
  }

  // ---- histórico em CSV (abre no Excel)
  if (pathname === '/api/envios.csv' && m === 'GET') {
    const lista = await dados.listarEnvios({
      status: searchParams.get('status') || undefined, tipo: searchParams.get('tipo') || undefined,
      q: searchParams.get('q') || undefined, de: searchParams.get('de') || undefined, ate: searchParams.get('ate') || undefined,
      intencao: searchParams.get('intencao') || undefined, limite: 5000,
    });
    const nome = `comunicar-mensagens-${dados.hoje()}.csv`;
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store', ...CABECALHOS_SEGUROS });
    return res.end(dados.paraCSV(lista, dados.COLUNAS_CSV_ENVIOS));
  }
  if ((mm = pathname.match(new RegExp(`^/api/envios/${UUID}/desfazer-cancelamento$`))) && m === 'POST') {
    const r = await dados.desfazerCancelamento(mm[1]);
    return r ? ok(res, r) : bad(res, 'Essa mensagem não está cancelada.');
  }
  if ((mm = pathname.match(new RegExp(`^/api/envios/${UUID}/encaminhar$`))) && m === 'POST') {
    const r = await dados.encaminharEnvio(mm[1], usuario);
    if (!r) return notFound(res);
    return r.ok ? ok(res, r) : bad(res, r.erro);
  }

  // ---- relatórios e leitura das respostas
  if (pathname === '/api/relatorio' && m === 'GET') {
    const regua = searchParams.get('regua');
    if (regua && regua !== 'todas' && !dados.TIPOS_ENVIO.includes(regua)) return bad(res, 'Régua desconhecida.');
    return ok(res, await dados.relatorioRegua(regua || null, Math.min(Math.max(Number(searchParams.get('semanas')) || 8, 2), 26)));
  }
  if (pathname === '/api/intencoes' && m === 'GET') {
    return ok(res, await dados.intencoesRecentes(Math.min(Math.max(Number(searchParams.get('dias')) || 7, 1), 60)));
  }
  if (pathname === '/api/aniversarios' && m === 'GET') return ok(res, await dados.aniversariosDaBase());

  // ---- IA
  if (pathname === '/api/ia/status' && m === 'GET') {
    const [cfg, chave, hojeN] = await Promise.all([dados.iaConfig(), dados.chaveIA(), dados.chamadasIAHoje()]);
    return ok(res, { ativo: cfg.ativo, temChave: !!chave, autonomia: cfg.autonomia, chamadasHoje: hojeN, limite: cfg.limite });
  }
  if (pathname === '/api/ia/escrever' && m === 'POST') {
    const regua = String(body.regua || 'campanha');
    if (!ia.VARIAVEIS_POR_REGUA[regua]) return bad(res, 'Régua desconhecida.');
    const pedido = String(body.pedido || '').slice(0, 500), texto = String(body.texto || '').slice(0, 1500);
    return chamadaIA(res, usuario, 'escrever_mensagem', (r) => `${r.variacoes.length} variações para ${dados.ROTULO_TIPO[regua] || regua}`, async (ctx) => {
      const r = await ia.escreverMensagem({ regua, pedido, textoAtual: texto, quantidade: 3 }, ctx);
      const ex = body.exemplo && typeof body.exemplo === 'object' ? body.exemplo : {};
      const exemplo = {
        ...EXEMPLO_PREVIA,
        nome: String(ex.nome || EXEMPLO_PREVIA.nome).slice(0, 80), carro: String(ex.carro || EXEMPLO_PREVIA.carro).slice(0, 60),
        placa: String(ex.placa || EXEMPLO_PREVIA.placa).slice(0, 10),
        link_avaliacao: (await dados.obterConfig()).link_avaliacao || 'https://g.page/r/indycar',
      };
      const variacoes = r.variacoes.map((v) => ({ ...v, previa: dados.renderTemplate(v.texto, exemplo) }));
      return { variacoes, modelo: r.modelo, uso: r.uso, __log: { regua, pedido: pedido || null, variacoes: variacoes.map((v) => ({ texto: v.texto, ok: v.ok, problemas: v.problemas })) } };
    });
  }
  if (pathname === '/api/ia/publico' && m === 'POST') {
    return chamadaIA(res, usuario, 'sugerir_publico', (r) => `Sugeriu ${r.rotulo}${r.valor ? ` (${r.valor})` : ''}`, async (ctx) => {
      const numeros = await dados.numerosDaSemana();
      const r = await ia.sugerirPublico({ numeros, segmentos: dados.SEGMENTOS }, ctx);
      const lista = await dados.segmentar(r.segmento, r.valor).catch(() => []);
      return { ...r, previa: { total: lista.length, amostra: lista.slice(0, 8).map((c) => ({ id: c.id, nome: c.nome, carro: c.carro })) }, __log: { segmento: r.segmento, valor: r.valor, motivo: r.motivo, mensagem: r.mensagem } };
    });
  }
  if (pathname === '/api/ia/resumo' && m === 'GET') {
    const cfg = await dados.obterConfig();
    const idadeH = cfg.ia_resumo_em ? (Date.now() - new Date(cfg.ia_resumo_em).getTime()) / 36e5 : null;
    return ok(res, { texto: cfg.ia_resumo, em: cfg.ia_resumo_em, valido: idadeH !== null && idadeH < 6 });
  }
  if (pathname === '/api/ia/resumo' && m === 'POST') {
    const cfg = await dados.obterConfig();
    const idadeH = cfg.ia_resumo_em ? (Date.now() - new Date(cfg.ia_resumo_em).getTime()) / 36e5 : null;
    if (!body.forcar && cfg.ia_resumo && idadeH !== null && idadeH < 6) return ok(res, { texto: cfg.ia_resumo, em: cfg.ia_resumo_em, valido: true, cache: true });
    return chamadaIA(res, usuario, 'resumo_semana', 'Resumo da semana do Comunicar', async (ctx) => {
      const numeros = await dados.numerosDaSemana();
      const r = await ia.resumirSemana({ numeros }, ctx);
      if (!r.texto) throw new Error('a IA voltou sem texto');
      const salvo = await dados.salvarResumoIA(r.texto).catch(() => null);
      return { texto: r.texto, em: salvo?.ia_resumo_em || new Date().toISOString(), valido: true, cache: false, modelo: r.modelo, uso: r.uso, __log: { texto: r.texto } };
    });
  }
  if (pathname === '/api/ia/ler-respostas' && m === 'POST') {
    if (!ehGestor(usuario)) return send(res, 403, { erro: 'Só gestor dispara a leitura agora.' });
    const r = await lerRespostasComIA();
    return r.erro ? send(res, 503, r) : ok(res, r);
  }

  // ---- modelos prontos
  if (pathname === '/api/modelos' && m === 'GET') return ok(res, await dados.listarModelos());

  // ---- satisfação
  if (pathname === '/api/satisfacao' && m === 'GET') return ok(res, await dados.listarRespostas());
  if (pathname === '/api/satisfacao' && m === 'POST') {
    if (!dados.ehUuid(body.cliente_id)) return bad(res, 'Escolha o cliente.');
    if (body.satisfeito !== true && body.satisfeito !== false)
      return bad(res, 'Diga se o cliente ficou satisfeito ou não.');
    return ok(res, await dados.registrarResposta({ ...body, registrado_por: quem }));
  }
  if ((mm = pathname.match(new RegExp(`^/api/satisfacao/${UUID}$`))) && m === 'DELETE') {
    await dados.removerResposta(mm[1]);
    return ok(res, { ok: true });
  }

  return notFound(res);
}

// ============================================================================
// Arquivos estáticos
// ============================================================================
async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); }
  catch { return notFound(res); }
  const filePath = normalize(join(PUBLIC, rel));
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + sep)) return notFound(res);
  const ext = extname(filePath);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // o service worker e o HTML nunca podem ficar presos em cache; imagens podem
      'Cache-Control': /\.(png|svg|ico|woff2)$/.test(ext) ? 'public, max-age=86400' : 'no-cache, must-revalidate',
      ...CABECALHOS_SEGUROS,
    });
    res.end(data);
  } catch {
    if (ext && ext !== '.html') return notFound(res); // arquivo que não existe não vira index.html
    try {
      const html = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...CABECALHOS_SEGUROS });
      res.end(html);
    } catch { notFound(res); }
  }
}

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { erro: 'requisição malformada' }); }
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/')) {
      const ms = Date.now() - inicio;
      if (ms > 2000 || res.statusCode >= 500) console.log(`${req.method} ${url.pathname} → ${res.statusCode} em ${ms} ms`);
    }
  });
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, { erro: String(e?.message || 'Erro interno') });
  }
});

// ============================================================================
// Agendadores
// ============================================================================
const aviso = (onde) => (e) => console.error(`${onde}:`, e?.message || e);

// A cada 10 min o carteiro roda sozinho (com o servidor acordado). No Render
// gratuito o servidor DORME — por isso o GitHub Actions e o pg_cron do Supabase
// também chamam /api/rodar.
// CARTEIRO_DESLIGADO=1 (conferência local): nenhum timer é criado.
const timerCarteiro = CARTEIRO_DESLIGADO ? null : setInterval(() => rodarCarteiro().catch(aviso('Carteiro')), 10 * 60 * 1000);
const timerInicial = CARTEIRO_DESLIGADO ? null : setTimeout(() => rodarCarteiro().catch(aviso('Carteiro')), 15 * 1000);

function encerrar(sinal) {
  console.log(`\n  ${sinal}: encerrando com calma…`);
  clearInterval(timerCarteiro); clearTimeout(timerInicial);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

async function iniciar() {
  conferirConfiguracao();
  if (CARTEIRO_DESLIGADO) console.warn('  ⏸  CARTEIRO_DESLIGADO=1: nenhum envio, nenhuma rodada automática.');
  if (!RUNNER_TOKEN) {
    console.warn('  ⚠  RUNNER_TOKEN não definido: /api/rodar (carteiro externo) fica fechado.');
  }
  server.listen(PORT, () => {
    console.log(`\n  🏁 IndyCar Comunicar v${VERSAO} rodando em http://localhost:${PORT}`);
    console.log('  Banco: Supabase (PostgREST) — o mesmo do CRM, Agenda e Atendimento\n');
  });
}

iniciar();
