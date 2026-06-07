import sys
sys.path.insert(0, '.')

from app_web import app

with app.test_client() as client:
    resp = client.get('/')
    html = resp.data.decode('utf-8')
    if 'itemModal' in html:
        print("SUCCESS: itemModal found in HTML")
        # Check for details button in the script? Not needed.
    else:
        print("ERROR: itemModal not found")
    # Also check that script.js contains showDetails
    resp_js = client.get('/static/script.js')
    js = resp_js.data.decode('utf-8')
    if 'showDetails' in js:
        print("SUCCESS: showDetails function found in script.js")
    else:
        print("ERROR: showDetails not found")
    if 'modalUnitPurchase' in js:
        print("SUCCESS: modal fields referenced")
    else:
        print("ERROR: modal fields not referenced")
