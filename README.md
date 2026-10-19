# Painel Biogás — Atlas do Gás Renovável + Calculadora

Aplicação web conteinerizada (Docker + Nginx) que serve uma única página com dois conteúdos
empilhados verticalmente:

1. **[Atlas do Gás Renovável Ceará](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)** — ArcGIS StoryMaps (conteúdo externo, via `<iframe>`).
2. **[Calculadora de Biogás](calculadora-biogas.html)** — página estática local.

---

## Sumário

- [Índice de arquivos](#índice-de-arquivos)
- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Requisitos](#requisitos)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [Comportamento HTTP](#comportamento-http)
- [Decisões de engenharia e limitações conhecidas](#decisões-de-engenharia-e-limitações-conhecidas)
- [Troubleshooting](#troubleshooting)
- [Deploy em produção](#deploy-em-produção)
- [Checklist operacional](#checklist-operacional)
- [Links úteis](#links-úteis)

---

## Índice de arquivos

Acesso rápido a todos os arquivos do projeto:

| Arquivo | Descrição | Atalho |
|---|---|---|
| [index.html](index.html) | Página-moldura com os dois `iframe`s | [abrir](index.html) |
| [calculadora-biogas.html](calculadora-biogas.html) | Calculadora de biogás (HTML + CSS + JS inline) | [abrir](calculadora-biogas.html) |
| [nginx.conf](nginx.conf) | Configuração do servidor (gzip, cache, headers, segurança) | [abrir](nginx.conf) |
| [Dockerfile](Dockerfile) | Build da imagem (nginx + arquivos + healthcheck) | [abrir](Dockerfile) |
| [docker-compose.yml](docker-compose.yml) | Orquestração (porta, restart, healthcheck) | [abrir](docker-compose.yml) |
| [.dockerignore](.dockerignore) | Exclusões do contexto de build | [abrir](.dockerignore) |
| [test.sh](test.sh) | Suíte de testes T1–T11 | [abrir](test.sh) |
| [README.md](README.md) | Esta documentação | [abrir](README.md) |

---

## Visão geral

| Item | Valor |
|---|---|
| Tipo | Site estático (HTML puro) |
| Servidor | `nginx:alpine` |
| Porta interna | `80` |
| Porta no host | `8080` (configurável via [HOST_PORT](#variáveis-de-ambiente)) |
| Container | `biogas-panel` |
| Imagem | `observatorio-biogas:latest` |
| Dependências externas | [storymaps.arcgis.com](https://storymaps.arcgis.com) |
| Build com rede | Sim (baixa a imagem `nginx:alpine` e a fonte Poppins no cliente) |

A página [index.html](index.html) é apenas uma moldura: ela não processa dados — apenas exibe,
empilhados, o [story map da Esri](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
e a [calculadora local](calculadora-biogas.html).

---

## Arquitetura

```
                     ┌──────────────────────────────────────────┐
   Navegador  ──────▶│  Container: biogas-panel (nginx:alpine)   │
   :8080             │                                            │
                     │  /usr/share/nginx/html/                    │
                     │    ├── index.html          (moldura)       │
                     │    └── calculadora-biogas.html             │
                     │                                            │
                     │  /etc/nginx/conf.d/default.conf            │
                     │    (= nginx.conf)                          │
                     └──────────────────┬─────────────────────────┘
                                        │
                     index.html contém 2 iframes:
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
   https://storymaps.arcgis.com/stories/...      calculadora-biogas.html
   (origem externa — Esri)                       (mesma origem — local)
```

### Layout da página

Definido no `<style>` de [index.html](index.html):

- Cabeçalho verde (`#004515`) **sticky** no topo, sempre visível.
- `iframe` 1: [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7), largura 100%, altura `100vh`.
- `iframe` 2: [Calculadora](calculadora-biogas.html), largura 100%, altura `100vh`, com divisória inferior (`border-bottom`).
- Empilhamento vertical via `flex-direction: column` — a rolagem da página alterna entre as duas áreas.

---

## Estrutura de arquivos

| Arquivo | Papel | Versionado |
|---|---|---|
| [index.html](index.html) | Página-moldura com os dois `iframe`s | Sim |
| [calculadora-biogas.html](calculadora-biogas.html) | Calculadora de biogás (estática) | Sim |
| [Dockerfile](Dockerfile) | Build da imagem (nginx + arquivos + healthcheck) | Sim |
| [nginx.conf](nginx.conf) | Configuração do servidor (gzip, cache, headers) | Sim |
| [docker-compose.yml](docker-compose.yml) | Orquestração (porta, restart, healthcheck) | Sim |
| [.dockerignore](.dockerignore) | Exclusões do contexto de build | Sim |
| [test.sh](test.sh) | Suíte de testes T1–T11 | Sim |

> O [.dockerignore](.dockerignore) exclui `*.md`, então esta documentação **não** é copiada para a
> imagem. A imagem final contém apenas [index.html](index.html) e
> [calculadora-biogas.html](calculadora-biogas.html) — verificado.

---

## Requisitos

- Docker Engine 20.10+ (ou [Docker Desktop](https://www.docker.com/products/docker-desktop/))
- Docker Compose v2 (comando `docker compose`, sem hífen)
- [`curl`](https://curl.se/) (usado pela suíte de testes e pelo healthcheck)
- Acesso de rede a [storymaps.arcgis.com](https://storymaps.arcgis.com) (no navegador do usuário
  final) e a `fonts.googleapis.com` / `fonts.gstatic.com` (fonte Poppins usada pela
  [calculadora](calculadora-biogas.html))

---

## Como executar

### Opção A — Docker Compose (recomendado)

Configuração em [docker-compose.yml](docker-compose.yml):

```bash
docker compose up -d --build
```

### Opção B — Docker puro

Build a partir do [Dockerfile](Dockerfile):

```bash
docker build -t observatorio-biogas:latest .
docker run -d --name biogas-panel --restart unless-stopped -p 8080:80 observatorio-biogas:latest
```

### Acesso

```
http://localhost:8080/
```

### Compartilhar com outra máquina

O container publica a porta em `0.0.0.0` (todas as interfaces), então outra máquina da mesma rede
já alcança. Descubra o IP e libere o firewall:

```bash
hostname -I | awk '{print $1}'      # IP local, ex.: 192.168.0.42
sudo ufw allow 8080/tcp             # liberar a porta (se usar ufw)
```

Endereço a enviar: `http://<IP-LOCAL>:8080/`.
Para acesso fora da rede local, use um túnel HTTPS temporário:

```bash
docker run --rm -it --network host cloudflare/cloudflared:latest tunnel --url http://localhost:8080
```

### Comandos úteis

```bash
docker compose logs -f          # acompanhar logs do nginx
docker compose restart          # reiniciar
docker compose down             # parar e remover
docker compose up -d --build    # reconstruir após alterar HTML/CSS
```

---

## Variáveis de ambiente

Definida em [docker-compose.yml](docker-compose.yml):

| Variável | Padrão | Descrição |
|---|---|---|
| `HOST_PORT` | `8080` | Porta publicada no host (mapeada para a `80` do container) |

Exemplo de uso em outra porta:

```bash
HOST_PORT=9000 docker compose up -d
```

---

## Testes

A suíte [test.sh](test.sh) cobre 11 verificações e é **não-bloqueante** (continua após uma falha,
para reportar o quadro completo).

```bash
chmod +x test.sh
./test.sh
```

| # | Teste | Valida | Resultado esperado |
|---|-------|--------|--------------------|
| T1 | Pre-flight | Existência dos 4 arquivos obrigatórios | Todos `OK` |
| T2 | Compose válido | Sintaxe do [docker-compose.yml](docker-compose.yml) | Sem erro |
| T3 | Build | Construção da imagem a partir do [Dockerfile](Dockerfile) | `Built` |
| T4 | Subir container | `docker compose up -d` | `Started` |
| T5 | Sintaxe nginx | `nginx -t` dentro do container | `syntax is ok` |
| T6 | HTTP raiz | `GET /` | `200` |
| T7 | Iframes | Presença dos 2 `iframe` em [index.html](index.html) | `OK` (2×) |
| T8 | Calculadora | `GET /calculadora-biogas.html` | `200` |
| T9 | Healthcheck | `.State.Health.Status` | `healthy` |
| T10 | Headers de segurança | `X-Content-Type-Options` em `/` e no `.html` | `OK` (2×) |
| T11 | Embed StoryMaps | Cabeçalhos `frame-ancestors` / `X-Frame-Options` da Esri | Informativo |

### Resultado medido (última execução)

```
T1 OK · T2 OK · T3 OK · T4 Started · T5 syntax is ok · T6 200
T7 OK · T8 200 · T9 healthy · T10 OK · T11 frame-ancestors https: http: 'self'
```

### Medição de performance

```bash
for i in 1 2 3; do
  curl -s -o /dev/null \
    -w "total=%{time_total}s  ttfb=%{time_starttransfer}s  size=%{size_download}B\n" \
    http://localhost:8080/
done
```

---

## Comportamento HTTP

Definido em [nginx.conf](nginx.conf).

### Rotas

| Rota | Tratamento |
|---|---|
| `/` | Serve [index.html](index.html) (`try_files /index.html =404`) |
| `/*.html` | Sem cache (`no-cache, must-revalidate`) |
| `/*.{css,js,png,jpg,jpeg,gif,svg,ico,woff,woff2}` | Cache de 7 dias (`immutable`) |
| `404` | `error_page` redireciona para [index.html](index.html) |

### Compressão

Gzip ativo em [nginx.conf](nginx.conf) para `text/plain`, `text/css`, `application/javascript`,
`application/json`, `image/svg+xml`.
Ganho medido em [calculadora-biogas.html](calculadora-biogas.html): **40.889 → 11.504 bytes (−72%)**.

### Headers de segurança

Presentes em **todas** as rotas:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

> **Não** é enviado `X-Frame-Options` restritivo — a própria página é a moldura (top-level), e
> restringi-lo impediria o embed do [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
> caso o navegador aplicasse `frame-ancestors 'self'` a subframes. Esta é uma decisão consciente,
> não uma omissão.

---

## Decisões de engenharia e limitações conhecidas

### 1. Layout empilhado com `height: 100vh` (não `scrollHeight`)

Ajustar a altura do `iframe` via JavaScript (`contentWindow.document.body.scrollHeight`) **não
funciona** para o [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7):
é conteúdo de **origem cruzada** e o acesso ao DOM é bloqueado pela política de same-origin. Por isso
cada `iframe` recebe `100vh` e rola internamente — solução previsível e que também evita o clássico
colapso de `iframe` com `height: 0`. Ver [index.html](index.html).

### 2. Embed do StoryMaps é permitido

A Esri responde com dois cabeçalhos:

```
content-security-policy: ...;frame-ancestors https: http: 'self';...
x-frame-options: SAMEORIGIN
```

- `frame-ancestors https: http: 'self'` **autoriza** enquadramento de qualquer origem.
- `x-frame-options: SAMEORIGIN` bloquearia, **mas** pela especificação de
  [CSP Level 2](https://www.w3.org/TR/CSP2/#directive-frame-ancestors), quando ambos estão presentes
  o `frame-ancestors` **prevalece** e o `X-Frame-Options` é ignorado por navegadores modernos
  (Chrome, Firefox, Safari, Edge).

**Conclusão:** o embed funciona em navegadores modernos. Navegadores muito antigos (que só entendem
`X-Frame-Options`) bloqueiam — cenário irrelevante para produção.

### 3. `HEALTHCHECK` do Dockerfile é descartado em ambientes com driver `docker-container`

**Sintoma:** `docker inspect <imagem> --format '{{json .Config.Healthcheck}}'` retorna `null`
mesmo com a instrução no [Dockerfile](Dockerfile).

**Diagnóstico:** reproduzido com um Dockerfile mínimo (apenas `FROM` + `HEALTHCHECK` + `EXPOSE`).
No mesmo build, `ExposedPorts` e `Cmd` foram aplicados, mas `Healthcheck` continuou `null` — ou seja,
o metadado é perdido no *export/import* do driver
[`docker-container`](https://docs.docker.com/build/builders/drivers/docker-container/) (buildx),
**não** é erro do [Dockerfile](Dockerfile).

**Mitigação aplicada:** o healthcheck também é declarado no
[docker-compose.yml](docker-compose.yml), onde é aplicado pelo **runtime** e portanto imune ao driver
de build. A instrução do [Dockerfile](Dockerfile) foi mantida para funcionar em Docker padrão.

### 4. `add_header` do nginx não é herdado (bug corrigido)

[`add_header`](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header) só é herdado
do nível superior se o bloco atual **não** declarar nenhum `add_header`. Como `location ~* \.html$`
declarava `Cache-Control`, os headers de segurança do nível `server` eram **silenciosamente
descartados** nessa rota. Corrigido replicando os headers de segurança em cada bloco `location` do
[nginx.conf](nginx.conf).

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `docker build` falha com `nginx.conf: no such file` | [nginx.conf](nginx.conf) ausente | Recriar o arquivo e rebuildar |
| Porta 8080 já em uso | Outro processo/container | `HOST_PORT=9000 docker compose up -d` |
| Página em branco no `iframe` do StoryMaps | Story tornado privado na Esri | Verificar o compartilhamento do [story](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7) |
| `iframe` "This page won't open in a frame" | Cabeçalhos de bloqueio mudaram na Esri | Rodar [T11](#testes) e reavaliar |
| Fontes diferentes na calculadora | `fonts.googleapis.com` inacessível | Sem impacto funcional (fallback para `sans-serif`) |
| `can't fork: Resource temporarily unavailable` em `docker run` | Limite de processos do ambiente | Validar via `docker exec biogas-panel nginx -t` |
| Container `unhealthy` | nginx não responde internamente | `docker compose logs biogas-panel` |
| Outro computador não acessa pelo IP local | Firewall do host ou redes diferentes | Liberar porta (`ufw allow 8080/tcp`) ou usar túnel |

---

## Deploy em produção

```bash
# 1. Clonar/atualizar o código
cd /caminho/para/biogas

# 2. Build e subida (usa docker-compose.yml + Dockerfile)
docker compose up -d --build

# 3. Validar (roda test.sh)
./test.sh
curl -sI http://localhost:8080/ | head -1
```

### Requisitos de infraestrutura

- A porta publicada deve estar acessível aos usuários finais.
- O **navegador do usuário** precisa alcançar:
  - [storymaps.arcgis.com](https://storymaps.arcgis.com) (conteúdo do `iframe`)
  - `fonts.googleapis.com` / `fonts.gstatic.com` (fonte Poppins da
    [calculadora](calculadora-biogas.html))
- HTTPS é recomendado na borda (proxy reverso / balanceador). O container fala **HTTP na 80** por
  padrão (ver [nginx.conf](nginx.conf)); termine o TLS no proxy.

### Política de reinício

`restart: unless-stopped` (em [docker-compose.yml](docker-compose.yml)) — o container volta
automaticamente após reboot ou falha, exceto se parado manualmente.

---

## Checklist operacional

### Antes do deploy

- [ ] `docker compose config -q` sem erros ([docker-compose.yml](docker-compose.yml))
- [ ] `docker compose build` concluído ([Dockerfile](Dockerfile))
- [ ] `./test.sh` ([test.sh](test.sh)) com **T1–T10** verdes
- [ ] [T11](#testes) indicando `frame-ancestors` permissivo (embed liberado)
- [ ] Porta de publicação definida ([HOST_PORT](#variáveis-de-ambiente))

### Após o deploy

- [ ] `docker ps` mostra `biogas-panel` como `Up (healthy)`
- [ ] `GET /` retorna `200`
- [ ] `GET /calculadora-biogas.html` retorna `200`
- [ ] Página exibe [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
      **e** [Calculadora](calculadora-biogas.html), empilhados
- [ ] Headers de segurança presentes nas duas rotas

### Manutenção

- [ ] Rebuild após alterar [index.html](index.html), [calculadora-biogas.html](calculadora-biogas.html),
      [nginx.conf](nginx.conf) ou [Dockerfile](Dockerfile)
- [ ] Rever [T11](#testes) periodicamente (cabeçalhos do StoryMaps são controlados pela Esri)
- [ ] Atualizar a imagem base `nginx:alpine` periodicamente

---

## Links úteis

### Recursos do projeto

- [StoryMaps — Atlas do Gás Renovável Ceará](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
- [Calculadora de Biogás](calculadora-biogas.html)
- [Página principal (index.html)](index.html)
- [Suíte de testes](test.sh)

### Documentação externa

- [Docker Compose — referência](https://docs.docker.com/compose/compose-file/)
- [Dockerfile — referência](https://docs.docker.com/reference/dockerfile/)
- [Nginx — ngx_http_headers_module (`add_header`)](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Nginx — gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
- [MDN — X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)
- [MDN — CSP: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)
- [CSP Level 2 — frame-ancestors (W3C)](https://www.w3.org/TR/CSP2/#directive-frame-ancestors)
- [ArcGIS StoryMaps — como incorporar em um site](https://services.slip.wa.gov.au/public/help/en/12.1/arcgis-storymaps/share-and-collaborate/embed.html)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
