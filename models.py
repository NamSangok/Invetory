from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String, index=True, nullable=True) # 품목코드/품번
    name = Column(String, index=True, nullable=False) # 품명
    item_type = Column(String, index=True, nullable=False) # 'part' (생산부품) or 'product' (완제품)
    category = Column(String, nullable=True, default="일반") # 원자재, 부자재, 반제품, 완제품 등
    spec = Column(String, nullable=True) # 규격/사양
    unit = Column(String, nullable=True, default="EA") # 단위 (EA, 박스, kg, set 등)
    location = Column(String, nullable=True) # 적재 위치 (A-1, B-2 등)
    unit_price = Column(Integer, nullable=True, default=0) # 단가 (원)
    current_stock = Column(Integer, default=0) # 현재고
    safety_stock = Column(Integer, default=0) # 안전재고
    note = Column(String, nullable=True) # 비고
    created_at = Column(DateTime, default=datetime.utcnow)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    tx_type = Column(String, nullable=False) # 'in' (입고) or 'out' (출고)
    sub_type = Column(String, nullable=True) # 구매입고, 생산입고, 반품입고 / 생산출고, 납품출하, 폐기손실
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Integer, nullable=True, default=0)
    worker = Column(String, nullable=True) # 담당자/작업자
    lot_number = Column(String, nullable=True) # LOT 번호
    company_name = Column(String, nullable=True) # 거래처 / 납품처 / 공급업체
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    note = Column(String, nullable=True) # 비고

class BOMItem(Base):
    __tablename__ = "bom_items"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False, index=True) # 완제품 Item ID
    part_id = Column(Integer, nullable=False, index=True) # 생산 부품 Item ID
    quantity_required = Column(Integer, nullable=False, default=1) # 완제품 1개당 소요 부품 수량
    created_at = Column(DateTime, default=datetime.utcnow)

class Notice(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)
    is_resolved = Column(Integer, default=0) # 0: 미해결, 1: 해결 (SQLite boolean fallback)
    created_at = Column(DateTime, default=datetime.utcnow)
