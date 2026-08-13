/* ========================= IndyCar Pós-venda — App ========================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---- ícones (SVG inline) ----------------------------------------------------
const I = {
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  wa:'<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  gift:'<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8s-1.5-4-4-4a2 2 0 0 0 0 4M12 8s1.5-4 4-4a2 2 0 0 1 0 4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  sad:'<circle cx="12" cy="12" r="9"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><path d="M9 9h.01M15 9h.01"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  play:'<path d="M5 3l14 9-14 9V3z"/>',
  megafone:'<path d="M3 11l18-7-7 18-2.5-7.5z"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
};
const svg = (p, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${p}</svg>`;

// ---- estado -----------------------------------------------------------------
const state = { route:'inicio', clientes:null };

// ---- API --------------------------------------------------------------------
let sb = null, CONFIG = null;

async function authCabecalhos() {
  const cab = { 'Content-Type':'application/json' };
  if (!sb) return cab;
  const { data } = await sb.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('Sua sessão expirou. Entre de novo para continuar.');
  cab.Authorization = `Bearer ${t}`;
  return cab;
}

async function api(method, path, body) {
  const opt = { method, headers: await authCabecalhos() };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { mostrarLogin('Sua sessão expirou. Entre de novo.'); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(data.erro || 'Erro na requisição');
  return data;
}

// ---- utilidades -------------------------------------------------------------
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
  setTimeout(() => (t.className = 'toast'), 3200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean)
  .slice(0, 2).map(x => x[0].toUpperCase()).join('');
const dataBR = (iso) => { if(!iso) return ''; const [a,m,d]=String(iso).slice(0,10).split('-'); return `${d}/${m}/${a}`; };
/* nascimento gravado com ano 1904 = planilha só trazia dia/mês */
const nascBR = (iso) => { if(!iso) return '—'; const [a,m,d]=String(iso).slice(0,10).split('-');
  return a === '1904' ? `${d}/${m}` : `${d}/${m}/${a}`; };
const dataHoraBR = (ts) => { if(!ts) return '';
  const d = new Date(ts); if (isNaN(d)) return String(ts);
  return d.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'short' }); };
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

const TIPO_LABEL = { aniversario:'🎂 Aniversário', posvenda:'🔧 Pós-venda', retorno:'🔁 Retorno',
  campanha:'📣 Campanha', avulsa:'✉️ Avulsa' };
const STATUS_ENVIO = { pendente:['Pendente','bp-orange'], enviado:['Enviada','bp-green'],
  falhou:['Falhou','bp-red'], cancelado:['Cancelada','bp-gray'] };

async function carregarClientes(force) {
  if (!state.clientes || force) state.clientes = await api('GET', '/clientes');
  return state.clientes;
}

// ============================================================================
// INÍCIO
// ============================================================================
const view = $('#view');

async function renderInicio() {
  const [r, wa] = await Promise.all([
    api('GET', '/resumo'),
    api('GET', '/whatsapp/status').catch(() => ({ ok:false, erro:'sem resposta' })),
  ]);
  const s = r.satisfacao;
  const waBadge = wa.conectado
    ? '<span class="badge-pill bp-green">WhatsApp conectado ✅</span>'
    : `<span class="badge-pill bp-red">WhatsApp ${wa.ok === false ? 'sem resposta' : 'desconectado'}</span>`;

  view.innerHTML = `
    <div class="stat-grid">
      ${statCard('orange', r.pendentes, 'Na fila para enviar', I.clock)}
      ${statCard('green',  r.enviadosHoje, 'Enviadas hoje', I.send)}
      ${statCard('red',    r.falhas, 'Falharam', I.x)}
      ${statCard('purple', s.pct === null ? '—' : s.pct + '%', 'Clientes satisfeitos', I.smile)}
      ${statCard('blue',   r.comNascimento, 'Clientes c/ aniversário', I.gift)}
    </div>

    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.gift)} Aniversariantes do mês</h2>
          <span class="badge-pill bp-gray">${r.aniversariantesDoMes.length}</span></div>
        <div class="panel-body">
          ${r.aniversariantesDoMes.length ? `<div class="tabela-rolagem"><table class="table">
            <thead><tr><th>Dia</th><th>Cliente</th><th>Telefone</th></tr></thead>
            <tbody>${r.aniversariantesDoMes.map(a => `<tr>
              <td><b>${String(a.dia).padStart(2,'0')}</b></td>
              <td>${esc(a.nome)}</td><td>${esc(a.telefone || '—')}</td></tr>`).join('')}
            </tbody></table></div>`
          : `<div class="empty">Nenhum aniversariante este mês.<br>
             <small>Cadastre as datas na aba <b>Clientes</b> — dá para importar de uma planilha.</small></div>`}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>${svg(I.wa)} Situação</h2>${waBadge}</div>
        <div class="panel-body">
          <div class="tpl"><div class="tpl-body">As mensagens saem pelo <b>WhatsApp da empresa</b> —
            o mesmo número do painel de atendimento${wa.numero ? ` (${esc(wa.numero)})` : ''}.
            Envio automático só entre <b>8h e 20h</b>.</div></div>
          <button class="btn primary" id="btnRodar">${svg(I.play)} Gerar e enviar agora</button>
          <div id="rodarResultado"></div>
          <small class="muted">O sistema roda sozinho a cada poucos minutos. Este botão é só para
            não esperar — ele gera as mensagens do dia (aniversário, pós-venda, retorno) e envia
            o que estiver na hora.</small>
        </div>
      </div>
    </div>`;

  $('#btnRodar').addEventListener('click', async () => {
    const btn = $('#btnRodar'), out = $('#rodarResultado');
    btn.disabled = true; out.innerHTML = '<div class="muted" style="margin-top:8px">Rodando…</div>';
    try {
      const res = await api('POST', '/rodar-agora');
      const g = res.gerado || {};
      const partes = [];
      const novos = (g.aniversario||0) + (g.posvenda||0) + (g.retorno||0);
      partes.push(novos ? `${novos} mensagem(ns) nova(s) na fila` : 'nada novo para gerar');
      if (res.enviados) partes.push(`${res.enviados} enviada(s)`);
      if (res.falhas) partes.push(`${res.falhas} falhou(aram)`);
      if (res.aviso) partes.push(res.aviso);
      out.innerHTML = `<div class="tpl" style="margin-top:8px"><div class="tpl-body">✅ ${esc(partes.join(' · '))}</div></div>`;
      refreshBadge();
    } catch (e) { out.innerHTML = `<div class="tpl" style="margin-top:8px;border-color:rgba(230,25,46,.4)"><div class="tpl-body">❌ ${esc(e.message)}</div></div>`; }
    finally { btn.disabled = false; }
  });
}

function statCard(cls, num, lbl, ico) {
  return `<div class="stat ${cls}">
    <div class="ico">${svg(ico)}</div>
    <div class="num">${num}</div>
    <div class="lbl">${lbl}</div>
  </div>`;
}

// ============================================================================
// MENSAGENS — fila e histórico
// ============================================================================
async function renderMensagens() {
  const filtro = state.filtroMsg || 'todas';
  const lista = await api('GET', '/envios' + (filtro !== 'todas' ? `?status=${filtro}` : ''));
  const pilula = (chave, rotulo) =>
    `<button type="button" class="pilula ${filtro === chave ? 'ativa' : ''}" data-filtro="${chave}">${rotulo}</button>`;

  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2>Mensagens programadas</h2>
      <span class="badge-pill bp-gray">${lista.length} na lista</span></div>
      <button class="btn primary" onclick="openMensagemModal()">${svg(I.send)} Nova mensagem</button>
    </div>
    <div class="pilulas">
      ${pilula('todas', 'Todas')}
      ${pilula('pendente', '🕒 Na fila')}
      ${pilula('enviado', '✅ Enviadas')}
      ${pilula('falhou', '❌ Falharam')}
      ${pilula('cancelado', 'Canceladas')}
    </div>
    <div class="panel"><div class="panel-body" id="listaEnvios">
      ${lista.length ? lista.map(cartaoEnvio).join('')
        : '<div class="empty">Nenhuma mensagem aqui. As automáticas aparecem sozinhas quando você ligar as campanhas.</div>'}
    </div></div>`;

  $$('.pilula', view).forEach(b => b.addEventListener('click', () => {
    state.filtroMsg = b.dataset.filtro; renderMensagens().catch(e => toast(e.message, 'err'));
  }));
  $$('#listaEnvios [data-cancelar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Cancelar esta mensagem? Ela não será enviada.')) return;
    try { await api('POST', `/envios/${b.dataset.cancelar}/cancelar`); toast('Mensagem cancelada'); renderMensagens(); refreshBadge(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}

function cartaoEnvio(e) {
  const [rotulo, cor] = STATUS_ENVIO[e.status] || [e.status, 'bp-gray'];
  return `<div class="envio s-${e.status}">
    <div class="envio-topo">
      <div class="envio-quem"><b>${esc(e.nome || e.telefone)}</b>
        <span class="muted">· ${esc(e.telefone)}</span></div>
      <div class="envio-chips">
        <span class="badge-pill bp-gray">${TIPO_LABEL[e.tipo] || esc(e.tipo)}</span>
        <span class="badge-pill ${cor}">${rotulo}</span>
      </div>
    </div>
    <div class="envio-corpo">${esc(e.corpo)}</div>
    <div class="envio-rodape">
      <span>${svg(I.clock)} ${e.status === 'enviado' ? 'enviada ' + esc(dataHoraBR(e.enviado_em)) : 'programada para ' + esc(dataHoraBR(e.enviar_em))}</span>
      ${e.erro ? `<span class="envio-erro">⚠ ${esc(e.erro)}</span>` : ''}
      ${e.status === 'pendente' ? `<button class="btn btn-mini" data-cancelar="${e.id}">${svg(I.x)} Cancelar</button>` : ''}
    </div>
  </div>`;
}

// ============================================================================
// CAMPANHAS — automáticas (aniversário / pós-venda / retorno) + em massa
// ============================================================================
async function renderCampanhas() {
  const cfg = await api('GET', '/posvenda/config');

  const cartaoAuto = (chave, titulo, icone, descricao, extras) => `
    <div class="panel">
      <div class="panel-head"><h2>${svg(icone)} ${titulo}</h2>
        <label class="switch"><input type="checkbox" id="at_${chave}" ${cfg['ativo_'+chave] ? 'checked' : ''}>
          <span>${cfg['ativo_'+chave] ? 'Ligada' : 'Desligada'}</span></label></div>
      <div class="panel-body">
        <small class="muted">${descricao}</small>
        ${extras || ''}
        <div class="field"><label>Mensagem</label>
          <textarea id="msg_${chave}" style="min-height:110px">${esc(cfg['msg_'+chave])}</textarea>
          <small class="muted">Variáveis: {nome} {primeiro_nome} {carro} {placa}${chave !== 'aniversario' ? ' {servico}' : ''}${chave === 'retorno' ? ' {meses}' : ''}</small></div>
      </div>
    </div>`;

  view.innerHTML = `
    <div class="toolbar"><div class="left"><h2>Campanhas</h2></div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="openMensagemModal()">${svg(I.megafone)} Campanha em massa</button>
        <button class="btn primary" id="cp_salvar">${svg(I.check)} Salvar campanhas</button>
      </div></div>

    <div class="tpl" style="margin-bottom:14px"><div class="tpl-body">🤖 <b>Como funciona:</b> com a campanha
      <b>ligada</b>, o sistema gera as mensagens do dia sozinho e envia pelo WhatsApp da empresa no
      horário escolhido. Tudo aparece na aba <b>Mensagens</b> antes e depois do envio — dá para
      cancelar qualquer uma enquanto estiver na fila.</div></div>

    <div class="cols">
      ${cartaoAuto('aniversario', 'Aniversário', I.gift,
        'Todo dia, quem faz aniversário recebe os parabéns da IndyCar. Os aniversários vêm da aba Clientes (dá para importar de planilha).')}
      ${cartaoAuto('posvenda', 'Pós-venda', I.wa,
        'Alguns dias depois de um serviço concluído, o cliente recebe uma mensagem perguntando se ficou tudo certo.',
        `<div class="field"><label>Enviar quantos dias depois do serviço</label>
          <input id="cp_dias" type="number" min="0" max="30" value="${cfg.dias_posvenda}"></div>`)}
      ${cartaoAuto('retorno', 'Retorno para revisão', I.clock,
        'Cliente que fez um serviço há X meses e não voltou recebe um convite para agendar a revisão (ex.: troca de óleo feita há 6 meses).',
        `<div class="field"><label>Convidar depois de quantos meses</label>
          <input id="cp_meses" type="number" min="1" max="24" value="${cfg.meses_retorno}"></div>`)}
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.gear)} Horário do envio automático</h2></div>
        <div class="panel-body">
          <div class="field"><label>Enviar as mensagens do dia a partir de</label>
            <input id="cp_hora" type="time" value="${esc(cfg.hora_envio)}"></div>
          <small class="muted">Fora da janela de <b>8h às 20h</b> nada é enviado, nem que a fila
            acumule — ninguém recebe mensagem de madrugada.</small>
        </div>
      </div>
    </div>`;

  $('#cp_salvar').addEventListener('click', async () => {
    const btn = $('#cp_salvar'); btn.disabled = true;
    try {
      await api('PUT', '/posvenda/config', {
        ativo_aniversario: $('#at_aniversario').checked,
        ativo_posvenda: $('#at_posvenda').checked,
        ativo_retorno: $('#at_retorno').checked,
        msg_aniversario: $('#msg_aniversario').value,
        msg_posvenda: $('#msg_posvenda').value,
        msg_retorno: $('#msg_retorno').value,
        dias_posvenda: Number($('#cp_dias').value),
        meses_retorno: Number($('#cp_meses').value),
        hora_envio: $('#cp_hora').value,
      });
      toast('Campanhas salvas ✅');
      renderCampanhas();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
}

// ============================================================================
// CLIENTES — base compartilhada + aniversário + importação de planilha
// ============================================================================
async function renderClientes() {
  const lista = await carregarClientes(true);
  const comNasc = lista.filter(c => c.nascimento).length;
  view.innerHTML = `
    <div class="toolbar">
      <div class="left"><div class="search">${svg(I.search)}<input id="qCli" placeholder="Buscar por nome, telefone ou placa…"></div>
        <span class="badge-pill bp-gray">${lista.length} clientes</span>
        <span class="badge-pill bp-green">${comNasc} com aniversário</span></div>
      <button class="btn primary" onclick="openImportarModal()">${svg(I.upload)} Importar planilha</button>
    </div>
    <div class="tpl" style="margin-bottom:14px"><div class="tpl-body">É a <b>mesma base</b> do CRM, da
      Agenda e do Atendimento. Aqui você cadastra o <b>aniversário</b> de cada cliente — clique no
      lápis. Para muitos de uma vez, use <b>Importar planilha</b>.</div></div>
    <div class="panel"><div class="tabela-rolagem"><table class="table"><thead><tr>
      <th>Nome</th><th>Telefone</th><th>Carro</th><th>Aniversário</th><th></th>
    </tr></thead><tbody id="cliBody">${linhasClientes(lista)}</tbody></table></div></div>`;

  bindLinhasClientes();
  $('#qCli').addEventListener('input', debounce(async e => {
    const r = await api('GET', '/clientes?q=' + encodeURIComponent(e.target.value));
    $('#cliBody').innerHTML = linhasClientes(r); bindLinhasClientes();
  }, 250));
}

function linhasClientes(lista) {
  if (!lista.length) return '<tr><td colspan="5" class="empty">Nenhum cliente.</td></tr>';
  return lista.map(c => `<tr data-id="${c.id}">
    <td><b>${esc(c.nome)}</b></td>
    <td>${esc(c.telefone || '—')}</td>
    <td>${esc(c.carro || '—')}</td>
    <td>${c.nascimento ? `🎂 <b>${nascBR(c.nascimento)}</b>` : '<span class="muted">—</span>'}</td>
    <td><div class="actions">
      <button class="icon-btn" data-act="nasc" title="Editar aniversário">${svg(I.edit)}</button>
    </div></td></tr>`).join('');
}

function bindLinhasClientes() {
  $$('#cliBody tr[data-id]').forEach(tr => {
    tr.querySelector('[data-act="nasc"]')?.addEventListener('click', () => openNascimentoModal(tr.dataset.id));
  });
}

// ============================================================================
// SATISFAÇÃO
// ============================================================================
async function renderSatisfacao() {
  const [respostas, clientes] = await Promise.all([api('GET', '/satisfacao'), carregarClientes()]);
  const total = respostas.length;
  const felizes = respostas.filter(r => r.satisfeito).length;
  const pct = total ? Math.round((felizes / total) * 100) : null;

  view.innerHTML = `
    <div class="stat-grid">
      ${statCard('green', felizes, 'Satisfeitos', I.smile)}
      ${statCard('red', total - felizes, 'Insatisfeitos', I.sad)}
      ${statCard('purple', pct === null ? '—' : pct + '%', 'Satisfação geral', I.check)}
    </div>
    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h2>${svg(I.smile)} Registrar retorno de cliente</h2></div>
        <div class="panel-body">
          <small class="muted">O cliente respondeu a mensagem de pós-venda, ou comentou na oficina?
            Registre aqui — é assim que a IndyCar acompanha a própria nota.</small>
          <div class="field"><label>Cliente</label>
            <input id="sat_busca" list="sat_lista" placeholder="Digite o nome…" autocomplete="off">
            <datalist id="sat_lista">${clientes.map(c =>
              `<option value="${esc(c.nome)}${c.telefone ? ' · ' + esc(c.telefone) : ''}"></option>`).join('')}</datalist></div>
          <div class="field"><label>Como o cliente ficou?</label>
            <div class="sat-botoes">
              <button type="button" class="btn sat-opcao" data-sat="1">${svg(I.smile)} Satisfeito</button>
              <button type="button" class="btn sat-opcao" data-sat="0">${svg(I.sad)} Insatisfeito</button>
            </div></div>
          <div class="field"><label>Nota (opcional)</label>
            <select id="sat_nota"><option value="">—</option>
              ${[5,4,3,2,1].map(n => `<option value="${n}">${'⭐'.repeat(n)} (${n})</option>`).join('')}</select></div>
          <div class="field"><label>Comentário (opcional)</label>
            <textarea id="sat_coment" placeholder="O que o cliente disse…"></textarea></div>
          <div><button class="btn primary" id="sat_salvar">${svg(I.check)} Registrar</button></div>
          <p class="form-msg" id="sat_msg" hidden></p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Últimos retornos</h2>
          <span class="badge-pill bp-gray">${total}</span></div>
        <div class="panel-body">
          ${respostas.length ? respostas.map(r => `
            <div class="envio">
              <div class="envio-topo">
                <div class="envio-quem"><b>${esc(r.cliente_nome || '—')}</b></div>
                <div class="envio-chips">
                  ${r.nota ? `<span class="badge-pill bp-gray">${'⭐'.repeat(r.nota)}</span>` : ''}
                  <span class="badge-pill ${r.satisfeito ? 'bp-green' : 'bp-red'}">${r.satisfeito ? '😊 Satisfeito' : '😞 Insatisfeito'}</span>
                </div>
              </div>
              ${r.comentario ? `<div class="envio-corpo">${esc(r.comentario)}</div>` : ''}
              <div class="envio-rodape"><span>${esc(dataHoraBR(r.created_at))}${r.registrado_por ? ' · por ' + esc(r.registrado_por) : ''}</span>
                <button class="btn btn-mini" data-apagar="${r.id}">${svg(I.trash)}</button></div>
            </div>`).join('') : '<div class="empty">Nenhum retorno registrado ainda.</div>'}
        </div>
      </div>
    </div>`;

  let escolha = null;
  $$('.sat-opcao').forEach(b => b.addEventListener('click', () => {
    escolha = b.dataset.sat === '1';
    $$('.sat-opcao').forEach(x => x.classList.toggle('ativa', x === b));
  }));

  $('#sat_salvar').addEventListener('click', async () => {
    const msg = (t, okk) => { const el = $('#sat_msg'); el.textContent = t;
      el.className = 'form-msg ' + (okk ? 'ok' : 'erro'); el.hidden = false; };
    const cliente = acharClientePorTexto($('#sat_busca').value);
    if (!cliente) return msg('Escolha um cliente da lista.', false);
    if (escolha === null) return msg('Diga se ele ficou satisfeito ou não.', false);
    const btn = $('#sat_salvar'); btn.disabled = true;
    try {
      await api('POST', '/satisfacao', {
        cliente_id: cliente.id, satisfeito: escolha,
        nota: $('#sat_nota').value ? Number($('#sat_nota').value) : null,
        comentario: $('#sat_coment').value.trim() || null,
      });
      toast('Retorno registrado ✅');
      renderSatisfacao();
    } catch (e) { msg(e.message, false); btn.disabled = false; }
  });

  $$('[data-apagar]', view).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Apagar este registro de satisfação?')) return;
    try { await api('DELETE', `/satisfacao/${b.dataset.apagar}`); toast('Registro apagado'); renderSatisfacao(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}

function acharClientePorTexto(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t || !state.clientes) return null;
  const nome = t.split('·')[0].trim();
  return state.clientes.find(c => c.nome.toLowerCase() === nome)
      || state.clientes.find(c => c.nome.toLowerCase().startsWith(nome))
      || null;
}

// ============================================================================
// MODAIS
// ============================================================================
const overlay = $('#modalOverlay'), modal = $('#modal');
function openModal(html){ modal.innerHTML = html; overlay.classList.add('open'); }
function closeModal(){ overlay.classList.remove('open'); }
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

/* ---- aniversário de um cliente ---- */
window.openNascimentoModal = async function(id){
  const c = (state.clientes || []).find(x => x.id === id);
  if (!c) return;
  openModal(`
    <div class="modal-head"><h3>${svg(I.gift)} Aniversário de ${esc(c.nome)}</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>Data de nascimento</label>
        <input id="n_data" placeholder="DD/MM/AAAA (ou só DD/MM)" value="${c.nascimento ? nascBR(c.nascimento) : ''}">
        <small class="muted">Pode ser só dia e mês — para os parabéns o ano não importa.</small></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="n_salvar">${svg(I.check)} Salvar</button></div>`);
  $('#n_salvar').addEventListener('click', async () => {
    try {
      await api('PUT', `/clientes/${id}`, { nascimento: $('#n_data').value.trim() });
      toast('Aniversário salvo 🎂'); closeModal();
      await carregarClientes(true);
      if (state.route === 'clientes') renderClientes();
    } catch (e) { toast(e.message, 'err'); }
  });
};

/* ---- nova mensagem / campanha em massa ---- */
window.openMensagemModal = async function(){
  const clientes = await carregarClientes();
  const comTelefone = clientes.filter(c => c.telefone);
  openModal(`
    <div class="modal-head"><h3>${svg(I.send)} Nova mensagem</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>Para quem</label>
        <select id="nm_alvo">
          <option value="um">Um cliente específico</option>
          <option value="todos">Todos os clientes com telefone (${comTelefone.length})</option>
          <option value="aniversariantes">Aniversariantes deste mês</option>
        </select></div>
      <div class="field" id="nm_umBox"><label>Cliente</label>
        <input id="nm_busca" list="nm_lista" placeholder="Digite o nome…" autocomplete="off">
        <datalist id="nm_lista">${comTelefone.map(c =>
          `<option value="${esc(c.nome)}${c.telefone ? ' · ' + esc(c.telefone) : ''}"></option>`).join('')}</datalist></div>
      <div class="field"><label>Mensagem</label>
        <textarea id="nm_corpo" style="min-height:120px" placeholder="Oi {primeiro_nome}! …"></textarea>
        <small class="muted">Variáveis: {nome} {primeiro_nome} {carro} {placa} — cada cliente recebe a sua.</small></div>
      <div class="field"><label>Quando enviar</label>
        <select id="nm_quando">
          <option value="agora">Agora (dentro da janela 8h–20h)</option>
          <option value="depois">Escolher data e hora</option>
        </select></div>
      <div class="field" id="nm_quandoBox" hidden><label>Data e hora</label>
        <input id="nm_data" type="datetime-local"></div>
      <div class="tpl" id="nm_previa" hidden><div class="tpl-body"></div></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="nm_enviar">${svg(I.send)} Colocar na fila</button></div>`);

  const mudouAlvo = () => { $('#nm_umBox').hidden = $('#nm_alvo').value !== 'um'; previa(); };
  const previa = () => {
    const alvo = $('#nm_alvo').value;
    let quantos = 0;
    if (alvo === 'um') quantos = acharClientePorTexto($('#nm_busca').value) ? 1 : 0;
    else if (alvo === 'todos') quantos = comTelefone.length;
    else quantos = aniversariantesDoMes(comTelefone).length;
    const box = $('#nm_previa');
    box.hidden = !quantos;
    if (quantos) box.querySelector('.tpl-body').textContent =
      `📣 ${quantos} mensagem(ns) entrará(ão) na fila.`;
  };
  $('#nm_alvo').addEventListener('change', mudouAlvo);
  $('#nm_busca').addEventListener('input', debounce(previa, 200));
  $('#nm_quando').addEventListener('change', () =>
    $('#nm_quandoBox').hidden = $('#nm_quando').value !== 'depois');

  $('#nm_enviar').addEventListener('click', async () => {
    const corpo = $('#nm_corpo').value.trim();
    if (!corpo) return toast('Escreva a mensagem', 'err');
    const alvo = $('#nm_alvo').value;
    let destinos = [];
    if (alvo === 'um') {
      const c = acharClientePorTexto($('#nm_busca').value);
      if (!c) return toast('Escolha um cliente da lista', 'err');
      destinos = [c];
    } else if (alvo === 'todos') destinos = comTelefone;
    else destinos = aniversariantesDoMes(comTelefone);
    if (!destinos.length) return toast('Nenhum cliente nesse grupo', 'err');
    if (destinos.length > 1 && !confirm(`Colocar ${destinos.length} mensagens na fila?`)) return;

    let enviar_em = null;
    if ($('#nm_quando').value === 'depois') {
      const v = $('#nm_data').value;
      if (!v) return toast('Escolha a data e a hora', 'err');
      enviar_em = new Date(v).toISOString();
    }
    const btn = $('#nm_enviar'); btn.disabled = true;
    try {
      const r = await api('POST', '/envios', {
        tipo: destinos.length === 1 ? 'avulsa' : 'campanha', corpo, enviar_em,
        destinos: destinos.map(c => ({ cliente_id: c.id, telefone: c.telefone, nome: c.nome,
          carro: c.carro, placa: c.placa })),
      });
      toast(`${r.enfileirados} mensagem(ns) na fila ✅`);
      closeModal(); refreshBadge();
      if (state.route === 'mensagens') renderMensagens();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
};

function aniversariantesDoMes(clientes) {
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', month:'2-digit' }).format(new Date());
  return clientes.filter(c => c.nascimento && String(c.nascimento).slice(5, 7) === mes);
}

/* ---- importar planilha (CSV ou colar do Excel) ---- */
window.openImportarModal = function(){
  openModal(`
    <div class="modal-head"><h3>${svg(I.upload)} Importar clientes de planilha</h3>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="tpl"><div class="tpl-body"><b>Como fazer:</b>
1. No Excel/Planilhas Google, deixe as colunas: <b>nome · telefone · nascimento</b> (e, se quiser, veículo · placa · e-mail).
2. Selecione as linhas e <b>copie</b> (Ctrl+C) — ou salve como CSV e escolha o arquivo.
3. Cole aqui embaixo (Ctrl+V) e confira a prévia antes de importar.</div></div>
      <div class="field"><label>Arquivo CSV (opcional)</label>
        <input id="imp_arquivo" type="file" accept=".csv,text/csv,text/plain"></div>
      <div class="field"><label>Ou cole as linhas da planilha aqui</label>
        <textarea id="imp_texto" style="min-height:130px" placeholder="nome	telefone	nascimento
Maria Souza	12 99999-0001	14/05/1988
João Lima	12 99999-0002	02/11"></textarea></div>
      <div id="imp_previa"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="imp_importar" disabled>${svg(I.check)} Importar</button></div>`);

  let linhas = [];
  const atualizar = () => {
    linhas = lerPlanilha($('#imp_texto').value);
    const box = $('#imp_previa');
    if (!linhas.length) { box.innerHTML = ''; $('#imp_importar').disabled = true; return; }
    const amostra = linhas.slice(0, 5).map(l =>
      `<tr><td>${esc(l.nome)}</td><td>${esc(l.telefone)}</td><td>${esc(l.nascimento || '—')}</td><td>${esc(l.veiculo || '—')}</td></tr>`).join('');
    box.innerHTML = `<div class="tpl"><div class="tpl-body">✅ Entendi <b>${linhas.length}</b> linha(s). Prévia:</div></div>
      <div class="tabela-rolagem"><table class="table"><thead><tr><th>Nome</th><th>Telefone</th><th>Nascimento</th><th>Veículo</th></tr></thead>
      <tbody>${amostra}</tbody></table></div>
      ${linhas.length > 5 ? `<small class="muted">…e mais ${linhas.length - 5}.</small>` : ''}`;
    $('#imp_importar').disabled = false;
  };
  $('#imp_texto').addEventListener('input', debounce(atualizar, 300));
  $('#imp_arquivo').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    $('#imp_texto').value = await f.text();
    atualizar();
  });

  $('#imp_importar').addEventListener('click', async () => {
    if (!linhas.length) return;
    const btn = $('#imp_importar'); btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const r = await api('POST', '/clientes/importar', { linhas });
      const partes = [`${r.criados} novo(s)`, `${r.atualizados} atualizado(s)`];
      if (r.ignorados) partes.push(`${r.ignorados} pulado(s)`);
      toast(`Importação: ${partes.join(', ')} ✅`);
      if (r.avisos?.length) {
        $('#imp_previa').innerHTML = `<div class="tpl" style="border-color:rgba(245,158,11,.45)"><div class="tpl-body">
          ⚠ <b>Avisos:</b><br>${r.avisos.slice(0, 8).map(esc).join('<br>')}</div></div>`;
        btn.textContent = 'Importar'; btn.disabled = false;
      } else {
        closeModal();
      }
      await carregarClientes(true);
      if (state.route === 'clientes') renderClientes();
    } catch (e) { toast(e.message, 'err'); btn.textContent = 'Importar'; btn.disabled = false; }
  });
};

/**
 * Lê o texto colado do Excel (tab), CSV com ; ou , — e detecta cabeçalho.
 * Sem cabeçalho, assume a ordem: nome, telefone, nascimento, veículo, placa, e-mail.
 */
function lerPlanilha(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = linhas[0].includes('\t') ? '\t' : (linhas[0].includes(';') ? ';' : ',');
  const dividir = (l) => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim());

  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const primeira = dividir(linhas[0]).map(semAcento);
  const APELIDOS = {
    nome: ['nome', 'cliente', 'name'],
    telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'numero'],
    nascimento: ['nascimento', 'aniversario', 'data de nascimento', 'nasc', 'aniversário', 'birthday'],
    veiculo: ['veiculo', 'carro', 'modelo', 'vehicle'],
    placa: ['placa', 'plate'],
    email: ['email', 'e-mail', 'mail'],
  };
  const colunaDe = (rotulo) => {
    for (const [campo, nomes] of Object.entries(APELIDOS)) {
      if (nomes.includes(rotulo)) return campo;
    }
    return null;
  };
  const mapa = primeira.map(colunaDe);
  const temCabecalho = mapa.filter(Boolean).length >= 2;
  const ordemPadrao = ['nome', 'telefone', 'nascimento', 'veiculo', 'placa', 'email'];

  const dados = [];
  for (const linha of (temCabecalho ? linhas.slice(1) : linhas)) {
    const celulas = dividir(linha);
    const obj = {};
    celulas.forEach((c, i) => {
      const campo = temCabecalho ? mapa[i] : ordemPadrao[i];
      if (campo && c) obj[campo] = c;
    });
    if (obj.nome || obj.telefone) dados.push(obj);
  }
  return dados;
}

// ============================================================================
// ROTEAMENTO
// ============================================================================
const ROUTES = { inicio:renderInicio, mensagens:renderMensagens, campanhas:renderCampanhas,
  clientes:renderClientes, satisfacao:renderSatisfacao };
const TAGS = { inicio:'PÓS-VENDA', mensagens:'MENSAGENS', campanhas:'CAMPANHAS',
  clientes:'CLIENTES', satisfacao:'SATISFAÇÃO' };

async function route(r){
  if (r) state.route = r;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === state.route));
  $('#pageTag').textContent = TAGS[state.route] || 'PÓS-VENDA';
  view.innerHTML = '<div class="empty">Carregando…</div>';
  try { await (ROUTES[state.route] || renderInicio)(); }
  catch(e){ view.innerHTML = `<div class="empty">Erro ao carregar: ${esc(e.message)}</div>`; }
  refreshBadge();
}

async function refreshBadge(){
  try{ const r = await api('GET','/envios?status=pendente');
    $('#badgeFila').textContent = r.length;
    $('#badgeFila').style.display = r.length ? 'flex' : 'none'; }catch{}
}

// ---- init -------------------------------------------------------------------
$('#nav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item'); if (!item) return;
  route(item.dataset.route);
});
$('#nav').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const item = e.target.closest('.nav-item'); if (!item) return;
  e.preventDefault();
  route(item.dataset.route);
});
$('#btnNova').addEventListener('click', () => openMensagemModal());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// PWA
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

/* ============================ LOGIN ============================ */
function mostrarLogin(mensagem){
  document.body.classList.add('deslogado');
  $('#telaLogin').hidden = false;
  const erro = $('#erroLogin');
  if (mensagem) { erro.textContent = mensagem; erro.hidden = false; } else { erro.hidden = true; }
}
function esconderLogin(){
  document.body.classList.remove('deslogado');
  $('#telaLogin').hidden = true;
  $('#erroLogin').hidden = true;
}

async function abrirApp(){
  try {
    const p = await api('GET', '/perfil');
    const el = $('#avatarPerfil');
    el.textContent = iniciais(p.nome) || 'IC';
    el.title = p.nome || 'Sua conta';
  } catch { /* segue com o padrão */ }
  await route('inicio');
}

$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = $('#btnEntrar');
  btn.disabled = true; btn.textContent = 'ENTRANDO…';
  try {
    if (!sb) throw new Error('Conexão com o Supabase não configurada.');
    const { error } = await sb.auth.signInWithPassword({
      email: f.loginEmail.value.trim(), password: f.loginSenha.value,
    });
    if (error) throw new Error(/invalid login/i.test(error.message)
      ? 'E-mail ou senha incorretos.' : error.message);
    f.loginSenha.value = '';
    esconderLogin();
    await abrirApp();
  } catch (err) { mostrarLogin(err.message); }
  finally { btn.disabled = false; btn.textContent = 'ENTRAR'; }
});

/* ==================== TEMA CLARO / ESCURO ==================== */
const TEMA_KEY = 'indycar_tema';
const temaAtual = () =>
  document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';

function aplicarTema(tema){
  const claro = tema === 'claro';
  const raiz = document.documentElement;
  raiz.setAttribute('data-trocando-tema', '');
  raiz.setAttribute('data-tema', claro ? 'claro' : 'escuro');
  void (document.body || raiz).offsetHeight;
  clearTimeout(state._temaTimer);
  state._temaTimer = setTimeout(() => raiz.removeAttribute('data-trocando-tema'), 60);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', claro ? '#eef0f4' : '#070a14');
  const ico = $('#temaIco'), txt = $('#temaTxt');
  if (ico) ico.textContent = claro ? '☀️' : '🌙';
  if (txt) txt.textContent = claro ? 'Claro' : 'Escuro';
  try { localStorage.setItem(TEMA_KEY, claro ? 'claro' : 'escuro'); } catch { /* ignora */ }
}
$('#btnTema')?.addEventListener('click', () =>
  aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro'));
aplicarTema(temaAtual());

(async function init(){
  mostrarLogin();
  try { CONFIG = await (await fetch('/api/config')).json(); }
  catch { return mostrarLogin('Não consegui falar com o servidor. Ele está rodando?'); }

  if (!CONFIG.configurado) {
    return mostrarLogin('Falta configurar o Supabase no servidor (SUPABASE_URL, '
      + 'SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (!window.supabase?.createClient) {
    return mostrarLogin('A biblioteca do Supabase não carregou. Verifique sua conexão.');
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

  const { data } = await sb.auth.getSession();
  if (data?.session) {
    esconderLogin();
    try { await abrirApp(); } catch (err) { mostrarLogin(err.message); }
  }
})();
