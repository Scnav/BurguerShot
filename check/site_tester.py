import argparse
import csv
import getpass
import json
import ssl
import sys
import time
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


DEFAULT_TIMEOUT = 15
DEFAULT_USER_AGENT = "SiteTester/1.0"
DEFAULT_MAX_LOGIN_ATTEMPTS = 20
DEFAULT_LOGIN_DELAY = 1.0


@dataclass
class PageResult:
    url: str
    ok: bool
    status: int | None
    content_type: str
    elapsed_ms: int
    title: str
    links_found: int
    error: str


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.title = ""
        self._inside_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self._inside_title = True
            return

        if tag.lower() != "a":
            return

        for name, value in attrs:
            if name.lower() == "href" and value:
                self.links.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title:
            self.title += data.strip()


class LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.form_action = ""
        self.form_method = "post"
        self.inputs: dict[str, str] = {}
        self._inside_form = False
        self._captured_form = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {name.lower(): value or "" for name, value in attrs}

        if tag.lower() == "form" and not self._captured_form:
            self._inside_form = True
            self._captured_form = True
            self.form_action = attrs_dict.get("action", "")
            self.form_method = attrs_dict.get("method", "post").lower()
            return

        if tag.lower() != "input" or not self._inside_form:
            return

        name = attrs_dict.get("name")
        if name:
            self.inputs[name] = attrs_dict.get("value", "")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "form":
            self._inside_form = False


def normalize_url(url: str) -> str:
    clean_url = url.strip()
    if not clean_url:
        raise ValueError("URL vazia.")

    parsed = urlparse(clean_url)
    if not parsed.scheme:
        clean_url = f"https://{clean_url}"
        parsed = urlparse(clean_url)

    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Use uma URL começando com http:// ou https://.")

    if not parsed.netloc:
        raise ValueError("URL inválida.")

    return clean_url


def fetch_url(url: str, timeout: int) -> tuple[int, str, bytes]:
    request = Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    context = ssl.create_default_context()

    with urlopen(request, timeout=timeout, context=context) as response:
        status = response.getcode()
        content_type = response.headers.get("content-type", "")
        body = response.read(1_000_000)

    return status, content_type, body


def login_smoke_test(
    login_url: str,
    username: str,
    password: str,
    username_field: str,
    password_field: str,
    success_text: str,
    failure_text: str,
    timeout: int,
) -> PageResult:
    started_at = time.perf_counter()
    opener = build_opener(HTTPCookieProcessor())

    try:
        get_request = Request(login_url, headers={"User-Agent": DEFAULT_USER_AGENT})
        with opener.open(get_request, timeout=timeout) as response:
            login_page = response.read(1_000_000)
            content_type = response.headers.get("content-type", "")

        form = LoginFormParser()
        form.feed(login_page.decode("utf-8", errors="replace"))

        form_data = dict(form.inputs)
        form_data[username_field] = username
        form_data[password_field] = password

        target_url = urljoin(login_url, form.form_action or login_url)
        encoded_data = urlencode(form_data).encode("utf-8")
        post_request = Request(
            target_url,
            data=encoded_data,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

        with opener.open(post_request, timeout=timeout) as response:
            status = response.getcode()
            response_body = response.read(1_000_000).decode("utf-8", errors="replace")
            response_type = response.headers.get("content-type", content_type)

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        success_match = bool(success_text and success_text in response_body)
        failure_match = bool(failure_text and failure_text in response_body)
        ok = 200 <= status < 400 and success_match and not failure_match

        error = ""
        if failure_match:
            error = "Texto de falha encontrado na resposta."
        elif success_text and not success_match:
            error = "Texto de sucesso nao encontrado na resposta."

        return PageResult(
            url=login_url,
            ok=ok,
            status=status,
            content_type=response_type,
            elapsed_ms=elapsed_ms,
            title=f"Login smoke test: {username}",
            links_found=0,
            error=error,
        )
    except HTTPError as error:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return PageResult(
            url=login_url,
            ok=False,
            status=error.code,
            content_type=error.headers.get("content-type", ""),
            elapsed_ms=elapsed_ms,
            title=f"Login smoke test: {username}",
            links_found=0,
            error=str(error.reason),
        )
    except (URLError, TimeoutError, OSError) as error:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return PageResult(
            url=login_url,
            ok=False,
            status=None,
            content_type="",
            elapsed_ms=elapsed_ms,
            title=f"Login smoke test: {username}",
            links_found=0,
            error=str(error),
        )


def parse_html(url: str, content_type: str, body: bytes) -> tuple[str, list[str]]:
    if "html" not in content_type.lower():
        return "", []

    encoding = "utf-8"
    if "charset=" in content_type.lower():
        encoding = content_type.split("charset=", 1)[1].split(";", 1)[0].strip()

    parser = PageParser()
    parser.feed(body.decode(encoding, errors="replace"))

    links = [
        urljoin(url, link)
        for link in parser.links
        if not link.startswith(("mailto:", "tel:", "javascript:", "#"))
    ]
    return parser.title.strip(), links


def test_page(url: str, timeout: int) -> tuple[PageResult, list[str]]:
    started_at = time.perf_counter()

    try:
        status, content_type, body = fetch_url(url, timeout)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        title, links = parse_html(url, content_type, body)

        return (
            PageResult(
                url=url,
                ok=200 <= status < 400,
                status=status,
                content_type=content_type,
                elapsed_ms=elapsed_ms,
                title=title,
                links_found=len(links),
                error="",
            ),
            links,
        )
    except HTTPError as error:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return (
            PageResult(
                url=url,
                ok=False,
                status=error.code,
                content_type=error.headers.get("content-type", ""),
                elapsed_ms=elapsed_ms,
                title="",
                links_found=0,
                error=str(error.reason),
            ),
            [],
        )
    except (URLError, TimeoutError, OSError) as error:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return (
            PageResult(
                url=url,
                ok=False,
                status=None,
                content_type="",
                elapsed_ms=elapsed_ms,
                title="",
                links_found=0,
                error=str(error),
            ),
            [],
        )


def check_links(links: Iterable[str], timeout: int, limit: int) -> list[PageResult]:
    results: list[PageResult] = []

    for link in list(dict.fromkeys(links))[:limit]:
        result, _ = test_page(link, timeout)
        results.append(result)

    return results


def load_credentials_file(path: Path) -> list[tuple[str, str]]:
    credentials: list[tuple[str, str]] = []

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        sample = file.read(2048)
        file.seek(0)

        if "," in sample:
            reader = csv.DictReader(file)
            if reader.fieldnames and {"username", "password"}.issubset(set(reader.fieldnames)):
                for row in reader:
                    username = (row.get("username") or "").strip()
                    password = row.get("password") or ""
                    if username and password:
                        credentials.append((username, password))
                return credentials

        for line_number, line in enumerate(file, start=1):
            clean_line = line.strip()
            if not clean_line or clean_line.startswith("#"):
                continue

            if ":" not in clean_line:
                raise ValueError(f"Linha {line_number}: use o formato usuario:senha.")

            username, password = clean_line.split(":", 1)
            username = username.strip()
            if not username or not password:
                raise ValueError(f"Linha {line_number}: usuario ou senha vazio.")

            credentials.append((username, password))

    return credentials


def write_report(results: list[PageResult], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.suffix.lower() == ".json":
        output.write_text(
            json.dumps([asdict(result) for result in results], indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return

    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(asdict(results[0]).keys()))
        writer.writeheader()
        for result in results:
            writer.writerow(asdict(result))


def print_result(result: PageResult) -> None:
    status = result.status if result.status is not None else "sem resposta"
    state = "OK" if result.ok else "FALHOU"
    print(f"[{state}] {result.url}")
    print(f"Status: {status}")
    print(f"Tempo: {result.elapsed_ms} ms")

    if result.title:
        print(f"Título: {result.title}")

    if result.content_type:
        print(f"Tipo: {result.content_type}")

    if result.links_found:
        print(f"Links encontrados: {result.links_found}")

    if result.error:
        print(f"Erro: {result.error}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Testa se uma URL responde corretamente e gera relatório simples."
    )
    parser.add_argument("url", nargs="?", help="URL para testar. Se vazio, o programa pergunta.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Tempo limite em segundos.")
    parser.add_argument("--check-links", action="store_true", help="Também testa links encontrados na página.")
    parser.add_argument("--link-limit", type=int, default=20, help="Quantidade máxima de links testados.")
    parser.add_argument("--output", default="reports/site-test.csv", help="Arquivo .csv ou .json do relatório.")
    parser.add_argument("--login-url", help="URL do formulário de login para smoke test.")
    parser.add_argument("--username", help="Usuário da conta de teste.")
    parser.add_argument("--password", help="Senha da conta de teste. Nao e salva no relatorio.")
    parser.add_argument("--credentials-file", help="Arquivo com contas de teste no formato usuario:senha ou CSV.")
    parser.add_argument("--ask-credentials", action="store_true", help="Pergunta uma conta de teste no terminal.")
    parser.add_argument(
        "--max-login-attempts",
        type=int,
        default=DEFAULT_MAX_LOGIN_ATTEMPTS,
        help="Limite de credenciais testadas por execução.",
    )
    parser.add_argument(
        "--login-delay",
        type=float,
        default=DEFAULT_LOGIN_DELAY,
        help="Intervalo em segundos entre tentativas de login.",
    )
    parser.add_argument("--username-field", default="username", help="Nome do campo de usuário no formulário.")
    parser.add_argument("--password-field", default="password", help="Nome do campo de senha no formulário.")
    parser.add_argument("--success-text", default="", help="Texto esperado após login válido.")
    parser.add_argument("--failure-text", default="", help="Texto que indica falha de login.")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    try:
        url = normalize_url(args.url or input("Digite a URL do site: "))
    except ValueError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 2

    results: list[PageResult] = []
    page_result, links = test_page(url, args.timeout)
    results.append(page_result)
    print_result(page_result)

    if args.check_links and links:
        print("")
        print(f"Testando até {args.link_limit} links encontrados...")
        link_results = check_links(links, args.timeout, args.link_limit)
        results.extend(link_results)

        failed = sum(1 for result in link_results if not result.ok)
        print(f"Links testados: {len(link_results)}")
        print(f"Links com falha: {failed}")

    if args.login_url:
        credential_sources = sum(
            [
                bool(args.credentials_file),
                bool(args.ask_credentials),
                bool(args.username or args.password),
            ]
        )
        if credential_sources > 1:
            print("Erro: use apenas uma origem de credenciais por vez.", file=sys.stderr)
            return 2

        if credential_sources == 0:
            print(
                "Erro: use --credentials-file, --ask-credentials ou --username e --password com --login-url.",
                file=sys.stderr,
            )
            return 2

        if (args.username and not args.password) or (args.password and not args.username):
            print("Erro: use --username e --password juntos.", file=sys.stderr)
            return 2

        if not args.success_text:
            print("Erro: use --success-text para confirmar login valido.", file=sys.stderr)
            return 2

        if args.max_login_attempts < 1:
            print("Erro: --max-login-attempts precisa ser maior que zero.", file=sys.stderr)
            return 2

        if args.login_delay < 0:
            print("Erro: --login-delay nao pode ser negativo.", file=sys.stderr)
            return 2

        try:
            login_url = normalize_url(args.login_url)
        except ValueError as error:
            print(f"Erro: {error}", file=sys.stderr)
            return 2

        try:
            if args.credentials_file:
                credentials = load_credentials_file(Path(args.credentials_file))
            elif args.ask_credentials:
                typed_username = input("Usuario de teste: ").strip()
                typed_password = getpass.getpass("Senha de teste: ")
                credentials = [(typed_username, typed_password)]
            else:
                credentials = [(args.username, args.password)]
        except (OSError, ValueError) as error:
            print(f"Erro ao ler credenciais: {error}", file=sys.stderr)
            return 2

        if not credentials:
            print("Erro: nenhuma credencial de teste encontrada.", file=sys.stderr)
            return 2

        if len(credentials) > args.max_login_attempts:
            print(
                f"Erro: {len(credentials)} credenciais encontradas, limite atual e {args.max_login_attempts}.",
                file=sys.stderr,
            )
            return 2

        print("")
        print(f"Testando login com {len(credentials)} conta(s) de teste...")

        for index, (username, password) in enumerate(credentials, start=1):
            if index > 1 and args.login_delay:
                time.sleep(args.login_delay)

            login_result = login_smoke_test(
                login_url=login_url,
                username=username,
                password=password,
                username_field=args.username_field,
                password_field=args.password_field,
                success_text=args.success_text,
                failure_text=args.failure_text,
                timeout=args.timeout,
            )
            results.append(login_result)
            print("")
            print_result(login_result)

    write_report(results, Path(args.output))
    print(f"Relatório salvo em: {args.output}")

    return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
