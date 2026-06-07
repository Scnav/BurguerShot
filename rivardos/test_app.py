import sys
sys.path.insert(0, '.')

from app_web import app

with app.test_client() as client:
    # Test index page
    print("Testing '/' route...")
    resp = client.get('/')
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(resp.data[:500])
    
    # Test static files
    print("\nTesting /style.css...")
    resp = client.get('/style.css')
    print(f"Status: {resp.status_code}")
    
    print("\nTesting /script.js...")
    resp = client.get('/script.js')
    print(f"Status: {resp.status_code}")
    
    # Test API inventory
    print("\nTesting /api/inventory...")
    resp = client.get('/api/inventory')
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(resp.data[:500])
    else:
        import json
        data = json.loads(resp.data)
        print(f"Success: {data.get('success')}")
        print(f"Items count: {len(data.get('items', []))}")
        
    # Test stats
    print("\nTesting /api/stats...")
    resp = client.get('/api/stats')
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(resp.data[:500])
    else:
        data = json.loads(resp.data)
        print(f"Stats: {data.get('stats')}")
