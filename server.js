const express = require('express');
const path = require('path');
const os = require('os');

// Carrega variáveis do arquivo .env (Node 20.12+)
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (e) {
  /* .env opcional */
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERRO: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const REST = SUPABASE_URL + '/rest/v1';
const STATUS_LIST = ['Montada', 'Aguardando Expedição', 'Liberada', 'Despachada'];

// ---------------------------------------------------------------- Cliente Supabase

async function sb(caminho, opcoes = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(opcoes.headers || {}),
  };
  const res = await fetch(REST + caminho, {
    method: opcoes.method || 'GET',
    headers,
    body: opcoes.body,
  });
  const texto = await res.text();
  let dados = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }
  }
  if (!res.ok) {
    const msg = dados && dados.message ? dados.message : 'Erro ao acessar o banco de dados.';
    const erro = new Error(msg);
    erro.status = res.status;
    throw erro;
  }
  return dados;
}

// ---------------------------------------------------------------- Utilidades

function agora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function hoje() {
  return agora().slice(0, 10);
}

function dataHoraExibicao() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function compararNumero(a, b) {
  const va = String(a);
  const vb = String(b);
  const an = /^\d+$/.test(va);
  const bn = /^\d+$/.test(vb);
  if (an && bn) return Number(va) - Number(vb);
  return va.localeCompare(vb, 'pt-BR');
}

function ordenarCargas(lista) {
  return lista.slice().sort((a, b) => {
    const da = a.dataPedido || '';
    const dbv = b.dataPedido || '';
    if (da !== dbv) return da < dbv ? -1 : 1;
    const cmp = compararNumero(a.numeroRomaneio, b.numeroRomaneio);
    if (cmp !== 0) return cmp;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
}

async function filaAtiva() {
  const ativas = await sb('/cargas?select=*&status=neq.Despachada');
  return ordenarCargas(ativas).map((c, i) => ({ ...c, posicao: i + 1 }));
}

async function obterCarga(id) {
  const lista = await sb('/cargas?select=*&id=eq.' + Number(id));
  return lista[0] || null;
}

function normalizarStatus(valor) {
  const status = (valor || '').toString().trim();
  if (!STATUS_LIST.includes(status)) return { valido: false, erro: 'Selecione um status válido.' };
  return { valido: true, valor: status };
}

function validarRomaneio(valor) {
  const v = (valor || '').toString().trim();
  if (!v) return { valido: false, erro: 'O número do romaneio é obrigatório.' };
  if (v.length > 20) return { valido: false, erro: 'O número do romaneio deve ter no máximo 20 caracteres.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9\/\-\s]*$/.test(v)) {
    return { valido: false, erro: 'O número do romaneio deve conter apenas números, letras, barras e hífens.' };
  }
  return { valido: true, valor: v };
}

function validarDataPedido(valor) {
  const v = (valor || '').toString().trim();
  if (!v) return { valido: false, erro: 'A data do pedido é obrigatória.' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return { valido: false, erro: 'A data do pedido deve estar no formato AAAA-MM-DD.' };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return { valido: false, erro: 'A data do pedido é inválida.' };
  }
  return { valido: true, valor: v };
}

async function registrarHistorico(cargaId, tipo, campo, valorAntigo, valorNovo, observacao) {
  await sb('/historico', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      cargaId,
      tipo,
      campo: campo || null,
      valorAntigo: valorAntigo == null ? null : String(valorAntigo),
      valorNovo: valorNovo == null ? null : String(valorNovo),
      dataHora: agora(),
      observacao: observacao || '',
    }),
  });
}

async function obterConfig(chave) {
  const lista = await sb('/config?select=valor&chave=eq.' + encodeURIComponent(chave));
  return lista.length ? lista[0].valor : null;
}

async function salvarConfig(chave, valor) {
  await sb('/config?on_conflict=chave', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ chave, valor }),
  });
}

const rota = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[API]', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor. Verifique a conexão com o banco de dados.' });
  });
};

// ---------------------------------------------------------------- Rotas

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/fila', rota(async (req, res) => {
  res.json(await filaAtiva());
}));

app.get('/api/relatorio', rota(async (req, res) => {
  const fila = await filaAtiva();
  const responsavel = (await obterConfig('responsavel')) || 'Equipe de Expedição';
  res.json({
    fila,
    responsavel,
    emissao: {
      dataHora: dataHoraExibicao(),
      geradoEm: agora(),
    },
  });
}));

app.get('/api/despachados', rota(async (req, res) => {
  const despachados = await sb('/cargas?select=*&status=eq.Despachada&order=dataDespacho.desc,id.desc');
  const resultado = [];
  for (const c of despachados) {
    const historico = await sb('/historico?select=*&cargaId=eq.' + c.id + '&order=id.desc');
    resultado.push({
      ...c,
      historico: historico.map((h) => ({ ...h, carga: { id: c.id, numeroRomaneio: c.numeroRomaneio } })),
    });
  }
  res.json(resultado);
}));

app.get('/api/cargas', rota(async (req, res) => {
  const numero = (req.query.numero || '').toString().trim();
  const dataInicio = (req.query.dataInicio || '').toString().trim();
  const dataFim = (req.query.dataFim || '').toString().trim();
  const status = (req.query.status || '').toString().trim();

  const qs = ['select=*'];
  if (numero) qs.push('numeroRomaneio=ilike.*' + encodeURIComponent(numero) + '*');
  if (dataInicio) qs.push('dataPedido=gte.' + encodeURIComponent(dataInicio));
  if (dataFim) qs.push('dataPedido=lte.' + encodeURIComponent(dataFim));
  if (status) qs.push('status=eq.' + encodeURIComponent(status));

  if (req.query.periodo) {
    const [ano, mes] = req.query.periodo.toString().split('-').map(Number);
    if (ano && mes) {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
      qs.push('dataPedido=gte.' + inicio);
      qs.push('dataPedido=lte.' + fim);
    }
  }

  const lista = await sb('/cargas?' + qs.join('&'));
  res.json(ordenarCargas(lista));
}));

app.post('/api/cargas', rota(async (req, res) => {
  const body = req.body || {};
  const numero = validarRomaneio(body.numeroRomaneio);
  if (!numero.valido) return res.status(400).json({ erro: numero.erro });

  const data = validarDataPedido(body.dataPedido);
  if (!data.valido) return res.status(400).json({ erro: data.erro });

  const status = normalizarStatus(body.status);
  if (!status.valido) return res.status(400).json({ erro: status.erro });

  const existente = await sb('/cargas?select=id&numeroRomaneio=ilike.' + encodeURIComponent(numero.valor));
  if (existente.length) {
    return res.status(409).json({ erro: `Já existe uma carga com o número de romaneio ${numero.valor}.` });
  }

  const agoraStr = agora();
  const inseridos = await sb('/cargas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      numeroRomaneio: numero.valor,
      dataPedido: data.valor,
      status: status.valor,
      observacoes: (body.observacoes || '').toString().trim(),
      dataDespacho: null,
      criadoEm: agoraStr,
      atualizadoEm: agoraStr,
    }),
  });

  const carga = inseridos[0];
  await registrarHistorico(carga.id, 'criacao', 'status', null, status.valor, 'Carga cadastrada no sistema');
  res.status(201).json(carga);
}));

app.put('/api/cargas/:id', rota(async (req, res) => {
  const id = Number(req.params.id);
  const carga = await obterCarga(id);
  if (!carga) return res.status(404).json({ erro: 'Carga não encontrada.' });

  const body = req.body || {};
  const updates = {};
  const eventos = [];

  if (body.numeroRomaneio !== undefined) {
    const numero = validarRomaneio(body.numeroRomaneio);
    if (!numero.valido) return res.status(400).json({ erro: numero.erro });
    const outro = await sb(
      '/cargas?select=id&numeroRomaneio=ilike.' + encodeURIComponent(numero.valor) + '&id=neq.' + id
    );
    if (outro.length) return res.status(409).json({ erro: `Já existe uma carga com o número de romaneio ${numero.valor}.` });
    if (String(numero.valor).trim() !== String(carga.numeroRomaneio).trim()) {
      eventos.push(['numeroRomaneio', carga.numeroRomaneio, numero.valor, 'Número de romaneio alterado']);
    }
    updates.numeroRomaneio = numero.valor;
  }

  if (body.dataPedido !== undefined) {
    const data = validarDataPedido(body.dataPedido);
    if (!data.valido) return res.status(400).json({ erro: data.erro });
    if (data.valor !== String(carga.dataPedido).slice(0, 10)) {
      eventos.push(['dataPedido', String(carga.dataPedido).slice(0, 10), data.valor, 'Data do pedido alterada']);
    }
    updates.dataPedido = data.valor;
  }

  if (body.status !== undefined) {
    const status = normalizarStatus(body.status);
    if (!status.valido) return res.status(400).json({ erro: status.erro });
    if (status.valor !== String(carga.status)) {
      eventos.push(['status', carga.status, status.valor, status.valor === 'Despachada' ? 'Carga despachada' : 'Status alterado']);
      updates.dataDespacho = status.valor === 'Despachada' ? hoje() : null;
    }
    updates.status = status.valor;
  }

  if (body.observacoes !== undefined) {
    const obs = String(body.observacoes).trim();
    if (obs !== String(carga.observacoes || '')) {
      eventos.push(['observacoes', String(carga.observacoes || ''), obs, 'Observações alteradas']);
    }
    updates.observacoes = obs;
  }

  let atualizada = carga;
  if (Object.keys(updates).length > 0) {
    updates.atualizadoEm = agora();
    const arr = await sb('/cargas?id=eq.' + id, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    atualizada = arr[0];
    for (const ev of eventos) {
      await registrarHistorico(id, ev[0] === 'status' ? 'status' : 'atualizacao', ev[0], ev[1], ev[2], ev[3]);
    }
  }

  res.json(atualizada);
}));

app.patch('/api/cargas/:id/status', rota(async (req, res) => {
  const id = Number(req.params.id);
  const carga = await obterCarga(id);
  if (!carga) return res.status(404).json({ erro: 'Carga não encontrada.' });
  const status = normalizarStatus(req.body.status);
  if (!status.valido) return res.status(400).json({ erro: status.erro });

  if (status.valor !== String(carga.status)) {
    const atualizacoes = { status: status.valor, atualizadoEm: agora() };
    if (status.valor === 'Despachada') atualizacoes.dataDespacho = hoje();
    else if (String(carga.status) === 'Despachada') atualizacoes.dataDespacho = null;
    await sb('/cargas?id=eq.' + id, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(atualizacoes),
    });
    await registrarHistorico(id, 'status', 'status', carga.status, status.valor, status.valor === 'Despachada' ? 'Carga despachada' : 'Status alterado');
  }
  res.json(await obterCarga(id));
}));

app.delete('/api/cargas/:id', rota(async (req, res) => {
  const id = Number(req.params.id);
  const carga = await obterCarga(id);
  if (!carga) return res.status(404).json({ erro: 'Carga não encontrada.' });
  await sb('/historico?cargaId=eq.' + id, { method: 'DELETE' });
  await sb('/cargas?id=eq.' + id, { method: 'DELETE' });
  res.json({ ok: true });
}));

app.get('/api/cargas/:id/historico', rota(async (req, res) => {
  const id = Number(req.params.id);
  const carga = await obterCarga(id);
  if (!carga) return res.status(404).json({ erro: 'Carga não encontrada.' });
  const lista = await sb('/historico?select=*&cargaId=eq.' + id + '&order=id.desc');
  res.json({ carga, historico: lista });
}));

app.get('/api/historico', rota(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const lista = await sb(
    '/historico?select=*,carga:cargas(numeroRomaneio,dataPedido,status)&order=id.desc&limit=' + limit
  );
  res.json(
    lista.map((h) => ({
      ...h,
      numeroRomaneio: h.carga ? h.carga.numeroRomaneio : null,
      dataPedido: h.carga ? h.carga.dataPedido : null,
      status: h.carga ? h.carga.status : null,
      carga: undefined,
    }))
  );
}));

app.get('/api/estatisticas', rota(async (req, res) => {
  const [todas, ativas, despachadas, liberadas] = await Promise.all([
    sb('/cargas?select=id'),
    sb('/cargas?select=id&status=neq.Despachada'),
    sb('/cargas?select=id&status=eq.Despachada'),
    sb('/cargas?select=id&status=eq.Liberada'),
  ]);
  res.json({
    total: todas.length,
    ativas: ativas.length,
    despachadas: despachadas.length,
    liberadas: liberadas.length,
  });
}));

app.get('/api/config', rota(async (req, res) => {
  const responsavel = (await obterConfig('responsavel')) || 'Equipe de Expedição';
  res.json({ responsavel });
}));

app.put('/api/config', rota(async (req, res) => {
  const valor = String((req.body || {}).valor || '').trim();
  await salvarConfig('responsavel', valor);
  res.json({ responsavel: valor });
}));

app.get('/api/logo', rota(async (req, res) => {
  res.json({ url: (await obterConfig('logo')) || null });
}));

app.post('/api/logo', rota(async (req, res) => {
  const dados = String((req.body || {}).dados || '');
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/.exec(dados);
  if (!match) return res.status(400).json({ erro: 'Imagem de logo inválida.' });
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    return res.status(400).json({ erro: 'Logo deve ter no máximo 2MB.' });
  }
  await salvarConfig('logo', dados);
  res.json({ url: dados });
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

function ipsLocais() {
  const saida = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((nome) => {
    (nets[nome] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) saida.push(net.address);
    });
  });
  return saida;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor de Organização de Cargas rodando em http://localhost:${PORT}`);
    ipsLocais().forEach((ip) => console.log(`Acesso na rede local: http://${ip}:${PORT}`));
    console.log(`Banco de dados: Supabase (${SUPABASE_URL})`);
  });
}

module.exports = app;
