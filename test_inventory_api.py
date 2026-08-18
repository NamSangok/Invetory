import json
from fastapi.testclient import TestClient
import main
from database import SessionLocal
import models

client = TestClient(main.app)

def run_tests():
    print("--- 1. Testing GET /api/dashboard ---")
    res = client.get("/api/dashboard")
    assert res.status_code == 200, f"Failed: {res.text}"
    dash = res.json()
    print(f"Total items: {dash['total_items']}, Parts: {dash['total_parts']}, Products: {dash['total_products']}")
    print(f"Total stock: {dash['total_stock_quantity']}, Stock Value: {dash['total_stock_value']}")
    print(f"Low stock alerts count: {len(dash['low_stock_alerts'])}")
    assert dash['total_items'] > 0
    assert dash['total_parts'] > 0
    assert dash['total_products'] > 0

    print("\n--- 2. Testing GET /api/items ---")
    res = client.get("/api/items")
    assert res.status_code == 200
    items = res.json()
    print(f"Fetched {len(items)} items.")
    
    parts = client.get("/api/items?item_type=part").json()
    products = client.get("/api/items?item_type=product").json()
    print(f"Filtered parts: {len(parts)}, Filtered products: {len(products)}")
    assert len(parts) > 0
    assert len(products) > 0

    print("\n--- 3. Testing Inbound & Outbound Transactions ---")
    part1 = parts[0]
    initial_stock = part1['current_stock']
    
    # Inbound 50 units
    in_res = client.post("/api/transactions", json={
        "item_id": part1['id'],
        "tx_type": "in",
        "sub_type": "구매입고",
        "quantity": 50,
        "worker": "테스터",
        "company_name": "테스트공급사",
        "note": "자동 테스트 입고"
    })
    assert in_res.status_code == 200, f"Inbound failed: {in_res.text}"
    print(f"Inbound 50 units success: new stock = {in_res.json()['current_stock']}")
    assert in_res.json()['current_stock'] == initial_stock + 50

    # Outbound 20 units
    out_res = client.post("/api/transactions", json={
        "item_id": part1['id'],
        "tx_type": "out",
        "sub_type": "생산투입출고",
        "quantity": 20,
        "worker": "테스터",
        "company_name": "생산라인",
        "note": "자동 테스트 출고"
    })
    assert out_res.status_code == 200, f"Outbound failed: {out_res.text}"
    print(f"Outbound 20 units success: new stock = {out_res.json()['current_stock']}")
    assert out_res.json()['current_stock'] == initial_stock + 30

    print("\n--- 4. Testing Production Execution (BOM Assembly) ---")
    prod1 = products[0]
    # Check if BOM exists
    bom_res = client.get(f"/api/bom/{prod1['id']}")
    bom_items = bom_res.json()
    print(f"BOM items for product [{prod1['name']}]: {len(bom_items)}")
    
    if len(bom_items) > 0:
        prod_res = client.post("/api/production", json={
            "product_id": prod1['id'],
            "quantity": 5,
            "worker": "테스트생산팀",
            "note": "자동화 테스트 완제품 5개 생산"
        })
        assert prod_res.status_code == 200, f"Production failed: {prod_res.text}"
        prod_data = prod_res.json()
        print(f"Production succeeded: {prod_data['message']}, LOT: {prod_data['lot_number']}")

    print("\n--- 5. Testing Monthly Statistics ---")
    stats_res = client.get("/api/statistics/monthly")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    print(f"Monthly stats records count: {len(stats)}")

    print("\n--- 6. Testing Network Info ---")
    net_res = client.get("/api/system/network-info")
    assert net_res.status_code == 200
    net = net_res.json()
    print(f"Network Info: {net}")

    print("\n==========================================")
    print("ALL 6 TEST SUITES PASSED SUCCESSFULLY! 🚀")
    print("==========================================")

if __name__ == "__main__":
    run_tests()
