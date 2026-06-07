import sys
sys.path.insert(0, '.')

from app_web import app

with app.test_client() as client:
    # Test index
    resp = client.get('/')
    print(f"Index status: {resp.status_code}")
    # Test static CSS
    resp = client.get('/static/style.css')
    print(f"CSS status: {resp.status_code}")
    # Test static JS
    resp = client.get('/static/script.js')
    print(f"JS status: {resp.status_code}")
    # Test steam_cache (should 404 if no image)
    resp = client.get('/steam_cache/test.png')
    print(f"Steam cache status: {resp.status_code}")
    # Test API inventory
    resp = client.get('/api/inventory')
    print(f"Inventory status: {resp.status_code}")
    if resp.status_code == 200:
        import json
        data = json.loads(resp.data)
        print(f"Items: {len(data.get('items', []))}")
        if data['items']:
            img = data['items'][0].get('img')
            print(f"First item img: {img}")
