(function () {
  'use strict';

  var motor = window.BiogasEngine;
  var fmt = motor.utils.formatarNumero;
  var TIPOS = motor.listarTipos();
  var CORES = ['#2F7D4F', '#5FA36C', '#2F5BD8', '#DA8412', '#7A8880'];

  var estado = { linhas: [] };
  var seq = 0;

  var elLinhas = document.getElementById('linhas');
  var elComp = document.getElementById('comp');
  var elFita = document.getElementById('fita');

  function corDoTipo(id) {
    for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i].id === id) return CORES[i % CORES.length];
    return CORES[CORES.length - 1];
  }

  function novaLinha(tipo, quantidade) {
    return {
      chave: 'l' + (++seq),
      tipo: tipo || TIPOS[0].id,
      quantidade: quantidade == null ? '' : String(quantidade)
    };
  }

  /* ---------- render das linhas ---------- */
  function renderLinhas() {
    elLinhas.innerHTML = '';
    estado.linhas.forEach(function (linha) {
      var div = document.createElement('div');
      div.className = 'linha';
      div.dataset.chave = linha.chave;

      var opcoes = TIPOS.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === linha.tipo ? ' selected' : '') + '>' + t.rotulo + '</option>';
      }).join('');

      div.innerHTML =
        '<div class="linha-campos">' +
          '<div class="campo"><label for="tipo-' + linha.chave + '">Tipo de resíduo</label>' +
            '<select id="tipo-' + linha.chave + '" data-campo="tipo">' + opcoes + '</select></div>' +
          '<div class="campo"><label for="qtd-' + linha.chave + '">Quantidade (t/mês)</label>' +
            '<input id="qtd-' + linha.chave + '" type="number" min="0" step="any" inputmode="decimal" placeholder="0" ' +
            'data-campo="quantidade" value="' + linha.quantidade + '"></div>' +
        '</div>' +
        '<button type="button" class="remover" data-acao="remover" aria-label="Remover esta linha de resíduo">&times;</button>' +
        '<div class="saida-linha" data-saida></div>';

      elLinhas.appendChild(div);
    });
  }

  /* ---------- cálculo + pintura ---------- */
  function recalcular() {
    var entradas = estado.linhas.map(function (linha) {
      return {
        id: linha.chave,
        tipo: linha.tipo,
        quantidade: linha.quantidade === '' ? 0 : linha.quantidade
      };
    });

    // Sem opções: fator e premissas vêm travados do motor.
    var r = motor.calcular(entradas);
    var preenchido = r.totais.biogasNm3Mes > 0;

    /* saída por linha */
    r.itens.forEach(function (item) {
      var div = elLinhas.querySelector('[data-chave="' + item.id + '"]');
      if (!div) return;
      var saida = div.querySelector('[data-saida]');

      if (!item.valido) {
        saida.innerHTML = '<span class="erro">' + item.erros[0].mensagem + '</span>';
        return;
      }
      saida.innerHTML =
        '<span class="tag fator">fator <b>' + fmt(item.fator, item.fator % 1 ? 1 : 0) + '</b> ' + item.unidadeFator + '</span>' +
        '<span class="tag">biogás <b>' + fmt(item.biogasNm3Mes, 0) + '</b> Nm³/mês</span>' +
        '<span class="tag">CH₄ <b>' + fmt(item.metanoNm3Mes, 0) + '</b> Nm³</span>' +
        '<span class="tag">energia <b>' + fmt(item.energiaMwhMes, 2) + '</b> MWh</span>' +
        '<span class="medida" aria-hidden="true"><i style="width:' + (item.participacaoBiogas * 100).toFixed(1) +
          '%;background:' + corDoTipo(item.tipo) + '"></i></span>';
    });

    /* coluna de conversão */
    var t = r.totais;
    no('no-residuo', 't-residuo', preenchido ? fmt(t.quantidade, 1) : '—', 't/mês', preenchido);
    no('no-biogas', 't-biogas', preenchido ? fmt(t.biogasNm3Mes, 0) : '—', 'Nm³/mês', preenchido);
    no('no-metano', 't-metano', preenchido ? fmt(t.metanoNm3Mes, 0) : '—', 'Nm³/mês', preenchido);
    no('no-energia', 't-energia', preenchido ? fmt(t.energiaKwhMes, 0) : '—', 'kWh/mês', preenchido);

    document.getElementById('e-ch4').textContent = fmt(r.premissas.fracaoMetano, 2);
    document.getElementById('e-kwh').textContent = fmt(r.premissas.energiaPorNm3Biogas, 0);
    document.getElementById('e-fator').textContent = preenchido
      ? 'fator médio ' + fmt(t.biogasNm3Mes / t.quantidade, 1) + ' Nm³/t'
      : 'fator médio —';

    /* cards */
    card('c-biogas-ano', preenchido ? fmt(t.biogasNm3Ano, 0) : '—', 'Nm³');
    card('c-metano-ano', preenchido ? fmt(t.metanoNm3Ano, 0) : '—', 'Nm³');
    card('c-mwh-mes', preenchido ? fmt(t.energiaMwhMes, 2) : '—', 'MWh');
    card('c-mwh-ano', preenchido ? fmt(t.energiaMwhAno, 1) : '—', 'MWh');

    var contribuintes = r.itens.filter(function (i) { return i.valido && i.biogasNm3Mes > 0; })
      .sort(function (a, b) { return b.biogasNm3Mes - a.biogasNm3Mes; });

    document.getElementById('sel-status').textContent =
      preenchido ? contribuintes.length + (contribuintes.length > 1 ? ' resíduos' : ' resíduo') : '—';

    /* anúncio para leitores de tela */
    document.getElementById('anuncio').textContent = preenchido
      ? 'Resultado atualizado para ' + fmt(t.quantidade, 1) + ' toneladas por mês: ' +
        fmt(t.biogasNm3Mes, 0) + ' normal metros cúbicos de biogás, ' +
        fmt(t.metanoNm3Mes, 0) + ' normal metros cúbicos de metano e ' +
        fmt(t.energiaMwhMes, 2) + ' megawatt-hora por mês.'
      : 'Nenhuma quantidade informada. Informe os resíduos para ver o resultado.';

    /* composição */
    if (!contribuintes.length) {
      elFita.innerHTML = '';
      elComp.innerHTML = '<p class="vazio">Informe ao menos uma quantidade para ver a composição.</p>';
    } else {
      elFita.innerHTML = contribuintes.map(function (i) {
        return '<i style="width:' + (i.participacaoBiogas * 100).toFixed(2) + '%;background:' +
               corDoTipo(i.tipo) + '"></i>';
      }).join('');
      elComp.innerHTML = contribuintes.map(function (i) {
        return '<div class="leg"><u style="background:' + corDoTipo(i.tipo) + '"></u>' +
               '<span>' + i.rotulo + '</span><b>' + fmt(i.participacaoBiogas * 100, 1) + '%</b></div>';
      }).join('');
    }
  }

  function no(idNo, idValor, valor, unidade, ativo) {
    document.getElementById(idValor).innerHTML = valor + '<small>' + unidade + '</small>';
    document.getElementById(idNo).classList.toggle('ativo', !!ativo);
  }
  function card(id, valor, unidade) {
    document.getElementById(id).innerHTML = valor + '<span>' + unidade + '</span>';
  }

  /* ---------- eventos ---------- */
  elLinhas.addEventListener('input', function (ev) {
    var campo = ev.target.dataset.campo;
    if (!campo) return;
    var chave = ev.target.closest('.linha').dataset.chave;
    var linha = estado.linhas.filter(function (l) { return l.chave === chave; })[0];
    if (!linha) return;
    linha[campo] = ev.target.value;
    recalcular();
  });

  elLinhas.addEventListener('change', function (ev) {
    if (ev.target.dataset.campo !== 'tipo') return;
    var chave = ev.target.closest('.linha').dataset.chave;
    var linha = estado.linhas.filter(function (l) { return l.chave === chave; })[0];
    linha.tipo = ev.target.value;
    recalcular();
  });

  elLinhas.addEventListener('click', function (ev) {
    if (ev.target.dataset.acao !== 'remover') return;
    var chave = ev.target.closest('.linha').dataset.chave;
    estado.linhas = estado.linhas.filter(function (l) { return l.chave !== chave; });
    if (!estado.linhas.length) estado.linhas.push(novaLinha());
    renderLinhas();
    recalcular();
    document.getElementById('btn-add').focus();
  });

  document.getElementById('btn-add').addEventListener('click', function () {
    var usados = estado.linhas.map(function (l) { return l.tipo; });
    var livre = TIPOS.filter(function (t) { return usados.indexOf(t.id) === -1; })[0];
    estado.linhas.push(novaLinha(livre ? livre.id : TIPOS[0].id));
    renderLinhas();
    recalcular();
  });

  document.getElementById('btn-exemplo').addEventListener('click', function () {
    estado.linhas = TIPOS.map(function (t) { return novaLinha(t.id, 10); });
    renderLinhas();
    recalcular();
  });

  document.getElementById('btn-limpar').addEventListener('click', function () {
    estado.linhas.forEach(function (l) { l.quantidade = ''; });
    renderLinhas();
    recalcular();
  });

  /* ---------- parâmetros do modelo (somente leitura) ---------- */
  (function () {
    var pr = motor.PREMISSAS_PADRAO;
    var fixos = [
      { rot: 'Fração de CH₄', val: fmt(pr.fracaoMetano, 2), un: 'do biogás' },
      { rot: 'Energia do biogás', val: fmt(pr.energiaPorNm3Biogas, 0), un: 'kWh/Nm³' },
      { rot: 'Meses por ano', val: fmt(pr.mesesPorAno, 0), un: 'meses' },
      { rot: 'Fatores de resíduo', val: String(TIPOS.length), un: 'travados' }
    ];
    document.getElementById('painel-fixos').innerHTML = fixos.map(function (f) {
      return '<div class="fixo"><dt>' + f.rot + '</dt><dd>' + f.val + '<span>' + f.un + '</span></dd></div>';
    }).join('');
  })();

  /* ---------- rodapé de fatores ---------- */
  document.getElementById('lista-fatores').innerHTML = TIPOS.map(function (t) {
    return '<li><span>' + t.rotulo + '<i>' + t.fonte + '</i></span><b>' +
           String(t.fator).replace('.', ',') + ' ' + t.unidadeFator + '</b></li>';
  }).join('');

  /* ---------- início ---------- */
  estado.linhas.push(novaLinha(TIPOS[0].id));
  renderLinhas();
  recalcular();
  document.getElementById('anuncio').textContent = '';
})();
