import socket
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, func, or_, and_, desc

import models
from database import engine, get_db, SessionLocal

# DB Table Creation
models.Base.metadata.create_all(bind=engine)

# DB Schema Auto-Migration for New Columns
def run_migrations():
    db = SessionLocal()
    migration_queries = [
        "ALTER TABLE items ADD COLUMN item_code VARCHAR",
        "ALTER TABLE items ADD COLUMN category VARCHAR DEFAULT '일반'",
        "ALTER TABLE items ADD COLUMN unit VARCHAR DEFAULT 'EA'",
        "ALTER TABLE items ADD COLUMN location VARCHAR",
        "ALTER TABLE items ADD COLUMN unit_price INTEGER DEFAULT 0",
        "ALTER TABLE items ADD COLUMN created_at DATETIME",
        "ALTER TABLE transactions ADD COLUMN sub_type VARCHAR",
        "ALTER TABLE transactions ADD COLUMN unit_price INTEGER DEFAULT 0",
        "ALTER TABLE transactions ADD COLUMN lot_number VARCHAR",
        "ALTER TABLE transactions ADD COLUMN company_name VARCHAR",
        "ALTER TABLE transactions ADD COLUMN note VARCHAR",
        "ALTER TABLE items ADD COLUMN note VARCHAR",
    ]
    for q in migration_queries:
        try:
            db.execute(text(q))
            db.commit()
        except Exception:
            db.rollback()
    
    # Check default item_code generation for items without item_code
    try:
        items = db.query(models.Item).all()
        for idx, item in enumerate(items, start=1):
            if not item.item_code:
                prefix = "PRD" if item.item_type == "product" else "PRT"
                item.item_code = f"{prefix}-{item.id:04d}"
            if not item.category:
                item.category = "완제품" if item.item_type == "product" else "원자재"
            if not item.unit:
                item.unit = "EA"
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

run_migrations()

app = FastAPI(title="Production & Finished Goods Inventory Management System")

# Helper to get local IP
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# --- Pydantic Models ---
class ItemBase(BaseModel):
    name: str
    item_type: str  # 'part' or 'product'
    item_code: Optional[str] = None
    category: Optional[str] = "일반"
    spec: Optional[str] = None
    unit: Optional[str] = "EA"
    location: Optional[str] = None
    unit_price: Optional[int] = 0
    safety_stock: int = 0
    note: Optional[str] = None

class ItemCreate(ItemBase):
    current_stock: int = 0

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    category: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    location: Optional[str] = None
    unit_price: Optional[int] = None
    safety_stock: Optional[int] = None
    current_stock: Optional[int] = None
    note: Optional[str] = None

class ItemResponse(ItemBase):
    id: int
    current_stock: int
    class Config:
        from_attributes = True

class BulkResponse(BaseModel):
    total: int
    success: int
    failed: int
    errors: List[str]

class TransactionBase(BaseModel):
    item_id: int
    tx_type: str  # 'in' or 'out'
    sub_type: Optional[str] = None  # 구매입고, 생산입고, 반품입고 / 생산출고, 납품출하, 폐기손실 등
    quantity: int
    unit_price: Optional[int] = 0
    worker: Optional[str] = ""
    lot_number: Optional[str] = ""
    company_name: Optional[str] = ""
    note: Optional[str] = ""

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    quantity: Optional[int] = None
    sub_type: Optional[str] = None
    worker: Optional[str] = None
    lot_number: Optional[str] = None
    company_name: Optional[str] = None
    note: Optional[str] = None

class BOMItemDetail(BaseModel):
    part_id: int
    quantity_required: int

class BOMSaveRequest(BaseModel):
    product_id: int
    parts: List[BOMItemDetail]

class ProductionRequest(BaseModel):
    product_id: int
    quantity: int
    lot_number: Optional[str] = ""
    worker: Optional[str] = ""
    note: Optional[str] = ""

class NoticeBase(BaseModel):
    content: str
    is_resolved: int = 0

class NoticeCreate(NoticeBase):
    pass

class NoticeResponse(NoticeBase):
    id: int
    created_at: str
    class Config:
        from_attributes = True

# --- API Endpoints ---

@app.get("/api/system/network-info")
def get_network_info():
    return {
        "local_ip": get_local_ip(),
        "port": 8000,
        "url": f"http://{get_local_ip()}:8000"
    }

@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    items = db.query(models.Item).all()
    
    total_items = len(items)
    parts = [i for i in items if i.item_type == "part"]
    products = [i for i in items if i.item_type == "product"]
    
    total_parts = len(parts)
    total_products = len(products)
    
    total_stock_quantity = sum(i.current_stock for i in items)
    parts_stock_quantity = sum(i.current_stock for i in parts)
    products_stock_quantity = sum(i.current_stock for i in products)
    
    total_stock_value = sum((i.current_stock or 0) * (i.unit_price or 0) for i in items)
    
    # Low stock & out of stock alerts
    low_stock = [
        {
            "id": item.id,
            "name": item.name,
            "item_code": item.item_code or f"ITM-{item.id:04d}",
            "item_type": item.item_type,
            "spec": item.spec or "-",
            "unit": item.unit or "EA",
            "safety_stock": item.safety_stock,
            "current_stock": item.current_stock,
            "shortage": max(0, item.safety_stock - item.current_stock),
            "location": item.location or "-"
        }
        for item in items
        if item.safety_stock > 0 and item.current_stock < item.safety_stock
    ]
    low_stock.sort(key=lambda x: (x["current_stock"] / max(1, x["safety_stock"])))

    out_of_stock_items = [i for i in items if i.current_stock == 0]

    # Date-based in/out calculation
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)

    all_txs = db.query(models.Transaction).all()
    
    today_in = sum(tx.quantity for tx in all_txs if tx.timestamp >= today_start and tx.tx_type == "in")
    today_out = sum(tx.quantity for tx in all_txs if tx.timestamp >= today_start and tx.tx_type == "out")
    
    month_in = sum(tx.quantity for tx in all_txs if tx.timestamp >= month_start and tx.tx_type == "in")
    month_out = sum(tx.quantity for tx in all_txs if tx.timestamp >= month_start and tx.tx_type == "out")

    # Trend stats: Last 7 days
    daily_trend = []
    for i in range(6, -1, -1):
        d_start = today_start - timedelta(days=i)
        d_end = d_start + timedelta(days=1)
        d_str = d_start.strftime("%m/%d")
        
        in_qty = sum(tx.quantity for tx in all_txs if d_start <= tx.timestamp < d_end and tx.tx_type == "in")
        out_qty = sum(tx.quantity for tx in all_txs if d_start <= tx.timestamp < d_end and tx.tx_type == "out")
        daily_trend.append({
            "date": d_str,
            "in_qty": in_qty,
            "out_qty": out_qty
        })

    # Top moving items (last 30 days outbound)
    thirty_days_ago = now - timedelta(days=30)
    top_out_counts = {}
    for tx in all_txs:
        if tx.timestamp >= thirty_days_ago and tx.tx_type == "out":
            top_out_counts[tx.item_id] = top_out_counts.get(tx.item_id, 0) + tx.quantity
    
    item_map = {i.id: i for i in items}
    top_moving = []
    for item_id, total_qty in sorted(top_out_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        item = item_map.get(item_id)
        if item:
            top_moving.append({
                "id": item.id,
                "name": item.name,
                "spec": item.spec or "-",
                "item_type": item.item_type,
                "out_quantity": total_qty
            })

    # Categories breakdown
    categories_count = {}
    for item in items:
        cat = item.category or ("완제품" if item.item_type == "product" else "생산부품")
        categories_count[cat] = categories_count.get(cat, 0) + item.current_stock

    return {
        "total_items": total_items,
        "total_parts": total_parts,
        "total_products": total_products,
        "total_stock_quantity": total_stock_quantity,
        "parts_stock_quantity": parts_stock_quantity,
        "products_stock_quantity": products_stock_quantity,
        "total_stock_value": total_stock_value,
        "out_of_stock_count": len(out_of_stock_items),
        "today_in": today_in,
        "today_out": today_out,
        "month_in": month_in,
        "month_out": month_out,
        "low_stock_alerts": low_stock,
        "daily_trend": daily_trend,
        "top_moving": top_moving,
        "categories_distribution": categories_count
    }

@app.get("/api/items")
def get_items(
    item_type: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    low_stock_only: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    query = db.query(models.Item)
    if item_type:
        query = query.filter(models.Item.item_type == item_type)
    if category:
        query = query.filter(models.Item.category == category)
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            or_(
                models.Item.name.ilike(search_fmt),
                models.Item.item_code.ilike(search_fmt),
                models.Item.spec.ilike(search_fmt),
                models.Item.location.ilike(search_fmt),
                models.Item.note.ilike(search_fmt)
            )
        )
    items = query.order_by(models.Item.id.asc()).all()
    if low_stock_only:
        items = [i for i in items if i.safety_stock > 0 and i.current_stock < i.safety_stock]

    return [
        {
            "id": i.id,
            "item_code": i.item_code or f"{('PRD' if i.item_type == 'product' else 'PRT')}-{i.id:04d}",
            "name": i.name,
            "item_type": i.item_type,
            "category": i.category or ("완제품" if i.item_type == "product" else "원자재"),
            "spec": i.spec or "",
            "unit": i.unit or "EA",
            "location": i.location or "",
            "unit_price": i.unit_price or 0,
            "current_stock": i.current_stock or 0,
            "safety_stock": i.safety_stock or 0,
            "note": i.note or ""
        }
        for i in items
    ]

@app.get("/api/items/{item_id}")
def get_item_detail(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    
    # BOM if product
    bom_data = []
    if item.item_type == "product":
        bom_items = db.query(models.BOMItem, models.Item)\
                      .join(models.Item, models.BOMItem.part_id == models.Item.id)\
                      .filter(models.BOMItem.product_id == item_id).all()
        for bom, part in bom_items:
            bom_data.append({
                "part_id": part.id,
                "part_code": part.item_code or f"PRT-{part.id:04d}",
                "part_name": part.name,
                "part_spec": part.spec or "-",
                "unit": part.unit or "EA",
                "current_stock": part.current_stock,
                "quantity_required": bom.quantity_required
            })

    return {
        "id": item.id,
        "item_code": item.item_code or f"{('PRD' if item.item_type == 'product' else 'PRT')}-{item.id:04d}",
        "name": item.name,
        "item_type": item.item_type,
        "category": item.category or "일반",
        "spec": item.spec or "",
        "unit": item.unit or "EA",
        "location": item.location or "",
        "unit_price": item.unit_price or 0,
        "current_stock": item.current_stock or 0,
        "safety_stock": item.safety_stock or 0,
        "note": item.note or "",
        "bom": bom_data
    }

@app.post("/api/items")
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    # Auto-generate item code if not given
    item_dict = item.model_dump()
    db_item = models.Item(**item_dict)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)

    if not db_item.item_code:
        prefix = "PRD" if db_item.item_type == "product" else "PRT"
        db_item.item_code = f"{prefix}-{db_item.id:04d}"
        db.commit()
        db.refresh(db_item)

    # If initial stock > 0, record initial transaction
    if db_item.current_stock > 0:
        tx = models.Transaction(
            item_id=db_item.id,
            tx_type="in",
            sub_type="초기재고",
            quantity=db_item.current_stock,
            worker="시스템",
            company_name="초기등록",
            note="품목 신규 등록 시 초기 재고 설정"
        )
        db.add(tx)
        db.commit()

    return db_item

@app.post("/api/items/bulk")
def create_items_bulk(items: List[ItemCreate], db: Session = Depends(get_db)):
    success = 0
    failed = 0
    errors = []
    for idx, item in enumerate(items):
        try:
            item_dict = item.model_dump()
            db_item = models.Item(**item_dict)
            db.add(db_item)
            db.commit()
            db.refresh(db_item)

            if not db_item.item_code:
                prefix = "PRD" if db_item.item_type == "product" else "PRT"
                db_item.item_code = f"{prefix}-{db_item.id:04d}"
                db.commit()

            if db_item.current_stock > 0:
                tx = models.Transaction(
                    item_id=db_item.id,
                    tx_type="in",
                    sub_type="초기재고",
                    quantity=db_item.current_stock,
                    worker="엑셀일괄등록",
                    company_name="초기등록",
                    note="엑셀 일괄 등록"
                )
                db.add(tx)
                db.commit()

            success += 1
        except Exception as e:
            failed += 1
            errors.append(f"행 {idx+1} ({item.name}): {str(e)}")
            db.rollback()

    return {"total": len(items), "success": success, "failed": failed, "errors": errors}

@app.put("/api/items/{item_id}")
def update_item(item_id: int, item_update: ItemUpdate, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    
    update_data = item_update.model_dump(exclude_unset=True)
    
    # Handle manual current_stock override
    if "current_stock" in update_data and update_data["current_stock"] is not None:
        new_stock = update_data["current_stock"]
        diff = new_stock - db_item.current_stock
        if diff != 0:
            tx = models.Transaction(
                item_id=db_item.id,
                tx_type="in" if diff > 0 else "out",
                sub_type="재고실사조정",
                quantity=abs(diff),
                worker="관리자",
                note=f"재고 직접 조정 (이전: {db_item.current_stock} -> 변경: {new_stock})"
            )
            db.add(tx)
        db_item.current_stock = new_stock

    for key, val in update_data.items():
        if key != "current_stock" and val is not None:
            setattr(db_item, key, val)

    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/api/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    
    # Also delete associated transactions and BOM items
    db.query(models.Transaction).filter(models.Transaction.item_id == item_id).delete()
    db.query(models.BOMItem).filter(
        or_(models.BOMItem.product_id == item_id, models.BOMItem.part_id == item_id)
    ).delete()
    db.delete(db_item)
    db.commit()
    return {"message": "품목과 관련 데이터가 삭제되었습니다."}

# --- BOM & Production APIs ---

@app.get("/api/bom/{product_id}")
def get_bom(product_id: int, db: Session = Depends(get_db)):
    bom_items = db.query(models.BOMItem, models.Item)\
                  .join(models.Item, models.BOMItem.part_id == models.Item.id)\
                  .filter(models.BOMItem.product_id == product_id).all()
    
    return [
        {
            "id": bom.id,
            "part_id": part.id,
            "part_code": part.item_code or f"PRT-{part.id:04d}",
            "part_name": part.name,
            "spec": part.spec or "-",
            "unit": part.unit or "EA",
            "current_stock": part.current_stock,
            "quantity_required": bom.quantity_required
        }
        for bom, part in bom_items
    ]

@app.post("/api/bom")
def save_bom(bom_req: BOMSaveRequest, db: Session = Depends(get_db)):
    # Clear existing BOM for this product
    db.query(models.BOMItem).filter(models.BOMItem.product_id == bom_req.product_id).delete()
    for item in bom_req.parts:
        if item.quantity_required > 0:
            bom_entry = models.BOMItem(
                product_id=bom_req.product_id,
                part_id=item.part_id,
                quantity_required=item.quantity_required
            )
            db.add(bom_entry)
    db.commit()
    return {"message": "BOM이 성공적으로 저장되었습니다."}

@app.post("/api/production")
def execute_production(prod: ProductionRequest, db: Session = Depends(get_db)):
    product = db.query(models.Item).filter(models.Item.id == prod.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="완제품을 찾을 수 없습니다.")
    if prod.quantity <= 0:
        raise HTTPException(status_code=400, detail="생산 수량은 1 이상이어야 합니다.")

    # Fetch BOM
    bom_items = db.query(models.BOMItem, models.Item)\
                  .join(models.Item, models.BOMItem.part_id == models.Item.id)\
                  .filter(models.BOMItem.product_id == prod.product_id).all()

    if not bom_items:
        raise HTTPException(status_code=400, detail="설정된 생산 부품(BOM) 구성이 없습니다. 먼저 부품 소요량을 등록해주세요.")

    # 1. Check stock availability for all parts
    shortages = []
    for bom, part in bom_items:
        total_needed = bom.quantity_required * prod.quantity
        if part.current_stock < total_needed:
            shortages.append(
                f"[{part.name}] 현재고: {part.current_stock}{part.unit or 'EA'} (필요량: {total_needed}{part.unit or 'EA'})"
            )

    if shortages:
        raise HTTPException(
            status_code=400,
            detail="부품 재고가 부족하여 생산을 진행할 수 없습니다:\n" + "\n".join(shortages)
        )

    # Generate LOT number if empty
    lot = prod.lot_number or f"LOT-{datetime.now().strftime('%Y%m%d%H%M')}"
    timestamp = datetime.utcnow()

    # 2. Deduct parts and create outbound transactions
    for bom, part in bom_items:
        total_needed = bom.quantity_required * prod.quantity
        part.current_stock -= total_needed
        tx_part = models.Transaction(
            item_id=part.id,
            tx_type="out",
            sub_type="생산투입출고",
            quantity=total_needed,
            worker=prod.worker or "생산팀",
            lot_number=lot,
            company_name="사내생산라인",
            timestamp=timestamp,
            note=f"[{product.name}] {prod.quantity}{product.unit or 'EA'} 생산 투입 소모"
        )
        db.add(tx_part)

    # 3. Add finished product stock and create inbound transaction
    product.current_stock += prod.quantity
    tx_prod = models.Transaction(
        item_id=product.id,
        tx_type="in",
        sub_type="생산완료입고",
        quantity=prod.quantity,
        worker=prod.worker or "생산팀",
        lot_number=lot,
        company_name="사내생산라인",
        timestamp=timestamp,
        note=prod.note or f"완제품 {prod.quantity}{product.unit or 'EA'} 생산 완료"
    )
    db.add(tx_prod)

    db.commit()
    return {
        "message": f"성공적으로 완제품 [{product.name}] {prod.quantity}개 생산 입고 및 부품 차감이 완료되었습니다.",
        "lot_number": lot
    }

# --- Transactions APIs ---

@app.get("/api/transactions")
def get_transactions(
    item_id: Optional[int] = None,
    item_type: Optional[str] = None,
    tx_type: Optional[str] = None,
    sub_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db)
):
    query = db.query(models.Transaction, models.Item)\
              .join(models.Item, models.Transaction.item_id == models.Item.id)

    if item_id:
        query = query.filter(models.Transaction.item_id == item_id)
    if item_type:
        query = query.filter(models.Item.item_type == item_type)
    if tx_type:
        query = query.filter(models.Transaction.tx_type == tx_type)
    if sub_type:
        query = query.filter(models.Transaction.sub_type == sub_type)
    if start_date:
        try:
            s_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(models.Transaction.timestamp >= s_dt)
        except ValueError:
            pass
    if end_date:
        try:
            e_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(models.Transaction.timestamp < e_dt)
        except ValueError:
            pass
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            or_(
                models.Item.name.ilike(search_fmt),
                models.Item.item_code.ilike(search_fmt),
                models.Transaction.lot_number.ilike(search_fmt),
                models.Transaction.worker.ilike(search_fmt),
                models.Transaction.company_name.ilike(search_fmt),
                models.Transaction.note.ilike(search_fmt)
            )
        )

    txs = query.order_by(desc(models.Transaction.timestamp)).limit(limit).all()

    result = []
    for tx, item in txs:
        result.append({
            "id": tx.id,
            "item_id": tx.item_id,
            "item_code": item.item_code or f"ITM-{item.id:04d}",
            "item_name": item.name,
            "item_type": item.item_type,
            "item_spec": item.spec or "-",
            "unit": item.unit or "EA",
            "tx_type": tx.tx_type,
            "sub_type": tx.sub_type or ("입고" if tx.tx_type == "in" else "출고"),
            "quantity": tx.quantity,
            "unit_price": tx.unit_price or item.unit_price or 0,
            "total_price": (tx.quantity or 0) * (tx.unit_price or item.unit_price or 0),
            "worker": tx.worker or "",
            "lot_number": tx.lot_number or "",
            "company_name": tx.company_name or "",
            "timestamp": tx.timestamp.strftime("%Y-%m-%d %H:%M:%S") if tx.timestamp else "",
            "note": tx.note or ""
        })
    return result

@app.get("/api/transactions/recent")
def get_recent_transactions(limit: int = 8, db: Session = Depends(get_db)):
    txs = db.query(models.Transaction, models.Item)\
            .join(models.Item, models.Transaction.item_id == models.Item.id)\
            .order_by(desc(models.Transaction.timestamp))\
            .limit(limit).all()
    
    result = []
    for tx, item in txs:
        result.append({
            "id": tx.id,
            "item_id": tx.item_id,
            "item_code": item.item_code or f"ITM-{item.id:04d}",
            "item_name": item.name,
            "item_type": item.item_type,
            "item_spec": item.spec or "-",
            "unit": item.unit or "EA",
            "tx_type": tx.tx_type,
            "sub_type": tx.sub_type or ("입고" if tx.tx_type == "in" else "출고"),
            "quantity": tx.quantity,
            "worker": tx.worker or "",
            "lot_number": tx.lot_number or "",
            "company_name": tx.company_name or "",
            "timestamp": tx.timestamp.strftime("%Y-%m-%d %H:%M:%S") if tx.timestamp else "",
            "note": tx.note or ""
        })
    return result

@app.post("/api/transactions")
def create_transaction(tx: TransactionCreate, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == tx.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    
    if tx.quantity <= 0:
        raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다.")

    if tx.tx_type == "out":
        if item.current_stock < tx.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"현재고가 부족합니다. (현재고: {item.current_stock}{item.unit or 'EA'}, 출고 요청량: {tx.quantity}{item.unit or 'EA'})"
            )
        item.current_stock -= tx.quantity
    elif tx.tx_type == "in":
        item.current_stock += tx.quantity
    else:
        raise HTTPException(status_code=400, detail="유효하지 않은 거래 유형입니다. (in 또는 out만 허용)")

    db_tx = models.Transaction(
        item_id=tx.item_id,
        tx_type=tx.tx_type,
        sub_type=tx.sub_type or ("일반입고" if tx.tx_type == "in" else "일반출고"),
        quantity=tx.quantity,
        unit_price=tx.unit_price or item.unit_price or 0,
        worker=tx.worker or "",
        lot_number=tx.lot_number or "",
        company_name=tx.company_name or "",
        timestamp=datetime.utcnow(),
        note=tx.note or ""
    )
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return {"message": "정상적으로 등록되었습니다.", "id": db_tx.id, "current_stock": item.current_stock}

@app.put("/api/transactions/{tx_id}")
def update_transaction(tx_id: int, tx_update: TransactionUpdate, db: Session = Depends(get_db)):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="이력을 찾을 수 없습니다.")
        
    item = db.query(models.Item).filter(models.Item.id == db_tx.item_id).first()
    
    if tx_update.quantity is not None and tx_update.quantity != db_tx.quantity:
        if tx_update.quantity < 1:
            raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다.")
        
        delta = tx_update.quantity - db_tx.quantity
        if db_tx.tx_type == "in":
            if item.current_stock + delta < 0:
                raise HTTPException(status_code=400, detail=f"수량 변경 시 현재고가 0 미만이 됩니다. (현재고: {item.current_stock})")
            item.current_stock += delta
        elif db_tx.tx_type == "out":
            if item.current_stock - delta < 0:
                raise HTTPException(status_code=400, detail=f"수량 변경 시 현재고가 0 미만이 됩니다. (현재고: {item.current_stock})")
            item.current_stock -= delta
        db_tx.quantity = tx_update.quantity

    if tx_update.sub_type is not None:
        db_tx.sub_type = tx_update.sub_type
    if tx_update.worker is not None:
        db_tx.worker = tx_update.worker
    if tx_update.lot_number is not None:
        db_tx.lot_number = tx_update.lot_number
    if tx_update.company_name is not None:
        db_tx.company_name = tx_update.company_name
    if tx_update.note is not None:
        db_tx.note = tx_update.note
        
    db.commit()
    return {"message": "이력이 성공적으로 수정되었습니다."}

@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not db_tx:
        raise HTTPException(status_code=404, detail="이력을 찾을 수 없습니다.")
    
    item = db.query(models.Item).filter(models.Item.id == db_tx.item_id).first()
    if item:
        # Revert stock
        if db_tx.tx_type == "in":
            if item.current_stock < db_tx.quantity:
                raise HTTPException(status_code=400, detail="해당 입고를 취소하면 현재고가 음수가 되므로 삭제할 수 없습니다.")
            item.current_stock -= db_tx.quantity
        elif db_tx.tx_type == "out":
            item.current_stock += db_tx.quantity

    db.delete(db_tx)
    db.commit()
    return {"message": "거래 이력이 취소되고 재고가 원래대로 복원되었습니다."}

@app.get("/api/statistics/monthly")
def get_monthly_statistics(year: Optional[int] = None, db: Session = Depends(get_db)):
    txs = db.query(models.Transaction, models.Item)\
            .join(models.Item, models.Transaction.item_id == models.Item.id).all()
    
    stats = {}
    for tx, item in txs:
        if not tx.timestamp:
            continue
        if year and tx.timestamp.year != year:
            continue
        month = tx.timestamp.strftime("%Y-%m")
        key = (month, tx.item_id)
        if key not in stats:
            stats[key] = {
                "month": month,
                "item_id": item.id,
                "item_code": item.item_code or f"ITM-{item.id:04d}",
                "item_name": item.name,
                "item_type": item.item_type,
                "spec": item.spec or "-",
                "unit": item.unit or "EA",
                "total_in": 0,
                "total_out": 0,
                "current_stock": item.current_stock
            }
        if tx.tx_type == "in":
            stats[key]["total_in"] += tx.quantity
        else:
            stats[key]["total_out"] += tx.quantity
            
    result = list(stats.values())
    result.sort(key=lambda x: (x["month"], x["item_name"]), reverse=True)
    return result

# --- Notice APIs ---

@app.get("/api/notices", response_model=List[NoticeResponse])
def get_notices(db: Session = Depends(get_db)):
    notices = db.query(models.Notice).order_by(models.Notice.created_at.desc()).all()
    for n in notices:
        n.created_at = n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else ""
    return notices

@app.post("/api/notices", response_model=NoticeResponse)
def create_notice(notice: NoticeCreate, db: Session = Depends(get_db)):
    db_notice = models.Notice(**notice.model_dump())
    db.add(db_notice)
    db.commit()
    db.refresh(db_notice)
    db_notice.created_at = db_notice.created_at.strftime("%Y-%m-%d %H:%M")
    return db_notice

@app.put("/api/notices/{notice_id}/toggle")
def toggle_notice(notice_id: int, db: Session = Depends(get_db)):
    db_notice = db.query(models.Notice).filter(models.Notice.id == notice_id).first()
    if not db_notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    db_notice.is_resolved = 1 if db_notice.is_resolved == 0 else 0
    db.commit()
    return {"message": "상태가 변경되었습니다."}

@app.delete("/api/notices/{notice_id}")
def delete_notice(notice_id: int, db: Session = Depends(get_db)):
    db_notice = db.query(models.Notice).filter(models.Notice.id == notice_id).first()
    if db_notice:
        db.delete(db_notice)
        db.commit()
    return {"message": "삭제되었습니다."}

# --- Static files ---
import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")
