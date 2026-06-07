# Site Tester

Projeto Python simples para testar se um site está respondendo corretamente por uma URL informada manualmente.

## Como usar

Execute perguntando a URL:

```bash
python site_tester.py
```

Ou informe a URL direto no comando:

```bash
python site_tester.py https://seusite.com
```

Para testar também os links encontrados na página:

```bash
python site_tester.py https://seusite.com --check-links
```

## Relatórios

Por padrão, o resultado é salvo em:

```text
reports/site-test.csv
```

Você também pode salvar em JSON:

```bash
python site_tester.py https://seusite.com --output reports/site-test.json
```

## Observação

Este projeto testa disponibilidade, status HTTP, tempo de resposta, título da página e links. Ele não automatiza tentativas de login, senhas ou captcha.

## Teste seguro de login

Use somente com uma conta de teste do seu próprio site. O script envia uma única tentativa de login e valida se um texto esperado aparece após autenticar.

```bash
python site_tester.py https://seusite.com \
  --login-url https://seusite.com/login \
  --username usuario_teste \
  --password senha_teste \
  --username-field email \
  --password-field password \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta"
```

O teste de login não faz força bruta, não usa lista de senhas e não tenta burlar captcha.

### Digitar uma conta sem arquivo

```bash
python site_tester.py https://seusite.com \
  --login-url https://seusite.com/login \
  --ask-credentials \
  --username-field username \
  --password-field password \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta"
```

A senha digitada nesse modo não aparece no terminal e não é salva no relatório.

### Várias contas de teste

Crie um arquivo `contas-teste.txt` com contas conhecidas do seu ambiente de teste:

```text
usuario1:senha1
usuario2:senha2
```

Execute:

```bash
python site_tester.py https://seusite.com \
  --login-url https://seusite.com/login \
  --credentials-file contas-teste.txt \
  --username-field email \
  --password-field password \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta" \
  --max-login-attempts 20 \
  --login-delay 1
```

Tambem aceita CSV com cabeçalhos `username,password`.

## Teste com Selenium

Use quando o login precisa de navegador real com JavaScript e cookies.

Instale a dependencia:

```bash
python -m pip install -r requirements.txt
```

Execute com uma conta de teste:

```bash
python selenium_login_smoke.py \
  --url https://seusite.com/login \
  --ask-credentials \
  --username-selector 'input[name="username"]' \
  --password-selector 'input[name="password"]' \
  --submit-selector 'button[type="submit"]' \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta" \
  --browser chrome
```

Se houver uma etapa humana, como 2FA ou captcha, use `--manual-wait`. O script nao resolve captcha nem tenta burlar protecoes.

Se preencher os campos, mas nao clicar, teste outro modo de envio:

```bash
python selenium_login_smoke.py \
  --url https://seusite.com/login \
  --ask-credentials \
  --username-selector '#login-page-userid' \
  --password-selector 'input[type="password"]' \
  --submit-selector '#login-button' \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta" \
  --submit-mode enter \
  --keep-open
```

Opcoes de `--submit-mode`: `click`, `js` ou `enter`.

Se um banner de cookies cobrir o botao, use `--pre-click-selector` com o seletor do botao de aceitar:

```bash
python selenium_login_smoke.py \
  --url https://seusite.com/login \
  --ask-credentials \
  --username-selector '#login-page-userid' \
  --password-selector 'input[type="password"]' \
  --submit-selector '#login-button' \
  --pre-click-selector '.cookie-consent-container button' \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta"
```

## Teste com Node.js e Playwright

Instale as dependencias:

```bash
npm install
npx playwright install chromium
```

Execute:

```bash
npm run login -- \
  --url https://seusite.com/login \
  --ask-credentials \
  --username-selector '#login-page-userid' \
  --password-selector 'input[type="password"]' \
  --submit-selector '#login-button' \
  --pre-click-selector '.cookie-consent-container button' \
  --success-text "Minha conta" \
  --failure-text "Senha incorreta" \
  --submit-mode click \
  --timeout 60000 \
  --keep-open
```

Se o login abrir nova aba ou janela, adicione:

```bash
--wait-for-popup
```

Se o clique normal falhar, teste `--submit-mode js` ou `--submit-mode enter`.
