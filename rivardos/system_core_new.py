"""
Sistema de Gerenciamento de Inventario de Skins - Nucleo Principal
Inclui: Sistema de Precos Steam, Anti-Bloqueio, Fila de Requests, Cache, Logs, Seguranca
"""
import logging
import sqlite3
import json
import re
from datetime import datetime, timedelta
import os
import time
import random
import hashlib
import html
import threading
import queue
import schedule
from urllib.parse import quote, unquote, urlparse
from pathlib import Path
from io import BytesIO
from collections import OrderedDict

import requests
from PIL import Image


# ============================================================
# EXCECOES
# ============================================================

class SteamRateLimitError(Exception):
    """Steam recusou temporariamente por excesso de requisicoes."""
    pass


class SteamTimeoutError(Exception):
    """Timeout ao conectar com a Steam API."""
    pass


class SteamBlockedError(Exception):
    """Steam bloqueou o IP temporariamente."""
    pass


class InvalidItemNameError(Exception):
    """Nome de item invalido ou vazio."""
    pass


# ============================================================
# SISTEMA DE LOGS (ETAPA 11)
# ============================================================

class LogManager:
    """Gerencia logs de todos os processos do sistema com categorias detalhadas."""

    LOG_CATEGORIES = {
        'REQUEST_FAIL': '[REQUEST_FAIL]',
        'NO_PRICE': '[NO_PRICE]',
        'STEAM_BLOCKED': '[STEAM_BLOCKED]',
        'RESPONSE_TIME': '[RESPONSE_TIME]',
        'UPDATE_DONE': '[UPDATE_DONE]',
        'STEAM_REQUEST': '[STEAM]',
        'ACTION': '[ACTION]',
        'ERROR': '[ERROR]',
        'CLICK': '[CLICK]',
        'SECURITY': '[SECURITY]',
        'CACHE': '[CACHE]',
        'QUEUE': '[QUEUE]',
        'RETRY': '[RETRY]',
    }

    def __init__(self, log_dir="logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)

        log_file = self.log_dir / f"inventario_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

        logger = logging.getLogger('inventory_system')
        logger.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s | %(levelname)-7s | %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

        fh = logging.FileHandler(log_file, encoding='utf-8')
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(formatter)

        sh = logging.StreamHandler()
        sh.setLevel(logging.INFO)
        sh.setFormatter(formatter)

        if logger.hasHandlers():
            logger.handlers.clear()

        logger.addHandler(fh)
        logger.addHandler(sh)

        self.logger = logger
        self.log_file = log_file

    def _sanitize(self, text):
        """Remove caracteres nao-ASCII para evitar erros no console."""
        try:
            s = str(text)
        except Exception:
            s = repr(text)
        return s.encode('ascii', 'ignore').decode('ascii', 'ignore')

    def _format_details(self, details):
        """Formata detalhes para log."""
        if details is None:
            return ""
        return f" | {json.dumps(details, ensure_ascii=False, default=str)}"

    def log_request_fail(self, url, status_code, error_msg, item_name=None):
        """Log de request falhou."""
        msg = f"{self.LOG_CATEGORIES['REQUEST_FAIL']} URL={url} Status={status_code} Error={error_msg}"
        if item_name:
            msg += f" Item={item_name}"
        self.logger.warning(self._sanitize(msg))

    def log_no_price(self, item_name, reason="Preco nao encontrado"):
        """Log de skin sem preco."""
        msg = f"{self.LOG_CATEGORIES['NO_PRICE']} Item={item_name} Reason={reason}"
        self.logger.warning(self._sanitize(msg))

    def log_steam_blocked(self, context="", duration=None):
        """Log de bloqueio da Steam."""
        msg = f"{self.LOG_CATEGORIES['STEAM_BLOCKED']} Bloqueio detectado"
        if context:
            msg += f" Contexto={context}"
        if duration:
            msg += f" Espera={duration}s"
        self.logger.error(self._sanitize(msg))

    def log_response_time(self, endpoint, response_time_ms, status_code=None):
        """Log de tempo de resposta."""
        msg = f"{self.LOG_CATEGORIES['RESPONSE_TIME']} Endpoint={endpoint} Time={response_time_ms:.0f}ms"
        if status_code:
            msg += f" Status={status_code}"
        self.logger.info(self._sanitize(msg))

    def log_update_done(self, item_name, old_price, new_price, source="scheduled"):
        """Log de atualizacao feita."""
        msg = (f"{self.LOG_CATEGORIES['UPDATE_DONE']} Item={item_name} "
               f"OldPrice={old_price} NewPrice={new_price} Source={source}")
        self.logger.info(self._sanitize(msg))

    def log_steam_request(self, item_name, success=True, price=None, image_url=None, response_time_ms=None):
        """Log de requisicoes ao Steam."""
        status = "SUCCESS" if success else "FAILED"
        msg = f"{self.LOG_CATEGORIES['STEAM_REQUEST']} {status} - Item: {item_name}"
        if price is not None:
            msg += f" | Price: R${price}"
        if image_url:
            msg += f" | Image: {image_url}"
        if response_time_ms is not None:
            msg += f" | Time: {response_time_ms:.0f}ms"
        self.logger.info(self._sanitize(msg))

    def log_action(self, action, details=None):
        """Log de acoes gerais."""
        msg = f"{self.LOG_CATEGORIES['ACTION']} {action}"
        if details:
            msg += self._format_details(details)
        self.logger.info(self._sanitize(msg))

    def log_error(self, error, action=None):
        """Log de erros."""
        if action:
            self.logger.error(self._sanitize(f"{self.LOG_CATEGORIES['ERROR']} {action} - {str(error)}"))
        else:
            self.logger.error(self._sanitize(f"{self.LOG_CATEGORIES['ERROR']} {str(error)}"))

    def log_click(self, button_name, params=None):
        """Log de cliques nos botoes."""
        msg = f"{self.LOG_CATEGORIES['CLICK']} {button_name}"
        if params:
            msg += self._format_details(params)
        self.logger.info(self._sanitize(msg))

    def log_cache(self, action, key, hit=False):
        """Log de operacoes de cache."""
        status = "HIT" if hit else "MISS"
        msg = f"{self.LOG_CATEGORIES['CACHE']} Action={action} Key={key} Status={status}"
        self.logger.debug(self._sanitize(msg))

    def log_queue(self, action, item_name=None, queue_size=0):
        """Log de operacoes da fila."""
        msg = f"{self.LOG_CATEGORIES['QUEUE']} Action={action}"
        if item_name:
            msg += f" Item={item_name}"
        msg += f" QueueSize={queue_size}"
        self.logger.info(self._sanitize(msg))

    def log_retry(self, item_name, attempt, max_attempts, error):
        """Log de tentativa de retry."""
        msg = (f"{self.LOG_CATEGORIES['RETRY']} Item={item_name} Attempt={attempt}/{max_attempts} "
               f"Error={str(error)[:100]}")
        self.logger.warning(self._sanitize(msg))

    def log_security(self, event, ip=None, details=None):
        """Log de eventos de seguranca."""
        msg = f"{self.LOG_CATEGORIES['SECURITY']} Event={event}"
        if ip:
            msg += f" IP={ip}"
        if details:
            msg += self._format_details(details)
        self.logger.warning(self._sanitize(msg))


# ============================================================
# SISTEMA DE CACHE DE PRECOS (ETAPA 3)
# ============================================================

class PriceCache:
    """Cache de precos em memoria com TTL para evitar chamadas redundantes a Steam."""

    def __init__(self, ttl_seconds=300, max_size=1000, log_manager=None):
        self._cache = OrderedDict()
        self._timestamps = {}
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self.log_manager = log_manager
        self._lock = threading.Lock()

    def get(self, key):
        """Obtem valor do cache. Retorna None se expirado ou nao existente."""
        with self._lock:
            if key not in self._cache:
                if self.log_manager:
                    self.log_manager.log_cache("GET", key, hit=False)
                return None

            # Verificar TTL
            now = time.time()
            if now - self._timestamps[key] > self.ttl_seconds:
                del self._cache[key]
                del self._timestamps[key]
                if self.log_manager:
                    self.log_manager.log_cache("GET", key, hit=False)
                return None

            if self.log_manager:
                self.log_manager.log_cache("GET", key, hit=True)
            return self._cache[key]

    def set(self, key, value):
        """Define valor no cache com TTL."""
        with self._lock:
            # Limpar cache se muito grande (LRU)
            if len(self._cache) >= self.max_size and key not in self._cache:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
                if oldest_key in self._timestamps:
                    del self._timestamps[oldest_key]
                if self.log_manager:
                    self.log_manager.log_cache("EVICT", oldest_key)

            self._cache[key] = value
            self._cache.move_to_end(key)
            self._timestamps[key] = time.time()

            if self.log_manager:
                self.log_manager.log_cache("SET", key)

    def invalidate(self, key):
        """Remove item especifico do cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                if key in self._timestamps:
                    del self._timestamps[key]

    def clear(self):
        """Limpa todo o cache."""
        with self._lock:
            self._cache.clear()
            self._timestamps.clear()

    @property
    def size(self):
        return len(self._cache)


# ============================================================
# SISTEMA DE FILA DE REQUESTS (ETAPA 3)
# ============================================================

class RequestQueue:
    """Fila de requests com controle de concorrência para evitar ban da Steam."""

    def __init__(self, max_concurrent=3, min_delay=2.0, max_delay=5.0, log_manager=None):
        self.queue = queue.Queue()
        self.max_concurrent = max_concurrent
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.log_manager = log_manager
        self._active_workers = 0
        self._lock = threading.Lock()
        self._results = {}
        self._errors = {}
        self._stop_event = threading.Event()
        self._worker_threads = []

    def add_item(self, item_id, item_name, callback=None):
        """Adiciona item à fila para processamento."""
        self.queue.put({'item_id': item_id, 'item_name': item_name, 'callback': callback})
        if self.log_manager:
            self.log_manager.log_queue("ADD", item_name, self.queue.qsize())

    def get_queue_size(self):
        return self.queue.qsize()

    def _worker(self):
        """Worker que processa itens da fila."""
        while not self._stop_event.is_set():
            try:
                item = self.queue.get(timeout=1)
                item_name = item.get('item_name', 'unknown')
                item_id = item.get('item_id')
                callback = item.get('callback')

                with self._lock:
                    self._active_workers += 1

                if self.log_manager:
                    self.log_manager.log_queue("PROCESS_START", item_name, self._active_workers)

                result = callback(item_id, item_name) if callback else None

                with self._lock:
                    if item_id is not None:
                        self._results[item_id] = result
                    self._active_workers -= 1

                if self.log_manager:
                    self.log_manager.log_queue("PROCESS_END", item_name, self._active_workers)

                self.queue.task_done()

                # Delay aleatorio entre requests (anti-bloqueio)
                delay = random.uniform(self.min_delay, self.max_delay)
                time.sleep(delay)

            except queue.Empty:
                continue
            except Exception as e:
                with self._lock:
                    if item_id is not None:
                        self._errors[item_id] = str(e)
                if self.log_manager:
                    self.log_manager.log_error(e, f"RequestQueue worker: {item_name}")
                try:
                    self.queue.task_done()
                except ValueError:
                    pass

    def start(self):
        """Inicia workers da fila."""
        for i in range(self.max_concurrent):
            t = threading.Thread(target=self._worker, daemon=True)
            t.start()
            self._worker_threads.append(t)
        if self.log_manager:
            self.log_manager.log_action(f"Request queue started with {self.max_concurrent} workers "
                                         f"(delay: {self.min_delay}s-{self.max_delay}s)")

    def wait_completion(self, timeout=None):
        """Aguarda conclusao de todos os itens na fila."""
        self.queue.join()

    def stop(self):
        """Para os workers da fila."""
        self._stop_event.set()
        for t in self._worker_threads:
            t.join(timeout=5)
        if self.log_manager:
            self.log_manager.log_action("Request queue stopped")

    def get_results(self):
        return dict(self._results)

    def get_errors(self):
        return dict(self._errors)

    def clear_results(self):
        self._results.clear()
        self._errors.clear()


# ============================================================
# SISTEMA ANTI-BLOQUEIO STEAM (ETAPA 10)
# ============================================================

class SteamAntiBlock:
    """Sistema anti-bloqueio com headers, retry, timeout, rate limiting por IP e cache."""

    def __init__(self, log_manager=None):
        self.log_manager = log_manager
        self._request_times = []
        self._max_requests_per_window = 15
        self._request_window = 60
        self._ban_duration = 60
        self._last_ban_time = 0
        self._is_banned = False
        self._lock = threading.Lock()

        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://steamcommunity.com/market/',
            'Origin': 'https://steamcommunity.com',
            'DNT': '1',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        }

    def _check_rate_limit(self):
        """Verifica se estamos respeitando o rate limit."""
        now = time.time()
        with self._lock:
            self._request_times = [t for t in self._request_times
                                   if now - t < self._request_window]

            if len(self._request_times) >= self._max_requests_per_window:
                wait_time = self._request_window - (now - self._request_times[0])
                if self.log_manager:
                    self.log_manager.log_steam_blocked("Rate limit atingido", wait_time)
                time.sleep(max(wait_time, 1))
                self._request_times = []

    def _check_ban(self):
        """Verifica se estamos banidos."""
        if self._is_banned:
            elapsed = time.time() - self._last_ban_time
            if elapsed < self._ban_duration:
                wait = self._ban_duration - elapsed
                if self.log_manager:
                    self.log_manager.log_steam_blocked("Ban ativo", wait)
                time.sleep(wait)
            self._is_banned = False

    def _record_request(self):
        """Registra um request para rate limiting."""
        with self._lock:
            self._request_times.append(time.time())

    def _mark_ban(self):
        """Marca ban preventivo."""
        with self._lock:
            self._is_banned = True
            self._last_ban_time = time.time()

    def make_request(self, session, url, method='GET', max_retries=3,
                     timeout=15, retry_delay=2, retry_backoff=2, params=None):
        """
        Faz request com retry automatico, timeout, e anti-bloqueio.
        """
        last_exception = None

        for attempt in range(1, max_retries + 1):
            self._check_ban()
            self._check_rate_limit()

            try:
                start_time = time.time()

                if method.upper() == 'GET':
                    response = session.get(url, params=params, timeout=timeout,
                                          headers=self.headers, allow_redirects=True)
                else:
                    response = session.post(url, params=params, timeout=timeout,
                                           headers=self.headers, allow_redirects=True)

                elapsed_ms = (time.time() - start_time) * 1000

                if self.log_manager:
                    self.log_manager.log_response_time(url, elapsed_ms, response.status_code)

                self._record_request()

                if response.status_code == 429:
                    if self.log_manager:
                        self.log_manager.log_steam_blocked(f"HTTP 429 na tentativa {attempt}")
                    self._mark_ban()
                    retry_wait = retry_delay * (retry_backoff ** (attempt - 1))
                    if attempt < max_retries:
                        time.sleep(retry_wait + random.uniform(1, 3))
                        continue
                    raise SteamRateLimitError("Steam rate limit (HTTP 429) apos multiplas tentativas")

                if response.status_code == 403 or response.status_code == 429:
                    if self.log_manager:
                        self.log_manager.log_steam_blocked(f"HTTP {response.status_code} na tentativa {attempt}")
                    self._mark_ban()
                    retry_wait = retry_delay * (retry_backoff ** (attempt - 1))
                    if attempt < max_retries:
                        time.sleep(retry_wait + random.uniform(2, 5))
                        continue

                if response.status_code == 200:
                    return response

                if self.log_manager:
                    self.log_manager.log_request_fail(
                        url, response.status_code,
                        response.text[:200] if response.text else "Sem corpo",
                        params.get('market_hash_name', '') if params else ''
                    )

                if 500 <= response.status_code < 600:
                    retry_wait = retry_delay * (retry_backoff ** (attempt - 1))
                    if attempt < max_retries:
                        time.sleep(retry_wait + random.uniform(0.5, 2))
                        continue
                    return None

                return None

            except requests.exceptions.Timeout:
                last_exception = SteamTimeoutError(f"Timeout apos {timeout}s na tentativa {attempt}")
                if self.log_manager:
                    self.log_manager.log_request_fail(url, 0, str(last_exception),
                                                     params.get('market_hash_name', '') if params else '')
                    self.log_manager.log_retry(
                        params.get('market_hash_name', '') if params else '',
                        attempt, max_retries, last_exception
                    )

            except requests.exceptions.ConnectionError as e:
                last_exception = e
                if self.log_manager:
                    self.log_manager.log_request_fail(url, 0, str(e)[:200],
                                                     params.get('market_hash_name', '') if params else '')
                    self.log_manager.log_retry(
                        params.get('market_hash_name', '') if params else '',
                        attempt, max_retries, last_exception
                    )

            except requests.exceptions.RequestException as e:
                last_exception = e
                if self.log_manager:
                    self.log_manager.log_request_fail(url, 0, str(e)[:200],
                                                     params.get('market_hash_name', '') if params else '')
                    self.log_manager.log_retry(
                        params.get('market_hash_name', '') if params else '',
                        attempt, max_retries, last_exception
                    )

            if attempt < max_retries:
                wait_time = retry_delay * (retry_backoff ** (attempt - 1)) + random.uniform(0.5, 2)
                time.sleep(wait_time)

        return None