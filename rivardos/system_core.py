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
from urllib.parse import quote, unquote, urlparse
from pathlib import Path
from io import BytesIO
import requests
import schedule
from PIL import Image


class SteamRateLimitError(Exception):
    """Steam recusou temporariamente por excesso de requisicoes."""
    pass


class SteamTimeoutError(Exception):
    """Timeout ao conectar com a Steam API."""
    pass


class LogManager:
    """Gerencia logs de todos os processos do sistema"""

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
        try:
            s = str(text)
        except Exception:
            s = repr(text)
        return ''.join(ch for ch in s if ch in '\t\n\r' or ord(ch) >= 32)

    def _format_details(self, details):
        if details is None:
            return ""
        return f" | {json.dumps(details, ensure_ascii=False, default=str)}"

    def log_action(self, action, details=None):
        msg = f"[ACTION] {action}"
        if details:
            msg += self._format_details(details)
        self.logger.info(self._sanitize(msg))

    def log_error(self, error, action=None):
        msg = f"[ERROR] {action} - {error}" if action else f"[ERROR] {error}"
        self.logger.error(self._sanitize(msg))

    def log_steam_request(self, item_name, success=True, price=None, image_url=None, reason=None, response_time_ms=None):
        status = "SUCCESS" if success else "FAILED"
        msg = f"[STEAM] {status} - Item: {item_name}"
        if price is not None:
            msg += f" | Price: R${price}"
        if image_url:
            msg += f" | Image: {image_url}"
        if reason:
            msg += f" | Reason: {reason}"
        if response_time_ms is not None:
            msg += f" | Time: {response_time_ms:.0f}ms"
        self.logger.info(self._sanitize(msg))

    def log_request_fail(self, url, status_code, error_msg, item_name=None):
        msg = f"[REQUEST_FAIL] URL={url} Status={status_code} Error={error_msg}"
        if item_name:
            msg += f" Item={item_name}"
        self.logger.warning(self._sanitize(msg))

    def log_no_price(self, item_name, reason="Preco nao encontrado"):
        msg = f"[NO_PRICE] Item={item_name} Reason={reason}"
        self.logger.warning(self._sanitize(msg))

    def log_steam_blocked(self, context="", duration=None):
        msg = "[STEAM_BLOCKED] Bloqueio detectado"
        if context:
            msg += f" Contexto={context}"
        if duration:
            msg += f" Espera={duration}s"
        self.logger.error(self._sanitize(msg))

    def log_response_time(self, endpoint, response_time_ms, status_code=None):
        msg = f"[RESPONSE_TIME] Endpoint={endpoint} Time={response_time_ms:.0f}ms"
        if status_code is not None:
            msg += f" Status={status_code}"
        self.logger.info(self._sanitize(msg))

    def log_update_done(self, item_name, old_price, new_price, source="scheduled"):
        msg = f"[UPDATE_DONE] Item={item_name} OldPrice={old_price} NewPrice={new_price} Source={source}"
        self.logger.info(self._sanitize(msg))

    def log_security(self, event, ip=None, details=None):
        msg = f"[SECURITY] Event={event}"
        if ip:
            msg += f" IP={ip}"
        if details:
            msg += self._format_details(details)
        self.logger.warning(self._sanitize(msg))

    def log_queue(self, action, item_name=None, queue_size=0):
        msg = f"[QUEUE] Action={action}"
        if item_name:
            msg += f" Item={item_name}"
        msg += f" QueueSize={queue_size}"
        self.logger.info(self._sanitize(msg))

    def log_retry(self, item_name, attempt, max_attempts, error):
        msg = f"[RETRY] Item={item_name} Attempt={attempt}/{max_attempts} Error={str(error)[:120]}"
        self.logger.warning(self._sanitize(msg))


class DatabaseManager:
    ITEM_COLUMNS = (
        "id",
        "source_row",
        "name",
        "quantity",
        "purchase_price",
        "current_price",
        "image_filename",
        "steam_item_id",
        "steam_market_url",
        "steam_sale_fee",
        "last_price_update",
        "created_at",
    )
    RUST_ITEM_COLUMNS = ITEM_COLUMNS

    def __init__(self, db_name="inventario.db", log_manager=None):
        self.db_path = Path(db_name)
        self.log_manager = log_manager
        self.create_tables()

    def get_connection(self):
        return sqlite3.connect(self.db_path)

    def create_tables(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_row INTEGER,
                name TEXT NOT NULL,
                quantity REAL DEFAULT 0,
                purchase_price REAL DEFAULT 0,
                current_price REAL DEFAULT 0,
                image_filename TEXT,
                steam_item_id TEXT,
                steam_market_url TEXT,
                steam_sale_fee REAL DEFAULT 0,
                last_price_update TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                price REAL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items (id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scheduled_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                next_update TIMESTAMP,
                update_frequency TEXT DEFAULT 'daily',
                FOREIGN KEY (item_id) REFERENCES items (id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rust_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_row INTEGER,
                name TEXT NOT NULL,
                quantity REAL DEFAULT 0,
                purchase_price REAL DEFAULT 0,
                current_price REAL DEFAULT 0,
                image_filename TEXT,
                steam_item_id TEXT,
                steam_market_url TEXT,
                steam_sale_fee REAL DEFAULT 0,
                last_price_update TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        if self.log_manager:
            self.log_manager.log_action("Database tables created")

    def calculate_steam_sale_fee(self, quantity=0, current_price=0):
        return float(quantity or 0) * float(current_price or 0) * 0.15

    def add_item(self, name, quantity=0, purchase_price=0, current_price=0, image_filename=None, steam_market_url=None, source_row=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        steam_sale_fee = self.calculate_steam_sale_fee(quantity, current_price)
        try:
            cursor.execute('''
                INSERT INTO items (
                    source_row, name, quantity, purchase_price, current_price,
                    image_filename, steam_item_id, steam_market_url, steam_sale_fee
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (source_row, name, quantity, purchase_price, current_price, image_filename, None, steam_market_url, steam_sale_fee))
            conn.commit()
            item_id = cursor.lastrowid
            if self.log_manager:
                self.log_manager.log_action("Item added", {"item_id": item_id, "name": name, "quantity": quantity})
            return item_id
        except sqlite3.IntegrityError as e:
            if self.log_manager:
                self.log_manager.log_error(str(e), "add_item")
            return None
        finally:
            conn.close()

    def get_item(self, item_id=None, name=None, source_row=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        if item_id is not None:
            cursor.execute(f"SELECT {', '.join(self.ITEM_COLUMNS)} FROM items WHERE id = ?", (item_id,))
        elif name is not None:
            if source_row is not None:
                cursor.execute(f"SELECT {', '.join(self.ITEM_COLUMNS)} FROM items WHERE name = ? AND source_row = ?", (name, source_row))
            else:
                cursor.execute(f"SELECT {', '.join(self.ITEM_COLUMNS)} FROM items WHERE name = ? ORDER BY source_row, id", (name,))
        else:
            conn.close()
            return None
        result = cursor.fetchone()
        conn.close()
        return result

    def update_item(self, item_id, **kwargs):
        conn = self.get_connection()
        cursor = conn.cursor()
        allowed_fields = ['source_row', 'name', 'quantity', 'purchase_price', 'current_price', 'image_filename', 'steam_item_id', 'steam_market_url', 'steam_sale_fee', 'last_price_update']
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
        if 'steam_sale_fee' not in updates and ('quantity' in updates or 'current_price' in updates):
            cursor.execute('SELECT quantity, current_price FROM items WHERE id = ?', (item_id,))
            current_values = cursor.fetchone()
            if current_values:
                quantity = updates.get('quantity', current_values[0])
                current_price = updates.get('current_price', current_values[1])
                updates['steam_sale_fee'] = self.calculate_steam_sale_fee(quantity or 0, current_price or 0)
        if not updates:
            conn.close()
            return False
        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values()) + [item_id]
        cursor.execute(f'UPDATE items SET {set_clause} WHERE id = ?', values)
        updated = cursor.rowcount > 0
        conn.commit()
        conn.close()
        if self.log_manager:
            if updated:
                self.log_manager.log_action("Item updated", {"item_id": item_id, "updates": updates})
            else:
                self.log_manager.log_error(f"Item not found: {item_id}", "update_item")
        return updated

    def delete_item(self, item_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM price_history WHERE item_id = ?", (item_id,))
            cursor.execute("DELETE FROM scheduled_updates WHERE item_id = ?", (item_id,))
            cursor.execute("DELETE FROM items WHERE id = ?", (item_id,))
            conn.commit()
            deleted = cursor.rowcount
        finally:
            conn.close()
        if self.log_manager:
            self.log_manager.log_action("Item deleted", {"item_id": item_id, "deleted": deleted})
        return deleted > 0

    def get_all_items(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SELECT {', '.join(self.ITEM_COLUMNS)} FROM items")
        results = cursor.fetchall()
        conn.close()
        return results

    def add_rust_item(self, name, quantity=0, purchase_price=0, current_price=0, image_filename=None, steam_item_id=None, steam_market_url=None, source_row=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        steam_sale_fee = self.calculate_steam_sale_fee(quantity, current_price)
        try:
            cursor.execute('''
                INSERT INTO rust_items (
                    source_row, name, quantity, purchase_price, current_price,
                    image_filename, steam_item_id, steam_market_url, steam_sale_fee
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (source_row, name, quantity, purchase_price, current_price, image_filename, steam_item_id, steam_market_url, steam_sale_fee))
            conn.commit()
            item_id = cursor.lastrowid
            if self.log_manager:
                self.log_manager.log_action("Rust item added", {"item_id": item_id, "name": name, "quantity": quantity})
            return item_id
        except sqlite3.IntegrityError as e:
            if self.log_manager:
                self.log_manager.log_error(str(e), "add_rust_item")
            return None
        finally:
            conn.close()

    def get_rust_item(self, item_id=None, name=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        if item_id is not None:
            cursor.execute(f"SELECT {', '.join(self.RUST_ITEM_COLUMNS)} FROM rust_items WHERE id = ?", (item_id,))
        elif name is not None:
            cursor.execute(f"SELECT {', '.join(self.RUST_ITEM_COLUMNS)} FROM rust_items WHERE name = ? ORDER BY source_row, id", (name,))
        else:
            conn.close()
            return None
        result = cursor.fetchone()
        conn.close()
        return result

    def update_rust_item(self, item_id, **kwargs):
        conn = self.get_connection()
        cursor = conn.cursor()
        allowed_fields = ['source_row', 'name', 'quantity', 'purchase_price', 'current_price', 'image_filename', 'steam_item_id', 'steam_market_url', 'steam_sale_fee', 'last_price_update']
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
        if 'steam_sale_fee' not in updates and ('quantity' in updates or 'current_price' in updates):
            cursor.execute('SELECT quantity, current_price FROM rust_items WHERE id = ?', (item_id,))
            current_values = cursor.fetchone()
            if current_values:
                quantity = updates.get('quantity', current_values[0])
                current_price = updates.get('current_price', current_values[1])
                updates['steam_sale_fee'] = self.calculate_steam_sale_fee(quantity or 0, current_price or 0)
        if not updates:
            conn.close()
            return False
        set_clause = ', '.join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [item_id]
        cursor.execute(f'UPDATE rust_items SET {set_clause} WHERE id = ?', values)
        updated = cursor.rowcount > 0
        conn.commit()
        conn.close()
        if self.log_manager:
            if updated:
                self.log_manager.log_action("Rust item updated", {"item_id": item_id, "updates": updates})
            else:
                self.log_manager.log_error(f"Rust item not found: {item_id}", "update_rust_item")
        return updated

    def delete_rust_item(self, item_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM rust_items WHERE id = ?", (item_id,))
            conn.commit()
            deleted = cursor.rowcount
        finally:
            conn.close()
        if self.log_manager:
            self.log_manager.log_action("Rust item deleted", {"item_id": item_id, "deleted": deleted})
        return deleted > 0

    def get_all_rust_items(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SELECT {', '.join(self.RUST_ITEM_COLUMNS)} FROM rust_items")
        results = cursor.fetchall()
        conn.close()
        return results

    def clear_rust_items(self):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rust_items")
        conn.commit()
        deleted = cursor.rowcount
        conn.close()
        if self.log_manager:
            self.log_manager.log_action("Rust items cleared", {"deleted": deleted})
        return deleted


class SteamManager:
    STEAM_MARKET_URL = "https://steamcommunity.com/market/priceoverview/"
    STEAM_ITEM_URL = "https://steamcommunity.com/market/search/render/"
    STEAM_PRICE_HISTORY_URL = "https://steamcommunity.com/market/pricehistory/"
    STEAM_BRL_CURRENCY_ID = 7
    CS2_APP_ID = 730
    RUST_APP_ID = 252490

    EXCHANGE_RATE_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL"

    NAME_MAPPING = {
        "CÃ¡psula de Adesivos das Lendas do Estocolmo 2021": "Stockholm 2021 Legends Sticker Capsule",
        "CÃ¡psula de AutÃ³grafos dos CampeÃµes do AntuÃ©rpia 2022": "Antwerp 2022 Champions Autograph Capsule",
        "Caixa CS20": "CS20 Case",
        "Caixa do Ataque OfÃ­dico": "Snakebite Case",
        "Caixa do Coice": "Recoil Case",
        "Caixa dos Sonhos e Pesadelos": "Dreams & Nightmares Case",
        "Caixa da RevoluÃ§Ã£o": "Revolution Case",
        "Terminal GÃªnese Lacrado": "Sealed Graffiti | Genesis"
    }

    def __init__(self, cache_dir="steam_cache", log_manager=None):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.log_manager = log_manager
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://steamcommunity.com/',
            'Origin': 'https://steamcommunity.com',
        })
        self.semaphore = threading.Semaphore(int(os.environ.get('STEAM_MAX_CONCURRENCY', 2)))
        self._request_queue = []
        self._queue_lock = threading.Lock()
        self._cache_lock = threading.Lock()
        self.delay_between_requests = float(os.environ.get('STEAM_REQUEST_DELAY', 2.0))
        self.max_retries = int(os.environ.get('STEAM_REQUEST_RETRIES', 3))
        self.request_timeout = int(os.environ.get('STEAM_REQUEST_TIMEOUT', 10))
        self.cache_ttl = int(os.environ.get('STEAM_CACHE_TTL', 1800))
        self.cache_file = self.cache_dir / 'steam_api_cache.json'
        self.api_cache = self._load_cache()
        
        # Cache para cotação USD/BRL
        self.exchange_rate_cache = None
        self.exchange_rate_timestamp = 0
        self.exchange_rate_ttl = 3600  # 1 hora

    def _sanitize_item_name(self, value):
        return re.sub(r'[^\w\s\-\.,\(\)\[\]]+', '', str(value or '')).strip()

    def _load_cache(self):
        if not self.cache_file.exists():
            return {}
        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception as e:
            if self.log_manager:
                self.log_manager.log_error(str(e), '_load_cache')
            return {}

    def _save_cache(self):
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.api_cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            if self.log_manager:
                self.log_manager.log_error(str(e), '_save_cache')

    def get_exchange_rate(self):
        """Busca a cotação USD para BRL em tempo real"""
        now = time.time()
        if self.exchange_rate_cache and (now - self.exchange_rate_timestamp) < self.exchange_rate_ttl:
            return self.exchange_rate_cache
        
        try:
            response = self.session.get(self.EXCHANGE_RATE_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'USDBRL' in data:
                rate = float(data['USDBRL']['bid'])  # Usar 'bid' (compra) para conversão
                self.exchange_rate_cache = rate
                self.exchange_rate_timestamp = now
                if self.log_manager:
                    self.log_manager.log_action(f'Exchange rate updated: USD 1 = BRL {rate:.4f}')
                return rate
            else:
                if self.log_manager:
                    self.log_manager.log_error('Invalid exchange rate response', 'get_exchange_rate')
                return 5.80  # Fallback
        except Exception as e:
            if self.log_manager:
                self.log_manager.log_error(f'Failed to get exchange rate: {str(e)}', 'get_exchange_rate')
            return 5.80  # Fallback

    def _cache_key(self, url, params):
        key = f"{url}|{json.dumps(params or {}, sort_keys=True, default=str)}"
        return hashlib.sha256(key.encode('utf-8')).hexdigest()

    def _cache_get(self, url, params):
        cache_key = self._cache_key(url, params)
        with self._cache_lock:
            entry = self.api_cache.get(cache_key)
            if not entry:
                return None
            if time.time() - entry.get('created_at', 0) > self.cache_ttl:
                self.api_cache.pop(cache_key, None)
                self._save_cache()
                return None
            if self.log_manager:
                self.log_manager.log_action('Cache hit', {'key': cache_key, 'url': url})
            return entry.get('data')

    def _cache_set(self, url, params, data):
        cache_key = self._cache_key(url, params)
        with self._cache_lock:
            self.api_cache[cache_key] = {'created_at': time.time(), 'data': data}
            self._save_cache()
        if self.log_manager:
            self.log_manager.log_action('Cache set', {'key': cache_key, 'url': url})

    def _enqueue(self, label):
        with self._queue_lock:
            self._request_queue.append((label, time.time()))
            if self.log_manager:
                self.log_manager.log_queue('ENQUEUE', label, len(self._request_queue))

    def _dequeue(self, label):
        with self._queue_lock:
            self._request_queue = [item for item in self._request_queue if item[0] != label]
            if self.log_manager:
                self.log_manager.log_queue('DEQUEUE', label, len(self._request_queue))

    def _perform_request(self, url, params=None, timeout=None, retries=None):
        params = params or {}
        timeout = timeout or self.request_timeout
        retries = retries or self.max_retries

        cached = self._cache_get(url, params)
        if cached is not None:
            return cached

        label = f"{url}?{params}"
        self._enqueue(label)
        try:
            with self.semaphore:
                for attempt in range(1, retries + 1):
                    try:
                        start = time.time()
                        response = self.session.get(url, params=params, timeout=timeout)
                        elapsed = time.time() - start
                        if self.log_manager:
                            self.log_manager.log_response_time(url, elapsed * 1000, response.status_code)

                        if response.status_code == 429:
                            if self.log_manager:
                                self.log_manager.log_steam_blocked('429 rate limit', attempt)
                            if attempt < retries:
                                time.sleep(self.delay_between_requests * attempt)
                                continue
                            raise SteamRateLimitError('Steam bloqueou temporariamente por excesso de requisicoes')

                        response.raise_for_status()
                        content_type = response.headers.get('Content-Type', '')
                        data = response.json() if 'application/json' in content_type else response.text
                        self._cache_set(url, params, data)
                        return data
                    except SteamRateLimitError:
                        raise
                    except requests.exceptions.RequestException as exc:
                        if self.log_manager:
                            self.log_manager.log_request_fail(url, getattr(exc, 'response', None).status_code if getattr(exc, 'response', None) else 0, str(exc)[:200], params.get('market_hash_name', ''))
                            self.log_manager.log_retry(params.get('market_hash_name', ''), attempt, retries, exc)
                        if attempt < retries:
                            wait = self.delay_between_requests * attempt + random.uniform(0.5, 1.5)
                            time.sleep(wait)
                            continue
                        return None
                    except ValueError as exc:
                        if self.log_manager:
                            self.log_manager.log_error(str(exc), '_perform_request JSON parse')
                        return None
                    finally:
                        if attempt < retries:
                            time.sleep(self.delay_between_requests)
        finally:
            self._dequeue(label)
        return None

    def _normalize_market_name(self, value):
        return re.sub(r'\s+', ' ', str(value or '').strip().casefold())

    def search_item_on_steam(self, item_name, app_id=CS2_APP_ID):
        if not item_name or not str(item_name).strip():
            raise ValueError('Item name is required')
        search_name = str(item_name).strip()
        mapped = self.NAME_MAPPING.get(search_name)
        if mapped:
            search_name = mapped
            if self.log_manager:
                self.log_manager.log_action('Name mapped for Steam search', {'original': item_name, 'mapped': search_name})

        params = {
            'query': search_name,
            'start': 0,
            'count': 1,
            'search_descriptions': 0,
            'sort_column': 'name',
            'sort_dir': 'asc',
            'appid': app_id,
        }
        data = self._perform_request(self.STEAM_ITEM_URL, params=params)
        if not isinstance(data, dict):
            if self.log_manager:
                self.log_manager.log_steam_request(item_name, False, reason='request_failed')
            return None
        if data.get('total_count', 0) <= 0:
            if self.log_manager:
                self.log_manager.log_steam_request(item_name, False, reason='not_found')
            return None

        results_html = data.get('results_html', '')
        result_rows = re.findall(r'(<a\s+class=["\']market_listing_row_link["\'][\s\S]*?</a>)', results_html)
        selected_html = None
        result_name = None
        for result_row in result_rows:
            name_match = re.search(r'market_listing_item_name["\'][^>]*>(.*?)<', result_row)
            row_name = html.unescape(name_match.group(1).strip()) if name_match else ''
            if self._normalize_market_name(row_name) == self._normalize_market_name(search_name):
                selected_html = result_row
                result_name = row_name
                break
        if selected_html is None:
            name_match = re.search(r'market_listing_item_name["\'][^>]*>(.*?)<', results_html)
            result_name = html.unescape(name_match.group(1).strip()) if name_match else search_name
            selected_html = results_html

        if self._normalize_market_name(result_name) != self._normalize_market_name(search_name):
            if self.log_manager:
                self.log_manager.log_error(f"Steam search returned different item: expected='{search_name}', got='{result_name}'", f"search_item_on_steam: {item_name}")
            return None

        image_url = None
        match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', selected_html)
        if not match:
            match = re.search(r'data-image-url=["\']([^"\']+)["\']', selected_html)
        if not match:
            match = re.search(r'background-image:\s*url\((?:"|\')?([^"\')]+)(?:"|\')?\)', selected_html)
        if match:
            image_url = match.group(1)
            if image_url.startswith('//'):
                image_url = 'https:' + image_url
            elif image_url.startswith('/'):
                image_url = 'https://steamcommunity.com' + image_url
            image_url = re.sub(r'/\d+fx\d+f$', '/360fx360f', image_url)

        steam_id = quote(result_name or search_name, safe='')
        market_url = f"https://steamcommunity.com/market/listings/{app_id}/{steam_id}"
        if self.log_manager:
            self.log_manager.log_steam_request(item_name, True, image_url=image_url or market_url)
        return {
            'steam_id': steam_id,
            'image_url': image_url,
            'market_url': market_url,
            'name': item_name,
            'search_name': search_name,
            'total_results': data.get('total_count', 0),
        }

    def _parse_market_price(self, price_str, currency_id=None):
        price_text = str(price_str or '').strip()
        is_brl = 'R$' in price_text or currency_id == self.STEAM_BRL_CURRENCY_ID
        is_usd = not is_brl and ('$' in price_text or 'USD' in price_text.upper())

        cleaned = (
            price_text
            .replace('R$', '')
            .replace('$', '')
            .replace('USD', '')
            .strip()
        )
        cleaned = re.sub(r'[^\d,.-]', '', cleaned)
        if ',' in cleaned and '.' in cleaned:
            cleaned = cleaned.replace('.', '').replace(',', '.')
        else:
            cleaned = cleaned.replace(',', '.')

        price = float(cleaned)
        if is_usd:
            usd_to_brl = self.get_exchange_rate()
            price *= usd_to_brl
            if self.log_manager:
                self.log_manager.log_action(
                    f'Converted USD to BRL: {price_text} -> R$ {price:.2f}',
                    {'original': price_text, 'converted': price}
                )
        return price

    def get_item_price(self, steam_id, currency_id=STEAM_BRL_CURRENCY_ID, app_id=CS2_APP_ID):
        if not steam_id:
            return None
        market_hash_name = unquote(str(steam_id))
        params = {
            'appid': app_id,
            'market_hash_name': market_hash_name,
            'currency': currency_id,
        }
        data = self._perform_request(self.STEAM_MARKET_URL, params=params)
        if not isinstance(data, dict):
            if self.log_manager:
                self.log_manager.log_steam_request(market_hash_name, False, reason='request_failed')
            return None
        if not data.get('success'):
            if self.log_manager:
                self.log_manager.log_no_price(market_hash_name)
            return None
        price_str = (data.get('lowest_price') or data.get('median_price') or '').strip()
        if not price_str:
            if self.log_manager:
                self.log_manager.log_no_price(market_hash_name)
            return None
        
        try:
            price = self._parse_market_price(price_str, currency_id)
            if self.log_manager:
                self.log_manager.log_steam_request(market_hash_name, True, price=price)
            return price
        except ValueError:
            if self.log_manager:
                self.log_manager.log_error(f"Failed to parse price '{price_str}'", f"get_item_price: {market_hash_name}")
            return None

    def get_last_sale_price(self, steam_id, currency_id=STEAM_BRL_CURRENCY_ID, app_id=CS2_APP_ID):
        if not steam_id:
            return None
        market_hash_name = unquote(str(steam_id))
        params = {
            'appid': app_id,
            'market_hash_name': market_hash_name,
            'currency': currency_id,
        }
        data = self._perform_request(self.STEAM_PRICE_HISTORY_URL, params=params)
        if not isinstance(data, dict):
            return None
        prices = data.get('prices')
        if not prices or not isinstance(prices, list):
            return None
        last_sale = prices[-1]
        if len(last_sale) < 2:
            return None
        try:
            return float(last_sale[1])
        except (ValueError, TypeError):
            return None

    def download_image(self, image_url, item_name):
        if not image_url or not item_name:
            return None
        try:
            response = self.session.get(image_url, timeout=self.request_timeout)
            response.raise_for_status()
            safe_name = "".join(c for c in str(item_name) if c.isalnum() or c in (' ', '_', '-')).strip()[:80]
            item_hash = hashlib.sha1(str(item_name).encode('utf-8')).hexdigest()[:10]
            filename = f"{safe_name}_{item_hash}_{int(time.time())}.png"
            filepath = self.cache_dir / filename
            img = Image.open(BytesIO(response.content))
            img.save(filepath)
            if self.log_manager:
                self.log_manager.log_action('Image downloaded', {'item_name': item_name, 'filename': filename})
            return filename
        except Exception as e:
            if self.log_manager:
                self.log_manager.log_error(str(e), f"download_image: {item_name}")
            return None

    def get_image_path(self, filename):
        if filename:
            return self.cache_dir / filename
        return None

    def is_item_data_mismatched(self, item_name, steam_id=None, steam_market_url=None):
        expected = self._normalize_market_name(self.NAME_MAPPING.get(item_name, item_name))
        if steam_id:
            decoded = unquote(str(steam_id))
            if self._normalize_market_name(decoded) != expected:
                return True
        if steam_market_url:
            market_path = urlparse(str(steam_market_url)).path
            marker = f'/market/listings/{self.CS2_APP_ID}/'
            url_id = market_path.split(marker, 1)[-1] if marker in market_path else market_path.rsplit('/', 1)[-1]
            if url_id and self._normalize_market_name(unquote(url_id)) != expected:
                return True
        return False


class SchedulerManager:
    def __init__(self, db_manager, steam_manager, log_manager=None):
        self.db = db_manager
        self.steam = steam_manager
        self.log_manager = log_manager
        self.running = False

    def schedule_daily_update(self, hour=10, minute=0):
        time_str = f"{hour:02d}:{minute:02d}"
        schedule.every().day.at(time_str).do(self.update_all_prices)
        if self.log_manager:
            self.log_manager.log_action('Daily price update scheduled', {'time': time_str})

    def update_all_prices(self):
        if self.log_manager:
            self.log_manager.log_action('Starting scheduled price update')
        items = self.db.get_all_items()
        now = datetime.now().isoformat()
        for item in items:
            item_id, source_row, name, quantity, purchase_price, current_price, image_filename, steam_item_id, steam_market_url, steam_sale_fee, last_price_update, created_at = item
            if steam_item_id:
                new_price = self.steam.get_item_price(steam_item_id)
                if new_price is not None:
                    conn = self.db.get_connection()
                    cursor = conn.cursor()
                    cursor.execute('INSERT INTO price_history (item_id, price) VALUES (?, ?)', (item_id, new_price))
                    conn.commit()
                    conn.close()
                    self.db.update_item(item_id, current_price=new_price, last_price_update=now)
                    if self.log_manager:
                        self.log_manager.log_update_done(name, current_price, new_price, source='scheduled')

    def run_scheduler(self):
        self.running = True
        if self.log_manager:
            self.log_manager.log_action('Scheduler started')
        while self.running:
            schedule.run_pending()
            time.sleep(60)

    def start_scheduler_thread(self):
        thread = threading.Thread(target=self.run_scheduler, daemon=True)
        thread.start()
        return thread

    def stop_scheduler(self):
        self.running = False
        if self.log_manager:
            self.log_manager.log_action('Scheduler stopped')

