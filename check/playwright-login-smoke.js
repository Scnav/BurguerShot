import { chromium, firefox, webkit } from "playwright";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_TIMEOUT = 30000;

function parseArgs(argv) {
  const args = {
    browser: "chromium",
    timeout: DEFAULT_TIMEOUT,
    usernameSelector: 'input[name="username"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: 'button[type="submit"]',
    preClickSelector: "",
    successText: "",
    failureText: "",
    submitMode: "click",
    manualWait: false,
    keepOpen: false,
    waitForPopup: false,
    headless: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const booleanFlags = new Set(["ask-credentials", "manual-wait", "keep-open", "wait-for-popup", "headless"]);

    if (booleanFlags.has(key)) {
      args[toCamelCase(key)] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Valor ausente para --${key}`);
    }

    args[toCamelCase(key)] = value;
    index += 1;
  }

  args.timeout = Number(args.timeout);
  if (!Number.isFinite(args.timeout) || args.timeout < 1000) {
    throw new Error("--timeout precisa ser um numero em milissegundos, ex: 60000");
  }

  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp() {
  console.log(`
Uso:
  npm run login -- --url URL --ask-credentials --success-text TEXTO [opcoes]

Opcoes:
  --url URL                         URL da pagina de login
  --ask-credentials                 Pergunta usuario e senha no terminal
  --username USER                   Usuario de teste
  --password PASS                   Senha de teste
  --username-selector SELECTOR      CSS do campo usuario
  --password-selector SELECTOR      CSS do campo senha
  --submit-selector SELECTOR        CSS do botao entrar
  --pre-click-selector SELECTOR     CSS clicado antes, como aceitar cookies
  --success-text TEXTO              Texto esperado apos login valido
  --failure-text TEXTO              Texto que indica login invalido
  --submit-mode click|js|enter      Metodo de envio
  --wait-for-popup                  Aguarda nova aba/janela apos clicar
  --manual-wait                     Pausa antes de enviar
  --keep-open                       Mantem navegador aberto no final
  --browser chromium|firefox|webkit Navegador
  --timeout MS                      Timeout em milissegundos
  --headless                        Executa sem janela
`);
}

async function askCredentials(args) {
  if (!args.askCredentials) {
    return {
      username: args.username || "",
      password: args.password || ""
    };
  }

  const rl = readline.createInterface({ input, output });
  const username = (await rl.question("Usuario de teste: ")).trim();
  const password = await rl.question("Senha de teste: ", { hideEchoBack: true });
  rl.close();
  return { username, password };
}

function getBrowser(browserName) {
  if (browserName === "chromium") {
    return chromium;
  }

  if (browserName === "firefox") {
    return firefox;
  }

  if (browserName === "webkit") {
    return webkit;
  }

  throw new Error("Use --browser chromium, firefox ou webkit");
}

async function clickIfPresent(page, selector, timeout) {
  if (!selector) {
    return;
  }

  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: "visible", timeout: Math.min(timeout, 8000) });
    await locator.click({ timeout: Math.min(timeout, 8000), force: true });
    console.log(`[INFO] Clique pre-login executado: ${selector}`);
  } catch {
    console.log("[INFO] Elemento pre-login nao apareceu; continuando.");
  }
}

async function submitLogin(page, args) {
  if (args.submitMode === "enter") {
    await page.locator(args.passwordSelector).press("Enter");
    return null;
  }

  const submit = page.locator(args.submitSelector).first();
  await submit.scrollIntoViewIfNeeded();

  if (args.waitForPopup) {
    const popupPromise = page.waitForEvent("popup", { timeout: args.timeout }).catch(() => null);

    if (args.submitMode === "js") {
      await submit.evaluate((element) => element.click());
    } else {
      await submit.click();
    }

    return popupPromise;
  }

  if (args.submitMode === "js") {
    await submit.evaluate((element) => element.click());
    return null;
  }

  await submit.click();
  return null;
}

async function waitForResult(page, popupPromise, args) {
  const activePage = popupPromise ? (await popupPromise) || page : page;
  await activePage.waitForLoadState("domcontentloaded", { timeout: args.timeout }).catch(() => {});

  await activePage.waitForFunction(
    ({ successText, failureText }) => {
      const body = document.body?.innerText || "";
      return body.includes(successText) || (failureText && body.includes(failureText));
    },
    { successText: args.successText, failureText: args.failureText },
    { timeout: args.timeout }
  );

  const bodyText = await activePage.locator("body").innerText({ timeout: args.timeout });

  if (args.failureText && bodyText.includes(args.failureText)) {
    console.log("[FALHOU] Texto de falha encontrado.");
    return 1;
  }

  if (bodyText.includes(args.successText)) {
    console.log("[OK] Login validado pelo texto de sucesso.");
    return 0;
  }

  console.log("[FALHOU] Nenhum texto esperado foi encontrado.");
  return 1;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return 0;
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    throw new Error("Informe --url");
  }

  if (!args.successText) {
    throw new Error("Informe --success-text");
  }

  if (!["click", "js", "enter"].includes(args.submitMode)) {
    throw new Error("Use --submit-mode click, js ou enter");
  }

  const { username, password } = await askCredentials(args);
  if (!username || !password) {
    throw new Error("Informe --ask-credentials ou --username e --password");
  }

  const browserType = getBrowser(args.browser);
  const browser = await browserType.launch({ headless: args.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(args.timeout);

  try {
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: args.timeout });
    await clickIfPresent(page, args.preClickSelector, args.timeout);

    await page.locator(args.usernameSelector).fill(username);
    await page.locator(args.passwordSelector).fill(password);

    if (args.manualWait) {
      const rl = readline.createInterface({ input, output });
      await rl.question("Resolva qualquer etapa manual no navegador e pressione Enter...");
      rl.close();
    }

    const popupPromise = await submitLogin(page, args);
    const exitCode = await waitForResult(page, popupPromise, args);

    if (args.keepOpen) {
      const rl = readline.createInterface({ input, output });
      await rl.question("Pressione Enter para fechar o navegador...");
      rl.close();
    }

    return exitCode;
  } finally {
    await browser.close();
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`[FALHOU] ${error.message}`);
    process.exitCode = 1;
  });
