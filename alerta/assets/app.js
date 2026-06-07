const state = {
  items: [],
  alerts: [],
  isRunning: false,
  requestInterval: null,
  isLoadingSkins: false,
  dropThreshold: 5,
  riseThreshold: 5,
};

const elements = {
  form: document.querySelector("#skinForm"),
  skinInput: document.querySelector("#skinInput"),
  intervalInput: document.querySelector("#intervalInput"),
  dropInput: document.querySelector("#dropInput"),
  riseInput: document.querySelector("#riseInput"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  clearAlertsBtn: document.querySelector("#clearAlertsBtn"),
  clearAllBtn: document.querySelector("#clearAllBtn"),
  body: document.querySelector("#watchlistBody"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  requestTimer: document.querySelector("#requestTimer"),
  alertsList: document.querySelector("#alertsList"),
  alertCount: document.querySelector("#alertCount"),
  chartModal: document.querySelector("#chartModal"),
  chartModalTitle: document.querySelector("#chartModalTitle"),
  skinsDatalist: document.querySelector("#skinsDatalist"),
  setRefModal: document.querySelector("#setRefModal"),
  refSkinName: document.querySelector("#refSkinName"),
  refValueInput: document.querySelector("#refValueInput"),
  saveRefBtn: document.querySelector("#saveRefBtn"),
};

let currentRefItemId = null;
let countdownTimer = null;
const alertedAbove = new Set();
const alertedBelow = new Set();

const PLACEHOLDER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%231a1a2e'/%3E%3Ctext x='24' y='28' font-size='9' text-anchor='middle' fill='white'%3ERust%3C/text%3E%3C/svg%3E";

function hasAlertedAboveThreshold(id) {
  return alertedAbove.has(id);
}

function hasAlertedBelowThreshold(id) {
  return alertedBelow.has(id);
}

function setAlertedAboveThreshold(id, value) {
  if (value) alertedAbove.add(id);
  else alertedAbove.delete(id);
}

function setAlertedBelowThreshold(id, value) {
  if (value) alertedBelow.add(id);
  else alertedBelow.delete(id);
}

function clearAlertedThresholds(id) {
  alertedAbove.delete(id);
  alertedBelow.delete(id);
}

function formatCurrency(value) {
  if (value == null || isNaN(value)) return "R$ --";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatNetPrice(value) {
  const net = value * 0.87;
  return formatCurrency(net);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function updateStatus(active, text) {
  state.isRunning = active;
  if (elements.statusDot && elements.statusText) {
    elements.statusDot.className = `status-dot ${active ? "running" : "waiting"}`;
    elements.statusText.textContent = text;
  }
  const toggle = (btn, ok) => {
    if (btn) {
      btn.disabled = !ok;
      if (ok) btn.removeAttribute("disabled");
      else btn.setAttribute("disabled", "");
    }
  };
  toggle(elements.startBtn, !active);
  toggle(elements.stopBtn, active);
}

function createSparkline(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (ctx.chart) ctx.chart.destroy();
  ctx.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i + 1),
      datasets: [{
        data,
        borderColor: "#22c55e",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      }],
    },
    options: {
      plugins: { legend: false },
      scales: { x: { display: false }, y: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderCard(item) {
  const card = document.createElement("div");
  card.className = "skin-card";
  card.dataset.id = item.id;

  let safeImage = PLACEHOLDER_SVG;
  if (item.image && item.image.length > 10) {
    safeImage = item.image;
  }

  const sparkData = (item.priceHistory || []).slice(-14).map((p) => p.price);
  const sparkId = `spark-${item.id}`;

  const move = detectMovement(item);
  const changeRef = move ? ((Number(item.currentPrice) - Number(item.referencePrice)) / Number(item.referencePrice)) * 100 : null;
  const changeDaily = move && move.dailyChange !== null ? move.dailyChange : null;

  card.innerHTML = `
    <div class="skin-header">
      <img class="skin-image" src="${safeImage}" alt="${item.name}" />
      <div class="skin-info">
        <div class="skin-name" title="${item.name}">${item.name}</div>
        <div class="appid">App 252490</div>
        <div class="skin-price">${formatCurrency(item.currentPrice)}</div>
        <div class="skin-spark"><canvas id="${sparkId}"></canvas></div>
        <div class="skin-meta">
          <span>Atualizado ${item.lastUpdated ? `há ${formatTime(item.lastUpdated)}` : "-"}</span>
        </div>
      </div>
    </div>
    <div class="skin-footer">
      <div class="skin-movement">
        ${changeRef !== null ? `<div class="movement ${changeRef > 0 ? 'positive' : changeRef < 0 ? 'negative' : ''}">Ref: ${changeRef > 0 ? '+' : ''}${changeRef.toFixed(2)}%</div>` : `<div class="movement muted">Sem referência</div>`}
        ${changeDaily !== null ? `<div class="movement ${changeDaily <= 0 ? 'positive' : 'negative'}">Hoje: ${changeDaily <= 0 ? '' : '+'}${formatCurrency(changeDaily)}</div>` : `<div class="movement muted">Hoje: -</div>`}
      </div>
      <div class="skin-actions">
        <button class="btn-dark small" data-action="open-history">Histórico</button>
        <button class="btn-dark small" data-action="set-reference">Definir ref.</button>
        <button class="btn-danger small" data-action="remove">Remover</button>
      </div>
    </div>
  `;

  if (sparkData.length >= 2) {
    setTimeout(() => createSparkline(sparkId, sparkData), 0);
  }

  return card;
}

function refreshCard(item) {
  const card = document.querySelector(`.skin-card[data-id="${item.id}"]`);
  if (!card) return;

  const move = detectMovement(item);
  const changeRef = move ? ((Number(item.currentPrice) - Number(item.referencePrice)) / Number(item.referencePrice)) * 100 : null;
  const changeDaily = move && move.dailyChange !== null ? move.dailyChange : null;

  const priceEl = card.querySelector(".skin-price");
  if (priceEl) priceEl.textContent = formatCurrency(item.currentPrice);

  const updatedEl = card.querySelector(".skin-meta span");
  if (updatedEl) updatedEl.textContent = `Atualizado ${item.lastUpdated ? `há ${formatTime(item.lastUpdated)}` : "-"}`;

  const moveEl = card.querySelector(".skin-movement");
  if (moveEl) {
    moveEl.innerHTML = `
      ${changeRef !== null ? `<div class="movement ${changeRef > 0 ? 'positive' : changeRef < 0 ? 'negative' : ''}">Ref: ${changeRef > 0 ? '+' : ''}${changeRef.toFixed(2)}%</div>` : `<div class="movement muted">Sem referência</div>`}
      ${changeDaily !== null ? `<div class="movement ${changeDaily <= 0 ? 'positive' : 'negative'}">Hoje: ${changeDaily <= 0 ? '' : '+'}${formatCurrency(changeDaily)}</div>` : `<div class="movement muted">Hoje: -</div>`}
    `;
  }

  const sparkData = (item.priceHistory || []).slice(-14).map((p) => p.price);
  const sparkId = `spark-${item.id}`;
  if (sparkData.length >= 2) {
    createSparkline(sparkId, sparkData);
  }
}

function addAlert(item, alertType, alertPercent, referencePriceAtAlert) {
   state.alerts.unshift({
     id: crypto.randomUUID(),
     name: item.name,
     currentPrice: item.currentPrice,
     referencePrice: referencePriceAtAlert || item.referencePrice,
     previousPrice: item.previousPrice,
     alertType,
     alertPercent,
     date: new Date(),
   });
   state.alerts = state.alerts.slice(0, 30);
   saveState();
   renderAlerts();
   notifyAlert(item, alertType, alertPercent);
 }

async function notifyAlert(item, type, changePercent) {
  if (!("Notification" in window)) return;
  if (!item) return;
  const port = document.location.port || "3000";
  let history = item.priceHistory || [];

  try {
    const histRes = await fetch(`http://localhost:${port}/api/history?name=${encodeURIComponent(item.name)}`);
    if (histRes.ok) {
      const serverHistory = await histRes.json();
      history = serverHistory.length ? serverHistory : history;
    }
  } catch {}

  const now = new Date();
  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const oneYearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1000;

  const pricesToday = history.filter(h => h.timestamp >= oneDayAgo).map(h => h.price);
  const pricesWeek = history.filter(h => h.timestamp >= oneWeekAgo).map(h => h.price);
  const pricesMonth = history.filter(h => h.timestamp >= oneMonthAgo).map(h => h.price);
  const pricesYear = history.filter(h => h.timestamp >= oneYearAgo).map(h => h.price);

  const dayMin = pricesToday.length ? Math.min(...pricesToday) : null;
  const dayMax = pricesToday.length ? Math.max(...pricesToday) : null;
  const weekMin = pricesWeek.length ? Math.min(...pricesWeek) : null;
  const weekMax = pricesWeek.length ? Math.max(...pricesWeek) : null;
  const monthMin = pricesMonth.length ? Math.min(...pricesMonth) : null;
  const monthMax = pricesMonth.length ? Math.max(...pricesMonth) : null;
  const yearMin = pricesYear.length ? Math.min(...pricesYear) : null;
  const yearMax = pricesYear.length ? Math.max(...pricesYear) : null;

  console.log(`[ALERTA] ${item.name}: ${type === "rise" ? "↑" : "↓"} ${changePercent.toFixed(1)}% (Ref: ${formatCurrency(item.referencePrice)} → ${formatCurrency(item.currentPrice)} (${formatNetPrice(item.currentPrice)} líquido))`);
  if (dayMin && dayMax) console.log(`  Hoje: ${formatCurrency(dayMin)} - ${formatCurrency(dayMax)}`);
  if (weekMin && weekMax) console.log(`  Semana: ${formatCurrency(weekMin)} - ${formatCurrency(weekMax)}`);
  if (monthMin && monthMax) console.log(`  Mês: ${formatCurrency(monthMin)} - ${formatCurrency(monthMax)}`);
  if (yearMin && yearMax) console.log(`  Ano: ${formatCurrency(yearMin)} - ${formatCurrency(yearMax)}`);

  const parts = [];
  if (dayMin && dayMax) parts.push(`Hoje: ${formatCurrency(dayMin)}-${formatCurrency(dayMax)}`);
  if (weekMin && weekMax) parts.push(`Semana: ${formatCurrency(weekMin)}-${formatCurrency(weekMax)}`);
  if (monthMin && monthMax) parts.push(`Mês: ${formatCurrency(monthMin)}-${formatCurrency(monthMax)}`);
  if (yearMin && yearMax) parts.push(`Ano: ${formatCurrency(yearMin)}-${formatCurrency(yearMax)}`);
  const statsInfo = parts.join("\n");
  const netPrice = item.currentPrice * 0.87;
  const body = type === "rise"
    ? `${item.name} valorizou ${changePercent.toFixed(1)}%\n${formatCurrency(item.currentPrice)} (${formatCurrency(netPrice)} líquido)\n${statsInfo}`.trim()
    : `${item.name} caiu ${changePercent.toFixed(1)}%\n${formatCurrency(item.currentPrice)} (${formatCurrency(netPrice)} líquido)\n${statsInfo}`.trim();
  const show = () => new Notification("Alerta de preço Rust", { body, icon: item.image });
  if (Notification.permission === "granted") show();
  else if (Notification.permission !== "denied") Notification.requestPermission().then(show);
}

function renderAlerts() {
  if (!elements.alertsList || !elements.alertCount) return;
  elements.alertCount.textContent = state.alerts.length;
  if (state.alerts.length === 0) {
    elements.alertsList.innerHTML = `
      <div class="empty-alerts">
        <div class="bell">🔔</div>
        <h3>Nenhum alerta encontrado</h3>
        <p>Quando uma skin atingir o limite configurado ela aparecerá aqui.</p>
      </div>
    `;
    return;
  }
  elements.alertsList.innerHTML = state.alerts
    .map((alert) => {
      const isRise = alert.alertType === "rise";
      const cls = isRise ? "rise" : "drop";
      const text = isRise ? `↑ ${alert.alertPercent.toFixed(1)}% (valorizou)` : `↓ ${alert.alertPercent.toFixed(1)}% (caiu)`;
      const netPrice = alert.currentPrice * 0.87;
      return `
        <div class="alert-item ${cls}">
          <div class="alert-body">
            <strong>${alert.name}</strong>
            <span>Ref: ${formatCurrency(alert.referencePrice)} → ${formatCurrency(alert.currentPrice)} (${formatNetPrice(netPrice)})</span>
            <small>${formatTime(alert.date)}</small>
          </div>
          <div class="alert-badge">${text}</div>
        </div>
      `;
    })
    .join("");
}

function detectMovement(item) {
  const current = Number(item.currentPrice);
  const reference = Number(item.referencePrice);
  const riseThreshold = item.riseThreshold || state.riseThreshold;
  const dropThreshold = item.dropThreshold || state.dropThreshold;
  if (isNaN(current) || isNaN(reference) || !isFinite(current) || !isFinite(reference)) {
    console.warn(`[DEBUG] Invalid price - current: ${current}, reference: ${reference}`);
    return null;
  }
  if (current <= 0 || reference <= 0) {
    console.warn(`[DEBUG] Price not positive - current: ${current}, reference: ${reference}`);
    return null;
  }

  const changeVsReference = ((current - reference) / reference) * 100;
  console.log(`[DEBUG] ${item.name}: current=${current}, ref=${reference}, change=${changeVsReference.toFixed(2)}%, riseThr=${riseThreshold}, dropThr=${dropThreshold}`);

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayPrices = (item.priceHistory || []).filter((h) => h.timestamp >= dayStart).map((h) => h.price);

  let dailyChange = null;
  if (todayPrices.length >= 2) {
    const firstToday = todayPrices[0];
    dailyChange = current - firstToday;
  }

  let alertType = null;
  let alertPercent = null;

  if (Math.abs(changeVsReference) < 0.01) return null;

  if (changeVsReference >= riseThreshold && !hasAlertedAboveThreshold(item.id)) {
    alertType = "rise";
    alertPercent = changeVsReference;
    setAlertedAboveThreshold(item.id, true);
  } else if (changeVsReference <= -dropThreshold && !hasAlertedBelowThreshold(item.id)) {
    alertType = "drop";
    alertPercent = Math.abs(changeVsReference);
    setAlertedBelowThreshold(item.id, true);
  }

  if (Math.abs(changeVsReference) < riseThreshold && Math.abs(changeVsReference) < dropThreshold) {
    clearAlertedThresholds(item.id);
  }

  return { dailyChange, changeVsReference, alertType, alertPercent };
}

async function fetchSteamPriceBRL(name) {
  const port = document.location.port || "3000";
  const res = await fetch(`http://localhost:${port}/api/price?name=${encodeURIComponent(name)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Number(data.price);
}

function pushHistory(item, price) {
  if (!item.priceHistory) item.priceHistory = [];
  item.priceHistory.push({ price, timestamp: Date.now() });
  if (item.priceHistory.length > 1000) item.priceHistory = item.priceHistory.slice(-1000);
}

async function loadSkins() {
  if (state.isLoadingSkins) return;
  state.isLoadingSkins = true;
  const port = document.location.port || "3000";
  try {
    const res = await fetch(`http://localhost:${port}/api/skins`);
    if (res.ok) {
      const skins = await res.json();
      if (elements.skinsDatalist) {
        elements.skinsDatalist.innerHTML = skins
          .filter((s) => !state.items.find((i) => i.name === s))
          .map((s) => `<option value="${s}"></option>`)
          .join("");
      }
    }
  } catch (err) {
    console.warn("Falha ao carregar skins:", err.message);
  }
  state.isLoadingSkins = false;
}

function showChartModal(skinName) {
  if (elements.chartModal && elements.chartModalTitle) {
    elements.chartModalTitle.textContent = `Histórico - ${skinName}`;
    elements.chartModal.classList.add("active");
    renderChart(skinName);
  }
}

function closeChartModal() {
  if (elements.chartModal) elements.chartModal.classList.remove("active");
}

async function renderChart(skinName) {
  const port = document.location.port || "3000";
  const res = await fetch(`http://localhost:${port}/api/history?name=${encodeURIComponent(skinName)}`);
  const history = res.ok ? await res.json() : [];
  const canvas = document.getElementById("priceChart");
  if (canvas && history.length) {
    const ctx = canvas;
    if (ctx.chart) ctx.chart.destroy();
    const prices = history.map(h => h.price);
    const labels = history.map(h => new Date(h.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    ctx.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Preço",
          data: prices,
          borderColor: "#22c55e",
          borderWidth: 2,
          pointRadius: 1,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: false },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#243244" } },
          y: { ticks: { color: "#94a3b8", callback: v => "R$ " + v }, grid: { color: "#243244" } },
        },
      },
    });
    const statsRes = await fetch(`http://localhost:${port}/api/stats?name=${encodeURIComponent(skinName)}`);
    const stats = statsRes.ok ? await statsRes.json() : {};
    const statsEl = document.getElementById("chartStats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-box"><span class="stat-label">Mínimo</span><span class="stat-value">${stats.min ? formatCurrency(stats.min) : "--"}</span></div>
        <div class="stat-box"><span class="stat-label">Máximo</span><span class="stat-value">${stats.max ? formatCurrency(stats.max) : "--"}</span></div>
        <div class="stat-box"><span class="stat-label">Média</span><span class="stat-value">${stats.avg ? formatCurrency(stats.avg) : "--"}</span></div>
        <div class="stat-box"><span class="stat-label">Atual</span><span class="stat-value">${stats.last ? formatCurrency(stats.last) : "--"}</span></div>
      `;
    }
  }
}

async function processNextRequest() {
  if (!state.isRunning) return;

  try {
    const currentItems = [...state.items];
    const results = await Promise.all(
      currentItems.map((item) =>
        fetchSteamPriceBRL(item.name)
          .then((price) => ({ ...item, currentPrice: price, lastUpdated: new Date(), fetchError: null }))
          .catch((err) => {
            console.warn(`Falha ao buscar ${item.name}:`, err.message);
            return { ...item, fetchError: err.message };
          })
      )
    );

    results.forEach((next) => {
      const prev = state.items.find((i) => i.id === next.id);
      if (prev) {
        let oldCurrentPrice = prev.currentPrice;
        let newPrice = next.currentPrice;

        if (newPrice && oldCurrentPrice && oldCurrentPrice > 0) {
          const changePercent = Math.abs((newPrice - oldCurrentPrice) / oldCurrentPrice) * 100;
          if (changePercent > 50) {
            console.warn(`[VALIDATION] ${prev.name}: Rejecting suspicious price jump from ${oldCurrentPrice} to ${newPrice} (${changePercent.toFixed(1)}%)`);
            newPrice = null;
          }
        }

        prev.previousPrice = oldCurrentPrice;
        prev.currentPrice = newPrice;
        prev.lastUpdated = next.lastUpdated;
        prev.fetchError = next.fetchError;
        if (prev.currentPrice != null) {
          if (prev.referencePrice == null) {
            prev.referencePrice = prev.currentPrice;
          }
          pushHistory(prev, prev.currentPrice);
        }

        const movement = detectMovement(prev);
        if (movement && movement.alertType) {
          addAlert(prev, movement.alertType, movement.alertPercent, prev.referencePrice);
          prev.referencePrice = prev.currentPrice;
        }
        refreshCard(prev);
      }
    });
  } catch (error) {
    console.error("[WATCHLIST] ciclo falhou:", error);
  }

  scheduleNextRequest();
}

function updateCountdown() {
  if (!state.isRunning || !state.requestEndTime || !elements.requestTimer) return;
  const remaining = Math.max(0, state.requestEndTime - Date.now());
  const secs = Math.floor(remaining / 1000);
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");
  if (mm > 0) elements.requestTimer.textContent = `Próxima requisição: ${mm}:${ss}`;
  else elements.requestTimer.textContent = `Próxima requisição: ${ss}s`;
}

function scheduleNextRequest() {
  if (!state.isRunning || !state.requestInterval) return;
  state.requestEndTime = Date.now() + state.requestInterval;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdown, 1000);
  setTimeout(processNextRequest, state.requestInterval);
}

function saveState() {
  localStorage.setItem("rustSkins", JSON.stringify({
    items: state.items.map(item => ({
      ...item,
      lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : item.lastUpdated
    })),
    alerts: state.alerts.map(alert => ({
      ...alert,
      date: alert.date instanceof Date ? alert.date.toISOString() : alert.date
    })),
  }));
}

function loadState() {
  const saved = localStorage.getItem("rustSkins");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.items = (data.items || []).map(item => ({
        ...item,
        riseThreshold: item.riseThreshold || state.riseThreshold,
        dropThreshold: item.dropThreshold || state.dropThreshold,
        lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : null
      }));
      state.alerts = (data.alerts || []).map(alert => ({
        ...alert,
        date: alert.date ? new Date(alert.date) : new Date()
      }));
      state.items.forEach(item => {
        if (elements.body) elements.body.appendChild(renderCard(item));
      });
      updateStats();
      renderAlerts();
    } catch (e) {
      console.error("Erro ao carregar estado:", e);
    }
  }
}

async function addSkin(name) {
  if (!name) throw new Error("Nome vazio");
  if (state.items.find((i) => i.name === name)) throw new Error("Já adicionada");

  const submitting = elements.form?.querySelector('button[type="submit"]');
  if (submitting) {
    submitting.disabled = true;
    submitting.textContent = "Buscando...";
  }

  let price = null;
  let image = "";
  try {
    const port = document.location.port || "3000";
    const res = await fetch(`http://localhost:${port}/api/price?name=${encodeURIComponent(name)}`);
    if (res.ok) {
      const data = await res.json();
      price = data.price;
      image = data.image || "";
    }
  } catch (err) {
    console.warn("Falha ao buscar preço:", err);
  }

  const item = {
    id: crypto.randomUUID(),
    name,
    appid: 252490,
    image,
    currentPrice: price,
    previousPrice: price,
    referencePrice: price,
    riseThreshold: Number(elements.riseInput?.value || 5),
    dropThreshold: Number(elements.dropInput?.value || 5),
    priceHistory: price != null ? [{ price, timestamp: Date.now() }] : [],
    lastUpdated: price != null ? new Date() : null,
  };

  state.items.push(item);
  saveState();
  if (elements.body) {
    elements.body.appendChild(renderCard(item));
  }
  updateStats();

  if (submitting) {
    submitting.disabled = false;
    submitting.textContent = "Adicionar";
  }

  return item;
}

function removeSkin(id) {
  state.items = state.items.filter((i) => i.id !== id);
  saveState();
  const card = document.querySelector(`.skin-card[data-id="${id}"]`);
  if (card) card.remove();
  updateStats();
}

function updateStats() {
  if (elements.alertCount) elements.alertCount.textContent = state.alerts.length;
}

function startMonitoring() {
  if (state.isRunning) return;
  if (state.items.length === 0) {
    alert("Adicione pelo menos uma skin antes de iniciar.");
    return;
  }
  const intervalMs = Number(elements.intervalInput?.value || 10) * 1000;
  state.dropThreshold = Number(elements.dropInput?.value || 5);
  state.riseThreshold = Number(elements.riseInput?.value || 5);
  state.requestInterval = intervalMs;
  state.requestEndTime = Date.now() + intervalMs;
  updateStatus(true, `Monitorando ${state.items.length} skins`);
  processNextRequest();
  setInputsDisabled(true);
}

function stopMonitoring() {
  if (!state.isRunning) return;
  clearTimeout(state.requestTimer);
  state.requestInterval = null;
  state.requestEndTime = null;
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  alertedAbove.clear();
  alertedBelow.clear();
  updateStatus(false, "Parado");
  setInputsDisabled(false);
  if (elements.requestTimer) elements.requestTimer.textContent = "Próxima requisição: --";
}

function setInputsDisabled(disabled) {
  document.querySelectorAll("#skinForm input, #skinForm select").forEach((el) => el.disabled = disabled);
}

function showSetRefModal(item) {
  if (elements.setRefModal && elements.refSkinName && elements.refValueInput) {
    currentRefItemId = item.id;
    elements.refSkinName.textContent = item.name;
    elements.refValueInput.value = item.currentPrice || "";
    elements.setRefModal.classList.add("active");
  }
}

function closeSetRefModal() {
  if (elements.setRefModal) elements.setRefModal.classList.remove("active");
  currentRefItemId = null;
}

function init() {
  if (!elements.body) {
    console.error("Elementos essenciais não encontrados.");
    return;
  }

  elements.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.skinInput?.value.trim();
    if (!name) return;
    try {
      await addSkin(name);
      elements.skinInput.value = "";
    } catch (error) {
      alert(error.message);
    } finally {
      elements.skinInput?.focus();
    }
  });

  elements.skinInput?.addEventListener("input", () => {
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(() => loadSkins(), 500);
  });

  if (elements.startBtn) elements.startBtn.addEventListener("click", startMonitoring);
  if (elements.stopBtn) elements.stopBtn.addEventListener("click", stopMonitoring);
  if (elements.clearAlertsBtn) elements.clearAlertsBtn.addEventListener("click", () => {
    state.alerts = [];
    renderAlerts();
    updateStats();
  });
  if (elements.clearAllBtn) elements.clearAllBtn.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja limpar todas as skins e o histórico?")) {
      stopMonitoring();
      state.items = [];
      state.alerts = [];
      alertedAbove.clear();
      alertedBelow.clear();
      if (elements.body) elements.body.innerHTML = "";
      saveState();
      renderAlerts();
      updateStats();
    }
  });

  if (elements.body) {
    elements.body.addEventListener("click", (event) => {
      const card = event.target.closest(".skin-card");
      if (!card) return;
      const id = card.dataset.id;
      const item = state.items.find((i) => i.id === id);
      const removeBtn = event.target.closest("[data-action='remove']");
      const historyBtn = event.target.closest("[data-action='open-history']");
      const setRefBtn = event.target.closest("[data-action='set-reference']");

      if (removeBtn && item) removeSkin(id);
      else if (historyBtn && item) showChartModal(item.name);
      else if (setRefBtn && item) showSetRefModal(item);
    });
  }

  if (elements.chartModal) {
    elements.chartModal.addEventListener("click", (event) => {
      if (event.target === elements.chartModal) closeChartModal();
    });
  }

  document.addEventListener("click", (event) => {
    const steamBtn = event.target.closest("[data-action='open-steam']");
    if (steamBtn) {
      const skinName = elements.chartModalTitle?.textContent.replace("Histórico - ", "").trim();
      if (skinName) window.open(`https://steamcommunity.com/market/listings/252490/${encodeURIComponent(skinName)}?l=portuguese`, "_blank");
      return;
    }
    const closeBtn = event.target.closest("[data-action='close-modal']");
    if (closeBtn) closeChartModal();
    const closeRefBtn = event.target.closest("[data-action='close-ref-modal']");
    if (closeRefBtn) closeSetRefModal();
  });

  if (elements.saveRefBtn) {
    elements.saveRefBtn.addEventListener("click", () => {
      if (!currentRefItemId) return;
      const item = state.items.find((i) => i.id === currentRefItemId);
      if (!item) return;
      const price = parseFloat(elements.refValueInput?.value || "0");
      if (!isNaN(price) && price > 0) {
        item.referencePrice = price;
        saveState();
        refreshCard(item);
        alert("Valor de referência salvo: R$ " + price.toFixed(2));
      } else {
        alert("Valor inválido!");
      }
      closeSetRefModal();
    });
  }

loadState();
   if (elements.intervalInput) elements.intervalInput.value = "10";
   if (elements.dropInput) elements.dropInput.value = "5";
   if (elements.riseInput) elements.riseInput.value = "5";
   updateStatus(false, "Parado");
   renderAlerts();
  updateStats();
}

init();