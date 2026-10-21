(function () {
  'use strict';
  var modal = document.getElementById('atlas-modal');
  if (!modal) return;
  var abrir = document.getElementById('btn-atlas-abrir');
  var fechar = document.getElementById('btn-atlas-fechar');
  var frame = modal.querySelector('.atlas-modal-frame');
  var ultimoFoco = null;

  function focaveis() {
    return modal.querySelectorAll('button, iframe, a[href], [tabindex]:not([tabindex="-1"])');
  }
  function abrirModal() {
    ultimoFoco = document.activeElement;
    if (frame && !frame.getAttribute('src')) frame.setAttribute('src', frame.getAttribute('data-src'));
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    fechar.focus();
  }
  function fecharModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
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
