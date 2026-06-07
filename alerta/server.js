const http = require("http");
const https = require("https");
const url = require("url");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { chromium } = require("playwright");

const STEAM_APP_ID = 252490;
const HISTORY_FILE = path.join(__dirname, "price-history.json");
const IMAGE_CACHE_DIR = path.join(__dirname, "image-cache");
const MAX_HISTORY_ENTRIES = 1000;
const USD_CACHE_TTL = 1000 * 60 * 60;

if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

let priceHistory = loadPriceHistory();
const usdCache = { rate: null, timestamp: 0 };

const RUST_SKINS = [
  "AK-47 | Bloodsport", "AK-47 | Uncharted", "AK-47 | Neon Rider",
  "M249 | Nebula Crusader", "M4A4 | Buzz Kill", "M4A4 | Desolate Space",
  "M4A1-S | Dark Water", "M4A1-S | Phantom Disruptor",
  "AWP Dragon Lore", "AWP | Phantom", "AWP | Asiimov",
  "USP-S | Cortex", "USP-S | Dark Water", "Glock-18 | Watermelon",
  "Deagle | Directive", "P250 | Undertow", "MP9 | Starlight Protector",
  "UMP-45 | Labyrinth", "MAC-10 | Heat", "FAMAS | Valence",
  "Galil AR | Sakura", "SG 553 | Dragon Tech", "SCAR-20 | Bloodsport",
  "SSG 08 | Blue Firetop", "Nova | Hyper Beast", "XM1014 | Seasons",
  "MAG-7 | Heat", "Negev | Lionfish",
];

let browser = null;
let browserContext = null;

async function getBrowser() {
  if (browser && browserContext) {
    try {
      const page = await browserContext.newPage();
      await page.goto("about:blank");
      await page.close();
      return browserContext;
    } catch {}
  }

  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
  }

  browserContext = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  });

  await browserContext.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return browserContext;
}

async function fetchWithPlaywright(skinName) {
  const pageUrl = `https://steamcommunity.com/market/listings/252490/${encodeURIComponent(skinName)}?country=BR&currency=5&language=portuguese`;

  let context;
  let page;

  try {
    context = await getBrowser();
    page = await context.newPage();

    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9" });
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 50000 });
    await page.waitForTimeout(10000);

    const result = await page.evaluate(() => {
      const prices = Array.from(document.body.innerHTML.matchAll(/R\$\s*([\d]{1,6}(?:\.\d{3})*,\d{2})/g));
      const priceValues = prices
        .map((m) => parseFloat(m[1].replace(/\./g, "").replace(",", ".")))
        .filter((v) => !isNaN(v) && v > 0 && v < 50000);

      let image = "";
      const html = document.body.innerHTML;
      let iconMatch = html.match(/"icon"\s*:\s*"(https:\/\/steamcommunity-a\.akamaihd\.net\/economy\/image\/[^"]+)"/);
      if (!iconMatch) {
        iconMatch = html.match(/"iconUrl"\s*:\s*"(https:\/\/steamcommunity-a\.akamaihd\.net\/economy\/image\/[^"]+)"/);
      }
      if (iconMatch) {
        image = iconMatch[1].replace(/thumb[_&]120x120/, "360x");
      }
      if (!image) {
        try {
          const xpath = "//*[@id='CommunityTemplate']/div/div/div/div[1]/div[2]/div[2]/div/div[1]/div/div/div[2]/div[1]/div[1]/img";
          const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (res.singleNodeValue && res.singleNodeValue.src) {
            image = res.singleNodeValue.src;
          }
        } catch (e) {}
      }

      return { price: priceValues[0] || null, image };
    });

    await page.close();

    console.log(`[PLAYWRIGHT] ${skinName}: price=${result.price || "none"}, image=${result.image || "none"}`);

    return result;
  } catch (err) {
    console.log(`[PLAYWRIGHT] ${skinName}: erro - ${err.message}`);
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    return { price: null, image: "" };
  }
}

function fetchWithAPIUSD(skinName) {
  return new Promise((resolve, reject) => {
    const query = `?country=US&currency=1&appid=${252490}&market_hash_name=${encodeURIComponent(skinName)}`;

    const req = https.request(
      {
        hostname: "steamcommunity.com",
        path: `/market/priceoverview${query}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        timeout: 20000,
      },
      (res) => {
        let data = "";
        let stream = res;

        if (res.headers["content-encoding"] === "gzip") {
          try {
            stream = res.pipe(zlib.createGunzip());
          } catch {
            stream = res;
          }
        }

        stream.on("data", (chunk) => {
          data += chunk;
        });

        stream.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          try {
            const json = JSON.parse(data);
            if (!json.success) {
              return reject(new Error("Skin not found"));
            }

            const priceStr = json.lowest_price || json.sell_price || json.median_price;
            if (!priceStr) {
              return reject(new Error("No price"));
            }

            const m = priceStr.match(/(\d+\.\d{2})/);
            const price = m ? parseFloat(m[1]) : parseFloat(priceStr.replace(/[^0-9.,]/g, "").replace(",", "."));

            if (isNaN(price)) {
              return reject(new Error("Invalid price"));
            }

            resolve({ price, currency: "USD" });
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.end();
  });
}

function getUsdToBRL() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (usdCache.rate && now - usdCache.timestamp < USD_CACHE_TTL) {
      return resolve(usdCache.rate);
    }

    https.get(
      {
        hostname: "economia.awesomeapi.com.br",
        path: "/json/last/USD-BRL",
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const rate = parseFloat(json.USDBRL?.bid || json.USDBRL?.ask || 0);
            if (rate > 0) {
              usdCache.rate = rate;
              usdCache.timestamp = now;
              console.log(`[COTACAO] USD→BRL: ${rate.toFixed(4)}`);
              return resolve(rate);
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
    ).on("error", () => resolve(null)).setTimeout(10000, () => {
      this.destroy();
      resolve(null);
    });
  });
}

async function fetchSteamPrice(skinName) {
  let result = await fetchWithPlaywright(skinName);
  let finalImage = "";

  if (result.image && result.image.startsWith("http")) {
    const imagePath = result.image.replace("https://", "").replace("http://", "");
    finalImage = `/img-proxy/${imagePath}`;
  }

  if (result.price && !isNaN(result.price) && result.price > 0) {
    console.log(`[PLAYWRIGHT] ${skinName}: R$ ${result.price.toFixed(2)}`);
    return { price: result.price, image: finalImage };
  }

  console.log(`[PLAYWRIGHT] ${skinName}: falhou -> API USD`);
  try {
    const { price: usdPrice, currency } = await fetchWithAPIUSD(skinName);
    if (currency === "USD" && usdPrice > 0) {
      const rate = await getUsdToBRL();
      if (rate) {
        const brlPrice = Math.round(usdPrice * rate * 100) / 100;
        console.log(`[API-USD] ${skinName}: $${usdPrice.toFixed(2)} -> R$ ${brlPrice.toFixed(2)}`);
        return { price: brlPrice, image: finalImage };
      }
    }
  } catch {}

  return { price: null, image: finalImage };
}

function loadPriceHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch (err) {
    console.error(`[ERROR] Erro ao carregar histórico: ${err.message}`);
  }
  return {};
}

function addToHistory(skinName, price) {
  if (!priceHistory[skinName]) {
    priceHistory[skinName] = [];
  }
  priceHistory[skinName].push({ price, timestamp: Date.now() });
  if (priceHistory[skinName].length > MAX_HISTORY_ENTRIES) {
    priceHistory[skinName] = priceHistory[skinName].slice(-MAX_HISTORY_ENTRIES);
  }
  savePriceHistory();
}

function savePriceHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(priceHistory, null, 2), "utf-8");
  } catch (err) {
    console.error(`[ERROR] Erro ao salvar histórico: ${err.message}`);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === "/" || pathname === "/index.html") {
    const filePath = path.join(__dirname, "index.html");
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    stream.pipe(res);
    return;
  }

  if (pathname.startsWith("/assets/")) {
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json; charset=utf-8",
        ".ico": "image/x-icon",
      };
      const mime = mimeTypes[ext] || "application/octet-stream";
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { "Content-Type": mime });
      stream.pipe(res);
      return;
    }
  }

  if (pathname === "/api/skins") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(RUST_SKINS));
    return;
  }

  if (pathname === "/api/price") {
    const skinName = parsedUrl.query.name;
    if (!skinName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "name parameter required" }));
      return;
    }
    fetchSteamPrice(skinName)
      .then((result) => {
        const { price, image } = result || { price: null, image: "" };
        if (price) addToHistory(skinName, price);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ price, image, name: skinName }));
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (pathname.startsWith("/img-proxy/")) {
    const imagePath = decodeURIComponent(pathname.replace("/img-proxy/", ""));
    const urlToFetch = `https://${imagePath}`;

    console.log(`[IMG-PROXY] Fetching: ${urlToFetch}`);

    https.get(urlToFetch, (targetRes) => {
      const contentType = targetRes.headers["content-type"] || "image/jpeg";
      res.writeHead(targetRes.statusCode || 200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400"
      });
      targetRes.pipe(res);
    }).on("error", (err) => {
      console.error("Image proxy error:", err.message);
      res.writeHead(500);
      res.end();
    });
    return;
  }

  if (pathname === "/api/history") {
    const skinName = parsedUrl.query.name;
    if (!skinName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "name parameter required" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(priceHistory[skinName] || []));
    return;
  }

  if (pathname === "/api/stats") {
    const skinName = parsedUrl.query.name;
    if (!skinName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "name parameter required" }));
      return;
    }
    const history = priceHistory[skinName] || [];
    const stats = {
      name: skinName,
      count: history.length,
      min: history.length ? Math.min(...history.map(h => h.price)) : null,
      max: history.length ? Math.max(...history.map(h => h.price)) : null,
      avg: history.length ? history.reduce((a, h) => a + h.price, 0) / history.length : null,
      last: history.length ? history[history.length - 1].price : null,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("clientError", (_err, socket) => {
  try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch {}
});

const PORT = process.env.BACKEND_PORT || 3000;
server.listen(PORT, () => {
  console.log(`Rust Skin Watch server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  - GET /api/skins`);
  console.log(`  - GET /api/price?name=...`);
  console.log(`  - GET /api/history?name=...`);
  console.log(`  - GET /api/stats?name=...`);
});