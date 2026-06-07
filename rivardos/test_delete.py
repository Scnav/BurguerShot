import sys
sys.path.insert(0, '.')

from app_web import app
import json

with app.test_client() as client:
    # Get first item id
    resp = client.get('/api/inventory')
    data = json.loads(resp.data)
    if data['success'] and data['items']:
        item_id = data['items'][0]['id']
        print(f"Found item id: {item_id}")
        # Delete it
        resp = client.delete(f'/api/inventory/{item_id}')
        print(f"Delete status: {resp.status_code}")
        print(resp.data)
        # Verify removal
        resp2 = client.get('/api/inventory')
        data2 = json.loads(resp2.data)
        print(f"Remaining items: {len(data2['items'])}")
    else:
        print("No items found")
