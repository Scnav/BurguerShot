import sys
sys.path.insert(0, '.')

from app_web import app
import json

with app.test_client() as client:
    # Test create item
    print("Creating new item...")
    resp = client.post('/api/inventory', json={
        'name': 'Test Item',
        'quantity': 5,
        'purchase_price': 10.0,
        'current_price': 20.0
    })
    print(f"Create status: {resp.status_code}")
    data = json.loads(resp.data)
    print(f"Response: {data}")
    if data.get('success'):
        item_id = data['item_id']
        print(f"Created item with id {item_id}")
        
        # Test update
        print("\nUpdating item...")
        resp = client.put(f'/api/inventory/{item_id}', json={
            'quantity': 10,
            'current_price': 25.0
        })
        print(f"Update status: {resp.status_code}")
        print(resp.data)
        
        # Verify update
        resp = client.get('/api/inventory')
        items = json.loads(resp.data)['items']
        updated = [it for it in items if it['id'] == item_id][0]
        print(f"Updated item: qty={updated['quantity']}, price={updated['current_price']}")
        
        # Clean up: delete the test item
        print("\nDeleting test item...")
        resp = client.delete(f'/api/inventory/{item_id}')
        print(f"Delete status: {resp.status_code}")
    else:
        print("Create failed")
        
    # Final count
    resp = client.get('/api/inventory')
    data = json.loads(resp.data)
    print(f"\nTotal items after test: {len(data['items'])}")
