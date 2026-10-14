// IndyCar Comunicar — servidor HTTP (somente módulos nativos do Node)
// A central de comunicação da oficina: réguas automáticas (lembrete de horário,
// pós-venda, avaliação, revisão por tipo de serviço, aniversário, orçamento
// parado, não fechou, reativação), campanhas por segmento e satisfação —
// tudo saindo pelo WhatsApp DA EMPRESA.
// Banco: o MESMO Supabase do CRM, da Agenda e do Atendimento.
//
// Aqui mora a "fiação": WhatsApp, carteiro, IA, login e arquivos estáticos.
// As rotas e o porteiro de cada uma estão em rotas.js (testados sem banco);
// as regras de papel/app em acesso.js; as automações da equipe em automacoes.js.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as dados from './dados.js';
import * as ia from './ia.js';
import * as acesso from './acesso.js';
import * as auto from './automacoes.js';
import * as carteiro from './carteiro.js';
import { criarApi } from './rotas.js';
import { criarEstaticos } from './estaticos.js';
import { selecionarUm, conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3500;
export const VERSAO = '4.0.0';

/* Token do carteiro externo (GitHub Actions e o pg_cron do Supabase chamam
   /api/rodar de fora, para o caso do servidor gratuito do Render estar dormindo). */
const RUNNER_TOKEN = (process.env.RUNNER_TOKEN || '').trim();
const EM_PRODUCAO = !!process.env.RENDER;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const SEGUROS = acesso.cabecalhosSeguros({ https: EM_PRODUCAO });

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
  const [iaCfg, central] = await Promise.all([
    selecionarUm('agenda_ia_config', 'select=cw_api_key,cw_connect_service_id,cw_base_url&id=is.true'),
    selecionarUm('codewords_config', 'select=api_key,device_id&limit=1'),
  ]);
  const cfg = {
    api_key: central?.api_key || iaCfg?.cw_api_key || null,
    servico: iaCfg?.cw_connect_service_id || 'whatsapp_device_manager',
    base: (iaCfg?.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, ''),
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

const ultimaRodada = { em: null, resultado: null };
/* CARTEIRO_DESLIGADO=1: servidor local de conferência — sem timers e sem rodada
   (nada é gerado, nada é enviado, nada é gravado na fila). */
const CARTEIRO_DESLIGADO = /^(1|true|sim)$/i.test(String(process.env.CARTEIRO_DESLIGADO || '').trim());

/** O que o carteiro faz pela EQUIPE (não fala com cliente): falhas por régua e resumo semanal. */
async function equipeNaRodada() {
  const saida = {};
  saida.falhas = await auto.vigiarFalhas({ loja: dados.lojaEquipe }).catch((e) => ({ erro: String(e?.message || e) }));
  saida.resumo = await auto.resumoSemanalEquipe({ loja: dados.lojaEquipe }).catch((e) => ({ erro: String(e?.message || e) }));
  return saida;
}

/* Rodada 4: se já está rodando, quem chamou ESPERA a rodada atual (antes voltava
   "já está rodando" e o "Rodar agora" parecia falhar). */
let rodadaAtual = null;
function rodarCarteiro(origem = 'desconhecido') {
  if (CARTEIRO_DESLIGADO) return Promise.resolve({ ok: false, desligado: true, enviados: 0, falhas: 0, aviso: 'Carteiro desligado neste servidor (CARTEIRO_DESLIGADO=1): nada foi gerado nem enviado.' });
  if (rodadaAtual) return rodadaAtual.then((r) => ({ ...r, juntouComRodadaEmAndamento: true }));
  const inicio = Date.now();
  rodadaAtual = umaRodada()
    .catch((e) => {
      console.error('Carteiro:', e?.message || e);
      return { ok: false, erro: 'O carteiro não conseguiu rodar agora (banco ou rede fora). Ele tenta de novo sozinho na próxima chamada.', enviados: 0, falhas: 0, detalhe: String(e?.message || e).slice(0, 200) };
    })
    .then((r) => {
      dados.registrarBatida({
        origem, duracao_ms: Date.now() - inicio, ok: r.ok !== false, criados: r.gerado?.criados, enviados: r.enviados,
        falhas: r.falhas, expirados: r.expirados, presos: r.presos, aviso: r.aviso, erro: r.ok === false ? (r.detalhe || r.erro) : null, versao: VERSAO,
      });
      return { ...r, origem, duracao_ms: Date.now() - inicio };
    })
    .finally(() => { rodadaAtual = null; });
  return rodadaAtual;
}

/** "Ontem" ficou sem nenhuma rodada? (o servidor ficou fora o dia todo) */
function ontemSemRodada(ultimaRodadaEm) {
  if (!ultimaRodadaEm) return false; // nunca rodou: régua recém-ligada não manda parabéns atrasado
  const inicioDeOntem = dados.instanteSP(dados.somarDias(dados.hoje(), -1), '00:00').getTime();
  return new Date(ultimaRodadaEm).getTime() < inicioDeOntem;
}

async function umaRodada() {
  const cfg = await dados.obterConfig();
  // 1. o que ficou para trás e não faz mais sentido, e envios presos de um servidor que caiu
  const presos = await dados.soltarReservasPresas(carteiro.ERRO_RESERVA_PRESA, carteiro.RESERVA_PRESA_MIN).catch(() => 0);
  const expirados = await dados.expirarVencidos(carteiro.MOTIVO_EXPIRADO).catch(() => 0);
  // 2. as réguas geram (idempotente: chave única por cliente/agendamento)
  const gerado = await dados.gerarTudo({ cfg, recuperarOntem: ontemSemRodada(cfg.ultima_rodada_em) });
  const base = { ok: true, gerado, enviados: 0, falhas: 0, adiados: 0, reagendados: 0, expirados, presos, versao: VERSAO };

  // a IA lê as respostas novas (independe da janela: ninguém recebe nada por isso)
  base.ia = await lerRespostasComIA().catch((e) => ({ erro: String(e?.message || e) }));

  if (cfg.pausa_geral) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: 'Envios pausados: a pausa geral está ligada.' });
  const { hora, diaSemana, data } = dados.agoraSP();
  if (hora < cfg.janela_inicio || hora >= cfg.janela_fim) {
    return anotar({ ...base, equipe: await equipeNaRodada(), aviso: `Fora da janela de envio (${cfg.janela_inicio}h–${cfg.janela_fim}h).` });
  }
  if (diaSemana === 0 && !cfg.envia_domingo) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: 'Domingo: envios automáticos pausados.' });

  // limite por hora: nunca passa do configurado (padrão 60)
  const vagas = dados.vagasNestaRodada(cfg.limite_por_hora, await dados.enviadasNaUltimaHora().catch(() => 0));
  if (!vagas) return anotar({ ...base, equipe: await equipeNaRodada(), aviso: `Limite de ${cfg.limite_por_hora} mensagens por hora atingido — o resto sai na próxima rodada.` });

  const nomeFeriado = dados.feriado(data);
  const fila = await dados.enviosDevidos(Math.min(vagas + 10, 40)); // folga: alguns serão adiados
  // lembretes: confere o horário de AGORA (cancelado/remarcado enquanto o servidor dormia)
  const agendas = await dados.agendamentosPorIds(fila.filter((e) => e.tipo === 'lembrete').map((e) => e.agendamento_id)).catch(() => null);
  let enviados = 0, falhas = 0, adiados = 0, reagendados = 0, pulados = 0, parouPor = null;
  for (const envio of fila) {
    if (enviados >= vagas) break;
    if (carteiro.envioVencido(envio)) continue; // a faxina do começo pega na próxima
    // feriado nacional: régua de relacionamento espera o próximo dia útil
    if (nomeFeriado && dados.TIPOS_SEGURAM_NO_FERIADO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, dados.proximoDiaDeEnvio(data, cfg.hora_envio, cfg.envia_domingo), `feriado (${nomeFeriado})`).catch(() => {});
      adiados++; continue;
    }
    if (envio.tipo === 'lembrete' && envio.agendamento_id && agendas) {
      const c = carteiro.conferirLembrete(envio, agendas.get(envio.agendamento_id), cfg);
      if (c.acao === 'pular') { await dados.marcarEnvio(envio.id, 'pulado', null, undefined, { motivo_pulado: c.motivo }).catch(() => {}); pulados++; continue; }
      if (c.acao === 'atualizar') {
        await dados.atualizarEnvio(envio.id, { corpo: c.corpo, expira_em: c.expira_em, ...(c.enviar_em ? { enviar_em: c.enviar_em } : {}) }).catch(() => {});
        if (c.enviar_em) { reagendados++; continue; }
        envio.corpo = c.corpo;
      }
    }
    // alguém está atendendo o cliente agora → espera 3 h
    let ocup = { ocupada: false, conversa: undefined };
    try { ocup = await dados.ocupacaoDaConversa(envio.telefone); } catch { /* sem leitura: segue */ }
    if (ocup.ocupada && dados.TIPOS_ESPERAM_ATENDIMENTO.has(envio.tipo)) {
      await dados.adiarEnvio(envio.id, new Date(Date.now() + 3 * 3600000).toISOString(), ocup.motivo).catch(() => {});
      adiados++; continue;
    }

    // reserva: só quem reservou manda (outro carteiro pode estar na mesma fila)
    const reservado = await dados.reservarEnvio(envio.id).catch(() => null);
    if (!reservado) continue;

    const r = await enviarWhatsApp(envio.telefone, envio.corpo);
    const tentativas = (Number(envio.tentativas) || 0) + 1;
    if (r.ok) {
      /* Saiu: marcar como enviado com novas tentativas (o Supabase às vezes engasga).
         Se nem assim gravar, a reserva fica e vira "confira antes de reenviar" —
         nunca uma segunda mensagem para o cliente. */
      await carteiro.comTentativas(() => dados.marcarEnvio(envio.id, 'enviado', null, tentativas, { motivo_pulado: null }))
        .catch((e) => console.error(`Envio ${envio.id} saiu mas não consegui marcar:`, e?.message || e));
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
  return anotar({ ...base, equipe: await equipeNaRodada(), enviados, falhas, adiados, reagendados, pulados, feriado: nomeFeriado || undefined, aviso: parouPor || undefined });
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

/* A leitura das respostas avisa a equipe: tarefa para o dono da conversa e,
   em reclamação, notificação imediata aos gestores (automacoes.js). */
const lojaLeitura = {
  ...dados.lojaRespostas,
  depoisDaLeitura: (envio, r) => auto.aposLeituraDaIA({ envio, intencao: r.intencao, resumo: r.resumo, loja: dados.lojaEquipe }),
};

let lendoRespostas = false;
async function lerRespostasComIA() {
  if (lendoRespostas) return { pulou: 'já estava lendo' };
  lendoRespostas = true;
  try {
    const ctx = await contextoIA();
    return await ia.lerRespostas({ loja: lojaLeitura, ctx, autonomia: ctx.autonomia, limite: 20 });
  } catch (e) {
    return { erro: String(e?.message || e) };
  } finally { lendoRespostas = false; }
}

/** Uma chamada de IA da tela: mede, registra em ia_acoes e nunca derruba a rota. */
async function chamadaIA(res, usuario, tipo, resumo, fn) {
  const inicio = Date.now();
  let ctx;
  try { ctx = await contextoIA(); } catch (e) { return api.send(res, e.status || 503, { erro: e.message }); }
  try {
    const r = await fn(ctx);
    await dados.registrarAcaoIA({
      tipo, status: 'proposta', perfil_id: usuario?.id, resumo: typeof resumo === 'function' ? resumo(r) : resumo,
      saida: r.__log ?? null, modelo: r.modelo, tokens_entrada: r.uso?.input_tokens ?? null,
      tokens_saida: r.uso?.output_tokens ?? null, duracao_ms: Date.now() - inicio,
    });
    delete r.__log; delete r.uso;
    return api.send(res, 200, r);
  } catch (e) {
    await dados.registrarAcaoIA({ tipo, status: 'erro', perfil_id: usuario?.id, resumo: 'Falhou', erro: String(e?.message || e), duracao_ms: Date.now() - inicio });
    const status = e?.name === 'TimeoutError' ? 504 : 502;
    return api.send(res, status, { erro: e?.name === 'TimeoutError' ? 'A IA demorou demais. Tente de novo.' : 'A IA não respondeu agora. Tente de novo em instantes.' });
  }
}

// ============================================================================
// PORTEIRO — mesmo login do CRM, da Agenda e do Atendimento
//   token válido → perfil ativo → acesso ao app (acesso.js) → segundo fator
// ============================================================================

const SUPA_URL  = process.env.SUPABASE_URL || '';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || '';
const SUPA_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CACHE_LOGIN = new Map();

function cargaDoToken(token) {
  try {
    const [, carga] = token.split('.');
    return JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) || {};
  } catch { return {}; }
}

function lembrar(token, resultado, ms) {
  if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
  CACHE_LOGIN.set(token, { resultado, expira: Date.now() + ms });
  return resultado;
}

/** Perfil mudou (desativado, apps, senha trocada…): a próxima chamada confere de novo. */
function esquecerSessao(perfilId) {
  for (const [t, v] of CACHE_LOGIN) if (v.resultado?.usuario?.id === perfilId) CACHE_LOGIN.delete(t);
}

async function autenticar(req) {
  const auth = req.headers['authorization'] || '';
  const achado = /^\s*bearer\s+(\S+)\s*$/i.exec(auth);
  const token = achado ? achado[1] : null;
  if (!token) return { status: 401, codigo: 'sem_login', erro: 'Faça login para usar o Comunicar.' };
  if (!SUPA_URL || !SUPA_ANON || !SUPA_SRV) return { status: 503, codigo: 'sem_config', erro: 'O servidor está sem a configuração do Supabase.' };

  const lembrado = CACHE_LOGIN.get(token);
  if (lembrado && lembrado.expira > Date.now()) return lembrado.resultado;

  const carga = cargaDoToken(token);
  const vence = Number.isFinite(carga.exp) ? carga.exp * 1000 : 0;
  if (vence && vence <= Date.now()) return { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' };

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return lembrar(token, { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' }, 30_000);
    const u = await r.json();
    if (!u?.id) return lembrar(token, { status: 401, codigo: 'sessao_expirada', erro: 'Sua sessão expirou. Entre de novo.' }, 30_000);

    const perfil = await dados.perfilCompleto(u.id);
    const v = acesso.verificarAcesso(perfil);
    if (!v.ok) return lembrar(token, v, 30_000);
    // verificação em duas etapas: quem tem fator verificado precisa do código nesta sessão
    if (acesso.exigeSegundoFator(u, carga.aal)) return lembrar(token, { status: 401, codigo: 'mfa_pendente', erro: 'Digite o código do seu app autenticador.' }, 15_000);

    const usuario = {
      id: u.id, email: u.email, nome: perfil.nome, papel: perfil.papel, apps: perfil.apps || [],
      cargo: perfil.cargo, telefone: perfil.telefone, avatar_cor: perfil.avatar_cor,
      preferencias: perfil.preferencias || {}, precisa_trocar_senha: !!perfil.precisa_trocar_senha,
    };
    return lembrar(token, { usuario }, Math.min(60_000, (vence || Infinity) - Date.now()));
  } catch {
    return { status: 503, codigo: 'sem_conexao', erro: 'Não consegui conferir seu login agora. Tente de novo.' };
  }
}

// ============================================================================
// API (rotas.js) e arquivos estáticos
// ============================================================================

const api = criarApi({
  dados, ia, versao: VERSAO, runnerToken: RUNNER_TOKEN, https: EM_PRODUCAO, autenticar, esquecerSessao, chamadaIA,
  supabase: { url: SUPA_URL, anon: SUPA_ANON, configurado: !!(SUPA_URL && SUPA_ANON && SUPA_SRV) },
  whatsapp: { enviar: enviarWhatsApp, status: statusWhatsapp },
  carteiro: { rodar: rodarCarteiro, lerRespostas: lerRespostasComIA, ultimaRodada: () => (ultimaRodada.em ? ultimaRodada : null) },
});

/* Rodada 4: arquivos da tela em memória, comprimidos e com ETag (estaticos.js). */
const serveStatic = criarEstaticos({ pasta: PUBLIC, mime: MIME, seguros: SEGUROS });

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400, SEGUROS); return res.end(); }
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/')) {
      const ms = Date.now() - inicio;
      if (ms > 2000 || res.statusCode >= 500) console.log(`${req.method} ${url.pathname} → ${res.statusCode} em ${ms} ms`);
    }
  });
  try {
    if (url.pathname.startsWith('/api/')) return await api.api(req, res, url);
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    api.erroInterno(res, e);
  }
});
server.headersTimeout = 30_000;
server.requestTimeout = 60_000;

// ============================================================================
// Agendadores
// ============================================================================
const aviso = (onde) => (e) => console.error(`${onde}:`, e?.message || e);

// A cada 10 min o carteiro roda sozinho (com o servidor acordado). No Render
// gratuito o servidor DORME — por isso o GitHub Actions e o pg_cron do Supabase
// também chamam /api/rodar.
// CARTEIRO_DESLIGADO=1 (conferência local): nenhum timer é criado.
const timerCarteiro = CARTEIRO_DESLIGADO ? null : setInterval(() => rodarCarteiro('timer').catch(aviso('Carteiro')), 10 * 60 * 1000);
const timerInicial = CARTEIRO_DESLIGADO ? null : setTimeout(() => rodarCarteiro('inicio').catch(aviso('Carteiro')), 15 * 1000);

function encerrar(sinal) {
  console.log(`\n  ${sinal}: encerrando com calma…`);
  clearInterval(timerCarteiro); clearTimeout(timerInicial);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

function iniciar() {
  conferirConfiguracao();
  if (CARTEIRO_DESLIGADO) console.warn('  ⏸  CARTEIRO_DESLIGADO=1: nenhum envio, nenhuma rodada automática.');
  if (!RUNNER_TOKEN) console.warn('  ⚠  RUNNER_TOKEN não definido: /api/rodar (carteiro externo) fica fechado.');
  server.listen(PORT, () => {
    console.log(`\n  🏁 IndyCar Comunicar v${VERSAO} rodando em http://localhost:${PORT}`);
    console.log('  Banco: Supabase (PostgREST) — o mesmo do CRM, Agenda e Atendimento\n');
  });
}

iniciar();
