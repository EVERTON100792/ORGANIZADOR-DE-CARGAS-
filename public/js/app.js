const STATUS_LIST = ['Montada', 'Aguardando Expedição', 'Liberada', 'Despachada'];

const state = {
  fila: [],
  despachados: [],
  historico: [],
  config: { responsavel: 'Equipe de Expedição' },
  est: { total: 0, ativas: 0, despachadas: 0, liberadas: 0 },
};

function badgeStatus(s) {
  const key = String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
  return 'status-' + key;
}

function formatarData(v) {
  if (!v) return '–';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  if (!y || !m || !d) return String(v);
  return `${d}/${m}/${y}`;
}

function formatarDataHora(v) {
  if (!v) return '–';
  const [data, hora] = String(v).split(' ');
  const [y, m, d] = data.split('-');
  if (!y) return String(v);
  const hh = hora ? ' às ' + hora.slice(0, 5) : '';
  return `${d}/${m}/${y}${hh}`;
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function api(url, op, body) {
  const res = await fetch(url, {
    method: op || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status} ao comunicar com o servidor.`);
  return data;
}

function toast(msg, tipo) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast ' + (tipo || 'ok');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.display = 'none'), 4200);
}

async function carregarTudo() {
  const [filaRes, despRes, histRes, cfgRes, estRes] = await Promise.all([
    api('/api/fila'),
    api('/api/despachados'),
    api('/api/historico?limit=60'),
    api('/api/config'),
    api('/api/estatisticas'),
  ]);
  state.fila = filaRes;
  state.despachados = despRes;
  state.historico = histRes;
  state.config = cfgRes;
  state.est = estRes;
  document.getElementById('responsavel').value = state.config.responsavel || '';
  return estRes;
}

async function recarregarTudo() {
  const est = await carregarTudo();
  await renderFila();
  await renderGerenciarComFiltros();
  await renderDespachados();
  renderHistorico();
  const statFila = document.getElementById('stat-fila');
  const statTotal = document.getElementById('stat-total');
  const statDespachadas = document.getElementById('stat-despachadas');
  if (statFila) statFila.textContent = String(est.ativas);
  if (statDespachadas) statDespachadas.textContent = String(est.despachadas);
  if (statTotal) statTotal.textContent = String(est.total);
}

// ------------------------------ Render Fila ------------------------------

function renderFila() {
  const tbody = document.getElementById('fila-tbody');
  const vazio = document.getElementById('fila-vazio');
  const empty = state.fila.length === 0;
  tbody.innerHTML = '';
  vazio.style.display = empty ? 'block' : 'none';

  state.fila.forEach((f) => {
    const pos = f.posicao;
    const classeLinha = pos === 1 ? 'row-pos-1' : pos === 2 ? 'row-pos-2' : pos === 3 ? 'row-pos-3' : 'row-pos-4';
    const corBadge = pos === 1 ? '#dc2626' : pos === 2 ? '#ea580c' : pos === 3 ? '#ca8a04' : '#059669';

    const tdPos = document.createElement('td');
    const spanPos = document.createElement('span');
    spanPos.className = 'pos-badge';
    spanPos.style.background = corBadge;
    spanPos.textContent = pos + 'º';
    tdPos.appendChild(spanPos);

    const tdNum = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = f.numeroRomaneio;
    tdNum.appendChild(strong);

    const tdData = document.createElement('td');
    tdData.textContent = formatarData(f.dataPedido);

    const tdObs = document.createElement('td');
    tdObs.textContent = f.observacoes || '–';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = badgeStatus(f.status);
    badge.textContent = f.status;
    tdStatus.appendChild(badge);

    const tdAcoes = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-acao';
    btn.dataset.id = String(f.id);
    btn.dataset.acao = 'editar';
    btn.textContent = 'Editar';
    tdAcoes.appendChild(btn);

    const tr = document.createElement('tr');
    tr.className = classeLinha;
    tr.append(tdPos, tdNum, tdData, tdObs, tdStatus, tdAcoes);
    tbody.appendChild(tr);
  });

  const statFila = document.getElementById('stat-fila');
  const statPrimaria = document.getElementById('stat-primaria');
  const statDespachadas = document.getElementById('stat-despachadas');
  const statTotal = document.getElementById('stat-total');
  if (statFila) statFila.textContent = String(state.fila.length);
  if (statPrimaria) statPrimaria.textContent = state.fila.length ? state.fila[0].numeroRomaneio : '–';
  if (statDespachadas) statDespachadas.textContent = String(state.despachados.length);
  if (statTotal) statTotal.textContent = String(state.est.total);
}

// ------------------------------ Render Gerenciar (com filtros) ------------------------------

async function renderGerenciarComFiltros() {
  const params = new URLSearchParams();
  const numero = document.getElementById('filtro-numero').value.trim();
  const dataInicio = document.getElementById('filtro-data-inicio').value;
  const dataFim = document.getElementById('filtro-data-fim').value;
  const status = document.getElementById('filtro-status').value;
  const periodo = document.getElementById('filtro-periodo').value;
  if (numero) params.set('numero', numero);
  if (dataInicio) params.set('dataInicio', dataInicio);
  if (dataFim) params.set('dataFim', dataFim);
  if (status) params.set('status', status);
  if (periodo) params.set('periodo', periodo);

  const lista = await api('/api/cargas?' + params.toString());
  const tbody = document.getElementById('gerenciar-tbody');
  const vazio = document.getElementById('gerenciar-vazio');
  tbody.innerHTML = '';
  vazio.style.display = lista.length ? 'none' : 'block';

  lista.forEach((c) => {
    const tr = document.createElement('tr');
    const tdNum = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = c.numeroRomaneio;
    tdNum.appendChild(strong);

    const tdData = document.createElement('td');
    tdData.textContent = formatarData(c.dataPedido);

    const tdObs = document.createElement('td');
    tdObs.textContent = c.observacoes || '–';

    const tdStatus = document.createElement('td');
    const sel = document.createElement('select');
    sel.className = 'select-status';
    sel.dataset.id = String(c.id);
    STATUS_LIST.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (String(c.status) === s) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => alterarStatus(Number(c.id), sel.value));

    const tdDesp = document.createElement('td');
    tdDesp.textContent = formatarData(c.dataDespacho);

    const tdAcoes = document.createElement('td');
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn btn-ghost btn-acao';
    btnEditar.dataset.id = String(c.id);
    btnEditar.dataset.acao = 'editar';
    btnEditar.textContent = 'Editar';
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn btn-ghost btn-acao btn-excluir';
    btnExcluir.dataset.id = String(c.id);
    btnExcluir.dataset.acao = 'excluir';
    btnExcluir.textContent = 'Excluir';
    tdAcoes.append(btnEditar, btnExcluir);

    tr.append(tdNum, tdData, tdObs, tdStatus, tdDesp, tdAcoes);
    tbody.appendChild(tr);
  });
}

// ------------------------------ Render Despachados ------------------------------

function renderDespachados() {
  const tbody = document.getElementById('despachados-tbody');
  const vazio = document.getElementById('despachados-vazio');
  tbody.innerHTML = '';
  vazio.style.display = state.despachados.length ? 'none' : 'block';

  state.despachados.forEach((c) => {
    const tr = document.createElement('tr');
    const tdNum = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = c.numeroRomaneio;
    tdNum.appendChild(strong);

    const tdData = document.createElement('td');
    tdData.textContent = formatarData(c.dataPedido);

    const tdDesp = document.createElement('td');
    tdDesp.textContent = formatarDataHora(c.dataDespacho);

    const tdObs = document.createElement('td');
    tdObs.textContent = c.observacoes || '–';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = badgeStatus(c.status);
    badge.textContent = c.status;
    tdStatus.appendChild(badge);

    const tdAcoes = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-acao';
    btn.dataset.id = String(c.id);
    btn.dataset.acao = 'ver-historico';
    btn.textContent = 'Histórico';
    tdAcoes.appendChild(btn);

    tr.append(tdNum, tdData, tdDesp, tdObs, tdStatus, tdAcoes);
    tbody.appendChild(tr);
  });
}

// ------------------------------ Render Histórico ------------------------------

function renderHistorico() {
  const ul = document.getElementById('timeline');
  const vazio = document.getElementById('timeline-vazio');
  ul.innerHTML = '';
  vazio.style.display = state.historico.length ? 'none' : 'block';

  const tipos = { criacao: 'Cadastro', atualizacao: 'Atualização', status: 'Status', exclusao: 'Exclusão' };
  state.historico.forEach((h) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'tl-dot';
    const content = document.createElement('div');
    content.className = 'tl-content';
    content.innerHTML = `<strong>${tipos[h.tipo] || h.tipo}</strong>` + (h.campo ? ` – ${h.campo}: ` : '') + `${h.valorAntigo || '–'} → <strong>${h.valorNovo || '–'}</strong>`;
    const meta = document.createElement('div');
    meta.className = 'tl-data';
    meta.textContent = (h.numeroRomaneio ? 'Romaneio ' + h.numeroRomaneio + ' • ' : '') + formatarDataHora(h.dataHora);
    li.append(dot, content, meta);
    ul.appendChild(li);
  });
}

// ------------------------------ Modal Carga ------------------------------

function abrirModalCriar() {
  document.getElementById('modal-titulo').textContent = 'Nova Carga';
  document.getElementById('modal-id-carga').value = '';
  document.getElementById('campo-romaneio').value = '';
  document.getElementById('campo-dataPedido').value = '';
  document.getElementById('campo-status').value = 'Montada';
  document.getElementById('campo-observacoes').value = '';
  document.getElementById('modal-carga').classList.add('open');
}

function abrirModalEditar(carga) {
  document.getElementById('modal-titulo').textContent = 'Editar Carga';
  document.getElementById('modal-id-carga').value = String(carga.id);
  document.getElementById('campo-romaneio').value = carga.numeroRomaneio;
  document.getElementById('campo-dataPedido').value = String(carga.dataPedido || '').slice(0, 10);
  document.getElementById('campo-status').value = carga.status;
  document.getElementById('campo-observacoes').value = carga.observacoes || '';
  document.getElementById('modal-carga').classList.add('open');
}

function fecharModal() {
  document.getElementById('modal-carga').classList.remove('open');
}

async function salvarCarga() {
  const numero = document.getElementById('campo-romaneio').value.trim();
  const dataPedido = document.getElementById('campo-dataPedido').value;
  const status = document.getElementById('campo-status').value;
  const observacoes = document.getElementById('campo-observacoes').value.trim();

  if (!numero || !dataPedido) {
    toast('Preencha o número do romaneio e a data do pedido.', 'erro');
    return;
  }

  const body = { numeroRomaneio: numero, dataPedido, status, observacoes };
  const id = document.getElementById('modal-id-carga').value;
  try {
    if (!id) {
      await api('/api/cargas', 'POST', body);
      toast('Carga cadastrada com sucesso!', 'ok');
    } else {
      await api('/api/cargas/' + id, 'PUT', body);
      toast('Carga atualizada com sucesso!', 'ok');
    }
    fecharModal();
    await recarregarTudo();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

// ------------------------------ Modal Histórico ------------------------------

async function abrirModalHistorico(id) {
  const data = await api('/api/cargas/' + id + '/historico');
  const list = document.getElementById('historico-modal-list');
  list.innerHTML = '';
  const tipos = { criacao: 'Cadastro', atualizacao: 'Atualização', status: 'Status', exclusao: 'Exclusão' };
  if (!data.historico.length) {
    list.innerHTML = '<li class="tl-content">Nenhuma alteração registrada.</li>';
  }
  data.historico.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'tl-content';
    li.innerHTML =
      `<strong>${tipos[h.tipo] || h.tipo}</strong>` + (h.campo ? ` – ${h.campo}: ` : '') + `${h.valorAntigo || '–'} → <strong>${h.valorNovo || '–'}</strong>`;
    const meta = document.createElement('div');
    meta.className = 'tl-data';
    meta.textContent = (h.numeroRomaneio ? 'Romaneio ' + h.numeroRomaneio + ' • ' : '') + formatarDataHora(h.dataHora);
    if (h.observacao) {
      const obs = document.createElement('div');
      obs.textContent = h.observacao;
      li.appendChild(obs);
    }
    li.appendChild(meta);
    list.appendChild(li);
  });
  document.getElementById('modal-historico').classList.add('open');
}

// ------------------------------ Ações ------------------------------

async function excluirCarga(id) {
  if (!confirm('Deseja realmente excluir este romaneio?')) return;
  try {
    await api('/api/cargas/' + id, 'DELETE');
    toast('Romaneio excluído com sucesso!', 'ok');
    await recarregarTudo();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function alterarStatus(id, status) {
  try {
    await api('/api/cargas/' + id + '/status', 'PATCH', { status });
    toast('Status atualizado.', 'ok');
    await recarregarTudo();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function abrirRelatorio() {
  try {
    const dados = await api('/api/relatorio');
    if (window.Relatorio && window.Relatorio.render) window.Relatorio.render(dados);
    window.print();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function enviarLogo(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await api('/api/logo', 'POST', { dados: dataUrl });
  return res.url;
}

function aplicarLogo(url) {
  if (!url) return;
  window.__LOGO_URL = url;
  const brandLogo = document.getElementById('brand-logo');
  brandLogo.innerHTML = '<img src="' + url + '" alt="Logotipo">';
  const reportLogo = document.getElementById('report-logo');
  reportLogo.src = url;
}

// ------------------------------ Eventos ------------------------------

document.getElementById('btn-nova-carga').addEventListener('click', abrirModalCriar);
document.getElementById('btn-nova-carga-2').addEventListener('click', abrirModalCriar);
document.getElementById('btn-fechar-modal').addEventListener('click', fecharModal);
document.getElementById('btn-cancelar').addEventListener('click', fecharModal);
document.getElementById('btn-salvar').addEventListener('click', salvarCarga);
document.getElementById('btn-fechar-modal-hist').addEventListener('click', () => document.getElementById('modal-historico').classList.remove('open'));
document.getElementById('btn-fechar-modal-hist-2').addEventListener('click', () => document.getElementById('modal-historico').classList.remove('open'));

document.getElementById('modal-carga').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-carga')) fecharModal();
});
document.getElementById('modal-historico').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-historico')) document.getElementById('modal-historico').classList.remove('open');
});

document.getElementById('btn-imprimir-top').addEventListener('click', abrirRelatorio);
document.getElementById('btn-imprimir-fila').addEventListener('click', abrirRelatorio);

document.getElementById('btn-logo').addEventListener('click', () => document.getElementById('logo-input').click());
document.getElementById('logo-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const url = await enviarLogo(file);
    aplicarLogo(url);
    toast('Logotipo atualizado com sucesso!', 'ok');
  } catch (err) {
    toast(err.message, 'erro');
  }
  e.target.value = '';
});

document.getElementById('fila-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.acao !== 'editar') return;
  const carga = await api('/api/cargas/' + id);
  document.getElementById('modal-id-carga').value = String(id);
  abrirModalEditar(carga);
});

document.getElementById('gerenciar-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const acao = btn.dataset.acao;
  if (acao === 'editar') {
    const carga = await api('/api/cargas/' + id);
    document.getElementById('modal-id-carga').value = String(id);
    abrirModalEditar(carga);
  }
  if (acao === 'excluir') await excluirCarga(id);
});

document.getElementById('despachados-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.acao === 'ver-historico') await abrirModalHistorico(id);
});

document.getElementById('btn-limpar-filtros').addEventListener('click', async () => {
  document.getElementById('filtro-numero').value = '';
  document.getElementById('filtro-data-inicio').value = '';
  document.getElementById('filtro-data-fim').value = '';
  document.getElementById('filtro-status').value = '';
  document.getElementById('filtro-periodo').value = '';
  await renderGerenciarComFiltros();
});

['filtro-numero', 'filtro-data-inicio', 'filtro-data-fim', 'filtro-status', 'filtro-periodo'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', renderGerenciarComFiltros);
  el.addEventListener('input', renderGerenciarComFiltros);
});

// ------------------------------ Init ------------------------------

async function init() {
  document.getElementById('campo-status').innerHTML = STATUS_LIST.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('filtro-status').innerHTML = '<option value="">Todos os status</option>' + STATUS_LIST.map((s) => `<option value="${s}">${s}</option>`).join('');

  await recarregarTudo();

  try {
    const logoRes = await api('/api/logo');
    aplicarLogo(logoRes && logoRes.url);
  } catch (e) {
    /* logo opcional */
  }

  document.getElementById('responsavel').addEventListener('change', async (e) => {
    try {
      await api('/api/config', 'PUT', { valor: e.target.value });
      state.config.responsavel = e.target.value;
    } catch (err) {
      toast(err.message, 'erro');
    }
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      const panel = document.getElementById('section-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
