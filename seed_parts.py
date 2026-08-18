import sqlite3

def seed():
    conn = sqlite3.connect("inventory.db")
    c = conn.cursor()
    c.execute("SELECT count(*) FROM items WHERE item_type = 'part'")
    count = c.fetchone()[0]
    if count == 0:
        sample_parts = [
            ('PRT-1001', '의료용 실리콘 튜브', 'part', '원자재', 'OD 2.0mm x ID 1.2mm', 'M', '창고 A-01', 1200, 1500, 500, '카테터 본체 압출 튜브'),
            ('PRT-1002', '스테인리스 가이드와이어', 'part', '원자재', '0.035inch x 150cm', 'EA', '창고 A-02', 4500, 800, 300, '삽입 유도용 와이어'),
            ('PRT-1003', '수형 루어락 커넥터', 'part', '부자재', 'Female Luer Lock PP', 'EA', '창고 B-01', 350, 2400, 1000, '주입 포트 연결용'),
            ('PRT-1004', '방사선 불투과성 마커링', 'part', '원자재', 'Pt/Ir 90/10 1.5mm', 'EA', '창고 A-03', 8500, 450, 200, 'X-ray 조영용 백금 링'),
            ('PRT-1005', 'EO가스 멸균 파우치', 'part', '부자재', '150mm x 250mm 타이벡', 'EA', '창고 C-01', 280, 3500, 1200, '1차 멸균 포장재'),
            ('PRT-1006', '의료기기 개별 인쇄박스', 'part', '부자재', '300x120x40mm 아트지', 'EA', '창고 C-02', 650, 1800, 500, '완제품 겉포장 상자'),
            ('PRT-1007', '생체적합성 티타늄 블록', 'part', '원자재', 'Ti-6Al-4V ELI Gr23', 'kg', '창고 A-04', 65000, 45, 20, '추간체 보형재 CNC 가공용 소재'),
            ('PRT-1008', '고정용 락킹 스크류', 'part', '가공품', 'Ø3.5mm x L14mm', 'EA', '창고 B-02', 12000, 350, 150, '척추 유합 고정 나사')
        ]
        for p in sample_parts:
            c.execute('''INSERT INTO items (item_code, name, item_type, category, spec, unit, location, unit_price, current_stock, safety_stock, note)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', p)
        
        # Link sample BOM for Product 1 (경막외카테터 EDEN-NC305)
        # Find item id for product 1 and newly inserted parts
        c.execute("SELECT id FROM items WHERE id = 1")
        prod1 = c.fetchone()
        if prod1:
            c.execute("SELECT id FROM items WHERE item_code = 'PRT-1001'")
            p1 = c.fetchone()
            c.execute("SELECT id FROM items WHERE item_code = 'PRT-1002'")
            p2 = c.fetchone()
            c.execute("SELECT id FROM items WHERE item_code = 'PRT-1003'")
            p3 = c.fetchone()
            c.execute("SELECT id FROM items WHERE item_code = 'PRT-1005'")
            p5 = c.fetchone()
            c.execute("SELECT id FROM items WHERE item_code = 'PRT-1006'")
            p6 = c.fetchone()
            
            if p1 and p2 and p3 and p5 and p6:
                c.execute("INSERT INTO bom_items (product_id, part_id, quantity_required) VALUES (?, ?, ?)", (prod1[0], p1[0], 1))
                c.execute("INSERT INTO bom_items (product_id, part_id, quantity_required) VALUES (?, ?, ?)", (prod1[0], p2[0], 1))
                c.execute("INSERT INTO bom_items (product_id, part_id, quantity_required) VALUES (?, ?, ?)", (prod1[0], p3[0], 1))
                c.execute("INSERT INTO bom_items (product_id, part_id, quantity_required) VALUES (?, ?, ?)", (prod1[0], p5[0], 1))
                c.execute("INSERT INTO bom_items (product_id, part_id, quantity_required) VALUES (?, ?, ?)", (prod1[0], p6[0], 1))
        
        conn.commit()
        print("Sample production parts & BOM configured successfully!")
    else:
        print(f"Parts already configured: {count} parts found.")
    conn.close()

if __name__ == "__main__":
    seed()
