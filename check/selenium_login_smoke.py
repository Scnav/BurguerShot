import argparse
import getpass
import sys
from dataclasses import dataclass

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as expected
from selenium.webdriver.support.ui import WebDriverWait


@dataclass
class LoginConfig:
    url: str
    username: str
    password: str
    username_selector: str
    password_selector: str
    submit_selector: str
    pre_click_selector: str
    success_text: str
    failure_text: str
    browser: str
    submit_mode: str
    timeout: int
    manual_wait: bool
    keep_open: bool


def create_driver(browser: str) -> webdriver.Chrome | webdriver.Edge | webdriver.Firefox:
    browser_name = browser.lower()

    if browser_name == "chrome":
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        return webdriver.Chrome(options=options)

    if browser_name == "edge":
        options = webdriver.EdgeOptions()
        options.add_argument("--start-maximized")
        return webdriver.Edge(options=options)

    if browser_name == "firefox":
        return webdriver.Firefox()

    raise ValueError("Use chrome, edge ou firefox.")


def run_login_test(config: LoginConfig) -> int:
    driver = create_driver(config.browser)

    try:
        wait = WebDriverWait(driver, config.timeout)
        driver.get(config.url)

        if config.pre_click_selector:
            try:
                short_wait = WebDriverWait(driver, 8)
                pre_click_element = short_wait.until(
                    expected.presence_of_element_located((By.CSS_SELECTOR, config.pre_click_selector))
                )
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", pre_click_element)
                driver.execute_script("arguments[0].click();", pre_click_element)
            except TimeoutException:
                print("[INFO] Elemento pre-click nao apareceu; continuando.")

        username_input = wait.until(
            expected.element_to_be_clickable((By.CSS_SELECTOR, config.username_selector))
        )
        password_input = wait.until(
            expected.element_to_be_clickable((By.CSS_SELECTOR, config.password_selector))
        )

        username_input.clear()
        username_input.send_keys(config.username)
        password_input.clear()
        password_input.send_keys(config.password)

        if config.manual_wait:
            input("Resolva qualquer etapa manual no navegador e pressione Enter para continuar...")

        if config.submit_mode == "enter":
            password_input.send_keys(Keys.ENTER)
        else:
            submit_button = wait.until(
                expected.presence_of_element_located((By.CSS_SELECTOR, config.submit_selector))
            )
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", submit_button)

            if config.submit_mode == "js":
                driver.execute_script("arguments[0].click();", submit_button)
            else:
                wait.until(expected.element_to_be_clickable((By.CSS_SELECTOR, config.submit_selector)))
                submit_button.click()

        wait.until(lambda active_driver: config.success_text in active_driver.page_source or (
            config.failure_text and config.failure_text in active_driver.page_source
        ))

        page_source = driver.page_source

        if config.failure_text and config.failure_text in page_source:
            print("[FALHOU] Texto de falha encontrado.")
            return 1

        if config.success_text in page_source:
            print("[OK] Login validado pelo texto de sucesso.")
            return 0

        print("[FALHOU] Nenhum texto esperado foi encontrado.")
        return 1
    except TimeoutException:
        print("[FALHOU] Tempo esgotado esperando campos, clique ou texto esperado.")
        return 1
    except WebDriverException as error:
        print(f"[FALHOU] Erro do navegador/Selenium: {error}")
        return 1
    finally:
        if config.keep_open:
            input("Pressione Enter para fechar o navegador...")
        driver.quit()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Smoke test de login com Selenium para uma conta de teste autorizada."
    )
    parser.add_argument("--url", required=True, help="URL da pagina de login.")
    parser.add_argument("--username", help="Usuario da conta de teste.")
    parser.add_argument("--password", help="Senha da conta de teste. Prefira --ask-credentials.")
    parser.add_argument("--ask-credentials", action="store_true", help="Pergunta usuario e senha no terminal.")
    parser.add_argument("--username-selector", default='input[name="username"]', help="Seletor CSS do usuario.")
    parser.add_argument("--password-selector", default='input[name="password"]', help="Seletor CSS da senha.")
    parser.add_argument("--submit-selector", default='button[type="submit"]', help="Seletor CSS do botao entrar.")
    parser.add_argument("--pre-click-selector", default="", help="Seletor CSS clicado antes do login, como aceitar cookies.")
    parser.add_argument("--success-text", required=True, help="Texto esperado apos login valido.")
    parser.add_argument("--failure-text", default="", help="Texto esperado quando o login falha.")
    parser.add_argument("--browser", default="chrome", choices=["chrome", "edge", "firefox"])
    parser.add_argument(
        "--submit-mode",
        default="click",
        choices=["click", "js", "enter"],
        help="Como enviar o formulario: click, js ou enter.",
    )
    parser.add_argument("--timeout", type=int, default=30, help="Tempo limite por etapa em segundos.")
    parser.add_argument(
        "--manual-wait",
        action="store_true",
        help="Pausa antes de enviar, para etapas humanas como captcha ou 2FA.",
    )
    parser.add_argument("--keep-open", action="store_true", help="Mantem navegador aberto ao terminar.")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.ask_credentials:
        username = input("Usuario de teste: ").strip()
        password = getpass.getpass("Senha de teste: ")
    else:
        username = args.username or ""
        password = args.password or ""

    if not username or not password:
        print("Erro: informe --ask-credentials ou --username e --password.", file=sys.stderr)
        return 2

    config = LoginConfig(
        url=args.url,
        username=username,
        password=password,
        username_selector=args.username_selector,
        password_selector=args.password_selector,
        submit_selector=args.submit_selector,
        pre_click_selector=args.pre_click_selector,
        success_text=args.success_text,
        failure_text=args.failure_text,
        browser=args.browser,
        submit_mode=args.submit_mode,
        timeout=args.timeout,
        manual_wait=args.manual_wait,
        keep_open=args.keep_open,
    )
    return run_login_test(config)


if __name__ == "__main__":
    raise SystemExit(main())
