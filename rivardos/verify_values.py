import sqlite3
import json

conn = sqlite3.connect('inventario.db')
cursor = conn.cursor()

# Buscar todos os itens
cursor.execute('SELECT id, name, quantity, purchase_price, current_price FROM items')
rows = cursor.fetchall()

print(f'Total de itens no banco: {len(rows)}')
print()

# Calcular totais manualmente
total_value = 0
total_tax = 0
total_liquid = 0

for row in rows:
    id_, name, qty, purch, curr = row
    qty = float(qty) if qty else 0.0
    purch = float(purch) if purch else 0.0
    curr = float(curr) if curr else 0.0

    item_total = qty * curr
    item_tax = item_total * 0.15
    item_purchase = qty * purch
    item_liquid = item_total - item_tax - item_purchase

    total_value += item_total
    total_tax += item_tax
    total_liquid += item_liquid

print(f'Soma manual dos itens:')
print(f'  Valor Bruto Total:   R$ {total_value:.2f}')
print(f'  Taxas (15%):          R$ {total_tax:.2f}')
print(f'  Valor Líquido:        R$ {total_liquid:.2f}')

conn.close()

# Agora comparar com a API
import requests
try:
    r = requests.get('http://127.0.0.1:5000/api/stats')
    stats = r.json()['stats']
    print(f'\nValores da API /api/stats:')
    print(f'  total_value:  {stats["total_value"]}')
    print(f'  taxes:        {stats["taxes"]}')
    print(f'  liquid_value: {stats["liquid_value"]}')

    print(f'\nDiferenças:')
    print(f'  Bruto:   {abs(total_value - stats["total_value"]):.4f}')
    print(f'  Taxas:   {abs(total_tax - stats["taxes"]):.4f}')
    print(f'  Líquido: {abs(total_liquid - stats["liquid_value"]):.4f}')

    # Verificar itens individualmente
    r2 = requests.get('http://127.0.0.1:5000/api/inventory')
    items_api = r2.json()['items']

    api_total = sum(float(i['total']) for i in items_api)
    print(f'\nSoma dos totais individuais da API: R$ {api_total:.2f}')
    print(f'Soma calculada manualmente:        R$ {total_value:.2f}')
    print(f'Diferença:                          {abs(api_total - total_value):.4f}')
except Exception as e:
    print(f'Erro ao testar API: {e}')