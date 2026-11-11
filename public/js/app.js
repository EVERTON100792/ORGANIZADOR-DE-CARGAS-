const STATUS_LIST = ['A contratar', 'Despachada'];
const TIPOS_VEICULO = ['FIORINO', 'VAN', 'VAN-SP', '3/4', '3/4-SP', 'TOCO', 'TOCO-SP'];

function normalizarNomeVeiculo(valor) {
  if (!valor) return '';
  const v = String(valor).trim().toUpperCase();
  if (v === 'FIORINO' || v.includes('FIORIN')) return 'FIORINO';
  if (v === 'VAN') return 'VAN';
  if (v === 'VAN-SP' || v === 'VAN SP') return 'VAN-SP';
  if (v === '3/4' || v === 'TRES QUARTOS' || v === 'TRÊS QUARTOS') return '3/4';
  if (v === '3/4-SP' || v === '3/4 SP' || v === 'TRES QUARTOS SP' || v === 'TRÊS QUARTOS SP') return '3/4-SP';
  if (v === 'TOCO') return 'TOCO';
  if (v === 'TOCO-SP' || v === 'TOCO SP') return 'TOCO-SP';
  return valor;
}
window.normalizarNomeVeiculo = normalizarNomeVeiculo;

function hojeFormatadoISO() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = String(hoje.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const state = {
  fila: [],
  despachados: [],
  historico: [],
  selecionadas: new Set(),
  est: { total: 0, ativas: 0, despachadas: 0 },
  usuario: null,
  token: null,
  filtroFilaVeiculo: 'TODOS',
};

let confirmacaoResolver = null;
let destaqueTimer = null;

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

function extrairMotorista(observacoes) {
  if (!observacoes) return '';
  const m = String(observacoes).match(/Motorista:\s*([^|;\n\r]+)/i);
  return m ? m[1].trim() : '';
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
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = 'Bearer ' + state.token;
  }
  const res = await fetch(url, {
    method: op || 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.includes('/api/auth/')) {
    fazerLogout('Sua sessão expirou. Faça login novamente.');
    throw new Error('Sessão expirada.');
  }
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
  const [filaRes, despRes, histRes, estRes] = await Promise.all([
    api('/api/fila'),
    api('/api/despachados'),
    api('/api/historico?limit=60'),
    api('/api/estatisticas'),
  ]);
  state.fila = filaRes;
  state.despachados = despRes;
  state.historico = histRes;
  state.est = estRes;
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

function obterFilaVisivel() {
  if (!state.filtroFilaVeiculo || state.filtroFilaVeiculo === 'TODOS') {
    return state.fila;
  }
  return state.fila.filter((f) => {
    const norm = normalizarNomeVeiculo(f.tipoVeiculo);
    return norm === state.filtroFilaVeiculo;
  });
}

function atualizarContadoresFiltroFila() {
  const contagem = { TODOS: state.fila.length };
  TIPOS_VEICULO.forEach((t) => (contagem[t] = 0));
  state.fila.forEach((f) => {
    const norm = normalizarNomeVeiculo(f.tipoVeiculo);
    if (contagem[norm] !== undefined) {
      contagem[norm]++;
    } else if (norm) {
      contagem[norm] = (contagem[norm] || 0) + 1;
    }
  });

  document.querySelectorAll('.chip-veiculo').forEach((btn) => {
    const tipo = btn.dataset.veiculo || 'TODOS';
    const badge = btn.querySelector('.chip-count');
    const qtd = contagem[tipo] || 0;
    if (badge) badge.textContent = String(qtd);
    btn.classList.toggle('chip-zero', qtd === 0 && tipo !== 'TODOS');
    btn.classList.toggle('active', tipo === (state.filtroFilaVeiculo || 'TODOS'));
  });
}

function renderFila() {
  atualizarContadoresFiltroFila();
  const tbody = document.getElementById('fila-tbody');
  const vazio = document.getElementById('fila-vazio');
  const filaVisivel = obterFilaVisivel();
  const empty = filaVisivel.length === 0;
  const idsAtivos = new Set(state.fila.map((f) => String(f.id)));
  state.selecionadas = new Set([...state.selecionadas].filter((id) => idsAtivos.has(id)));
  tbody.innerHTML = '';

  if (empty) {
    vazio.style.display = 'block';
    vazio.textContent =
      state.filtroFilaVeiculo && state.filtroFilaVeiculo !== 'TODOS'
        ? `Nenhuma carga ativa com o veículo "${state.filtroFilaVeiculo}" na fila de prioridades.`
        : 'Nenhuma carga ativa na fila de prioridades.';
  } else {
    vazio.style.display = 'none';
  }

  filaVisivel.forEach((f) => {
    const pos = f.posicao;
    const idStr = String(f.id);
    const selecionada = state.selecionadas.has(idStr);
    const classeLinha = pos === 1 ? 'row-pos-1' : pos === 2 ? 'row-pos-2' : pos === 3 ? 'row-pos-3' : 'row-pos-4';
    const corBadge = pos === 1 ? '#dc2626' : pos === 2 ? '#ea580c' : pos === 3 ? '#ca8a04' : '#059669';

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check-carga';
    check.dataset.id = idStr;
    check.checked = selecionada;
    check.setAttribute('aria-label', 'Selecionar romaneio ' + f.numeroRomaneio);
    tdCheck.appendChild(check);

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

    const tdVeiculo = document.createElement('td');
    tdVeiculo.textContent = normalizarNomeVeiculo(f.tipoVeiculo) || '–';

    const tdData = document.createElement('td');
    tdData.textContent = formatarData(f.dataPedido);

    const tdObs = document.createElement('td');
    tdObs.textContent = f.observacoes || '–';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'status-badge ' + badgeStatus(f.status);
    badge.textContent = f.status;
    tdStatus.appendChild(badge);

    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'td-acoes-fila';

    const btnDespachar = document.createElement('button');
    btnDespachar.className = 'btn btn-acao btn-despachar-linha';
    btnDespachar.dataset.id = idStr;
    btnDespachar.dataset.acao = 'despachar';
    btnDespachar.title = 'Marcar romaneio como despachado';
    btnDespachar.textContent = '✓ Despachar';

    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-acao';
    btn.dataset.id = String(f.id);
    btn.dataset.acao = 'editar';
    btn.textContent = 'Editar';
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn btn-ghost btn-acao btn-excluir';
    btnExcluir.dataset.id = String(f.id);
    btnExcluir.dataset.acao = 'excluir';
    btnExcluir.textContent = 'Excluir';
    tdAcoes.append(btnDespachar, btn, btnExcluir);

    const tr = document.createElement('tr');
    tr.className = classeLinha + (selecionada ? ' row-selecionada' : '');
    tr.dataset.id = idStr;
    tr.dataset.numeroRomaneio = f.numeroRomaneio;
    tr.append(tdCheck, tdPos, tdNum, tdVeiculo, tdData, tdObs, tdStatus, tdAcoes);
    tbody.appendChild(tr);
  });

  atualizarBarraSelecao();

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

    const tdVeiculo = document.createElement('td');
    tdVeiculo.textContent = normalizarNomeVeiculo(c.tipoVeiculo) || '–';

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
    tdStatus.appendChild(sel);

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

    tr.append(tdNum, tdVeiculo, tdData, tdObs, tdStatus, tdDesp, tdAcoes);
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

    const tdVeiculo = document.createElement('td');
    tdVeiculo.textContent = normalizarNomeVeiculo(c.tipoVeiculo) || '–';

    const tdData = document.createElement('td');
    tdData.textContent = formatarData(c.dataPedido);

    const tdDesp = document.createElement('td');
    tdDesp.textContent = formatarDataHora(c.dataDespacho);

    const tdObs = document.createElement('td');
    tdObs.textContent = c.observacoes || '–';

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'status-badge ' + badgeStatus(c.status);
    badge.textContent = c.status;
    tdStatus.appendChild(badge);

    const tdAcoes = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-acao';
    btn.dataset.id = String(c.id);
    btn.dataset.acao = 'ver-historico';
    btn.textContent = 'Histórico';
    tdAcoes.appendChild(btn);

    tr.append(tdNum, tdVeiculo, tdData, tdDesp, tdObs, tdStatus, tdAcoes);
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

function selecionarPillVeiculo(tipo) {
  const norm = normalizarNomeVeiculo(tipo);
  document.querySelectorAll('.btn-veiculo-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tipo === norm);
  });
  const sel = document.getElementById('campo-tipoVeiculo');
  if (sel) sel.value = norm || '';
}

function abrirModalCriar() {
  document.getElementById('modal-titulo').textContent = 'Nova Carga';
  document.getElementById('modal-id-carga').value = '';
  document.getElementById('campo-romaneio').value = '';
  document.getElementById('campo-dataPedido').value = hojeFormatadoISO();
  selecionarPillVeiculo('');
  document.getElementById('campo-status').value = 'A contratar';
  document.getElementById('campo-observacoes').value = '';
  const btnSalvarNovo = document.getElementById('btn-salvar-novo');
  if (btnSalvarNovo) btnSalvarNovo.style.display = 'inline-flex';
  document.getElementById('modal-carga').classList.add('open');
  setTimeout(() => document.getElementById('campo-romaneio')?.focus(), 80);
}

function abrirModalEditar(carga) {
  document.getElementById('modal-titulo').textContent = 'Editar Carga';
  document.getElementById('modal-id-carga').value = String(carga.id);
  document.getElementById('campo-romaneio').value = carga.numeroRomaneio;
  document.getElementById('campo-dataPedido').value = String(carga.dataPedido || '').slice(0, 10);
  selecionarPillVeiculo(carga.tipoVeiculo || '');
  document.getElementById('campo-status').value = carga.status;
  document.getElementById('campo-observacoes').value = carga.observacoes || '';
  const btnSalvarNovo = document.getElementById('btn-salvar-novo');
  if (btnSalvarNovo) btnSalvarNovo.style.display = 'none';
  document.getElementById('modal-carga').classList.add('open');
  setTimeout(() => document.getElementById('campo-romaneio')?.focus(), 80);
}

function fecharModal() {
  document.getElementById('modal-carga').classList.remove('open');
}

async function salvarCarga(fechar = true) {
  const numero = document.getElementById('campo-romaneio').value.trim();
  const dataPedido = document.getElementById('campo-dataPedido').value;
  const tipoVeiculo = document.getElementById('campo-tipoVeiculo').value;
  const status = document.getElementById('campo-status').value;
  const observacoes = document.getElementById('campo-observacoes').value.trim();

  if (!numero || !dataPedido) {
    toast('Preencha o número do romaneio e a data do pedido.', 'erro');
    return;
  }

  if (!tipoVeiculo) {
    toast('Selecione o tipo de veículo clicando em uma das opções.', 'erro');
    return;
  }

  const body = { numeroRomaneio: numero, dataPedido, tipoVeiculo, status, observacoes };
  const id = document.getElementById('modal-id-carga').value;
  try {
    if (!id) {
      await api('/api/cargas', 'POST', body);
      toast('Carga cadastrada com sucesso!', 'ok');
    } else {
      await api('/api/cargas/' + id, 'PUT', body);
      toast('Carga atualizada com sucesso!', 'ok');
    }
    await recarregarTudo();
    if (fechar) {
      fecharModal();
    } else {
      document.getElementById('modal-id-carga').value = '';
      document.getElementById('campo-romaneio').value = '';
      document.getElementById('campo-observacoes').value = '';
      const campoRom = document.getElementById('campo-romaneio');
      if (campoRom) campoRom.focus();
      toast('Carga cadastrada! Digite o próximo romaneio.', 'ok');
    }
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

// ------------------------------ Confirmação ------------------------------

function abrirConfirmacao(mensagem) {
  const modal = document.getElementById('modal-confirmacao');
  document.getElementById('confirmacao-mensagem').textContent = mensagem;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('btn-cancelar-confirmacao').focus();
  return new Promise((resolve) => {
    confirmacaoResolver = resolve;
  });
}

function fecharConfirmacao(resultado) {
  const modal = document.getElementById('modal-confirmacao');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  const resolver = confirmacaoResolver;
  confirmacaoResolver = null;
  if (resolver) resolver(resultado);
}

// ------------------------------ Ações ------------------------------

async function excluirCarga(id, numero) {
  const mensagem = numero
    ? `O romaneio ${numero} será excluído permanentemente do sistema.`
    : 'Deseja realmente excluir este romaneio?';
  const confirmado = await abrirConfirmacao(mensagem);
  if (!confirmado) return;
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
    await renderGerenciarComFiltros();
  }
}

async function abrirRelatorio() {
  try {
    const dados = await api('/api/relatorio');
    if (state.filtroFilaVeiculo && state.filtroFilaVeiculo !== 'TODOS') {
      dados.fila = (dados.fila || []).filter((f) => normalizarNomeVeiculo(f.tipoVeiculo) === state.filtroFilaVeiculo);
      dados.titulo = `RELATÓRIO DE PRIORIZAÇÃO DE CARGAS - VEÍCULO: ${state.filtroFilaVeiculo}`;
    }
    if (window.Relatorio && window.Relatorio.render) window.Relatorio.render(dados);
    window.print();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

// ------------------------------ Sequência de montagem ------------------------------

function atualizarBarraSelecao() {
  const visiveis = obterFilaVisivel();
  const totalVisiveis = visiveis.length;
  const n = state.selecionadas.size;
  const nVisiveisSelecionadas = visiveis.filter((f) => state.selecionadas.has(String(f.id))).length;
  const contador = document.getElementById('seq-contador');
  const btn = document.getElementById('btn-imprimir-selecionadas');
  const btnDespachar = document.getElementById('btn-despachar-selecionadas');
  const todos = document.getElementById('check-todos');

  if (contador) {
    if (state.filtroFilaVeiculo && state.filtroFilaVeiculo !== 'TODOS') {
      contador.textContent = `${n} ${n === 1 ? 'carga selecionada' : 'cargas selecionadas'} (${totalVisiveis} ${state.filtroFilaVeiculo} na fila)`;
    } else {
      contador.textContent = `${n} ${n === 1 ? 'carga selecionada' : 'cargas selecionadas'}`;
    }
  }
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent = `🖨 Imprimir sequência (${n})`;
  }
  if (btnDespachar) {
    btnDespachar.disabled = n === 0;
    btnDespachar.textContent = `✓ Despachar selecionadas (${n})`;
  }
  if (todos) {
    todos.disabled = totalVisiveis === 0;
    todos.checked = totalVisiveis > 0 && nVisiveisSelecionadas === totalVisiveis;
    todos.indeterminate = nVisiveisSelecionadas > 0 && nVisiveisSelecionadas < totalVisiveis;
  }
}

function selecionarPrimeiras() {
  const input = document.getElementById('seq-quantidade');
  const qtd = Number(input.value);
  if (!Number.isInteger(qtd) || qtd < 1) {
    toast('Informe uma quantidade válida de cargas.', 'erro');
    return;
  }
  const visiveis = obterFilaVisivel();
  if (!visiveis.length) {
    toast('Nenhuma carga ativa encontrada na fila para o filtro selecionado.', 'erro');
    return;
  }
  const n = Math.min(qtd, visiveis.length);
  visiveis.slice(0, n).forEach((f) => state.selecionadas.add(String(f.id)));
  renderFila();
  const filtroNome = state.filtroFilaVeiculo && state.filtroFilaVeiculo !== 'TODOS' ? ` de ${state.filtroFilaVeiculo}` : '';
  toast(
    n < qtd
      ? `Só há ${n} carga(s) disponível(is)${filtroNome}. Todas foram selecionadas.`
      : `${n} primeira(s) carga(s)${filtroNome} selecionada(s) para a expedição.`,
    'ok'
  );
}

function limparSelecao() {
  state.selecionadas.clear();
  renderFila();
  toast('Seleção limpa.', 'ok');
}

async function abrirRelatorioSelecionadas() {
  if (!state.selecionadas.size) {
    toast('Selecione ao menos uma carga para imprimir.', 'erro');
    return;
  }
  try {
    const dados = await api('/api/relatorio');
    const fila = (dados.fila || [])
      .filter((f) => state.selecionadas.has(String(f.id)))
      .map((f, i) => ({ ...f, posicao: i + 1 }));

    if (!fila.length) {
      toast('As cargas selecionadas não estão mais na fila ativa.', 'erro');
      return;
    }

    if (window.Relatorio && window.Relatorio.render) {
      window.Relatorio.render({ ...dados, fila, titulo: 'SEQUÊNCIA DE MONTAGEM – EXPEDIÇÃO' });
    }
    window.print();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function despacharCargaIndividual(id, numero) {
  const mensagem = numero
    ? `Deseja despachar o romaneio ${numero}? Ele sairá da fila de prioridade ativa e será arquivado no Histórico de Despachados.`
    : 'Deseja marcar este romaneio como despachado?';
  const confirmado = await abrirConfirmacao(mensagem);
  if (!confirmado) return;
  try {
    await api('/api/cargas/' + id + '/status', 'PATCH', { status: 'Despachada' });
    toast(`Romaneio ${numero || id} despachado com sucesso!`, 'ok');
    await recarregarTudo();
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function despacharSelecionadas() {
  const ids = Array.from(state.selecionadas).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) {
    toast('Selecione ao menos uma carga para despachar.', 'erro');
    return;
  }
  const qtd = ids.length;
  const textoQtd = qtd === 1 ? '1 carga selecionada' : `${qtd} cargas selecionadas`;
  const confirmado = await abrirConfirmacao(
    `Deseja marcar ${textoQtd} como DESPACHADA(S)? Elas serão removidas da fila de prioridade ativa e arquivadas no Histórico de Despachados.`
  );
  if (!confirmado) return;

  const btn = document.getElementById('btn-despachar-selecionadas');
  const textoOriginal = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Despachando...';
  }

  try {
    const res = await api('/api/cargas/status-em-massa', 'POST', {
      ids,
      status: 'Despachada',
    });
    state.selecionadas.clear();
    toast(`${res.atualizados || qtd} carga(s) despachada(s) com sucesso!`, 'ok');
    await recarregarTudo();
  } catch (e) {
    toast(e.message || 'Erro ao despachar cargas em massa.', 'erro');
  } finally {
    if (btn) {
      btn.disabled = state.selecionadas.size === 0;
      btn.textContent = `✓ Despachar selecionadas (${state.selecionadas.size})`;
      atualizarBarraSelecao();
    }
  }
}

// ------------------------------ Despacho Rápido: Bipador e Lote ------------------------------

function processarBipadorRomaneio() {
  const input = document.getElementById('input-bipar-romaneio');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const numBusca = val.toLowerCase();
  const cargaAtiva = state.fila.find(
    (f) => String(f.numeroRomaneio || '').trim().toLowerCase() === numBusca
  );

  if (cargaAtiva) {
    const idStr = String(cargaAtiva.id);
    if (state.selecionadas.has(idStr)) {
      toast(`ℹ Romaneio ${cargaAtiva.numeroRomaneio} já está selecionado.`, 'ok');
    } else {
      state.selecionadas.add(idStr);
      renderFila();
      const tr = Array.from(document.querySelectorAll('#fila-tbody tr')).find(
        (linha) => linha.dataset.id === idStr
      );
      if (tr) {
        tr.classList.remove('row-destacada');
        void tr.offsetWidth;
        tr.classList.add('row-destacada');
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      toast(`✓ Romaneio ${cargaAtiva.numeroRomaneio} selecionado! (${state.selecionadas.size} selecionadas)`, 'ok');
    }
    input.value = '';
    input.focus();
    return;
  }

  const cargaDespachada = state.despachados.find(
    (c) => String(c.numeroRomaneio || '').trim().toLowerCase() === numBusca
  );
  if (cargaDespachada) {
    const mot = extrairMotorista(cargaDespachada.observacoes);
    const motStr = mot ? ` (Motorista: ${mot})` : '';
    toast(`⚠️ Romaneio ${cargaDespachada.numeroRomaneio} já foi DESPACHADO anteriormente${motStr}.`, 'erro');
  } else {
    toast(`❌ Romaneio "${val}" não foi encontrado na fila ativa.`, 'erro');
  }
  input.value = '';
  input.focus();
}

function abrirModalColarLote() {
  const modal = document.getElementById('modal-colar-lote');
  const txt = document.getElementById('textarea-colar-lote');
  const fb = document.getElementById('feedback-colar-lote');
  if (txt) txt.value = '';
  if (fb) {
    fb.style.display = 'none';
    fb.className = 'feedback-lote';
    fb.innerHTML = '';
  }
  if (modal) modal.classList.add('open');
  setTimeout(() => txt?.focus(), 80);
}

function fecharModalColarLote() {
  const modal = document.getElementById('modal-colar-lote');
  if (modal) modal.classList.remove('open');
}

function extrairRomaneiosDeTexto(texto) {
  if (!texto) return [];
  const tokens = texto
    .split(/[\r\n,;\t\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return Array.from(new Set(tokens));
}

function processarMarcarLote() {
  const txt = document.getElementById('textarea-colar-lote')?.value || '';
  const romaneios = extrairRomaneiosDeTexto(txt);

  if (!romaneios.length) {
    toast('Cole ao menos um número de romaneio no campo.', 'erro');
    return;
  }

  const encontrados = [];
  const jaDespachados = [];
  const naoEncontrados = [];

  romaneios.forEach((num) => {
    const numLower = num.toLowerCase();
    const naFila = state.fila.find(
      (f) => String(f.numeroRomaneio || '').trim().toLowerCase() === numLower
    );
    if (naFila) {
      encontrados.push(naFila);
    } else {
      const desp = state.despachados.find(
        (c) => String(c.numeroRomaneio || '').trim().toLowerCase() === numLower
      );
      if (desp) jaDespachados.push(num);
      else naoEncontrados.push(num);
    }
  });

  if (encontrados.length > 0) {
    encontrados.forEach((f) => state.selecionadas.add(String(f.id)));
    renderFila();
    fecharModalColarLote();

    let msg = `✓ ${encontrados.length} carga(s) selecionada(s) na fila!`;
    if (jaDespachados.length > 0) {
      msg += ` (${jaDespachados.length} já despachada(s))`;
    }
    if (naoEncontrados.length > 0) {
      msg += ` (${naoEncontrados.length} não encontrada(s))`;
    }
    toast(msg, 'ok');
  } else {
    const fb = document.getElementById('feedback-colar-lote');
    if (fb) {
      fb.style.display = 'block';
      fb.className = 'feedback-lote erro';
      let detalhe = '<strong>Nenhuma carga ativa encontrada na fila.</strong><br>';
      if (jaDespachados.length > 0) {
        detalhe += `• ${jaDespachados.length} romaneio(s) já foram despachados anteriormente.<br>`;
      }
      if (naoEncontrados.length > 0) {
        detalhe += `• ${naoEncontrados.length} romaneio(s) não constam no sistema.<br>`;
      }
      fb.innerHTML = detalhe;
    }
  }
}

async function processarDespacharLote() {
  const txt = document.getElementById('textarea-colar-lote')?.value || '';
  const romaneios = extrairRomaneiosDeTexto(txt);

  if (!romaneios.length) {
    toast('Cole ao menos um número de romaneio no campo.', 'erro');
    return;
  }

  const encontrados = [];
  const jaDespachados = [];
  const naoEncontrados = [];

  romaneios.forEach((num) => {
    const numLower = num.toLowerCase();
    const naFila = state.fila.find(
      (f) => String(f.numeroRomaneio || '').trim().toLowerCase() === numLower
    );
    if (naFila) encontrados.push(naFila);
    else {
      const desp = state.despachados.find(
        (c) => String(c.numeroRomaneio || '').trim().toLowerCase() === numLower
      );
      if (desp) jaDespachados.push(num);
      else naoEncontrados.push(num);
    }
  });

  if (!encontrados.length) {
    const fb = document.getElementById('feedback-colar-lote');
    if (fb) {
      fb.style.display = 'block';
      fb.className = 'feedback-lote erro';
      fb.innerHTML = '<strong>Nenhuma carga ativa para despachar.</strong> Verifique os números informados.';
    }
    toast('Nenhuma carga ativa encontrada para despachar.', 'erro');
    return;
  }

  const ids = encontrados.map((f) => Number(f.id));
  const btn = document.getElementById('btn-despachar-lote');
  const txtOriginal = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Despachando...';
  }

  try {
    const res = await api('/api/cargas/status-em-massa', 'POST', {
      ids,
      status: 'Despachada',
    });
    fecharModalColarLote();
    toast(`🚀 ${res.atualizados || ids.length} carga(s) despachada(s) com sucesso!`, 'ok');
    await recarregarTudo();
  } catch (e) {
    toast(e.message || 'Erro ao despachar cargas em lote.', 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = txtOriginal;
    }
  }
}

// ------------------------------ Leitor de PDF de Programação ------------------------------

let pdfCargasAtuais = [];

async function extrairCargasDePDF(file) {
  if (!window.pdfjsLib) {
    throw new Error('A biblioteca PDF.js ainda está carregando ou falhou. Verifique sua conexão com a internet.');
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const cargasExtraidas = [];
  const romaneiosVistos = new Set();
  const linhasFallback = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // 1. Agrupar itens por linha vertical (eixo Y com tolerância de 8pt para acomodar observações de múltiplas linhas)
    const gruposY = [];
    content.items.forEach((item) => {
      if (!item || !item.str) return;
      const y = item.transform[5];
      let grupo = gruposY.find((g) => Math.abs(g.y - y) <= 8);
      if (!grupo) {
        grupo = { y, itens: [] };
        gruposY.push(grupo);
      }
      grupo.itens.push(item);
    });

    // Ordenar do topo para a base da página
    gruposY.sort((a, b) => b.y - a.y);

    for (const g of gruposY) {
      // Ordenar da esquerda para a direita (eixo X)
      g.itens.sort((a, b) => a.transform[4] - b.transform[4]);

      // Guardar linha corrida para fallback genérico
      const linhaCompleta = g.itens.map((it) => it.str).join(' ').trim();
      if (linhaCompleta) linhasFallback.push(linhaCompleta);

      // 2. Extração estruturada por colunas da Programação Turno C (coordenadas X)
      const cols = {
        num: '',
        data: '',
        veiculo: '',
        romaneio: '',
        tipo: '',
        motorista: '',
        peso: '',
        obs: '',
        horario: '',
      };

      g.itens.forEach((it) => {
        const x = it.transform[4];
        if (x < 50) cols.num += it.str;
        else if (x < 140) cols.data += it.str;
        else if (x < 250) cols.veiculo += it.str;
        else if (x < 400) cols.romaneio += it.str;
        else if (x < 540) cols.tipo += it.str;
        else if (x < 720) cols.motorista += it.str;
        else if (x < 800) cols.peso += it.str;
        else if (x < 980) cols.obs += it.str;
        else cols.horario += it.str;
      });

      const mRom = cols.romaneio.match(/\b\d{5,7}\b/);
      if (mRom) {
        const romaneio = mRom[0];
        if (!romaneiosVistos.has(romaneio)) {
          romaneiosVistos.add(romaneio);

          let veiculoLimpo = cols.veiculo.trim().toUpperCase().replace(/\s+/g, '');
          if (veiculoLimpo.includes('FIORINO')) veiculoLimpo = 'FIORINO';
          else if (veiculoLimpo.includes('3/4')) veiculoLimpo = '3/4';
          else if (veiculoLimpo.includes('VAN')) veiculoLimpo = 'VAN';
          else if (veiculoLimpo.includes('TOCO')) veiculoLimpo = 'TOCO';

          cargasExtraidas.push({
            romaneio,
            veiculo: veiculoLimpo || cols.veiculo.trim(),
            motorista: cols.motorista.trim(),
            peso: cols.peso.trim(),
            data: cols.data.trim(),
            observacao: cols.obs.trim(),
            horario: cols.horario.trim(),
          });
        }
      }
    }
  }

  // 3. Fallback genérico caso a tabela estruturada não identifique os romaneios
  if (cargasExtraidas.length === 0) {
    return interpretarLinhasPDFProgramacao(linhasFallback);
  }

  return cargasExtraidas;
}

function interpretarLinhasPDFProgramacao(linhas) {
  const regex = /(?:(\d{1,3})\s+)?(?:(\d{2}\/\d{2}\/\d{4})\s+)?(FIORINO|VAN|VAN-SP|3\/4|3\/4-SP|TOCO|TOCO-SP)\s+(\d{5,7})\s+(?:BATIDA|PALETIZADA|FRACIONADA|DIRETA|[A-Z]{4,12})\s+([A-Z\s]{2,35}?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)/i;

  const cargasExtraidas = [];
  const romaneiosVistos = new Set();

  linhas.forEach((linha) => {
    const l = linha.trim();
    if (!l) return;

    const m = l.match(regex);
    if (m) {
      const romaneio = m[4];
      if (!romaneiosVistos.has(romaneio)) {
        romaneiosVistos.add(romaneio);
        cargasExtraidas.push({
          romaneio,
          veiculo: m[3].toUpperCase(),
          motorista: m[5].trim(),
          peso: m[6] || '',
          data: m[2] || '',
          observacao: '',
          horario: '',
        });
      }
    } else {
      const mRom = l.match(/\b(\d{5,7})\b/);
      if (
        mRom &&
        !l.toUpperCase().includes('TOTAL') &&
        !l.toUpperCase().includes('PROGRAMAÇÃO') &&
        !l.toUpperCase().includes('TRIZY')
      ) {
        const romaneio = mRom[1];
        if (!romaneiosVistos.has(romaneio)) {
          romaneiosVistos.add(romaneio);
          const veicMatch = l.match(/\b(FIORINO|VAN|VAN-SP|3\/4|3\/4-SP|TOCO|TOCO-SP)\b/i);
          cargasExtraidas.push({
            romaneio,
            veiculo: veicMatch ? veicMatch[1].toUpperCase() : '',
            motorista: '',
            peso: '',
            data: '',
            observacao: '',
            horario: '',
          });
        }
      }
    }
  });

  return cargasExtraidas;
}

function fecharModalPreviewPDF() {
  document.getElementById('modal-preview-pdf')?.classList.remove('open');
  const fileInput = document.getElementById('input-pdf-upload');
  if (fileInput) fileInput.value = '';
}

async function processarArquivoPDF(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    toast('Por favor, selecione um arquivo no formato PDF.', 'erro');
    return;
  }

  toast('Lendo arquivo PDF e identificando romaneios...', 'ok');

  try {
    const extraidos = await extrairCargasDePDF(file);

    if (!extraidos.length) {
      toast('Não foi possível identificar romaneios na tabela deste PDF. Verifique se o arquivo possui texto selecionável.', 'erro');
      return;
    }

    pdfCargasAtuais = extraidos.map((item) => {
      const numLower = item.romaneio.toLowerCase();
      const naFila = state.fila.find(
        (f) => String(f.numeroRomaneio || '').trim().toLowerCase() === numLower
      );
      if (naFila) {
        return {
          ...item,
          status: 'PRONTA',
          cargaId: naFila.id,
          posicao: naFila.posicao,
          veiculoOriginal: naFila.tipoVeiculo,
          selecionado: true,
        };
      }
      const despachada = state.despachados.find(
        (c) => String(c.numeroRomaneio || '').trim().toLowerCase() === numLower
      );
      if (despachada) {
        return {
          ...item,
          status: 'DESPACHADA',
          cargaId: despachada.id,
          selecionado: false,
        };
      }
      return {
        ...item,
        status: 'NAO_CADASTRADA',
        cargaId: null,
        selecionado: false,
      };
    });

    renderModalPreviewPDF(file.name);
  } catch (err) {
    toast(err.message || 'Erro ao processar o arquivo PDF.', 'erro');
  }
}

function renderModalPreviewPDF(nomeArquivo) {
  const modal = document.getElementById('modal-preview-pdf');
  const nomeEl = document.getElementById('pdf-nome-arquivo');
  const subinfoEl = document.getElementById('pdf-subtitulo-info');
  const badgeProntos = document.getElementById('badge-pdf-prontos');
  const badgeDesp = document.getElementById('badge-pdf-despachados');
  const badgeNao = document.getElementById('badge-pdf-nao-encontrados');
  const tbody = document.getElementById('pdf-tbody-cargas');

  if (nomeEl) nomeEl.textContent = nomeArquivo || 'Programacao.pdf';

  const nProntas = pdfCargasAtuais.filter((c) => c.status === 'PRONTA').length;
  const nDesp = pdfCargasAtuais.filter((c) => c.status === 'DESPACHADA').length;
  const nNao = pdfCargasAtuais.filter((c) => c.status === 'NAO_CADASTRADA').length;

  if (subinfoEl) {
    subinfoEl.textContent = `${pdfCargasAtuais.length} cargas identificadas no documento`;
  }
  if (badgeProntos) badgeProntos.textContent = `${nProntas} prontas para despachar`;
  if (badgeDesp) badgeDesp.textContent = `${nDesp} já despachadas`;
  if (badgeNao) badgeNao.textContent = `${nNao} não cadastradas`;

  if (tbody) {
    tbody.innerHTML = '';
    pdfCargasAtuais.forEach((c) => {
      const tr = document.createElement('tr');
      if (c.status === 'NAO_CADASTRADA') tr.className = 'row-nao-cadastrada';

      const tdCheck = document.createElement('td');
      tdCheck.className = 'col-check';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(c.selecionado && c.status === 'PRONTA');
      check.disabled = c.status !== 'PRONTA';
      check.addEventListener('change', () => {
        c.selecionado = check.checked;
        atualizarBotaoDespachoPDF();
      });
      tdCheck.appendChild(check);

      const tdRom = document.createElement('td');
      tdRom.innerHTML = `<strong>${c.romaneio}</strong>`;

      const tdVeic = document.createElement('td');
      tdVeic.textContent = c.veiculo || '–';

      const tdMot = document.createElement('td');
      tdMot.textContent = c.motorista ? c.motorista : '–';

      const tdStatus = document.createElement('td');
      if (c.status === 'PRONTA') {
        tdStatus.innerHTML = `<span class="status-tag-pdf status-tag-pronto">🟢 Ativa na Fila (${c.posicao}º)</span>`;
      } else if (c.status === 'DESPACHADA') {
        tdStatus.innerHTML = `<span class="status-tag-pdf status-tag-despachada">⚪ Já Despachada</span>`;
      } else {
        tdStatus.innerHTML = `<span class="status-tag-pdf status-tag-inexistente">🔴 Não Cadastrada</span>`;
      }

      tr.append(tdCheck, tdRom, tdVeic, tdMot, tdStatus);
      tbody.appendChild(tr);
    });
  }

  atualizarBotaoDespachoPDF();

  if (modal) modal.classList.add('open');
}

function atualizarBotaoDespachoPDF() {
  const btnDespachar = document.getElementById('btn-despachar-tudo-pdf');
  const checkTodos = document.getElementById('check-todos-pdf');
  const prontas = pdfCargasAtuais.filter((c) => c.status === 'PRONTA');
  const selecionadas = prontas.filter((c) => c.selecionado);

  if (btnDespachar) {
    btnDespachar.disabled = selecionadas.length === 0;
    btnDespachar.textContent = `🚀 Despachar Cargas Prontas (${selecionadas.length})`;
  }
  if (checkTodos) {
    checkTodos.disabled = prontas.length === 0;
    checkTodos.checked = prontas.length > 0 && selecionadas.length === prontas.length;
    checkTodos.indeterminate = selecionadas.length > 0 && selecionadas.length < prontas.length;
  }
}

function confirmarSelecaoFilaPDF() {
  const selecionadas = pdfCargasAtuais.filter((c) => c.status === 'PRONTA' && c.selecionado);
  if (!selecionadas.length) {
    toast('Selecione ao menos uma carga ativa na tabela.', 'erro');
    return;
  }
  selecionadas.forEach((c) => state.selecionadas.add(String(c.cargaId)));
  fecharModalPreviewPDF();
  renderFila();
  toast(`✓ ${selecionadas.length} carga(s) do PDF selecionada(s) na fila de prioridade!`, 'ok');
}

async function confirmarDespachoPDF() {
  const selecionadas = pdfCargasAtuais.filter((c) => c.status === 'PRONTA' && c.selecionado);
  if (!selecionadas.length) {
    toast('Nenhuma carga ativa selecionada para despacho.', 'erro');
    return;
  }

  const salvarMot = document.getElementById('check-salvar-motorista')?.checked;
  const ids = selecionadas.map((c) => Number(c.cargaId));
  const motoristasMap = {};

  if (salvarMot) {
    selecionadas.forEach((c) => {
      if (c.motorista) {
        motoristasMap[c.cargaId] = c.motorista;
      }
    });
  }

  const btn = document.getElementById('btn-despachar-tudo-pdf');
  const txtOriginal = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Despachando...';
  }

  try {
    const res = await api('/api/cargas/status-em-massa', 'POST', {
      ids,
      status: 'Despachada',
      motoristas: motoristasMap,
    });
    fecharModalPreviewPDF();
    toast(`🚀 ${res.atualizados || ids.length} carga(s) despachada(s) com sucesso com seus motoristas vinculados!`, 'ok');
    await recarregarTudo();
  } catch (err) {
    toast(err.message || 'Erro ao despachar cargas.', 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = txtOriginal;
    }
  }
}

// ------------------------------ Consulta rápida ------------------------------

function ativarAba(nome) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === nome);
  });
  document.querySelectorAll('.tab-panel').forEach((painel) => {
    painel.classList.toggle('active', painel.id === 'section-' + nome);
  });
}

async function destacarCargaNaFila(carga) {
  const id = String(carga.id);
  const numero = String(carga.numeroRomaneio || '').trim().toLowerCase();

  const localizar = () =>
    state.fila.findIndex(
      (f) => String(f.id) === id || (numero && String(f.numeroRomaneio || '').trim().toLowerCase() === numero)
    );

  let indice = localizar();

  // Se a fila estiver desatualizada, recarrega antes de desistir do destaque.
  if (indice === -1) {
    try {
      state.fila = await api('/api/fila');
      renderFila();
      indice = localizar();
    } catch (e) {
      /* mantém o aviso da consulta */
    }
  }

  if (indice === -1) return null;

  ativarAba('fila');

  const alvo = state.fila[indice];
  const idAlvo = String(alvo.id);
  let linha = Array.from(document.querySelectorAll('#fila-tbody tr')).find(
    (tr) => tr.dataset.id === idAlvo
  );
  if (!linha && state.filtroFilaVeiculo !== 'TODOS') {
    state.filtroFilaVeiculo = 'TODOS';
    document.querySelectorAll('.chip-veiculo').forEach((c) => {
      c.classList.toggle('active', c.dataset.veiculo === 'TODOS');
    });
    renderFila();
    linha = Array.from(document.querySelectorAll('#fila-tbody tr')).find(
      (tr) => tr.dataset.id === idAlvo
    );
  }
  if (!linha) return null;

  if (destaqueTimer) {
    clearTimeout(destaqueTimer);
    destaqueTimer = null;
  }
  document.querySelectorAll('#fila-tbody tr.row-destacada').forEach((tr) => {
    tr.classList.remove('row-destacada');
  });

  // Reinicia a animação mesmo em buscas repetidas.
  void linha.offsetWidth;
  linha.classList.add('row-destacada');

  const reduzirMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  linha.scrollIntoView({ behavior: reduzirMovimento ? 'auto' : 'smooth', block: 'center' });

  destaqueTimer = setTimeout(() => {
    linha.classList.remove('row-destacada');
    destaqueTimer = null;
  }, 10000);

  return alvo.posicao;
}

async function consultarRomaneio() {
  const input = document.getElementById('busca-romaneio');
  const box = document.getElementById('consulta-resultado');
  const numero = input.value.trim();

  box.hidden = false;
  if (!numero) {
    box.className = 'consulta-resultado aviso';
    box.textContent = 'Digite o número do romaneio para verificar.';
    input.focus();
    return;
  }

  try {
    const dados = await api('/api/verificar-romaneio?numero=' + encodeURIComponent(numero));

    if (!dados.encontrado) {
      box.className = 'consulta-resultado livre';
      box.innerHTML = '';
      const texto = document.createElement('span');
      texto.textContent = `Romaneio ${numero} não está cadastrado. Você pode cadastrá-lo.`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-pequeno';
      btn.textContent = 'Cadastrar agora';
      btn.addEventListener('click', () => {
        abrirModalCriar();
        document.getElementById('campo-romaneio').value = numero;
        document.getElementById('campo-romaneio').focus();
      });
      box.append(texto, btn);
      return;
    }

    const carga = dados.carga;
    const despachada = String(carga.status) === 'Despachada';
    box.className = 'consulta-resultado ' + (despachada ? 'despachada' : 'cadastrada');
    const dataDespacho = carga.dataDespacho ? ` em ${formatarData(carga.dataDespacho)}` : '';
    const mot = extrairMotorista(carga.observacoes);
    const detalhes = [];
    if (carga.tipoVeiculo) detalhes.push(`Veículo: ${carga.tipoVeiculo}`);
    if (mot) detalhes.push(`Motorista: ${mot}`);
    const detalhesStr = detalhes.length ? ` (${detalhes.join(' | ')})` : '';

    if (despachada) {
      box.textContent = `Romaneio ${carga.numeroRomaneio} já foi DESPACHADO${dataDespacho}${detalhesStr}. Não é necessário cadastrar novamente.`;
      return;
    }

    box.textContent = `Romaneio ${carga.numeroRomaneio} está cadastrado com status "${carga.status}"${detalhesStr}. Não é necessário cadastrar novamente.`;

    const posicao = await destacarCargaNaFila(carga);
    if (posicao) {
      box.textContent = `Romaneio ${carga.numeroRomaneio} está na ${posicao}ª posição da fila de prioridade${detalhesStr}. Destaque aplicado na lista.`;
    }
  } catch (e) {
    box.className = 'consulta-resultado erro';
    box.textContent = e.message;
  }
}

// ------------------------------ Eventos ------------------------------

document.getElementById('btn-nova-carga')?.addEventListener('click', abrirModalCriar);
document.getElementById('btn-nova-carga-2')?.addEventListener('click', abrirModalCriar);
document.getElementById('btn-nova-carga-fila')?.addEventListener('click', abrirModalCriar);
document.getElementById('btn-fechar-modal')?.addEventListener('click', fecharModal);
document.getElementById('btn-cancelar')?.addEventListener('click', fecharModal);
document.getElementById('btn-salvar')?.addEventListener('click', () => salvarCarga(true));
document.getElementById('btn-salvar-novo')?.addEventListener('click', () => salvarCarga(false));

// Seleção rápida de veículos pelos botões
document.querySelectorAll('.btn-veiculo-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    selecionarPillVeiculo(btn.dataset.tipo);
  });
});
document.getElementById('campo-tipoVeiculo')?.addEventListener('change', (e) => {
  selecionarPillVeiculo(e.target.value);
});

// Pressionar Enter no campo romaneio para salvar rapidamente e passar para o próximo
document.getElementById('campo-romaneio')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const veiculo = document.getElementById('campo-tipoVeiculo')?.value;
    if (veiculo) {
      salvarCarga(false);
    } else {
      toast('Selecione o veículo acima antes de avançar.', 'erro');
    }
  }
});

document.getElementById('btn-fechar-modal-hist')?.addEventListener('click', () => document.getElementById('modal-historico').classList.remove('open'));
document.getElementById('btn-fechar-modal-hist-2')?.addEventListener('click', () => document.getElementById('modal-historico').classList.remove('open'));

document.getElementById('modal-carga').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-carga')) fecharModal();
});
document.getElementById('modal-historico').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-historico')) document.getElementById('modal-historico').classList.remove('open');
});

document.getElementById('btn-fechar-confirmacao').addEventListener('click', () => fecharConfirmacao(false));
document.getElementById('btn-cancelar-confirmacao').addEventListener('click', () => fecharConfirmacao(false));
document.getElementById('btn-confirmar-exclusao').addEventListener('click', () => fecharConfirmacao(true));
document.getElementById('modal-confirmacao').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-confirmacao')) fecharConfirmacao(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('modal-confirmacao').classList.contains('open')) {
      fecharConfirmacao(false);
    }
    if (document.getElementById('modal-colar-lote')?.classList.contains('open')) {
      fecharModalColarLote();
    }
    if (document.getElementById('modal-preview-pdf')?.classList.contains('open')) {
      fecharModalPreviewPDF();
    }
  }
});

// Eventos do Bipador de Romaneios
document.getElementById('input-bipar-romaneio')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    processarBipadorRomaneio();
  }
});
document.getElementById('btn-bipar-romaneio')?.addEventListener('click', processarBipadorRomaneio);

// Eventos do Modal de Colar Lista em Lote
document.getElementById('btn-abrir-colar-lote')?.addEventListener('click', abrirModalColarLote);
document.getElementById('btn-fechar-colar-lote')?.addEventListener('click', fecharModalColarLote);
document.getElementById('btn-cancelar-colar-lote')?.addEventListener('click', fecharModalColarLote);
document.getElementById('modal-colar-lote')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-colar-lote')) fecharModalColarLote();
});
document.getElementById('btn-marcar-lote')?.addEventListener('click', processarMarcarLote);
document.getElementById('btn-despachar-lote')?.addEventListener('click', processarDespacharLote);

// Eventos de Importação de PDF de Programação
document.getElementById('btn-abrir-upload-pdf')?.addEventListener('click', () => {
  document.getElementById('input-pdf-upload')?.click();
});

document.getElementById('input-pdf-upload')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) processarArquivoPDF(file);
});

document.getElementById('btn-fechar-preview-pdf')?.addEventListener('click', fecharModalPreviewPDF);
document.getElementById('btn-cancelar-preview-pdf')?.addEventListener('click', fecharModalPreviewPDF);
document.getElementById('modal-preview-pdf')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-preview-pdf')) fecharModalPreviewPDF();
});

document.getElementById('check-todos-pdf')?.addEventListener('change', (e) => {
  const marcado = e.target.checked;
  pdfCargasAtuais.forEach((c) => {
    if (c.status === 'PRONTA') c.selecionado = marcado;
  });
  document.querySelectorAll('#pdf-tbody-cargas input[type="checkbox"]').forEach((cb) => {
    if (!cb.disabled) cb.checked = marcado;
  });
  atualizarBotaoDespachoPDF();
});

document.getElementById('btn-selecionar-fila-pdf')?.addEventListener('click', confirmarSelecaoFilaPDF);
document.getElementById('btn-despachar-tudo-pdf')?.addEventListener('click', confirmarDespachoPDF);

// Suporte para arrastar e soltar (drag & drop) o PDF em qualquer lugar
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
    processarArquivoPDF(file);
  }
});

document.getElementById('btn-imprimir-top').addEventListener('click', abrirRelatorio);
document.getElementById('btn-imprimir-fila').addEventListener('click', abrirRelatorio);
document.getElementById('btn-imprimir-selecionadas').addEventListener('click', abrirRelatorioSelecionadas);
document.getElementById('btn-despachar-selecionadas').addEventListener('click', despacharSelecionadas);
document.getElementById('btn-selecionar-qtd').addEventListener('click', selecionarPrimeiras);
document.getElementById('btn-limpar-selecao').addEventListener('click', limparSelecao);

// Filtro rápido de veículos na fila de prioridade
document.querySelectorAll('.chip-veiculo').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filtroFilaVeiculo = btn.dataset.veiculo || 'TODOS';
    document.querySelectorAll('.chip-veiculo').forEach((c) => {
      c.classList.toggle('active', c.dataset.veiculo === state.filtroFilaVeiculo);
    });
    renderFila();
  });
});

document.getElementById('check-todos')?.addEventListener('change', (e) => {
  const visiveis = obterFilaVisivel();
  if (e.target.checked) {
    visiveis.forEach((f) => state.selecionadas.add(String(f.id)));
  } else {
    visiveis.forEach((f) => state.selecionadas.delete(String(f.id)));
  }
  renderFila();
});

document.getElementById('fila-tbody').addEventListener('change', (e) => {
  const check = e.target.closest('.check-carga');
  if (!check) return;
  const id = String(check.dataset.id);
  if (check.checked) state.selecionadas.add(id);
  else state.selecionadas.delete(id);
  const tr = check.closest('tr');
  if (tr) tr.classList.toggle('row-selecionada', check.checked);
  atualizarBarraSelecao();
});

document.getElementById('form-consulta').addEventListener('submit', (e) => {
  e.preventDefault();
  consultarRomaneio();
});

document.getElementById('busca-romaneio').addEventListener('input', () => {
  document.getElementById('consulta-resultado').hidden = true;
});

document.getElementById('fila-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const numero = btn.closest('tr')?.querySelector('td strong')?.textContent.trim() || '';
  try {
    if (btn.dataset.acao === 'despachar') await despacharCargaIndividual(id, numero);
    if (btn.dataset.acao === 'editar') {
      const carga = await api('/api/cargas/' + id);
      abrirModalEditar(carga);
    }
    if (btn.dataset.acao === 'excluir') await excluirCarga(id, numero);
  } catch (err) {
    toast(err.message, 'erro');
  }
});

document.getElementById('gerenciar-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const acao = btn.dataset.acao;
  const numero = btn.closest('tr')?.querySelector('td strong')?.textContent.trim() || '';
  try {
    if (acao === 'editar') {
      const carga = await api('/api/cargas/' + id);
      abrirModalEditar(carga);
    }
    if (acao === 'excluir') await excluirCarga(id, numero);
  } catch (err) {
    toast(err.message, 'erro');
  }
});

document.getElementById('despachados-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-acao');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.acao === 'ver-historico') {
    try {
      await abrirModalHistorico(id);
    } catch (err) {
      toast(err.message, 'erro');
    }
  }
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

// ------------------------------ Autenticação Supabase ------------------------------

function exibirAuthMsg(msg, tipo) {
  const box = document.getElementById('auth-msg');
  if (!box) return;
  box.className = 'auth-msg ' + (tipo || 'erro');
  box.textContent = msg;
  box.hidden = false;
}

function limparAuthMsg() {
  const box = document.getElementById('auth-msg');
  if (box) box.hidden = true;
}

function alternarAbasAuth(aba) {
  limparAuthMsg();
  const tabLogin = document.getElementById('tab-auth-login');
  const tabCadastro = document.getElementById('tab-auth-cadastro');
  const formLogin = document.getElementById('form-login');
  const formCadastro = document.getElementById('form-cadastro');

  if (aba === 'cadastro') {
    tabLogin.classList.remove('active');
    tabCadastro.classList.add('active');
    formLogin.style.display = 'none';
    formCadastro.style.display = 'block';
    document.getElementById('cadastro-nome').focus();
  } else {
    tabCadastro.classList.remove('active');
    tabLogin.classList.add('active');
    formCadastro.style.display = 'none';
    formLogin.style.display = 'block';
    document.getElementById('login-email').focus();
  }
}

function alternarVisibilidadeSenha(idInput) {
  const input = document.getElementById(idInput);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function aplicarUsuarioNaTela(usuario) {
  const nameEl = document.getElementById('user-name');
  if (nameEl && usuario) {
    nameEl.textContent = usuario.nome || usuario.email.split('@')[0];
  }
}

function abrirApp() {
  const authScreen = document.getElementById('auth-screen');
  const appEl = document.getElementById('app');
  if (authScreen) authScreen.style.display = 'none';
  if (appEl) appEl.style.display = 'block';
}

function fecharAppParaLogin() {
  const authScreen = document.getElementById('auth-screen');
  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'none';
  if (authScreen) {
    authScreen.style.display = 'flex';
    alternarAbasAuth('login');
  }
  // Limpa imediatamente os campos do formulário para não manter dados na tela
  const emailInput = document.getElementById('login-email');
  const senhaInput = document.getElementById('login-senha');
  if (emailInput) emailInput.value = '';
  if (senhaInput) senhaInput.value = '';
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = 'Usuário';
}

async function fazerLogin(e) {
  if (e) e.preventDefault();
  limparAuthMsg();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-senha').value;
  const btn = document.getElementById('btn-submit-login');
  const textoOriginal = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Entrando...</span>';
  }

  try {
    const res = await api('/api/auth/login', 'POST', { email, password });
    state.token = res.token;
    state.usuario = res.user;

    // Salva na sessão ativa do navegador (sessionStorage)
    // Isso garante que ao fechar o navegador/aba a sessão expire e não fique salva para outra pessoa
    sessionStorage.setItem('cargas_auth_token', res.token);
    sessionStorage.setItem('cargas_auth_user', JSON.stringify(res.user));

    // Remove qualquer dado legado de usuário no localStorage para não misturar máquinas
    localStorage.removeItem('cargas_auth_token');
    localStorage.removeItem('cargas_auth_user');

    // Limpa os campos de senha e email para não ficarem guardados no DOM
    const emailInput = document.getElementById('login-email');
    const senhaInput = document.getElementById('login-senha');
    if (emailInput) emailInput.value = '';
    if (senhaInput) senhaInput.value = '';

    aplicarUsuarioNaTela(res.user);
    abrirApp();
    toast(`Bem-vindo, ${res.user.nome}!`, 'ok');
    await recarregarTudo();
  } catch (err) {
    exibirAuthMsg(err.message, 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  }
}

async function fazerCadastro(e) {
  if (e) e.preventDefault();
  limparAuthMsg();
  const nome = document.getElementById('cadastro-nome').value.trim();
  const email = document.getElementById('cadastro-email').value.trim().toLowerCase();
  const password = document.getElementById('cadastro-senha').value;

  if (!email.endsWith('@selmi.com.br')) {
    exibirAuthMsg('Por segurança, o cadastro só é permitido para e-mails corporativos @selmi.com.br.', 'erro');
    return;
  }

  const btn = document.getElementById('btn-submit-cadastro');
  const textoOriginal = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Criando conta...</span>';
  }

  try {
    await api('/api/auth/cadastro', 'POST', { nome, email, password });
    exibirAuthMsg('Conta criada com sucesso no Supabase! Você já pode entrar.', 'sucesso');
    document.getElementById('login-email').value = email;
    document.getElementById('login-senha').value = '';
    setTimeout(() => alternarAbasAuth('login'), 1200);
  } catch (err) {
    exibirAuthMsg(err.message, 'erro');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  }
}

function fazerLogout(mensagem) {
  state.token = null;
  state.usuario = null;
  localStorage.removeItem('cargas_auth_token');
  localStorage.removeItem('cargas_auth_user');
  sessionStorage.removeItem('cargas_auth_token');
  sessionStorage.removeItem('cargas_auth_user');

  // Limpa campos na tela de login
  const emailInput = document.getElementById('login-email');
  const senhaInput = document.getElementById('login-senha');
  if (emailInput) emailInput.value = '';
  if (senhaInput) senhaInput.value = '';

  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = 'Usuário';

  fecharAppParaLogin();
  if (mensagem) {
    exibirAuthMsg(mensagem, 'erro');
  } else {
    toast('Você saiu do sistema.', 'ok');
  }
}

async function verificarSessaoInicial() {
  // Limpa resíduos antigos de localStorage que pudessem estar salvos de outros usuários
  localStorage.removeItem('cargas_auth_token');
  localStorage.removeItem('cargas_auth_user');

  // Verifica exclusivamente a sessão da aba atual (sessionStorage)
  const token = sessionStorage.getItem('cargas_auth_token');
  const userJson = sessionStorage.getItem('cargas_auth_user');

  if (!token || !userJson) {
    fecharAppParaLogin();
    return false;
  }

  try {
    state.token = token;
    state.usuario = JSON.parse(userJson);
    aplicarUsuarioNaTela(state.usuario);
    abrirApp();
    api('/api/auth/me').catch(() => {
      fazerLogout('Sessão expirada. Faça login novamente.');
    });
    return true;
  } catch (e) {
    fazerLogout();
    return false;
  }
}

// ------------------------------ Init ------------------------------

async function init() {
  // Limpa campos de login ao carregar a página para nunca exibir dados de outros usuários
  const emailInput = document.getElementById('login-email');
  const senhaInput = document.getElementById('login-senha');
  if (emailInput) emailInput.value = '';
  if (senhaInput) senhaInput.value = '';

  window.addEventListener('pageshow', () => {
    if (!state.usuario) {
      if (emailInput) emailInput.value = '';
      if (senhaInput) senhaInput.value = '';
    }
  });

  document.getElementById('campo-status').innerHTML = STATUS_LIST.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('campo-tipoVeiculo').innerHTML =
    '<option value="">Selecione...</option>' +
    TIPOS_VEICULO.map((t) => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('filtro-status').innerHTML = '<option value="">Todos os status</option>' + STATUS_LIST.map((s) => `<option value="${s}">${s}</option>`).join('');

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => ativarAba(tab.dataset.tab));
  });

  // Eventos da Tela de Login e Cadastro
  document.getElementById('tab-auth-login')?.addEventListener('click', () => alternarAbasAuth('login'));
  document.getElementById('tab-auth-cadastro')?.addEventListener('click', () => alternarAbasAuth('cadastro'));
  document.getElementById('btn-toggle-senha-login')?.addEventListener('click', () => alternarVisibilidadeSenha('login-senha'));
  document.getElementById('btn-toggle-senha-cadastro')?.addEventListener('click', () => alternarVisibilidadeSenha('cadastro-senha'));
  document.getElementById('form-login')?.addEventListener('submit', fazerLogin);
  document.getElementById('form-cadastro')?.addEventListener('submit', fazerCadastro);
  document.getElementById('btn-logout')?.addEventListener('click', () => fazerLogout());

  const logado = await verificarSessaoInicial();
  if (logado) {
    await recarregarTudo();
  }
}

document.addEventListener('DOMContentLoaded', init);
