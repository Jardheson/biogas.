#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

PORTA="${HOST_PORT:-8080}"
BASE="http://localhost:${PORTA}"

echo "== T1: Pre-flight =="
for f in Dockerfile nginx.conf index.html calculadora-biogas.html css/estilo.css js/biogas-engine.js js/app.js js/atlas-modal.js assets/ceara.png assets/rodape.png; do
  [ -f "$f" ] || { echo "  FALHA: $f ausente"; exit 1; }; echo "  OK: $f"
done

echo "== T2: Compose válido =="
docker compose config -q && echo "  OK"

echo "== T3: Build =="
docker compose build

echo "== T4: Subir container =="
docker compose up -d
sleep 3

echo "== T5: Sintaxe Nginx (no container em execução) =="
docker exec biogas-panel nginx -t 2>&1

echo "== T6: HTTP 200 na raiz =="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] && echo "  OK: HTTP $code" || echo "  FALHA: HTTP $code"

echo "== T7: index.html redireciona para a calculadora =="
curl -s "$BASE/" | grep -q "calculadora-biogas.html" && echo "  OK: redirecionamento presente" || echo "  FALHA: redirecionamento ausente"

echo "== T8: Calculadora local =="
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/calculadora-biogas.html")
[ "$c" = "200" ] && echo "  OK: HTTP $c" || echo "  FALHA: HTTP $c"
curl -s "$BASE/calculadora-biogas.html" | grep -q "storymaps.arcgis.com" && echo "  OK: link do StoryMaps" || echo "  FALHA: link do StoryMaps ausente"

echo "== T9: CSS e JS servidos =="
for u in /css/estilo.css /js/biogas-engine.js /js/app.js /js/atlas-modal.js; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$u")
  [ "$c" = "200" ] && echo "  OK: $u ($c)" || echo "  FALHA: $u ($c)"
done

echo "== T10: Imagens servidas =="
for u in /assets/ceara.png /assets/rodape.png; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$u")
  [ "$c" = "200" ] && echo "  OK: $u ($c)" || echo "  FALHA: $u ($c)"
done

echo "== T11: Healthcheck =="
sleep 12
docker inspect biogas-panel --format '  health={{.State.Health.Status}}'

echo "== T12: Headers de segurança =="
for u in / /calculadora-biogas.html /css/estilo.css; do
  h=$(curl -sI "$BASE$u" | grep -ic 'x-content-type-options')
  [ "$h" -ge 1 ] && echo "  OK: $u tem X-Content-Type-Options" || echo "  FALHA: $u sem X-Content-Type-Options"
done

echo "== T13: StoryMaps permite embed? =="
curl -sI https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7 \
  | grep -iE 'frame-ancestors|x-frame-options' || echo "  (sem header de bloqueio)"

echo "== FIM =="
