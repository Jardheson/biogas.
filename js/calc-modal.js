(function () {
  'use strict';
  var modal = document.getElementById('calc-modal');
  if (!modal) return;
  var abrir = document.getElementById('btn-calc-abrir');
  var fechar = document.getElementById('btn-calc-fechar');
  if (!abrir || !fechar) return;
  var ultimoFoco = null;
  var fundos = [document.querySelector('.envolucro'), document.querySelector('.pular')].filter(Boolean);

  function travarFundo(travar) {
    fundos.forEach(function (el) {
      if (travar) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
  }

  function focaveis() {
    return modal.querySelectorAll('button, a[href], select, input, [tabindex]:not([tabindex="-1"])');
  }
  function abrirModal() {
    ultimoFoco = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    travarFundo(true);
    fechar.focus();
  }
  function fecharModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    travarFundo(false);
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  abrir.addEventListener('click', abrirModal);
  fechar.addEventListener('click', fecharModal);
  modal.addEventListener('click', function (ev) {
    if (ev.target === modal) fecharModal();
  });
  document.addEventListener('keydown', function (ev) {
    if (modal.hidden) return;
    if (ev.key === 'Escape') { fecharModal(); return; }
    if (ev.key !== 'Tab') return;
    var itens = focaveis();
    if (!itens.length) return;
    var primeiro = itens[0];
    var ultimo = itens[itens.length - 1];
    if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
  });
})();
