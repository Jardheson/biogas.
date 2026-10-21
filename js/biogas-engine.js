/*!
 * biogas-engine.js — Motor de cálculo da calculadora simples de biogás
 * Escopo: resíduos sólidos/orgânicos (estimativa preliminar de triagem)
 *
 * Baseado em Calculadora_Biogas.xlsx (abas "Calculadora", "Fatores", "Estrutura").
 * Cadeia de conversão implementada:
 *   biogás  (Nm³/mês) = quantidade (t/mês) × fator do resíduo (Nm³/t)
 *   metano  (Nm³/mês) = biogás × fração de CH₄ (0,60)
 *   energia (kWh/mês) = biogás × 6 kWh/Nm³
 *   energia (MWh/mês) = energia (kWh/mês) ÷ 1000
 *   valores anuais    = valores mensais × 12
 *
 * FATORES BLOQUEADOS
 * ------------------
 * O catálogo de fatores e as premissas de conversão são constantes do modelo.
 * A API pública NÃO aceita fator nem premissa vindos da chamada: qualquer campo
 * `fator` na entrada é ignorado e reportado em `avisos` (código FATOR_IGNORADO).
 * Catálogo e premissas são congelados (Object.freeze), então também não podem ser
 * alterados por referência em tempo de execução.
 *
 * A única forma de operar com outro conjunto é `criarCalculadora({...})`, decisão de
 * quem integra o motor no código — nunca do usuário final da interface.
 *
 * Sem dependências. Funciona como ESM, CommonJS ou global (window.BiogasEngine).
 * Versão 1.1.0
 */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  } else if (typeof define === 'function' && define.amd) {
    define(function () { return api; });
  } else {
    raiz.BiogasEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSAO = '1.1.0';

  /* ------------------------------------------------------------------ *
   * 1. Premissas fixas do modelo                                        *
   * ------------------------------------------------------------------ */

  var PREMISSAS_PADRAO = {
    fracaoMetano: 0.60,          // fração volumétrica de CH₄ no biogás
    energiaPorNm3Biogas: 6,      // kWh por Nm³ de biogás
    mesesPorAno: 12,
    precisao: 6                  // casas decimais internas (evita ruído de ponto flutuante)
  };

  /* ------------------------------------------------------------------ *
   * 2. Catálogo de fatores fixos (aba "Fatores")                        *
   * ------------------------------------------------------------------ */

  var CATALOGO_FATORES = [
    {
      id: 'organico_alimentos',
      rotulo: 'Resíduo orgânico de alimentos',
      unidadeEntrada: 't/mês',
      fator: 91.7,
      unidadeFator: 'Nm³/t',
      fonte: 'EPE',
      observacao: 'Usar quando a empresa informa massa de resíduo orgânico separado. ' +
                  'Estimativa preliminar baseada na fração orgânica.'
    },
    {
      id: 'vegetal_poda',
      rotulo: 'Resíduos vegetais / poda',
      unidadeEntrada: 't/mês',
      fator: 40,
      unidadeFator: 'Nm³/t',
      fonte: 'Embrapa',
      observacao: 'Usar para poda, folhas, restos vegetais e biomassa vegetal em triagem inicial.'
    },
    {
      id: 'esterco_bovino',
      rotulo: 'Esterco bovino fresco',
      unidadeEntrada: 't/mês',
      fator: 38,
      unidadeFator: 'Nm³/t',
      fonte: 'Embrapa',
      observacao: 'Usar para massa mensal de esterco/dejeto bovino fresco.'
    },
    {
      id: 'dejeto_suino',
      rotulo: 'Dejetos suínos frescos',
      unidadeEntrada: 't/mês',
      fator: 79,
      unidadeFator: 'Nm³/t',
      fonte: 'Embrapa',
      observacao: 'Usar para massa mensal de dejetos suínos.'
    },
    {
      id: 'dejeto_aves',
      rotulo: 'Dejetos/esterco de aves',
      unidadeEntrada: 't/mês',
      fator: 50,
      unidadeFator: 'Nm³/t',
      fonte: 'Embrapa',
      observacao: 'Usar para massa mensal de dejetos/esterco de aves em estimativa preliminar.'
    }
  ];

  /* ------------------------------------------------------------------ *
   * 3. Utilitários internos                                             *
   * ------------------------------------------------------------------ */

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /** Congela em profundidade: o catálogo publicado não pode ser alterado em runtime. */
  function congelar(valor) {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
      Object.getOwnPropertyNames(valor).forEach(function (chave) {
        congelar(valor[chave]);
      });
      Object.freeze(valor);
    }
    return valor;
  }

  function ehNumeroFinito(valor) {
    return typeof valor === 'number' && isFinite(valor);
  }

  /** Aceita 1234.56, "1234.56", "1.234,56" e "1234,56". */
  function paraNumero(valor) {
    if (ehNumeroFinito(valor)) return valor;
    if (typeof valor !== 'string') return NaN;
    var texto = valor.trim();
    if (texto === '') return NaN;
    if (texto.indexOf(',') > -1) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    }
    var n = Number(texto);
    return isFinite(n) ? n : NaN;
  }

  function arredondar(valor, casas) {
    if (!ehNumeroFinito(valor)) return 0;
    var f = Math.pow(10, casas);
    return Math.round((valor + Number.EPSILON) * f) / f;
  }

  /** Remove acentos e caixa, para casar rótulos digitados de forma livre. */
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function mesclarPremissas(premissas) {
    var base = {};
    Object.keys(PREMISSAS_PADRAO).forEach(function (chave) {
      base[chave] = PREMISSAS_PADRAO[chave];
    });
    if (premissas) {
      Object.keys(PREMISSAS_PADRAO).forEach(function (chave) {
        var n = paraNumero(premissas[chave]);
        if (ehNumeroFinito(n) && n >= 0) base[chave] = n;
      });
    }
    return base;
  }

  /** Busca por id ou por rótulo (tolerante a acento e caixa). */
  function obterTipoEm(catalogo, referencia) {
    var alvo = normalizar(referencia);
    if (!alvo) return null;
    for (var i = 0; i < catalogo.length; i++) {
      if (normalizar(catalogo[i].id) === alvo || normalizar(catalogo[i].rotulo) === alvo) {
        return catalogo[i];
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 4. Cálculo de um item                                               *
   * ------------------------------------------------------------------ *
   * `contexto` é montado apenas por criarCalculadora() — nunca pela chamada.
   */

  function calcularItem(entrada, contexto) {
    var premissas = contexto.premissas;
    var catalogo = contexto.catalogo;
    var dados = entrada || {};
    var erros = [];
    var avisos = [];

    var tipo = obterTipoEm(catalogo, dados.tipo);

    /* --- fator: travado no catálogo --- */
    var fatorInformado = paraNumero(dados.fator);
    var tentouSobrescrever = dados.fator != null && dados.fator !== '';
    var fatorPersonalizado = false;
    var fator = tipo ? tipo.fator : NaN;

    if (tentouSobrescrever) {
      if (contexto.permitirFatorPersonalizado && ehNumeroFinito(fatorInformado) && fatorInformado >= 0) {
        fatorPersonalizado = true;
        fator = fatorInformado;
      } else {
        avisos.push({
          campo: 'fator',
          codigo: 'FATOR_IGNORADO',
          mensagem: 'O fator é fixo pelo modelo e não pode ser alterado. Foi usado o valor do catálogo.'
        });
      }
    }

    if (!tipo) {
      erros.push({
        campo: 'tipo',
        codigo: 'TIPO_DESCONHECIDO',
        mensagem: 'Tipo de resíduo não encontrado no catálogo de fatores fixos.'
      });
    }

    var quantidade = paraNumero(dados.quantidade);
    if (!ehNumeroFinito(quantidade)) {
      erros.push({
        campo: 'quantidade',
        codigo: 'QUANTIDADE_INVALIDA',
        mensagem: 'Informe a quantidade mensal em toneladas.'
      });
      quantidade = 0;
    } else if (quantidade < 0) {
      erros.push({
        campo: 'quantidade',
        codigo: 'QUANTIDADE_NEGATIVA',
        mensagem: 'A quantidade não pode ser negativa.'
      });
      quantidade = 0;
    }

    var valido = erros.length === 0;
    var p = premissas.precisao;

    var biogasMes = valido ? arredondar(quantidade * fator, p) : 0;
    var metanoMes = arredondar(biogasMes * premissas.fracaoMetano, p);
    var energiaKwhMes = arredondar(biogasMes * premissas.energiaPorNm3Biogas, p);
    var energiaMwhMes = arredondar(energiaKwhMes / 1000, p);
    var m = premissas.mesesPorAno;

    return {
      id: dados.id != null ? dados.id : (tipo ? tipo.id : 'desconhecido'),
      tipo: tipo ? tipo.id : (dados.tipo != null ? String(dados.tipo) : null),
      rotulo: tipo ? tipo.rotulo : (dados.tipo != null ? String(dados.tipo) : 'Resíduo não identificado'),
      fonte: tipo ? tipo.fonte : null,
      observacao: tipo ? tipo.observacao : null,

      quantidade: quantidade,
      unidadeEntrada: tipo ? tipo.unidadeEntrada : 't/mês',
      fator: ehNumeroFinito(fator) ? fator : 0,
      unidadeFator: tipo ? tipo.unidadeFator : 'Nm³/t',
      fatorPersonalizado: fatorPersonalizado,

      biogasNm3Mes: biogasMes,
      biogasNm3Ano: arredondar(biogasMes * m, p),
      metanoNm3Mes: metanoMes,
      metanoNm3Ano: arredondar(metanoMes * m, p),
      energiaKwhMes: energiaKwhMes,
      energiaKwhAno: arredondar(energiaKwhMes * m, p),
      energiaMwhMes: energiaMwhMes,
      energiaMwhAno: arredondar(energiaMwhMes * m, p),

      participacaoBiogas: 0, // preenchido no cálculo do conjunto
      valido: valido,
      erros: erros,
      avisos: avisos
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Cálculo do conjunto                                              *
   * ------------------------------------------------------------------ */

  function calcularConjunto(entradas, contexto) {
    var premissas = contexto.premissas;
    var lista = Array.isArray(entradas) ? entradas : (entradas ? [entradas] : []);
    var p = premissas.precisao;

    var itens = lista.map(function (entrada, indice) {
      var item = calcularItem(entrada, contexto);
      item.indice = indice;
      return item;
    });

    var totais = {
      quantidade: 0,
      biogasNm3Mes: 0, biogasNm3Ano: 0,
      metanoNm3Mes: 0, metanoNm3Ano: 0,
      energiaKwhMes: 0, energiaKwhAno: 0,
      energiaMwhMes: 0, energiaMwhAno: 0
    };

    itens.forEach(function (item) {
      if (!item.valido) return;
      Object.keys(totais).forEach(function (chave) {
        totais[chave] += item[chave];
      });
    });

    Object.keys(totais).forEach(function (chave) {
      totais[chave] = arredondar(totais[chave], p);
    });

    itens.forEach(function (item) {
      item.participacaoBiogas = totais.biogasNm3Mes > 0
        ? arredondar(item.biogasNm3Mes / totais.biogasNm3Mes, p)
        : 0;
    });

    var erros = [];
    var avisos = [];
    itens.forEach(function (item) {
      item.erros.forEach(function (erro) {
        erros.push({ indice: item.indice, id: item.id, campo: erro.campo, codigo: erro.codigo, mensagem: erro.mensagem });
      });
      item.avisos.forEach(function (aviso) {
        avisos.push({ indice: item.indice, id: item.id, campo: aviso.campo, codigo: aviso.codigo, mensagem: aviso.mensagem });
      });
    });

    return {
      versao: VERSAO,
      premissas: clonar(premissas),
      fatoresBloqueados: !contexto.permitirFatorPersonalizado,
      itens: itens,
      totais: totais,
      valido: erros.length === 0,
      erros: erros,
      avisos: avisos
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. Instância (única porta de configuração)                          *
   * ------------------------------------------------------------------ *
   * Config é decisão de integração, avaliada uma vez na construção.
   * Os métodos da instância não aceitam opções — o usuário final não tem
   * como injetar fator nem premissa por chamada.
   *
   *   var calc = BiogasEngine.criarCalculadora({
   *     catalogo: fatoresDoBanco,               // opcional
   *     premissas: { fracaoMetano: 0.55 },      // opcional
   *     permitirFatorPersonalizado: true        // opcional, padrão false
   *   });
   */

  function criarCalculadora(config) {
    config = config || {};

    var catalogo = congelar(
      Array.isArray(config.catalogo) && config.catalogo.length
        ? clonar(config.catalogo)
        : clonar(CATALOGO_FATORES)
    );
    var premissas = congelar(mesclarPremissas(config.premissas));
    var permitir = config.permitirFatorPersonalizado === true;

    var contexto = congelar({
      catalogo: catalogo,
      premissas: premissas,
      permitirFatorPersonalizado: permitir
    });

    return {
      versao: VERSAO,
      fatoresBloqueados: !permitir,
      premissas: clonar(premissas),
      listarTipos: function () { return clonar(catalogo); },
      obterTipo: function (referencia) {
        var tipo = obterTipoEm(catalogo, referencia);
        return tipo ? clonar(tipo) : null;
      },
      calcularItem: function (entrada) { return calcularItem(entrada, contexto); },
      calcular: function (entradas) { return calcularConjunto(entradas, contexto); }
    };
  }

  /* ------------------------------------------------------------------ *
   * 7. Formatação (opcional — a UI pode usar a sua própria)             *
   * ------------------------------------------------------------------ */

  function formatarNumero(valor, casas, local) {
    if (!ehNumeroFinito(valor)) return '—';
    casas = casas == null ? 0 : casas;
    try {
      return new Intl.NumberFormat(local || 'pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
      }).format(valor);
    } catch (e) {
      return valor.toFixed(casas);
    }
  }

  /* ------------------------------------------------------------------ *
   * 8. API pública — instância padrão, com fatores travados             *
   * ------------------------------------------------------------------ */

  congelar(PREMISSAS_PADRAO);
  congelar(CATALOGO_FATORES);

  var padrao = criarCalculadora();

  return {
    VERSAO: VERSAO,
    PREMISSAS_PADRAO: PREMISSAS_PADRAO,
    CATALOGO_FATORES: CATALOGO_FATORES,
    fatoresBloqueados: true,

    // Não aceitam opções: fator e premissa não entram por chamada.
    listarTipos: padrao.listarTipos,
    obterTipo: padrao.obterTipo,
    calcularItem: padrao.calcularItem,
    calcular: padrao.calcular,

    criarCalculadora: criarCalculadora,
    utils: {
      paraNumero: paraNumero,
      arredondar: arredondar,
      normalizar: normalizar,
      formatarNumero: formatarNumero
    }
  };
});
