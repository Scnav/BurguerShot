"""
Backend Flask para o Gerenciador de Inventário Web
Integra com system_core.py (LogManager, DatabaseManager, etc)
"""
from datetime import datetime
import time
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import re
import html
import unicodedata
import requests
from pathlib import Path
from urllib.parse import quote, unquote
from system_core import LogManager, DatabaseManager, SteamManager, SteamRateLimitError

# Inicializar Flask com configuração explícita de pastas
app = Flask(__name__, 
           template_folder='templates',
           static_folder='static')  # static URL path defaults to /static
CORS(app, resources={r"/api/*": {"origins": os.environ.get('CORS_ORIGINS', '*').split(',')}})
app.config['CORS_HEADERS'] = 'Content-Type'

# Limite simples por IP para segurança
RATE_LIMIT = int(os.environ.get('API_RATE_LIMIT_MAX', 30))
RATE_WINDOW_SECONDS = int(os.environ.get('API_RATE_LIMIT_WINDOW', 60))
request_counters = {}

# Inicializar gerenciadores
log_manager = LogManager()
db_manager = DatabaseManager(log_manager=log_manager)
steam_manager = SteamManager(log_manager=log_manager)
RUST_APP_ID = SteamManager.RUST_APP_ID

# Taxa de câmbio USD → BRL (será buscada em tempo real)
# USD_TO_BRL = float(os.environ.get('USD_TO_BRL', '5.80'))  # Removido, agora usa tempo real

# Armazenar dados em memória (será substituído por dados persistentes)
inventory_data = []


def get_client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr)


def sanitize_string(value, max_length=256):
    if not value:
        return ''
    clean = str(value).strip()
    clean = html.escape(clean)
    clean = re.sub(r'[^\w\s\-\.,:\/\(\)\[\]]', '', clean)
    return clean[:max_length]


def validate_numeric(value, field_name):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f'Campo {field_name} deve ser um numero valido')


@app.before_request
def apply_rate_limit():
    if not request.path.startswith('/api/'):
        return
    client_ip = get_client_ip() or 'unknown'
    now = time.time()
    bucket = request_counters.setdefault(client_ip, [])
    bucket = [ts for ts in bucket if now - ts < RATE_WINDOW_SECONDS]
    if len(bucket) >= RATE_LIMIT:
        log_manager.log_security('rate_limit_exceeded', client_ip, {'path': request.path})
        return jsonify({'success': False, 'error': 'Rate limit excedido. Tente novamente mais tarde.'}), 429
    bucket.append(now)
    request_counters[client_ip] = bucket
    
    # Log da requisição
    log_manager.log_action(f"API Request: {request.method} {request.path}", {
        'ip': client_ip,
        'user_agent': request.headers.get('User-Agent', '')[:100]
    })


@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Access-Control-Allow-Origin'] = os.environ.get('CORS_ORIGINS', '*')
    return response

# If database is empty, try to import default Excel file
def import_default_excel():
    conn = db_manager.get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM items')
    count = cursor.fetchone()[0]
    conn.close()
    if count == 0:
        default_file = 'Do Zero Ao Milhão.xlsx'
        if os.path.exists(default_file):
            log_manager.log_action(f"Importing default file: {default_file}")
            try:
                import pandas as pd
                df = pd.read_excel(default_file, usecols='B:I')
                df = df.dropna(how='all')
                if 'Item' in df.columns:
                    df = df[df['Item'].notna()]
                df = df.reset_index(drop=True)
                for idx, row in df.iterrows():
                    name = str(row['Item']).strip() if 'Item' in row and pd.notna(row['Item']) else f'Item {idx}'
                    quantity = float(row['Qtd.']) if 'Qtd.' in row and pd.notna(row['Qtd.']) else 0.0
                    purchase_price = float(row['Valor de Compra']) if 'Valor de Compra' in row and pd.notna(row['Valor de Compra']) else 0.0
                    current_price = float(row['Valor Atual']) if 'Valor Atual' in row and pd.notna(row['Valor Atual']) else 0.0
                    db_manager.add_item(name=name, quantity=quantity, purchase_price=purchase_price, current_price=current_price)
                log_manager.log_action(f"Default file imported: {len(df)} items")
            except ImportError:
                log_manager.log_error("Pandas not installed, cannot import default file", "import_default_excel")
            except Exception as e:
                log_manager.log_error(f"Failed to import default file: {str(e)}", "import_default_excel")

import_default_excel()


@app.route('/')
def index():
    """Serve a página principal HTML"""
    try:
        return render_template('index.html')
    except Exception as e:
        log_manager.log_error(f"Erro ao servir index.html: {str(e)}", "index")
        # Fallback para servir o arquivo diretamente se o template falhar
        try:
            return send_from_directory('templates', 'index.html')
        except Exception as e2:
            return jsonify({'error': 'Não foi possível carregar a página inicial', 'details': str(e2)}), 500


@app.route('/style.css')
def legacy_style():
    """Compatibilidade com a primeira versão web."""
    return send_from_directory('static', 'style.css')


@app.route('/script.js')
def legacy_script():
    """Compatibilidade com a primeira versão web."""
    return send_from_directory('static', 'script.js')


def format_inventory_item(item):
    quantity = float(item[3]) if item[3] is not None else 0.0
    purchase_price_brl = round(float(item[4]), 2) if item[4] is not None else 0.0
    current_price_brl = round(float(item[5]), 2) if item[5] is not None else 0.0
    purchase_total_brl = round(quantity * purchase_price_brl, 2)
    total_brl = round(quantity * current_price_brl, 2)
    tax_brl = round(total_brl * 0.15, 2)
    net_brl = round(total_brl - tax_brl, 2)
    profit_brl = round(net_brl - purchase_total_brl, 2)

    return {
        'id': item[0],
        'source_row': item[1],
        'name': item[2],
        'quantity': quantity,
        'purchase_price': purchase_price_brl,
        'current_price': current_price_brl,
        'image_filename': item[6],
        'steam_item_id': item[7],
        'steam_market_url': item[8],
        'steam_sale_fee': tax_brl,
        'last_price_update': item[10],
        'created_at': item[11],
        'purchase_total': purchase_total_brl,
        'total': total_brl,
        'tax': tax_brl,
        'net': net_brl,
        'liquid': net_brl,
        'profit': profit_brl,
        'img': f'/steam_cache/{item[6]}' if item[6] else 'https://community.cloudflare.steamstatic.com/economy/image/730fx730f'
    }


def normalize_column_name(value):
    text = unicodedata.normalize('NFKD', str(value or ''))
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', '', text.lower())


def find_column(columns, candidates):
    normalized = {normalize_column_name(column): column for column in columns}
    for candidate in candidates:
        column = normalized.get(normalize_column_name(candidate))
        if column is not None:
            return column
    return None


def parse_money_value(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    text = text.replace('R$', '').replace('$', '').replace('BRL', '').strip()
    text = re.sub(r'[^\d,.-]', '', text)
    if ',' in text and '.' in text:
        text = text.replace('.', '').replace(',', '.')
    else:
        text = text.replace(',', '.')
    try:
        return float(text)
    except ValueError:
        return default


def encode_market_name(value):
    return quote(unquote(str(value or '').strip()), safe='')


def read_spreadsheet(file_path):
    suffix = Path(file_path).suffix.lower()
    if suffix == '.csv':
        import pandas as pd
        return pd.read_csv(file_path)

    import pandas as pd
    df = pd.read_excel(file_path)
    if any(normalize_column_name(column) in {'item', 'skin', 'nome', 'name'} for column in df.columns):
        return df

    raw = pd.read_excel(file_path, header=None)
    for row_index in range(min(10, len(raw))):
        values = [normalize_column_name(value) for value in raw.iloc[row_index].tolist()]
        if {'item', 'skin', 'nome', 'name'} & set(values):
            return pd.read_excel(file_path, header=row_index)
    return df


def extract_inventory_rows(df):
    df = df.dropna(how='all').reset_index(drop=True)
    name_column = find_column(df.columns, ['Item', 'Skin', 'Nome', 'Name', 'Market Hash Name', 'MarketHashName'])
    quantity_column = find_column(df.columns, ['Qtd.', 'Qtd', 'Quantidade', 'Quantity', 'Qty'])
    purchase_column = find_column(df.columns, ['Valor de Compra', 'Preço Compra', 'Preco Compra', 'Purchase Price', 'Buy Price'])
    current_column = find_column(df.columns, ['Valor Atual', 'Preço Atual', 'Preco Atual', 'Current Price', 'Market Price'])
    steam_id_column = find_column(df.columns, ['Steam Item ID', 'Steam ID', 'Market Hash Name', 'MarketHashName', 'Steam Name'])
    url_column = find_column(df.columns, ['Steam Market URL', 'Market URL', 'URL'])

    if name_column is None:
        name_column = df.columns[0] if len(df.columns) else None
    if name_column is None:
        return []

    rows = []
    for index, row in df.iterrows():
        raw_name = row.get(name_column)
        if raw_name is None or str(raw_name).strip() == '' or str(raw_name).strip().lower() == 'nan':
            continue
        name = sanitize_string(raw_name, max_length=180)
        if not name:
            continue
        steam_name = str(row.get(steam_id_column)).strip() if steam_id_column else name
        if not steam_name or steam_name.lower() == 'nan':
            steam_name = name
        steam_market_url = str(row.get(url_column)).strip() if url_column else ''
        if steam_market_url.lower() == 'nan':
            steam_market_url = ''

        rows.append({
            'source_row': int(index),
            'name': name,
            'quantity': parse_money_value(row.get(quantity_column), default=1.0) if quantity_column else 1.0,
            'purchase_price': parse_money_value(row.get(purchase_column), default=0.0) if purchase_column else 0.0,
            'current_price': parse_money_value(row.get(current_column), default=0.0) if current_column else 0.0,
            'steam_item_id': encode_market_name(steam_name),
            'steam_market_url': steam_market_url if steam_market_url.startswith('http') else f"https://steamcommunity.com/market/listings/{RUST_APP_ID}/{encode_market_name(steam_name)}",
        })
    return rows


@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    """Retorna todos os itens do inventário"""
    try:
        # Conectar ao banco de dados
        items = db_manager.get_all_items() if hasattr(db_manager, 'get_all_items') else []
        log_manager.log_action(f"Inventário carregado: {len(items)} itens")
        
        formatted_items = [format_inventory_item(item) for item in items]
        
        return jsonify({
            'success': True,
            'items': formatted_items,
            'total': len(formatted_items)
        })
    except Exception as e:
        log_manager.log_error(f"Erro ao carregar inventário: {str(e)}", "get_inventory")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/inventory', methods=['POST'])
def create_item():
    """Criar novo item no inventário"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        # Validar dados obrigatórios
        required_fields = ['name', 'quantity', 'purchase_price', 'current_price']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Campo obrigatório faltando: {field}'}), 400

        name = sanitize_string(data['name'], max_length=150)
        if not name:
            return jsonify({'success': False, 'error': 'Nome invalido'}), 400
        quantity = validate_numeric(data['quantity'], 'quantity')
        purchase_price = validate_numeric(data['purchase_price'], 'purchase_price')
        current_price = validate_numeric(data['current_price'], 'current_price')
        image_filename = sanitize_string(data.get('image_filename', ''), max_length=200) or None
        steam_market_url = sanitize_string(data.get('steam_market_url', ''), max_length=400) or None

        # Adicionar item ao banco de dados
        item_id = db_manager.add_item(
            name=name,
            quantity=quantity,
            purchase_price=purchase_price,
            current_price=current_price,
            image_filename=image_filename,
            steam_market_url=steam_market_url
        )
        
        if item_id is None:
            return jsonify({'success': False, 'error': 'Falha ao criar item (pode já existir)'}), 400
        
        log_manager.log_action(f"Novo item criado: {data['name']}", {'item_id': item_id})
        return jsonify({
            'success': True,
            'message': 'Item criado com sucesso',
            'item_id': item_id
        })
    except ValueError as e:
        log_manager.log_error(f"Erro de valor ao criar item: {str(e)}", "create_item")
        return jsonify({'success': False, 'error': f'Valor inválido: {str(e)}'}), 400
    except Exception as e:
        log_manager.log_error(f"Erro ao criar item: {str(e)}", "create_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/inventory/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """Atualizar item existente"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        
        # Preparar dados para atualização
        update_data = {}
        if 'quantity' in data:
            update_data['quantity'] = validate_numeric(data['quantity'], 'quantity')
        if 'purchase_price' in data:
            update_data['purchase_price'] = validate_numeric(data['purchase_price'], 'purchase_price')
        if 'current_price' in data:
            update_data['current_price'] = validate_numeric(data['current_price'], 'current_price')
        if 'name' in data:
            name = sanitize_string(data['name'], max_length=150)
            if not name:
                return jsonify({'success': False, 'error': 'Nome invalido'}), 400
            update_data['name'] = name
        if 'image_filename' in data:
            update_data['image_filename'] = sanitize_string(data['image_filename'], max_length=200) or None
        if 'steam_market_url' in data:
            update_data['steam_market_url'] = sanitize_string(data['steam_market_url'], max_length=400) or None
        
        if not update_data:
            return jsonify({'success': False, 'error': 'Nenhum dado para atualizar'}), 400
        
        # Atualizar item no banco de dados
        updated = db_manager.update_item(item_id, **update_data)
        if updated is False:
            return jsonify({'success': False, 'error': 'Item não encontrado'}), 404
        
        log_manager.log_action(f"Item {item_id} atualizado", update_data)
        return jsonify({
            'success': True,
            'message': 'Item atualizado com sucesso'
        })
    except ValueError as e:
        log_manager.log_error(f"Erro de valor ao atualizar item: {str(e)}", "update_item")
        return jsonify({'success': False, 'error': f'Valor inválido: {str(e)}'}), 400
    except Exception as e:
        log_manager.log_error(f"Erro ao atualizar item: {str(e)}", "update_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/inventory/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Deletar item do inventário"""
    try:
        # Deletar item do banco de dados
        deleted = db_manager.delete_item(item_id)
        
        if not deleted:
            return jsonify({'success': False, 'error': 'Item não encontrado ou falha ao deletar'}), 404
        
        log_manager.log_action(f"Item {item_id} deletado")
        return jsonify({
            'success': True,
            'message': 'Item deletado com sucesso'
        })
    except Exception as e:
        log_manager.log_error(f"Erro ao deletar item: {str(e)}", "delete_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Retorna estatísticas do inventário"""
    try:
        # Calcular estatísticas reais do banco de dados
        items = db_manager.get_all_items() if hasattr(db_manager, 'get_all_items') else []
        
        formatted_items = [format_inventory_item(item) for item in items]
        
        stats = {
            'total_items': len(formatted_items),
            'purchase_value': round(sum(item['purchase_total'] for item in formatted_items), 2),
            'total_value': round(sum(item['total'] for item in formatted_items), 2),
            'taxes': round(sum(item['tax'] for item in formatted_items), 2),
            'liquid_value': round(sum(item['net'] for item in formatted_items), 2),
            'profit_value': round(sum(item['profit'] for item in formatted_items), 2)
        }
        
        log_manager.log_action("Estatísticas carregadas", stats)
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        log_manager.log_error(f"Erro ao carregar estatísticas: {str(e)}", "get_stats")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/inventory', methods=['GET'])
def get_rust_inventory():
    try:
        items = db_manager.get_all_rust_items()
        formatted_items = [format_inventory_item(item) for item in items]
        log_manager.log_action(f"Inventário Rust carregado: {len(items)} itens")
        return jsonify({'success': True, 'items': formatted_items, 'total': len(formatted_items)})
    except Exception as e:
        log_manager.log_error(f"Erro ao carregar Rust: {str(e)}", "get_rust_inventory")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/stats', methods=['GET'])
def get_rust_stats():
    try:
        formatted_items = [format_inventory_item(item) for item in db_manager.get_all_rust_items()]
        stats = {
            'total_items': len(formatted_items),
            'purchase_value': round(sum(item['purchase_total'] for item in formatted_items), 2),
            'total_value': round(sum(item['total'] for item in formatted_items), 2),
            'taxes': round(sum(item['tax'] for item in formatted_items), 2),
            'liquid_value': round(sum(item['net'] for item in formatted_items), 2),
            'profit_value': round(sum(item['profit'] for item in formatted_items), 2)
        }
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        log_manager.log_error(f"Erro ao carregar estatísticas Rust: {str(e)}", "get_rust_stats")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/inventory', methods=['POST'])
def create_rust_item():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        name = sanitize_string(data.get('name', ''), max_length=180)
        if not name:
            return jsonify({'success': False, 'error': 'Nome invalido'}), 400
        quantity = validate_numeric(data.get('quantity', 0), 'quantity')
        purchase_price = validate_numeric(data.get('purchase_price', 0), 'purchase_price')
        current_price = validate_numeric(data.get('current_price', 0), 'current_price')
        steam_item_id = encode_market_name(data.get('steam_item_id') or name)
        steam_market_url = sanitize_string(data.get('steam_market_url', ''), max_length=500) or f"https://steamcommunity.com/market/listings/{RUST_APP_ID}/{steam_item_id}"

        item_id = db_manager.add_rust_item(
            name=name,
            quantity=quantity,
            purchase_price=purchase_price,
            current_price=current_price,
            steam_item_id=steam_item_id,
            steam_market_url=steam_market_url
        )
        return jsonify({'success': True, 'message': 'Skin Rust criada com sucesso', 'item_id': item_id})
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Valor inválido: {str(e)}'}), 400
    except Exception as e:
        log_manager.log_error(f"Erro ao criar skin Rust: {str(e)}", "create_rust_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/inventory/<int:item_id>', methods=['PUT'])
def update_rust_item(item_id):
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
        update_data = {}
        if 'name' in data:
            name = sanitize_string(data['name'], max_length=180)
            if not name:
                return jsonify({'success': False, 'error': 'Nome invalido'}), 400
            update_data['name'] = name
        if 'quantity' in data:
            update_data['quantity'] = validate_numeric(data['quantity'], 'quantity')
        if 'purchase_price' in data:
            update_data['purchase_price'] = validate_numeric(data['purchase_price'], 'purchase_price')
        if 'current_price' in data:
            update_data['current_price'] = validate_numeric(data['current_price'], 'current_price')
        if 'steam_item_id' in data:
            steam_item_id = str(data.get('steam_item_id') or update_data.get('name') or '').strip()
            update_data['steam_item_id'] = encode_market_name(steam_item_id) if steam_item_id else None
        if 'steam_market_url' in data:
            update_data['steam_market_url'] = sanitize_string(data.get('steam_market_url', ''), max_length=500) or None

        updated = db_manager.update_rust_item(item_id, **update_data)
        if not updated:
            return jsonify({'success': False, 'error': 'Skin Rust não encontrada'}), 404
        return jsonify({'success': True, 'message': 'Skin Rust atualizada com sucesso'})
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Valor inválido: {str(e)}'}), 400
    except Exception as e:
        log_manager.log_error(f"Erro ao atualizar skin Rust: {str(e)}", "update_rust_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/inventory/<int:item_id>', methods=['DELETE'])
def delete_rust_item(item_id):
    try:
        deleted = db_manager.delete_rust_item(item_id)
        if not deleted:
            return jsonify({'success': False, 'error': 'Skin Rust não encontrada'}), 404
        return jsonify({'success': True, 'message': 'Skin Rust deletada com sucesso'})
    except Exception as e:
        log_manager.log_error(f"Erro ao deletar skin Rust: {str(e)}", "delete_rust_item")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Retorna logs recentes do sistema"""
    try:
        log_dir = Path('logs')
        if not log_dir.exists():
            return jsonify({
                'success': True,
                'logs': [{'type': 'info', 'message': 'Pasta de logs não encontrada'}]
            })
        
        # Encontrar o arquivo de log mais recente
        log_files = list(log_dir.glob('inventario_*.log'))
        if not log_files:
            return jsonify({
                'success': True,
                'logs': [{'type': 'info', 'message': 'Nenhum arquivo de log encontrado'}]
            })
        
        latest_log_file = max(log_files, key=lambda f: f.stat().st_mtime)
        
        logs = []
        with open(latest_log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        recent_lines = lines[-200:] if len(lines) > 200 else lines  # Aumentar para 200 linhas
        recent_lines.reverse()

        for line in recent_lines:
            parsed = None
            if ' | ' in line:
                parts = line.split(' | ', 2)
                if len(parts) == 3:
                    timestamp, level, message = parts
                    parsed = {
                        'timestamp': timestamp.strip(),
                        'level': level.strip(),
                        'message': message.strip()
                    }
            if parsed is None:
                logs.append({'type': 'info', 'message': line.strip()})
                continue

            log_type = 'info'
            msg = parsed['message']
            if parsed['level'] == 'ERROR' or '[ERROR]' in msg or '[STEAM_BLOCKED]' in msg or '[REQUEST_FAIL]' in msg or '[NO_PRICE]' in msg:
                log_type = 'error'
            elif '[ACTION]' in msg or '[UPDATE_DONE]' in msg or '[STEAM]' in msg:
                log_type = 'success'
            else:
                log_type = 'info'

            logs.append({
                'type': log_type,
                'message': msg,
                'timestamp': parsed['timestamp'],
                'level': parsed['level']
            })
        
        return jsonify({
            'success': True,
            'logs': logs
        })
    except Exception as e:
        log_manager.log_error(f"Erro ao carregar logs: {str(e)}", "get_logs")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/steam/price/name', methods=['GET'])
def get_steam_price_by_name():
    """Obtém preço da Steam pelo nome/market_hash_name"""
    try:
        market_hash_name = sanitize_string(request.args.get('name', ''), max_length=250)
        if not market_hash_name:
            return jsonify({'success': False, 'error': 'Nome do item obrigatório'}), 400

        price = steam_manager.get_item_price(market_hash_name)
        if price is not None:
            return jsonify({
                'success': True,
                'price_brl': round(price, 2)
            })

        return jsonify({'success': False, 'error': 'Preço não encontrado'}), 404
        
    except Exception as e:
        log_manager.log_error(f"Erro ao buscar preço por nome: {str(e)}", "get_steam_price_by_name")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/steam/price/<int:item_id>', methods=['GET'])
def get_steam_price(item_id):
    """Obtém preço atual do item da Steam API"""
    try:
        # Buscar dados do item
        item = db_manager.get_item(item_id=item_id)
        if not item:
            return jsonify({'success': False, 'error': 'Item não encontrado'}), 404

        steam_item_id = item[7]
        if not steam_item_id:
            return jsonify({'success': False, 'error': 'Item não tem ID da Steam'}), 400

        try:
            price = steam_manager.get_item_price(steam_item_id)
            if price is None:
                log_manager.log_no_price(steam_item_id, 'get_steam_price no value')
                return jsonify({'success': False, 'error': 'Preço não encontrado'}), 404

            db_manager.update_item(item_id, current_price=price)
            log_manager.log_action(f"Preço Steam atualizado para item {item_id}", {'price_brl': price})

            return jsonify({'success': True, 'price_brl': round(price, 2)})
        except SteamRateLimitError as e:
            log_manager.log_error(str(e), 'get_steam_price')
            return jsonify({'success': False, 'error': 'Steam bloqueou temporariamente'}), 429
            
    except Exception as e:
        log_manager.log_error(f"Erro ao obter preço Steam: {str(e)}", "get_steam_price")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/steam/update-all', methods=['POST'])
def update_all_steam_prices():
    """Atualiza preços usando Steam Web API com API key"""
    try:
        items = db_manager.get_all_items()
        updated_count = 0
        results = []
        errors = []

        log_manager.log_action(f"Atualizando {len(items)} itens com Steam API")

        for item in items:
            item_id = item[0]
            item_name = item[2]
            steam_item_id = item[7]

            if not steam_item_id:
                errors.append(f"{item_name}: sem steam_item_id")
                continue

            try:
                price = steam_manager.get_item_price(steam_item_id)
                if price is None:
                    errors.append(f"{item_name}: sem preço")
                    log_manager.log_no_price(item_name, 'update_all_steam_prices')
                    continue

                old_price = float(item[5] or 0)
                db_manager.update_item(item_id, current_price=price, last_price_update=datetime.now().isoformat())
                log_manager.log_update_done(item_name, old_price, price, source='update_all_steam_prices')
                updated_count += 1
                results.append({'id': item_id, 'name': item_name, 'success': True, 'price': round(price, 2)})
            except SteamRateLimitError as e:
                errors.append(f"{item_name}: Steam bloqueou")
                log_manager.log_error(str(e), 'update_all_steam_prices')
            except Exception as e:
                errors.append(f"{item_name}: {str(e)}")
                log_manager.log_error(f"Erro no item {item_name}: {str(e)}", 'update_all_steam_prices')

        log_manager.log_action('Atualização feita', {'updated': updated_count, 'total': len(items), 'errors': len(errors)})

        return jsonify({
            'success': True,
            'updated': updated_count,
            'total': len(items),
            'errors': errors[:20],
            'results': results
        })
        
    except Exception as e:
        log_manager.log_error(f"Erro geral: {str(e)}", "update_all_steam_prices")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/search', methods=['GET'])
def search_items():
    """Buscar itens por termo"""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({
                'success': True,
                'results': [],
                'message': 'Query vazia'
            })
        
        # Implementar busca no banco de dados
        items = db_manager.get_all_items() if hasattr(db_manager, 'get_all_items') else []
        
        # Filtrar items pelo nome (case insensitive)
        filtered_items = []
        for item in items:
            if query.lower() in item[2].lower():  # item[2] é o nome
                filtered_items.append(format_inventory_item(item))
        
        log_manager.log_action(f"Busca realizada: '{query}'", {'results_count': len(filtered_items)})
        return jsonify({
            'success': True,
            'results': filtered_items,
            'total': len(filtered_items)
        })
    except Exception as e:
        log_manager.log_error(f"Erro ao buscar itens: {str(e)}", "search_items")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/rust/import', methods=['POST'])
def import_rust_spreadsheet():
    temp_path = None
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Arquivo vazio'}), 400

        suffix = Path(file.filename).suffix.lower()
        if suffix not in {'.xlsx', '.xls', '.csv'}:
            return jsonify({'success': False, 'error': 'Formato inválido. Use .xlsx, .xls ou .csv'}), 400

        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
        file.save(temp_path)

        rows = extract_inventory_rows(read_spreadsheet(temp_path))
        if not rows:
            return jsonify({'success': False, 'error': 'Nenhuma skin válida encontrada na planilha'}), 400

        replace = request.form.get('replace', 'true').lower() not in {'0', 'false', 'no'}
        if replace:
            db_manager.clear_rust_items()

        imported = 0
        for row in rows:
            item_id = db_manager.add_rust_item(**row)
            if item_id is not None:
                imported += 1

        log_manager.log_action(f"Planilha Rust importada: {file.filename}", {'imported': imported, 'replace': replace})
        return jsonify({'success': True, 'message': f'Importadas {imported} skins Rust', 'imported': imported})
    except ImportError:
        return jsonify({'success': False, 'error': 'Pandas/openpyxl não instalado'}), 500
    except Exception as e:
        log_manager.log_error(f"Erro ao importar planilha Rust: {str(e)}", "import_rust_spreadsheet")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.route('/api/rust/update-all', methods=['POST'])
def update_all_rust_prices():
    try:
        items = db_manager.get_all_rust_items()
        updated_count = 0
        results = []
        errors = []
        now = datetime.now().isoformat()

        for item in items:
            item_id = item[0]
            item_name = item[2]
            steam_item_id = item[7] or encode_market_name(item_name)
            image_filename = item[6]
            steam_market_url = item[8]
            updates = {}

            if not image_filename or not steam_market_url:
                found = steam_manager.search_item_on_steam(item_name, app_id=RUST_APP_ID)
                if found:
                    steam_item_id = found.get('steam_id') or steam_item_id
                    updates['steam_item_id'] = steam_item_id
                    updates['steam_market_url'] = found.get('market_url')
                    if found.get('image_url') and not image_filename:
                        downloaded = steam_manager.download_image(found['image_url'], item_name)
                        if downloaded:
                            updates['image_filename'] = downloaded

            price = steam_manager.get_item_price(steam_item_id, app_id=RUST_APP_ID)
            if price is None:
                errors.append(f"{item_name}: preço não encontrado")
                continue

            old_price = float(item[5] or 0)
            updates.update({'current_price': price, 'last_price_update': now})
            db_manager.update_rust_item(item_id, **updates)
            log_manager.log_update_done(item_name, old_price, price, source='update_all_rust_prices')
            updated_count += 1
            results.append({'id': item_id, 'name': item_name, 'success': True, 'price': round(price, 2)})

        return jsonify({
            'success': True,
            'updated': updated_count,
            'total': len(items),
            'errors': errors[:20],
            'results': results
        })
    except SteamRateLimitError as e:
        log_manager.log_error(str(e), 'update_all_rust_prices')
        return jsonify({'success': False, 'error': 'Steam bloqueou temporariamente'}), 429
    except Exception as e:
        log_manager.log_error(f"Erro ao atualizar Rust: {str(e)}", "update_all_rust_prices")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/import', methods=['POST'])
def import_excel():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Arquivo vazio'}), 400
        
        # Save temporarily
        import tempfile
        import os
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'upload.xlsx')
        file.save(temp_path)
        
        # Read Excel
        try:
            import pandas as pd
            df = pd.read_excel(temp_path, usecols='B:I')
        except ImportError:
            return jsonify({'success': False, 'error': 'Pandas não instalado'}), 500
        
        df = df.dropna(how='all')
        if 'Item' in df.columns:
            df = df[df['Item'].notna()]
        df = df.reset_index(drop=True)
        
        # Clear existing items
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM items')
        conn.commit()
        conn.close()
        
        # Add items
        for idx, row in df.iterrows():
            name = str(row['Item']).strip() if 'Item' in row and pd.notna(row['Item']) else f'Item {idx}'
            quantity = float(row['Qtd.']) if 'Qtd.' in row and pd.notna(row['Qtd.']) else 0.0
            purchase_price = float(row['Valor de Compra']) if 'Valor de Compra' in row and pd.notna(row['Valor de Compra']) else 0.0
            current_price = float(row['Valor Atual']) if 'Valor Atual' in row and pd.notna(row['Valor Atual']) else 0.0
            db_manager.add_item(name=name, quantity=quantity, purchase_price=purchase_price, current_price=current_price)
        
        # Remove temp file
        os.remove(temp_path)
        
        log_manager.log_action(f"Imported Excel file: {file.filename}, {len(df)} items")
        return jsonify({'success': True, 'message': f'Importados {len(df)} itens'})
    except Exception as e:
        log_manager.log_error(f"Erro ao importar Excel: {str(e)}", "import_excel")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/steam_cache/<path:filename>')
def serve_steam_cache(filename):
    """Serve imagens armazenadas em cache"""
    return send_from_directory('steam_cache', filename)


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint não encontrado'}), 404


@app.errorhandler(500)
def server_error(error):
    log_manager.log_error(f"Erro no servidor: {str(error)}", "server_error")
    return jsonify({'error': 'Erro interno do servidor'}), 500


if __name__ == '__main__':
    log_manager.log_action("Iniciando aplicação web...")
    try:
        host = os.environ.get('FLASK_HOST', '127.0.0.1')
        port = int(os.environ.get('FLASK_PORT', 5000))
        debug = os.environ.get('FLASK_DEBUG', 'true').lower() in {'1', 'true', 'yes', 'on'}
        app.run(debug=debug, host=host, port=port)
    except Exception as e:
        log_manager.log_error(f"Falha ao iniciar servidor: {str(e)}", "server_startup")
        raise
