function normalizarNomeVeiculoRelatorio(valor) {
  if (typeof window.normalizarNomeVeiculo === 'function') {
    return window.normalizarNomeVeiculo(valor);
  }
  const v = (valor || '').toString().trim();
  if (!v) return '';
  const up = v.toUpperCase();
  if (up === 'FIORINO' || up === 'FIORIONO') return 'FIORINO';
  if (up === 'VAN') return 'VAN';
  if (up === 'VAN-SP' || up === 'VAN SP' || up === 'VANSP') return 'VAN-SP';
  if (up === '3/4' || up === '3/4 VEICULO' || up === 'TRES QUARTOS' || up === 'TRÊS QUARTOS') return '3/4';
  if (up === '3/4-SP' || up === '3/4 SP' || up === 'TRES QUARTOS SP' || up === 'TRÊS QUARTOS SP') return '3/4-SP';
  if (up === 'TOCO') return 'TOCO';
  if (up === 'TOCO-SP' || up === 'TOCO SP' || up === 'TOCOSP') return 'TOCO-SP';
  return v;
}

window.Relatorio = {
  render(dados) {
    const tituloEl = document.getElementById('report-titulo');
    const datahoraEl = document.getElementById('report-datahora');
    const totalEl = document.getElementById('report-total-cargas');
    const resumoEl = document.getElementById('report-resumo-veiculos');
    const tbody = document.getElementById('report-corpo');

    const fila = (dados && dados.fila) ? dados.fila : [];
    const total = fila.length;

    if (tituloEl) tituloEl.textContent = (dados && dados.titulo) || 'RELATÓRIO DE PRIORIZAÇÃO DE CARGAS';
    if (datahoraEl) datahoraEl.textContent = (dados && dados.emissao && dados.emissao.dataHora) || '';
    if (totalEl) totalEl.textContent = `${total} ${total === 1 ? 'carga' : 'cargas'}`;

    // Contagem detalhada por tipo de veículo
    const ORDEM_VEICULOS = ['FIORINO', 'VAN', 'VAN-SP', '3/4', '3/4-SP', 'TOCO', 'TOCO-SP'];
    const contagem = {};
    let semTipo = 0;

    fila.forEach((f) => {
      const v = normalizarNomeVeiculoRelatorio(f.tipoVeiculo);
      if (v) {
        contagem[v] = (contagem[v] || 0) + 1;
      } else {
        semTipo++;
      }
    });

    if (resumoEl) {
      resumoEl.innerHTML = '';
      const bloco = document.createElement('div');
      bloco.className = 'resumo-container';

      const tituloResumo = document.createElement('div');
      tituloResumo.className = 'resumo-titulo';
      tituloResumo.textContent = `RESUMO POR TIPO DE VEÍCULO (${total} ${total === 1 ? 'CARGA' : 'CARGAS'} NO TOTAL):`;
      bloco.appendChild(tituloResumo);

      const lista = document.createElement('div');
      lista.className = 'resumo-itens';

      // 1. Tipos padrão que possuem cargas
      ORDEM_VEICULOS.forEach((tipo) => {
        const qtd = contagem[tipo] || 0;
        if (qtd > 0) {
          const item = document.createElement('div');
          item.className = 'resumo-pill';
          item.innerHTML = `<span class="rp-tipo">${tipo}:</span> <strong class="rp-qtd">${qtd}</strong>`;
          lista.appendChild(item);
        }
      });

      // 2. Outros tipos que possam existir
      Object.keys(contagem).forEach((tipo) => {
        if (!ORDEM_VEICULOS.includes(tipo) && contagem[tipo] > 0) {
          const item = document.createElement('div');
          item.className = 'resumo-pill';
          item.innerHTML = `<span class="rp-tipo">${tipo}:</span> <strong class="rp-qtd">${contagem[tipo]}</strong>`;
          lista.appendChild(item);
        }
      });

      if (semTipo > 0) {
        const item = document.createElement('div');
        item.className = 'resumo-pill resumo-pill-vazio';
        item.innerHTML = `<span class="rp-tipo">Não especificado:</span> <strong class="rp-qtd">${semTipo}</strong>`;
        lista.appendChild(item);
      }

      bloco.appendChild(lista);
      resumoEl.appendChild(bloco);
    }

    tbody.innerHTML = '';
    fila.forEach((f) => {
      const tr = document.createElement('tr');
      const tdPos = document.createElement('td');
      tdPos.className = 'center';
      tdPos.textContent = f.posicao + 'º';
      const tdNum = document.createElement('td');
      tdNum.textContent = f.numeroRomaneio;
      const tdVeiculo = document.createElement('td');
      tdVeiculo.textContent = normalizarNomeVeiculoRelatorio(f.tipoVeiculo) || '–';
      const tdData = document.createElement('td');
      tdData.textContent = f.dataPedido ? String(f.dataPedido).slice(0, 10).split('-').reverse().join('/') : '–';
      const tdObs = document.createElement('td');
      tdObs.textContent = f.observacoes || '–';
      const tdStatus = document.createElement('td');
      tdStatus.textContent = f.status;

      if (f.posicao === 1) tr.className = 'report-top-1';
      else if (f.posicao === 2) tr.className = 'report-top-2';
      else if (f.posicao === 3) tr.className = 'report-top-3';

      tr.append(tdPos, tdNum, tdVeiculo, tdData, tdObs, tdStatus);
      tbody.appendChild(tr);
    });
  },
};
