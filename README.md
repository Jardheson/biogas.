# Painel Biogás — Atlas do Gás Renovável + Calculadora

Aplicação web conteinerizada (Docker + Nginx) que serve uma página única com o
**[Atlas do Gás Renovável Ceará](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7)**
e a **calculadora de biogás**, no mesmo fluxo de rolagem.

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
| [calculadora-biogas.html](calculadora-biogas.html) | Página principal: capa do atlas + calculadora (só marcação) | [abrir](calculadora-biogas.html) |
| [index.html](index.html) | Redireciona `/` para a página principal | [abrir](index.html) |
| [css/estilo.css](css/estilo.css) | Todo o estilo, incluindo os breakpoints responsivos | [abrir](css/estilo.css) |
| [js/biogas-engine.js](js/biogas-engine.js) | Motor de cálculo puro (v1.1.0), sem dependências | [abrir](js/biogas-engine.js) |
| [js/app.js](js/app.js) | Interface: linhas de entrada, cálculo e pintura do resultado | [abrir](js/app.js) |
| [js/atlas-modal.js](js/atlas-modal.js) | Modal do atlas (abrir/fechar, foco preso, `Esc`) | [abrir](js/atlas-modal.js) |
| [assets/ceara.png](assets/ceara.png) | Capa fixa do atlas | [abrir](assets/ceara.png) |
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
│   └── atlas-modal.js
├── assets/
│   ├── ceara.png
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

1. **Capa do atlas** — `assets/ceara.png` fixa na seção, sem rolagem própria.
2. **Botão `Abrir atlas`** — abre o [StoryMaps](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7) em um modal sobreposto.
3. **Link `Ver atlas completo`** — abre o StoryMaps em nova aba.
4. **Calculadora** — resíduos, parâmetros do modelo e resultado mensal/anual.
5. **Rodapé** — fatores aplicados, como ler o resultado, limites de uso e faixa institucional.

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
                     │    ├── js/{biogas-engine,app,atlas-modal}  │
                     │    └── assets/{ceara,rodape}.png           │
                     │                                            │
                     │  /etc/nginx/conf.d/default.conf            │
                     │    (= nginx.conf)                          │
                     └──────────────────┬─────────────────────────┘
                                        │
                    calculadora-biogas.html carrega:
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
   assets/ceara.png (local, capa fixa)      iframe StoryMaps (só no modal)
   css/estilo.css · js/*.js (local)         origem externa — Esri
```

### Ordem de carregamento dos scripts

Declarados no fim do `<body>`, nesta ordem — [js/app.js](js/app.js) depende de
`window.BiogasEngine` já existir:

1. [js/biogas-engine.js](js/biogas-engine.js) — publica a API (global, CommonJS ou AMD)
2. [js/app.js](js/app.js) — lê `window.BiogasEngine` e monta a interface
3. [js/atlas-modal.js](js/atlas-modal.js) — controla o modal do atlas

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
  - [storymaps.arcgis.com](https://storymaps.arcgis.com) (conteúdo do modal do atlas)
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
| T1 | Pre-flight | Existência dos 10 arquivos obrigatórios | Todos `OK` |
| T2 | Compose válido | Sintaxe do [docker-compose.yml](docker-compose.yml) | Sem erro |
| T3 | Build | Construção da imagem a partir do [Dockerfile](Dockerfile) | `Built` |
| T4 | Subir container | `docker compose up -d` | `Started` |
| T5 | Sintaxe nginx | `nginx -t` dentro do container | `syntax is ok` |
| T6 | HTTP raiz | `GET /` | `200` |
| T7 | Redirecionamento | [index.html](index.html) aponta para a calculadora | `OK` |
| T8 | Calculadora | `GET /calculadora-biogas.html` + link do StoryMaps | `200` + `OK` |
| T9 | CSS e JS | `GET` de [css/estilo.css](css/estilo.css) e dos 3 scripts | `200` (4×) |
| T10 | Imagens | `GET` de [assets/ceara.png](assets/ceara.png) e [assets/rodape.png](assets/rodape.png) | `200` (2×) |
| T11 | Healthcheck | `.State.Health.Status` | `healthy` |
| T12 | Headers de segurança | `X-Content-Type-Options` em `/`, `.html` e `.css` | `OK` (3×) |
| T13 | Embed StoryMaps | Cabeçalhos `frame-ancestors` / `X-Frame-Options` da Esri | Informativo |

### Resultado medido (última execução)

```
T1 OK (10 arquivos) · T2 OK · T3 Built · T4 Started · T5 syntax is ok
T6 200 · T7 OK · T8 200 + StoryMaps OK · T9 200 (4×) · T10 200 (2×)
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
> restringir o header poderia interferir no embed do StoryMaps dentro do modal.

### Conteúdo copiado para a imagem

Verificado com `docker exec biogas-panel find /usr/share/nginx/html -type f` — a imagem contém
exatamente 8 arquivos:

```
/usr/share/nginx/html/index.html
/usr/share/nginx/html/calculadora-biogas.html
/usr/share/nginx/html/css/estilo.css
/usr/share/nginx/html/js/biogas-engine.js
/usr/share/nginx/html/js/app.js
/usr/share/nginx/html/js/atlas-modal.js
/usr/share/nginx/html/assets/ceara.png
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
| [calculadora-biogas.html](calculadora-biogas.html) | 8.078 | 2.595 |
| [css/estilo.css](css/estilo.css) | 16.980 | 4.737 |
| [js/biogas-engine.js](js/biogas-engine.js) | 14.868 | 4.312 |
| [js/app.js](js/app.js) | 9.460 | 2.889 |
| [js/atlas-modal.js](js/atlas-modal.js) | 1.574 | 589 |
| **Total** | **50.960** | **15.122** |

O CSS e os três scripts são servidos com cache de 7 dias: na segunda visita o navegador baixa
apenas o HTML (~2,6 KB comprimidos). Em troca, a **primeira** visita transfere mais bytes do que
um HTML monolítico transferia — a separação ganha em cache e manutenção, não na carga inicial.

---

## Decisões de engenharia e limitações conhecidas

### 1. A capa do atlas é uma imagem local, não o embed do StoryMaps

A seção do atlas exibe [assets/ceara.png](assets/ceara.png) — uma imagem fixa, sem rolagem
própria. O StoryMaps completo só é carregado **quando o usuário abre o modal**, via `data-src`,
o que evita baixar o conteúdo externo em quem não pede.

**Limite conhecido:** por ser conteúdo de origem cruzada, não é possível controlar nem remover a
rolagem interna do StoryMaps de dentro desta página. Fazer a página ter "apenas um scroll" exige
substituir o embed por conteúdo local — decisão de produto, não de código.

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

**Conclusão:** o modal funciona em navegadores modernos. Navegadores muito antigos (que só
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

### 6. Acessibilidade: `h1` só para leitores de tela

A página tem um `h1` — `Atlas do gás renovável Ceará e calculadora de biogás` — mas ele usa a classe
`.sr-only`, então **não aparece visualmente**. Isso mantém o desenho atual, que começa direto pela
seção do atlas, e ao mesmo tempo dá à página um título de nível 1 para leitores de tela e
verificadores de acessibilidade.

O `<header>` original continua **comentado** em
[calculadora-biogas.html](calculadora-biogas.html#L22-L29), com o selo
`Atlas + estimativa preliminar de triagem` que foi restaurado a pedido. Se ele for reativado,
será preciso remover o `h1` `sr-only` para não haver dois `h1` na página.

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `docker build` falha com `nginx.conf: no such file` | [nginx.conf](nginx.conf) ausente | Recriar o arquivo e rebuildar |
| Porta 8080 já em uso | Outro processo/container | `HOST_PORT=9000 docker compose up -d` |
| Página sem estilo ou sem cálculo | `css/estilo.css` ou `js/*.js` não copiados | `docker compose up -d --build` e conferir T9 |
| Imagem do atlas/rodapé quebrada | `assets/` fora da imagem | Conferir T10 |
| Modal do atlas em branco | Story tornado privado na Esri | Verificar o compartilhamento do [story](https://storymaps.arcgis.com/stories/d3476caa5c2944098849a8635c6370f7) |
| `iframe` "This page won't open in a frame" | Cabeçalhos de bloqueio mudaram na Esri | Rodar [T13](#testes) e reavaliar |
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
  [storymaps.arcgis.com](https://storymaps.arcgis.com) (ao abrir o modal) e
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
- [ ] Capa do atlas, calculadora e rodapé aparecem corretamente
- [ ] Modal do atlas abre, fecha com `Esc` e devolve o foco
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
