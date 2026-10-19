#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

echo "== T1: Pre-flight =="
for f in Dockerfile nginx.conf index.html calculadora-biogas.html; do
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
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
[ "$code" = "200" ] && echo "  OK: HTTP $code" || echo "  FALHA: HTTP $code"

echo "== T7: iframes presentes =="
curl -s http://localhost:8080/ | grep -q "storymaps.arcgis.com" && echo "  OK: StoryMaps"
curl -s http://localhost:8080/ | grep -q "calculadora-biogas.html" && echo "  OK: Calculadora"

echo "== T8: Calculadora local =="
c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/calculadora-biogas.html)
[ "$c" = "200" ] && echo "  OK: HTTP $c" || echo "  FALHA: HTTP $c"

echo "== T9: Healthcheck =="
sleep 12
docker inspect biogas-panel --format '  health={{.State.Health.Status}}'

echo "== T10: Headers de segurança =="
for u in / /calculadora-biogas.html; do
  h=$(curl -sI "http://localhost:8080$u" | grep -ic 'x-content-type-options')
  [ "$h" -ge 1 ] && echo "  OK: $u tem X-Content-Type-Options" || echo "  FALHA: $u sem X-Content-Type-Options"
done

echo "== T11: StoryMaps permite embed? =="
curl -sI https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7 \
  | grep -iE 'frame-ancestors|x-frame-options' || echo "  (sem header de bloqueio)"

echo "== FIM =="
