import sys
sys.path.insert(0, '.')

from app_web import app
import json

with app.test_client() as client:
    # Get first item
    resp = client.get('/api/inventory')
    data = json.loads(resp.data)
    if data['success'] and data['items']:
        item = data['items'][0]
        item_id = item['id']
        print(f"Testing edit for item: {item['name']} (id: {item_id})")
        print(f"  Current - qty: {item['quantity']}, purchase: {item['purchase_price']}, current: {item['current_price']}")
        
        # Update item with new values
        new_data = {
            'name': item['name'] + ' (edited)',
            'quantity': item['quantity'] + 1,
            'purchase_price': item['purchase_price'] + 1.0 if item['purchase_price'] else 1.0,
            'current_price': item['current_price'] + 1.0 if item['current_price'] else 1.0
        }
        
        resp = client.put(f'/api/inventory/{item_id}', 
                        json=new_data)
        print(f"  Update status: {resp.status_code}")
        if resp.status_code == 200:
            result = json.loads(resp.data)
            print(f"  Response: {result}")
            
            # Verify update
            resp = client.get('/api/inventory')
            data = json.loads(resp.data)
            updated = [it for it in data['items'] if it['id'] == item_id][0]
            print(f"  Updated - name: {updated['name']}, qty: {updated['quantity']}")
            
            # Revert change
            revert_data = {
                'name': item['name'],
                'quantity': item['quantity'],
                'purchase_price': item['purchase_price'],
                'current_price': item['current_price']
            }
            client.put(f'/api/inventory/{item_id}', json=revert_data)
            print("  Reverted changes")
        else:
            print(f"  Error: {resp.data}")
    else:
        print("No items found")
