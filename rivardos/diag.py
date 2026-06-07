import sqlite3, os
conn = sqlite3.connect('inventario.db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM items")
print("Total itens:", cursor.fetchone()[0])
cursor.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='items'")
print("Indices:", cursor.fetchall())
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tabelas:", cursor.fetchall())
cursor.execute("SELECT * FROM items LIMIT 1")
cols = [d[0] for d in cursor.description]
print("Colunas:", cols)
conn.close()

print()
print("Arquivo DB tamanho:", os.path.getsize('inventario.db'), "bytes")
print("Steam cache tamanho:", sum(os.path.getsize(os.path.join('steam_cache', f)) for f in os.listdir('steam_cache')) if os.path.exists('steam_cache') else 0, "bytes")
print("Logs tamanho:", sum(os.path.getsize(os.path.join('logs', f)) for f in os.listdir('logs')) if os.path.exists('logs') else 0, "bytes")