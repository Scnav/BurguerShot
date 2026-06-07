# 🎮 Rust Skin Watch - Monitor de Preços Steam Market

Sistema de monitoramento automático de quedas de preço de skins de Rust na Steam Community Market.

## 🚀 Recursos

✅ **Monitoramento em tempo real** - Consulta preços diretamente da Steam Market  
✅ **Intervalo anti-bloqueio** - Respeita delays entre requisições (5-60s configurável)  
✅ **Alertas inteligentes** - Notifica quando detecta queda maior que o limiar (3-15%)  
✅ **Histórico de alertas** - Mantém registro dos últimos 30 alertas  
✅ **Persistência local** - Salva lista de skins em localStorage  
✅ **Notificações desktop** - Avisa em tempo real via Notification API  
✅ **Apenas Rust** - Monitoramento específico para skins do app ID 252490  

## 📋 Requisitos

- **Node.js** 14+ (apenas para backend)
- **Navegador moderno** com suporte a ES6+
- **Conexão com internet** (para acessar Steam Market)

## 🔧 Instalação & Execução

### 1️⃣ Iniciar o Backend (proxy Steam Market)

```bash
cd d:\Maanain\alerta
node server.js
```

Saída esperada:
```
✓ Rust Skin Watch server running on http://localhost:3000
✓ Frontend available on http://localhost:8080
✓ API endpoints:
  - GET /api/skins - lista de skins
  - GET /api/price?name=... - preço da skin
```

### 2️⃣ Iniciar o Frontend (http-server ou VS Code Live Server)

Se você já tem um servidor web rodando em `http://localhost:8080/`:
- Apenas acesse `http://localhost:8080/` no navegador

Se não tiver:

**Opção A - com http-server (npm):**
```bash
npm install -g http-server
cd d:\Maanain\alerta
http-server -p 8080
```

**Opção B - com VS Code Live Server (extensão):**
- Instale a extensão "Live Server"
- Clique direito em `index.html` → "Open with Live Server"

**Opção C - com Python:**
```bash
cd d:\Maanain\alerta
python -m http.server 8080
```

## 🎯 Como Usar

1. **Adicionar skin**
   - Digite o nome da skin (ex: "AK-47 | Bloodsport")
   - Escolha intervalo entre consultas (5-60s)
   - Configure limiar de alerta (3-15%)
   - Clique "Adicionar"

2. **Iniciar monitoramento**
   - Clique "Iniciar"
   - Status muda para "Monitorando"
   - Timer mostra quando será a próxima requisição

3. **Receber alertas**
   - Se a queda for maior que o limiar, aparecerá:
     - Badge "Queda detectada" na tabela
     - Card no painel de alertas
     - Notificação desktop (se habilitada)

4. **Pausar / Limpar**
   - "Pausar" para interromper monitoramento
   - "Limpar alertas" para resetar histórico

## 📡 Arquitetura

```
┌─────────────────────────────────────────────────────┐
│         Navegador (index.html + app.js)             │
│  - Interface + estado local                          │
│  - Requisições para: http://localhost:3000/api/...   │
└─────────────────────────────────────────────────────┘
                         ↓ HTTP
┌─────────────────────────────────────────────────────┐
│        Node.js Backend (server.js)                   │
│  - Proxy CORS para Steam Market                      │
│  - Endpoints:                                        │
│    GET /api/skins → lista de skins                   │
│    GET /api/price?name=... → preço da skin           │
└─────────────────────────────────────────────────────┘
                         ↓ HTTPS
┌─────────────────────────────────────────────────────┐
│      Steam Community Market API                      │
│  - https://steamcommunity.com/market/priceoverview/  │
│  - AppID: 252490 (Rust)                              │
│  - Moeda: BRL (Real)                                 │
└─────────────────────────────────────────────────────┘
```

## 🛠️ Endpoints da API

### `GET /api/skins`
Retorna lista de skins conhecidas para autocomplete.

**Response:**
```json
{
  "skins": [
    "AK-47 | Bloodsport",
    "AWP | Dragon Lore",
    ...
  ]
}
```

### `GET /api/price?name=...`
Busca o preço atual da skin na Steam Market.

**Example:**
```
GET /api/price?name=AK-47%20%7C%20Bloodsport
```

**Response (sucesso):**
```json
{
  "name": "AK-47 | Bloodsport",
  "price": 45.50,
  "currency": "BRL",
  "source": "steam",
  "timestamp": "2026-06-06T12:45:30.000Z"
}
```

**Response (erro):**
```json
{
  "error": "Skin not found: AK-47 | Invalid",
  "name": "AK-47 | Invalid"
}
```

## ⚙️ Configurações

### No Frontend (app.js)
- `STORAGE_KEY` - Chave localStorage para persistência
- Intervalo: 5, 10, 20, 30, 60 segundos
- Alerta: 3, 5, 10, 15% de queda

### No Backend (server.js)
- `STEAM_APP_ID = 252490` - Rust (não mude!)
- `PORT = 3000` - Porta do backend
- `STEAM_API_URL` - URL da Steam Market
- `RUST_SKINS` - Lista de skins para autocomplete (editar para adicionar mais)

## 🚨 Possíveis Erros & Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| "Cannot fetch price" | Backend não está rodando | Execute `node server.js` |
| "Skin not found" | Nome da skin não existe na Steam Market | Verifique o nome exato |
| "Request timeout" | Steam Market demorando para responder | Tente novamente (limite de 10s) |
| CORS error | Está tentando chamar Steam diretamente | Certifique-se que backend está rodando |
| "Port 3000 already in use" | Outro processo usando porta 3000 | Feche o processo ou mude a porta em `server.js` |

## 📝 Estrutura de Arquivos

```
d:\Maanain\alerta\
├── index.html          # Frontend (interface)
├── styles.css          # Estilos (dark theme)
├── app.js              # Lógica do cliente (monitoramento, alertas)
├── server.js           # Backend (proxy Steam Market)
├── package.json        # Dependências (vazio, sem npm packages)
└── README.md           # Este arquivo
```

## 🔐 Segurança

✅ **Sem exposição de chaves** - Backend faz proxy das requisições  
✅ **CORS habilitado** - Frontend em localhost:8080 → Backend em localhost:3000  
✅ **User-Agent forjado** - Imita navegador para Steam não bloquear  
✅ **Timeout de 10s** - Evita travamentos  

## 🎮 Skins Disponíveis (padrão)

O backend vem com uma lista de skins populares pré-configuradas. Para adicionar mais, edite o array `RUST_SKINS` em `server.js`.

**Exemplos:**
- AK-47 | Bloodsport
- AWP Dragon Lore
- M4A1-S | Dark Water
- USP-S | Cortex
- Glock-18 | Watermelon
- (+ 20 mais)

## 📊 Dados Salvos Localmente

No localStorage (prefixo `rust-skin-watchlist`):
```json
[
  {
    "id": "uuid",
    "name": "AK-47 | Bloodsport",
    "intervalSeconds": 10,
    "dropPercent": 5,
    "currentPrice": 45.50,
    "previousPrice": 48.00,
    "lastCheckedAt": 1717677930000,
    "status": "Estavel"
  }
]
```

## 🐛 Debug

Para ver logs de requisições:
1. Abra DevTools (F12)
2. Aba "Console" - ver logs do app.js
3. Aba "Network" - ver requisições para `/api/price`
4. Terminal node - ver logs do backend

## 📱 Responsividade

- ✅ Desktop (1180px+)
- ✅ Tablet (920px)
- ✅ Mobile (560px)

Layout se adapta automaticamente.

## 🚀 Melhorias Futuras

- [ ] Exportar histórico (CSV/JSON)
- [ ] Gráfico de preços (Chart.js)
- [ ] Webhook Discord/Telegram
- [ ] Banco de dados (histórico persistente)
- [ ] Autenticação Steam OpenID
- [ ] Dark mode toggle
- [ ] Busca/filtro de skins com autocomplete

## 📄 Licença

MIT

---

**Feito para monitorar skins de Rust na Steam Market** 🎮💰
