from database import SessionLocal
import main
import models

def run_direct_tests():
    db = SessionLocal()
    print("--- 1. Testing get_dashboard ---")
    dash = main.get_dashboard(db=db)
    print(f"Total items: {dash['total_items']}, Parts: {dash['total_parts']}, Products: {dash['total_products']}")
    print(f"Total stock quantity: {dash['total_stock_quantity']}, Stock Value: {dash['total_stock_value']}")
    print(f"Low stock alerts: {len(dash['low_stock_alerts'])}")
    assert dash['total_items'] > 0
    assert dash['total_parts'] > 0
    assert dash['total_products'] > 0

    print("\n--- 2. Testing get_items ---")
    all_items = main.get_items(db=db)
    parts = main.get_items(item_type="part", db=db)
    products = main.get_items(item_type="product", db=db)
    print(f"Total items: {len(all_items)}, Parts: {len(parts)}, Products: {len(products)}")
    assert len(parts) > 0
    assert len(products) > 0

    print("\n--- 3. Testing Transactions In & Out ---")
    part1 = parts[0]
    initial_stock = part1['current_stock']
    
    # Inbound 50
    tx_in = main.TransactionCreate(
        item_id=part1['id'],
        tx_type="in",
        sub_type="구매입고",
        quantity=50,
        worker="테스터",
        company_name="테스트공급사",
        note="직접 함수 테스트 입고"
    )
    res_in = main.create_transaction(tx=tx_in, db=db)
    print("Inbound result:", res_in)
    assert res_in['current_stock'] == initial_stock + 50

    # Outbound 20
    tx_out = main.TransactionCreate(
        item_id=part1['id'],
        tx_type="out",
        sub_type="생산투입출고",
        quantity=20,
        worker="테스터",
        company_name="생산라인",
        note="직접 함수 테스트 출고"
    )
    res_out = main.create_transaction(tx=tx_out, db=db)
    print("Outbound result:", res_out)
    assert res_out['current_stock'] == initial_stock + 30

    print("\n--- 4. Testing BOM & Production Execution ---")
    prod1 = products[0]
    bom = main.get_bom(product_id=prod1['id'], db=db)
    print(f"BOM items for product [{prod1['name']}]: {len(bom)}")

    if len(bom) > 0:
        prod_req = main.ProductionRequest(
            product_id=prod1['id'],
            quantity=3,
            worker="테스트생산팀",
            note="직접 함수 테스트 생산"
        )
        res_prod = main.execute_production(prod=prod_req, db=db)
        print("Production result:", res_prod)
        assert "성공적으로" in res_prod['message']

    print("\n--- 5. Testing Monthly Statistics ---")
    monthly = main.get_monthly_statistics(year=2026, db=db)
    print(f"Monthly stats records: {len(monthly)}")

    print("\n--- 6. Testing Network Info ---")
    net = main.get_network_info()
    print("Network info:", net)
    assert "local_ip" in net

    db.close()
    print("\n==========================================")
    print("ALL 6 DIRECT TESTS PASSED WITH 100% SUCCESS! 🚀")
    print("==========================================")

if __name__ == "__main__":
    run_direct_tests()
