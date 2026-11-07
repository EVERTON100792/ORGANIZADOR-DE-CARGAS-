window.Relatorio = {
  render(dados) {
    const datahoraEl = document.getElementById('report-datahora');
    const responsavelEl = document.getElementById('report-responsavel');
    const logoEl = document.getElementById('report-logo');
    const tbody = document.getElementById('report-corpo');

    if (datahoraEl) datahoraEl.textContent = (dados && dados.emissao && dados.emissao.dataHora) || '';
    if (responsavelEl) responsavelEl.textContent = (dados && dados.responsavel) || '';

    if (logoEl) {
      if (window.__LOGO_URL) {
        logoEl.src = window.__LOGO_URL;
        logoEl.style.display = 'block';
      } else {
        logoEl.style.display = 'none';
      }
    }

    tbody.innerHTML = '';
    (dados && dados.fila ? dados.fila : []).forEach((f) => {
      const tr = document.createElement('tr');
      const tdPos = document.createElement('td');
      tdPos.className = 'center';
      tdPos.textContent = f.posicao + 'º';
      const tdNum = document.createElement('td');
      tdNum.textContent = f.numeroRomaneio;
      const tdData = document.createElement('td');
      tdData.textContent = f.dataPedido ? String(f.dataPedido).slice(0, 10).split('-').reverse().join('/') : '–';
      const tdObs = document.createElement('td');
      tdObs.textContent = f.observacoes || '–';
      const tdStatus = document.createElement('td');
      tdStatus.textContent = f.status;

      if (f.posicao === 1) tr.className = 'report-top-1';
      else if (f.posicao === 2) tr.className = 'report-top-2';
      else if (f.posicao === 3) tr.className = 'report-top-3';

      tr.append(tdPos, tdNum, tdData, tdObs, tdStatus);
      tbody.appendChild(tr);
    });
  },
};
