# Painel Biogás — Atlas do Gás Renovável + Calculadora

Aplicação web conteinerizada (Docker + Nginx) que serve uma página única com o
**[Atlas do Gás Renovável Ceará](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)**
embutido em `iframe` e a **calculadora de biogás** em um modal sobreposto.

---

## Sumário

- [Índice de arquivos](#índice-de-arquivos)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Requisitos](#requisitos)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [Comportamento HTTP](#comportamento-http)
- [Performance e compressão](#performance-e-compressão)
- [Decisões de engenharia e limitações conhecidas](#decisões-de-engenharia-e-limitações-conhecidas)
- [Troubleshooting](#troubleshooting)
- [Deploy em produção](#deploy-em-produção)
- [Checklist operacional](#checklist-operacional)
- [Links úteis](#links-úteis)

---

## Índice de arquivos

| Arquivo | Descrição | Atalho |
|---|---|---|
| [calculadora-biogas.html](calculadora-biogas.html) | Página principal: StoryMaps em `iframe`, faixa institucional e modal da calculadora (só marcação) | [abrir](calculadora-biogas.html) |
| [index.html](index.html) | Redireciona `/` para a página principal | [abrir](index.html) |
| [css/estilo.css](css/estilo.css) | Estilo, breakpoints responsivos, mídias de acessibilidade e suporte a `safe-area` | [abrir](css/estilo.css) |
| [js/biogas-engine.js](js/biogas-engine.js) | Motor de cálculo puro (v1.1.0), sem dependências | [abrir](js/biogas-engine.js) |
| [js/app.js](js/app.js) | Interface: linhas de entrada, cálculo e pintura do resultado | [abrir](js/app.js) |
| [js/calc-modal.js](js/calc-modal.js) | Modal da calculadora (abrir/fechar, foco preso, `Esc`, fundo `inert`) | [abrir](js/calc-modal.js) |
| [assets/rodape.png](assets/rodape.png) | Faixa institucional do rodapé | [abrir](assets/rodape.png) |
| [nginx.conf](nginx.conf) | Servidor (gzip, cache, headers de segurança) | [abrir](nginx.conf) |
| [Dockerfile](Dockerfile) | Build da imagem (nginx + arquivos + healthcheck) | [abrir](Dockerfile) |
| [docker-compose.yml](docker-compose.yml) | Orquestração (porta, restart, healthcheck) | [abrir](docker-compose.yml) |
| [.dockerignore](.dockerignore) | Exclusões do contexto de build | [abrir](.dockerignore) |
| [test.sh](test.sh) | Suíte de testes T1–T13 | [abrir](test.sh) |

---

## Estrutura de pastas

```
biogas/
├── calculadora-biogas.html     # página principal (marcação)
├── index.html                  # redirecionamento
├── css/
│   └── estilo.css
├── js/
│   ├── biogas-engine.js
│   ├── app.js
│   └── calc-modal.js
├── assets/
│   └── rodape.png
├── nginx.conf
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── test.sh
└── README.md
```

Convenção: **`assets/` para imagens, `css/` para estilo, `js/` para script**. O HTML na raiz fica
apenas com marcação — sem CSS nem JavaScript inline.

---

## Visão geral

| Item | Valor |
|---|---|
| Tipo | Site estático (HTML + CSS + JS, sem build de front-end) |
| Servidor | `nginx:alpine` |
| Porta interna | `80` |
| Porta no host | `8080` (configurável via [HOST_PORT](#variáveis-de-ambiente)) |
| Container | `biogas-panel` |
| Imagem | `observatorio-biogas:latest` |
| Dependências externas | [storymaps.arcgis.com](https://storymaps.arcgis.com) e Google Fonts (Poppins) |
| Motor de cálculo | v1.1.0, sem dependências, roda 100% no cliente |

Fluxo da página [calculadora-biogas.html](calculadora-biogas.html):

1. **Atlas embutido** — o [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
   é carregado em um `iframe` que ocupa a área principal da viewport.
2. **Botão `Abrir calculadora`** — abre a calculadora em um **modal** sobreposto,
   sem sair da página.
3. **Modal da calculadora** — resíduos, parâmetros do modelo e resultado mensal/anual;
   fecha com `Esc`, com o botão `Fechar` ou com clique no fundo.
4. **Faixa institucional** — `assets/rodape.png`, ancorada ao final da página.

A página usa layout de coluna flexível com `min-height:100dvh`: cabeçalho + atlas (`flex:1`) +
faixa, de modo que a viewport é preenchida sem rolagem dupla. O atlas é o único elemento
elástico — ele cresce ou encolhe conforme a tela.

> A raiz `/` serve [index.html](index.html), que é apenas um redirecionamento para
> [calculadora-biogas.html](calculadora-biogas.html).

---

## Arquitetura

```
                     ┌────────────────────────────────────────────┐
   Navegador  ──────▶│  Container: biogas-panel (nginx:alpine)    │
   :8080             │                                            │
                     │  /usr/share/nginx/html/                    │
                     │    ├── index.html            (redireciona) │
                     │    ├── calculadora-biogas.html             │
                     │    ├── css/estilo.css                      │
                     │    ├── js/{biogas-engine,app,calc-modal}   │
                     │    └── assets/rodape.png                   │
                     │                                            │
                     │  /etc/nginx/conf.d/default.conf            │
                     │    (= nginx.conf)                          │
                     └──────────────────┬─────────────────────────┘
                                        │
                    calculadora-biogas.html carrega:
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
   css/estilo.css · js/*.js · rodape.png    iframe StoryMaps (área principal,
   (local, mesma origem)                    `loading="lazy"`) — origem Esri
```

### Ordem de carregamento dos scripts

Declarados no fim do `<body>`, nesta ordem — [js/app.js](js/app.js) depende de
`window.BiogasEngine` já existir:

1. [js/biogas-engine.js](js/biogas-engine.js) — publica a API (global, CommonJS ou AMD)
2. [js/app.js](js/app.js) — lê `window.BiogasEngine` e monta a interface
3. [js/calc-modal.js](js/calc-modal.js) — controla o modal da calculadora

### O motor de cálculo

[js/biogas-engine.js](js/biogas-engine.js) é a única fonte da verdade do cálculo:

```
biogás  (Nm³/mês) = quantidade (t/mês) × fator do resíduo (Nm³/t)
metano  (Nm³/mês) = biogás × 0,60
energia (kWh/mês) = biogás × 6 kWh/Nm³
anuais             = mensais × 12
```

Fatores fixos por tipo de resíduo: **91,7** (orgânico de alimentos, EPE), **40** (vegetais/poda),
**38** (esterco bovino), **79** (dejetos suínos) e **50** (dejetos de aves) — os quatro últimos
da Embrapa.

O catálogo e as premissas são **congelados** (`Object.freeze`) e a API pública **não aceita**
`fator` nem premissa por chamada: qualquer `fator` enviado é ignorado e devolvido em `avisos`
com o código `FATOR_IGNORADO`. A única porta de configuração é `criarCalculadora({...})`,
decisão de quem integra o motor no código — não do usuário final da interface.

---

## Requisitos

- Docker Engine 20.10+ (ou [Docker Desktop](https://www.docker.com/products/docker-desktop/))
- Docker Compose v2 (comando `docker compose`, sem hífen)
- [`curl`](https://curl.se/) (usado pela suíte de testes e pelo healthcheck)
- O **navegador do usuário final** precisa alcançar:
  - [storymaps.arcgis.com](https://storymaps.arcgis.com) (conteúdo do atlas embutido)
  - `fonts.googleapis.com` / `fonts.gstatic.com` (fonte Poppins)

---

## Como executar

### Opção A — Docker Compose (recomendado)

```bash
docker compose up -d --build
```

### Opção B — Docker puro

```bash
docker build -t observatorio-biogas:latest .
docker run -d --name biogas-panel --restart unless-stopped -p 8080:80 observatorio-biogas:latest
```

### Acesso

```
http://localhost:8080/
```

### Compartilhar com outra máquina

O container publica a porta em `0.0.0.0`, então outra máquina da mesma rede já alcança:

```bash
hostname -I | awk '{print $1}'      # IP local, ex.: 192.168.0.42
sudo ufw allow 8080/tcp             # liberar a porta (se usar ufw)
```

Endereço a enviar: `http://<IP-LOCAL>:8080/`.

### Comandos úteis

```bash
docker compose logs -f          # acompanhar logs do nginx
docker compose restart          # reiniciar
docker compose down             # parar e remover
docker compose up -d --build    # reconstruir após alterar HTML/CSS/JS/imagens
```

---

## Variáveis de ambiente

Definida em [docker-compose.yml](docker-compose.yml):

| Variável | Padrão | Descrição |
|---|---|---|
| `HOST_PORT` | `8080` | Porta publicada no host (mapeada para a `80` do container) |

```bash
HOST_PORT=9000 docker compose up -d
```

A suíte [test.sh](test.sh) respeita a mesma variável.

---

## Testes

A suíte [test.sh](test.sh) cobre 13 verificações e é **não-bloqueante** (continua após uma falha,
para reportar o quadro completo).

```bash
chmod +x test.sh
./test.sh
```

| # | Teste | Valida | Resultado esperado |
|---|-------|--------|--------------------|
| T1 | Pre-flight | Existência dos 9 arquivos obrigatórios | Todos `OK` |
| T2 | Compose válido | Sintaxe do [docker-compose.yml](docker-compose.yml) | Sem erro |
| T3 | Build | Construção da imagem a partir do [Dockerfile](Dockerfile) | `Built` |
| T4 | Subir container | `docker compose up -d` | `Started` |
| T5 | Sintaxe nginx | `nginx -t` dentro do container | `syntax is ok` |
| T6 | HTTP raiz | `GET /` | `200` |
| T7 | Redirecionamento | [index.html](index.html) aponta para a calculadora | `OK` |
| T8 | Calculadora | `GET /calculadora-biogas.html` + link do StoryMaps | `200` + `OK` |
| T9 | CSS e JS | `GET` de [css/estilo.css](css/estilo.css) e dos 3 scripts | `200` (4×) |
| T10 | Imagens | `GET` de [assets/rodape.png](assets/rodape.png) | `200` |
| T11 | Healthcheck | `.State.Health.Status` | `healthy` |
| T12 | Headers de segurança | `X-Content-Type-Options` em `/`, `.html` e `.css` | `OK` (3×) |
| T13 | Embed StoryMaps | Cabeçalhos `frame-ancestors` / `X-Frame-Options` da Esri | Informativo |

### Resultado medido (última execução)

```
T1 OK (9 arquivos) · T2 OK · T3 Built · T4 Started · T5 syntax is ok
T6 200 · T7 OK · T8 200 + StoryMaps OK · T9 200 (4×) · T10 200 (1×)
T11 healthy · T12 OK (3×) · T13 frame-ancestors https: http: 'self'
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
| `/*.{css,js,png,jpg,jpeg,gif,svg,ico,woff,woff2}` | Cache de 7 dias |
| `404` | `error_page` redireciona para [index.html](index.html) |

### Headers de segurança

Presentes em **todas** as rotas (verificado em T12):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

> **Não** é enviado `X-Frame-Options` restritivo — a página não é enquadrada por ninguém e
> restringir o header poderia interferir no embed do StoryMaps dentro da página.

### Conteúdo copiado para a imagem

Verificado com `docker exec biogas-panel find /usr/share/nginx/html -type f` — a imagem contém
exatamente 7 arquivos:

```
/usr/share/nginx/html/index.html
/usr/share/nginx/html/calculadora-biogas.html
/usr/share/nginx/html/css/estilo.css
/usr/share/nginx/html/js/biogas-engine.js
/usr/share/nginx/html/js/app.js
/usr/share/nginx/html/js/calc-modal.js
/usr/share/nginx/html/assets/rodape.png
```

O [.dockerignore](.dockerignore) exclui `*.md` (logo, este README **não** entra na imagem),
`test.sh`, `docker-compose.yml`, `.git` e `.dockerignore`.

---

## Performance e compressão

Gzip ativo em [nginx.conf](nginx.conf) para `text/css`, `application/javascript`,
`text/plain`, `application/json` e `image/svg+xml`.

Transferência medida na página principal (bytes):

| Recurso | Em disco | Com gzip |
|---|---:|---:|
| [calculadora-biogas.html](calculadora-biogas.html) | 7.012 | 2.130 |
| [css/estilo.css](css/estilo.css) | 18.638 | 5.149 |
| [js/biogas-engine.js](js/biogas-engine.js) | 14.868 | 4.302 |
| [js/app.js](js/app.js) | 9.504 | 2.907 |
| [js/calc-modal.js](js/calc-modal.js) | 1.854 | 703 |
| **Total** | **51.876** | **15.191** |

O CSS e os três scripts são servidos com cache de 7 dias: na segunda visita o navegador baixa
apenas o HTML (~2,1 KB comprimidos). Em troca, a **primeira** visita transfere mais bytes do que
um HTML monolítico transferia — a separação ganha em cache e manutenção, não na carga inicial.

A `assets/rodape.png` e o `iframe` do StoryMaps ficam fora dessa conta: a faixa é estática
(imagem, já comprimida) e o atlas é conteúdo de origem externa, carregado com `loading="lazy"`.

---

## Decisões de engenharia e limitações conhecidas

### 1. O atlas é o conteúdo principal da página, embutido em `iframe`

A seção do atlas carrega o [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
diretamente em um `iframe` com `loading="lazy"`, que ocupa a área elástica do layout (`flex:1`)
e cresce ou encolhe conforme a tela.

**Limite conhecido:** por ser conteúdo de origem cruzada, não é possível controlar nem remover a
rolagem interna do StoryMaps de dentro desta página. A página em si não rola — o layout é uma
coluna flexível de `100dvh` em que apenas o `iframe` varia de altura; a faixa institucional fica
ancorada no fim.

### 2. Embed do StoryMaps é permitido

A Esri responde com dois cabeçalhos:

```
content-security-policy: ...;frame-ancestors https: http: 'self';...
x-frame-options: SAMEORIGIN
```

- `frame-ancestors https: http: 'self'` **autoriza** enquadramento de qualquer origem.
- `x-frame-options: SAMEORIGIN` bloquearia, **mas** pela especificação de
  [CSP Level 2](https://www.w3.org/TR/CSP2/#directive-frame-ancestors), quando ambos estão
  presentes o `frame-ancestors` **prevalece** e o `X-Frame-Options` é ignorado por navegadores
  modernos.

**Conclusão:** o embed funciona em navegadores modernos. Navegadores muito antigos (que só
entendem `X-Frame-Options`) bloqueiam.

### 3. `HEALTHCHECK` do Dockerfile pode ser descartado com driver `docker-container`

**Sintoma:** `docker inspect <imagem> --format '{{json .Config.Healthcheck}}'` retorna `null`
mesmo com a instrução no [Dockerfile](Dockerfile).

**Diagnóstico:** reproduzido com um Dockerfile mínimo (apenas `FROM` + `HEALTHCHECK` + `EXPOSE`).
No mesmo build, `ExposedPorts` e `Cmd` foram aplicados, mas `Healthcheck` continuou `null` — o
metadado é perdido no *export/import* do driver
[`docker-container`](https://docs.docker.com/build/builders/drivers/docker-container/) (buildx),
**não** é erro do [Dockerfile](Dockerfile).

**Mitigação aplicada:** o healthcheck também é declarado no
[docker-compose.yml](docker-compose.yml), onde é aplicado pelo **runtime** e portanto imune ao
driver de build. A instrução do [Dockerfile](Dockerfile) foi mantida para funcionar em Docker
padrão.

### 4. `add_header` do nginx não é herdado (bug corrigido)

[`add_header`](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header) só é
herdado do nível superior se o bloco atual **não** declarar nenhum `add_header`. Como o bloco de
`.html` declarava `Cache-Control`, os headers de segurança do nível `server` eram
**silenciosamente descartados** nessa rota. Corrigido replicando os headers de segurança em cada
bloco `location` do [nginx.conf](nginx.conf).

### 5. `Cache-Control` duplicado nos estáticos (corrigido)

O bloco de estáticos usava `expires 7d` **e** um `add_header Cache-Control "public, max-age=604800,
immutable"`. Como o `expires` já emite `Cache-Control: max-age=604800`, a resposta saía com **dois**
headers `Cache-Control`.

**Correção aplicada:** removido o `add_header Cache-Control` redundante. Agora a resposta traz um
único header, emitido pelo `expires`:

```
Expires: <data + 7 dias>
Cache-Control: max-age=604800
```

O `immutable` também foi descartado de propósito: os arquivos **não** têm hash no nome, e com
`immutable` o navegador manteria `css/estilo.css` e `js/*.js` antigos por até 7 dias após um
deploy, mesmo com recarga. Sem ele, a recarga revalida e pega a versão nova.

### 6. Acessibilidade

A página e o modal implementam, em código:

- **Navegação por teclado** — *skip link* `.pular` como primeiro elemento focável, apontando
  para `#conteudo` (`main` com `tabindex="-1"`).
- **Título de nível 1** — `h1` com a classe `.sr-only`: dá título semântico à página para
  leitores de tela sem alterar o desenho visual, que começa direto pela seção do atlas.
- **Modal** ([js/calc-modal.js](js/calc-modal.js)) — `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby`; o botão de abertura declara `aria-haspopup="dialog"` e `aria-controls`.
  Ao abrir, o foco vai para o botão `Fechar`; `Tab`/`Shift+Tab` ficam presos dentro do modal;
  `Esc`, o botão `Fechar` e o clique no fundo encerram; ao fechar, o foco **volta** ao elemento
  que abriu o modal.
- **Fundo inerte** — com o modal aberto, `.envolucro` e `.pular` recebem `inert` **e**
  `aria-hidden="true"`, de modo que o conteúdo de trás sai da árvore de acessibilidade e da
  ordem de tabulação.
- **Resultado anunciado** — `<p role="status" aria-live="polite">` recebe, a cada recálculo, uma
  frase com os totais em toneladas, Nm³ e MWh. A barra visual `.fita` é `aria-hidden="true"`
  porque a mesma informação está na legenda textual.
- **Foco visível** — `:focus-visible` com contorno de 2 px (`outline-offset:2px`) em links,
  botões, `select`, `input`, `summary` e `[tabindex]`.
- **Alvos de toque ≥ 44×44 px** (WCAG 2.5.5) — `a`, `button`, `summary`, `select` e `input`
  têm `min-height:44px`. O botão `.remover` é visualmente 36×36, mas tem a área de toque
  ampliada para 44×44 por um `::after` com `inset:-4px`.
- **Preferências do sistema** — `@media (prefers-contrast:more)` escurece os cinzas, engrossa
  as bordas para 2 px e clareia as superfícies; `@media (forced-colors:active)` usa
  `CanvasText`/`ButtonText`/`Canvas`; `@media (prefers-reduced-motion:reduce)` desliga
  transições, animações e a rolagem suave.
- **Sem armadilha de zoom** — o `<meta viewport>` não fixa `maximum-scale`, e em telas ≤ 640 px
  os campos passam a `font-size:16px`, o que evita o zoom automático do iOS Safari ao focar.

### 7. Responsividade

O layout é uma coluna flexível de `min-height:100dvh` em que apenas o `iframe` do atlas é
elástico (`flex:1`). As margens laterais saem de uma variável única, `--gutter`, cujo padrão é
`clamp(12px,1.5vw,40px)` e que é reduzida conforme a largura:

| Faixa de largura | `--gutter` |
|---|---|
| Base (fluido) | `clamp(12px,1.5vw,40px)` |
| 768–1024 px (tablet) | `24px` |
| ≤ 640 px | `18px` |
| ≤ 420 px | `14px` |
| ≤ 360 px | `12px` |

Cada valor é combinado com `max(..., env(safe-area-inset-left/right))`, então a margem nunca fica
menor que a área segura de aparelhos com entalhe. O mesmo vale para o topo e a base do
`.envolucro` e para o `padding` do modal.

Breakpoints, em [css/estilo.css](css/estilo.css):

- `940px` — grade do modal passa de 2 colunas para 1; o painel de resultado deixa de ser *sticky*.
- `920px` — cabeçalho do atlas empilha; botão ocupa a largura toda; modal em tela cheia
  (`border-radius:0`) usando as *safe areas*.
- `760px` — blocos de notas em coluna única.
- `640px` — *gutter* 18 px, campos com 16 px (anti-zoom), fundo sem `background-attachment:fixed`.
- `520px` — par `tipo`/`quantidade` de cada linha passa a uma coluna.
- `420px` — cards anuais em coluna única; botões em pilha, largura total.
- `360px` — *gutter* 12 px; grade de parâmetros em 2 colunas fixas.
- `max-height:540px` — celular deitado: esconde o texto de apoio do topo, limita a faixa
  institucional a 56 px de altura e comprime o corpo do modal, preservando a área útil do atlas.
- `1600 / 1920 / 2400px` — TVs: `body` em 16,5 px a partir de 1600 px e 19 px a partir de
  2400 px; micro-rótulos ampliados em 1920 px (12,5 px) e 2400 px (13,5 px).

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `docker build` falha com `nginx.conf: no such file` | [nginx.conf](nginx.conf) ausente | Recriar o arquivo e rebuildar |
| Porta 8080 já em uso | Outro processo/container | `HOST_PORT=9000 docker compose up -d` |
| Página sem estilo ou sem cálculo | `css/estilo.css` ou `js/*.js` não copiados | `docker compose up -d --build` e conferir T9 |
| Faixa institucional quebrada | `assets/` fora da imagem | Conferir T10 |
| Atlas em branco | Story tornado privado na Esri | Verificar o compartilhamento do [story](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7) |
| `iframe` "This page won't open in a frame" | Cabeçalhos de bloqueio mudaram na Esri | Rodar [T13](#testes) e reavaliar |
| Modal da calculadora não abre | [js/calc-modal.js](js/calc-modal.js) não carregou ou o botão saiu do DOM | Conferir o Console do navegador e o T9 |
| Fontes diferentes | `fonts.googleapis.com` inacessível | Sem impacto funcional (fallback para `sans-serif`) |
| Container `unhealthy` | nginx não responde internamente | `docker compose logs biogas-panel` |
| Outro computador não acessa pelo IP local | Firewall do host ou redes diferentes | Liberar porta (`ufw allow 8080/tcp`) |
| CSS/JS antigos após deploy | Cache de 7 dias no navegador | Recarregar com `Ctrl+F5`, ou revisar a [política de cache](#5-cache-control-duplicado-nos-estáticos-corrigido) |

---

## Deploy em produção

```bash
# 1. Clonar/atualizar o código
cd /caminho/para/biogas

# 2. Build e subida
docker compose up -d --build

# 3. Validar
./test.sh
curl -sI http://localhost:8080/ | head -1
```

### Requisitos de infraestrutura

- A porta publicada deve estar acessível aos usuários finais.
- O **navegador do usuário** precisa alcançar
  [storymaps.arcgis.com](https://storymaps.arcgis.com) (para exibir o atlas embutido) e
  `fonts.googleapis.com` / `fonts.gstatic.com` (fonte Poppins).
- HTTPS é recomendado na borda (proxy reverso / balanceador). O container fala **HTTP na 80**;
  termine o TLS no proxy.

### Política de reinício

`restart: unless-stopped` (em [docker-compose.yml](docker-compose.yml)) — o container volta
automaticamente após reboot ou falha, exceto se parado manualmente.

---

## Checklist operacional

### Antes do deploy

- [ ] `docker compose config -q` sem erros
- [ ] `docker compose build` concluído
- [ ] `./test.sh` com **T1–T12** verdes
- [ ] [T13](#testes) indicando `frame-ancestors` permissivo (embed liberado)
- [ ] Porta de publicação definida ([HOST_PORT](#variáveis-de-ambiente))

### Após o deploy

- [ ] `docker ps` mostra `biogas-panel` como `Up (healthy)`
- [ ] `/` retorna `200` e redireciona
- [ ] `GET /calculadora-biogas.html` retorna `200`
- [ ] Atlas embutido carrega e a faixa institucional aparece no fim da página
- [ ] Modal da calculadora abre, calcula, fecha com `Esc` e devolve o foco ao botão
- [ ] Layout conferido em celular (retrato e paisagem), tablet, desktop e TV
- [ ] Headers de segurança presentes em `/`, `.html` e `.css`

### Manutenção

- [ ] Rebuild após alterar HTML, [css/estilo.css](css/estilo.css), [js/](js) ou [assets/](assets)
- [ ] Rever [T13](#testes) periodicamente (cabeçalhos do StoryMaps são controlados pela Esri)
- [ ] Atualizar a imagem base `nginx:alpine` periodicamente

---

## Links úteis

### Recursos do projeto

- [StoryMaps — Atlas do Gás Renovável Ceará](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)
- [Página principal](calculadora-biogas.html)
- [Suíte de testes](test.sh)
- [Repositório no GitHub](https://github.com/Jardheson/biogas) (`origin`)

### Documentação externa

- [Docker Compose — referência](https://docs.docker.com/compose/compose-file/)
- [Dockerfile — referência](https://docs.docker.com/reference/dockerfile/)
- [Nginx — ngx_http_headers_module (`add_header`)](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Nginx — gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
- [MDN — X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)
- [MDN — CSP: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)
- [CSP Level 2 — frame-ancestors (W3C)](https://www.w3.org/TR/CSP2/#directive-frame-ancestors)
- [ArcGIS StoryMaps — como incorporar em um site](https://services.slip.wa.gov.au/public/help/en/12.1/arcgis-storymaps/share-and-collaborate/embed.html)
