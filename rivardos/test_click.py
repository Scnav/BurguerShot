import sys
sys.path.insert(0, '.')

from app_web import app

with app.test_client() as client:
    resp = client.get('/')
    html = resp.data.decode('utf-8')
    
    # Check if cards have onclick handler
    if 'onclick="showDetails(' in html:
        print("SUCCESS: Cards have onclick handler for showDetails")
    else:
        print("ERROR: Cards missing onclick handler")
    
    # Check no "Detalhes" button
    if 'Detalhes' not in html:
        print("SUCCESS: No 'Detalhes' button in HTML")
    else:
        print("ERROR: 'Detalhes' button still present")
    
    # Check stopPropagation on edit/delete buttons
    if 'event.stopPropagation()' in html:
        print("SUCCESS: Buttons have stopPropagation()")
    else:
        print("ERROR: Buttons missing stopPropagation()")
    
    # Check modal exists
    if 'itemModal' in html:
        print("SUCCESS: Modal exists in HTML")
    
    # Check script.js is loaded
    resp_js = client.get('/static/script.js')
    js = resp_js.data.decode('utf-8')
    if 'showDetails' in js:
        print("SUCCESS: showDetails function exists in JS")
    if 'event.stopPropagation()' in js:
        print("SUCCESS: stopPropagation in JS")
