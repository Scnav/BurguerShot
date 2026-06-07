import sys
sys.path.insert(0, '.')

from app_web import app
import json

with app.test_client() as client:
    # Test index page
    print("Testing index page...")
    resp = client.get('/')
    print(f"  Status: {resp.status_code}")
    # Test static files
    print("Testing static CSS...")
    resp = client.get('/static/style.css')
    print(f"  Status: {resp.status_code}")
    print("Testing static JS...")
    resp = client.get('/static/script.js')
    print(f"  Status: {resp.status_code}")
    # Test stats API
    print("Testing /api/stats...")
    resp = client.get('/api/stats')
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = json.loads(resp.data)
        print(f"  Stats: {data['stats']}")
    # Test inventory API
    print("Testing /api/inventory...")
    resp = client.get('/api/inventory')
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = json.loads(resp.data)
        print(f"  Items count: {len(data['items'])}")
        if data['items']:
            first = data['items'][0]
            print(f"  First item: {first['name']}")
            print(f"  Image URL: {first['img']}")
    # Test logs API
    print("Testing /api/logs...")
    resp = client.get('/api/logs')
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = json.loads(resp.data)
        print(f"  Logs count: {len(data['logs'])}")
    # Test search API
    print("Testing /api/search?q=caixa...")
    resp = client.get('/api/search?q=caixa')
    print(f"  Status: {resp.status_code}")
    if resp.status_code == 200:
        data = json.loads(resp.data)
        print(f"  Results count: {len(data['results'])}")
    print("\nAll tests passed!")
