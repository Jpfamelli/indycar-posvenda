// IndyCar Pós-venda — servidor HTTP (somente módulos nativos do Node)
// Mensagens programadas (aniversário, pós-venda, retorno e campanhas) saindo
// pelo WhatsApp DA EMPRESA, e registro de satisfação dos clientes.
// Banco: o MESMO Supabase do CRM, da Agenda e do Atendimento.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import * as dados from './dados.js';
import { selecionarUm, conferirConfiguracao } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3500;

/* Token do carteiro externo (GitHub Actions chama /api/rodar de fora para o
   caso do servidor gratuito do Render estar dormindo na hora do envio). */
const RUNNER_TOKEN = (process.env.RUNNER_TOKEN || '').trim();

// Janela de envio: mensagem automática não sai de madrugada, nem que a fila
// tenha acumulado. Fora da janela o carteiro só espera.
const ENVIA_DAS = 8, ENVIA_ATE = 20; // horas, fuso da oficina

const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
const ok = (res, data) => send(res, 200, data);
const bad = (res, msg) => send(res, 400, { erro: msg });
const notFound = (res) => send(res, 404, { erro: 'Não encontrado' });

function readBody(req, limite = 2_000_000) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > limite) { raw = ''; req.destroy(); } });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function telefoneInternacional(telefone) {
  let num = dados.soDigitos(telefone);
  if (num && num.length <= 11) num = '55' + num;
  return num;
}

/** Hora atual no fuso da oficina (0-23). */
function horaSP() {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false,
  }).format(new Date()));
}

// ============================================================================
// WHATSAPP DA EMPRESA — mesma fonte dos outros painéis:
//   • chave e serviço do CodeWords: agenda_ia_config (linha única)
//   • aparelho conectado: codewords_config (o Atendimento mantém atualizado)
// ============================================================================

let _cacheCw = { valor: null, em: 0 };
async function configWhatsapp() {
  if (_cacheCw.valor && Date.now() - _cacheCw.em < 5 * 60_000) return _cacheCw.valor;
  const [ia, central] = await Promise.all([
    selecionarUm('agenda_ia_config', 'select=cw_api_key,cw_connect_service_id,cw_base_url&id=is.true'),
    selecionarUm('codewords_config', 'select=device_id&limit=1'),
  ]);
  const cfg = {
    api_key: ia?.cw_api_key || null,
    servico: ia?.cw_connect_service_id || 'whatsapp_device_manager',
    base: (ia?.cw_base_url || 'https://runtime.codewords.ai').replace(/\/+$/, ''),
    device_id: central?.device_id || null,
  };
  _cacheCw = { valor: cfg, em: Date.now() };
  return cfg;
}

/* Envia pelo número conectado (proxy GOWA). `phone_id`, não `device_id`:
   o CodeWords renomeou o parâmetro quando trocou /devices por /connections. */
async function enviarWhatsApp(telefone, mensagem) {
  const cfg = await configWhatsapp();
  if (!cfg.api_key) return { ok: false, erro: 'CodeWords sem chave (Atendimento › Configurações).' };
  if (!cfg.device_id) return { ok: false, erro: 'Nenhum WhatsApp conectado — reconecte no painel de atendimento.' };
  const url = `${cfg.base}/run/${cfg.servico}/proxy/send/message?phone_id=${encodeURIComponent(cfg.device_id)}`;
  const body = new URLSearchParams({ phone: telefoneInternacional(telefone), message: mensagem }).toString();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: cfg.api_key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body, signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && /success/i.test(JSON.stringify(data))) return { ok: true };
    return { ok: false, erro: data?.message || data?.detail || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}

/** Situação da conexão — só leitura, para a tela mostrar. */
async function statusWhatsapp() {
  const cfg = await configWhatsapp();
  if (!cfg.api_key) return { ok: false, erro: 'CodeWords não configurado.' };
  try {
    const r = await fetch(`${cfg.base}/run/${cfg.servico}/connections`, {
      headers: { Authorization: cfg.api_key }, signal: AbortSignal.timeout(15000),
    });
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
// CARTEIRO — gera o que a config manda e envia o que venceu
// ============================================================================

let carteiroRodando = false;

async function rodarCarteiro() {
  if (carteiroRodando) return { ok: false, erro: 'já está rodando' };
  carteiroRodando = true;
  try {
    const gerado = await dados.gerarTudo();

    const h = horaSP();
    if (h < ENVIA_DAS || h >= ENVIA_ATE) {
      return { ok: true, gerado, enviados: 0, aviso: `Fora da janela de envio (${ENVIA_DAS}h–${ENVIA_ATE}h).` };
    }

    const fila = await dados.enviosDevidos(20);
    let enviados = 0, falhas = 0;
    for (const envio of fila) {
      const r = await enviarWhatsApp(envio.telefone, envio.corpo);
      if (r.ok) {
        await dados.marcarEnvio(envio.id, 'enviado');
        enviados++;
      } else {
        await dados.marcarEnvio(envio.id, 'falhou', r.erro);
        falhas++;
        console.error(`Envio ${envio.id} falhou: ${r.erro}`);
        /* Sem aparelho/chave TODOS falhariam igual — para de tentar agora e
           deixa o resto pendente para o próximo ciclo, já com o aviso claro. */
        if (/conectado|chave|CodeWords/i.test(r.erro)) {
          await dados.marcarEnvio(envio.id, 'pendente', null).catch(() => {});
          break;
        }
      }
      await new Promise((r2) => setTimeout(r2, 1200)); // 1 msg/1,2s — sem rajada
    }
    return { ok: true, gerado, enviados, falhas };
  } finally {
    carteiroRodando = false;
  }
}

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
       Pós-venda ele não entra — nada de mensagens nem lista de clientes. */
    if (perfil.papel === 'agenda') return negar();
    usuario.papel = perfil.papel;
    usuario.nome = perfil.nome;

    if (CACHE_LOGIN.size > 500) CACHE_LOGIN.clear();
    CACHE_LOGIN.set(token, { usuario, expira: Math.min(Date.now() + 60_000, vence || Infinity) });
    return usuario;
  } catch { return null; }
}

const ROTAS_SEM_LOGIN = new Set(['/api/config', '/api/rodar']);

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
    });
  }

  /* Carteiro externo (GitHub Actions): token próprio, sem login de pessoa.
     Sem RUNNER_TOKEN configurado a rota fica FECHADA — nunca aberta por engano. */
  if (pathname === '/api/rodar' && m === 'POST') {
    const t = req.headers['x-runner-token'] || searchParams.get('t') || '';
    if (!RUNNER_TOKEN || t !== RUNNER_TOKEN) {
      return send(res, 403, { erro: 'Token do carteiro inválido.' });
    }
    return ok(res, await rodarCarteiro());
  }

  let usuario = null;
  if (!ROTAS_SEM_LOGIN.has(pathname)) {
    usuario = await usuarioLogado(req);
    if (!usuario) return send(res, 401, { erro: 'Faça login para usar o Pós-venda.' });
  }

  const body = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? await readBody(req) : {};
  const quem = usuario?.nome || usuario?.email || null;

  // ---- painel
  if (pathname === '/api/resumo' && m === 'GET') return ok(res, await dados.resumo());
  if (pathname === '/api/whatsapp/status' && m === 'GET') return ok(res, await statusWhatsapp());
  if (pathname === '/api/perfil' && m === 'GET')
    return ok(res, { id: usuario.id, nome: usuario.nome || '', email: usuario.email, papel: usuario.papel });

  // ---- clientes (base compartilhada)
  if (pathname === '/api/clientes' && m === 'GET')
    return ok(res, await dados.listarClientes(searchParams.get('q') || undefined));
  let mm;
  if ((mm = pathname.match(new RegExp(`^/api/clientes/${UUID}$`))) && m === 'PUT') {
    const c = await dados.atualizarCliente(mm[1], body);
    return c ? ok(res, c) : notFound(res);
  }
  if (pathname === '/api/clientes/importar' && m === 'POST') {
    const linhas = Array.isArray(body.linhas) ? body.linhas.slice(0, 2000) : [];
    if (!linhas.length) return bad(res, 'Nenhuma linha para importar.');
    return ok(res, await dados.importarClientes(linhas));
  }

  // ---- fila de mensagens
  if (pathname === '/api/envios' && m === 'GET') {
    return ok(res, await dados.listarEnvios({
      status: searchParams.get('status') || undefined,
      tipo: searchParams.get('tipo') || undefined,
    }));
  }

  /* Campanha / avulsa: cada destino vira uma linha na fila, com o template já
     renderizado ({nome}, {primeiro_nome}, {carro}, {placa}). */
  if (pathname === '/api/envios' && m === 'POST') {
    const corpo = String(body.corpo ?? '').trim();
    const destinos = Array.isArray(body.destinos) ? body.destinos.slice(0, 1000) : [];
    if (!corpo) return bad(res, 'Escreva a mensagem.');
    if (!destinos.length) return bad(res, 'Escolha pelo menos um cliente.');
    const tipo = body.tipo === 'avulsa' ? 'avulsa' : 'campanha';
    const enviarEm = body.enviar_em ? new Date(body.enviar_em) : new Date();
    if (Number.isNaN(enviarEm.getTime())) return bad(res, 'Data de envio inválida.');

    const criados = [];
    for (const d of destinos) {
      const criado = await dados.enfileirar({
        cliente_id: d.cliente_id ?? null,
        telefone: d.telefone, nome: d.nome ?? null, tipo,
        corpo: dados.renderTemplate(corpo, { nome: d.nome, carro: d.carro, placa: d.placa }),
        enviar_em: enviarEm.toISOString(), criado_por: quem,
      });
      if (criado) criados.push(criado);
    }
    return ok(res, { ok: true, enfileirados: criados.length });
  }

  if ((mm = pathname.match(new RegExp(`^/api/envios/${UUID}/cancelar$`))) && m === 'POST') {
    const r = await dados.cancelarEnvio(mm[1]);
    return r ? ok(res, r) : bad(res, 'Só dá para cancelar mensagem que ainda não saiu.');
  }

  // gera (aniversário/pós-venda/retorno) e envia o que venceu — botão da tela
  if (pathname === '/api/rodar-agora' && m === 'POST')
    return ok(res, await rodarCarteiro());

  // ---- configuração
  if (pathname === '/api/posvenda/config' && m === 'GET') return ok(res, await dados.obterConfig());
  if (pathname === '/api/posvenda/config' && m === 'PUT') return ok(res, await dados.salvarConfig(body));

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
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const filePath = normalize(join(PUBLIC, rel));
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + sep)) return notFound(res);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache, must-revalidate',
    });
    res.end(data);
  } catch {
    try {
      const html = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch { notFound(res); }
  }
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { erro: 'requisição malformada' }); }
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
// gratuito o servidor DORME — por isso o GitHub Actions também chama /api/rodar.
setInterval(() => rodarCarteiro().catch(aviso('Carteiro')), 10 * 60 * 1000);
setTimeout(() => rodarCarteiro().catch(aviso('Carteiro')), 15 * 1000);

async function iniciar() {
  conferirConfiguracao();
  if (!RUNNER_TOKEN) {
    console.warn('  ⚠  RUNNER_TOKEN não definido: /api/rodar (carteiro externo) fica fechado.');
  }
  server.listen(PORT, () => {
    console.log(`\n  🏁 IndyCar Pós-venda rodando em http://localhost:${PORT}`);
    console.log('  Banco: Supabase (PostgREST) — o mesmo do CRM, Agenda e Atendimento\n');
  });
}

iniciar();
