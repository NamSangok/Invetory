# 생산 부품 및 완제품 입출고 관리 대시보드 시스템 (Smart Inventory Hub)

회사 생산 부품(원자재/부자재/가공품) 및 완제품의 재고를 실시간으로 추적하고, 효율적인 입출고 및 생산 연동(BOM 조립), 통계 분석을 제공하는 통합 재고 관리 웹 애플리케이션입니다.

---

## 🌟 주요 기능 (Key Features)

1. **실시간 통합 대시보드 (Dashboard & Analytics)**
   - 총 등록 품목 수(생산 부품 vs 완제품 실시간 분류 집계)
   - 총 보유 재고 수량 및 추정 재고 평가액(₩)
   - 금일 / 당월 누적 입고량 및 출고량 현황
   - 안전재고 부족 품목 및 결품(재고 0) 실시간 경고
   - 최근 7일간 주간 입출고 추이(막대 차트) 및 품목 분류별 재고 비중(도넛 차트) 시각화 (Chart.js)
   - 안전재고 미달 품목 실시간 긴급 경고 위젯 및 원클릭 즉시 입고 연동
   - 최근 입출고 실시간 피드 및 사내 공지/현장 작업 메모판

2. **생산 부품 & 완제품 품목 마스터 (Item Master)**
   - 전체 / 생산 부품 / 완제품 / 부족 재고 원클릭 필터링 및 통합 검색
   - 품목 코드(Part No.), 규격/사양, 단위(EA, M, kg, 박스 등), 적재 위치(창고/선반), 단가, 현재고, 안전재고 관리
   - 개별 품목 **1D 바코드(CODE128) 및 2D QR 코드 라벨 자동 생성 및 인쇄**
   - 엑셀(Excel) 표준 템플릿 다운로드 및 일괄 업로드(SheetJS) 지원

3. **스마트 입출고 관리 및 수불부 (Transactions)**
   - 입고(구매/생산완료/반품/조정) 및 출고(생산투입/납품/폐기) 세부 사유별 등록
   - LOT 번호, 거래처/출하처, 담당 작업자 추적성(Traceability) 관리
   - 입출고 이력 수정 및 거래 취소(재고 자동 역산 롤백) 지원
   - 기간별 다차원 필터링 및 수불부 엑셀 내보내기

4. **완제품 생산 관리 & BOM 조립 연계 (Production & BOM)**
   - 완제품 1개당 소요 부품 구성(BOM) 설정
   - 원클릭 생산 실행: 목표 수량 입력 시 필요 부품 재고 충족 여부 자동 계산 → **부품 자동 출고 차감 + 완제품 자동 입고 + 생산 LOT 자동 발급**

5. **클라우드 연동 및 모바일 / 태블릿 현장 연동 (Firebase Cloud Ready)**
   - **Firebase Cloud Firestore 실시간 양방향 동기화 지원**: 다른 장소(재택/출장/타사업장)의 PC나 모바일에서도 실시간 동기화
   - 사무실 PC와 공장 태블릿/스마트폰 완벽 호환 반응형 UI
   - 사내 Wi-Fi 자동 감지 및 접속용 QR코드 팝업 지원
   - 카메라 기반 바코드/QR 스캐너 지원

---

## 🛠️ 기술 스택 (Tech Stack)

- **Backend**: Python 3.14 + FastAPI + SQLAlchemy + Uvicorn
- **Database**: SQLite (`inventory.db`) / Firebase Cloud Firestore (Dual-mode)
- **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS, FontAwesome 6, Chart.js, SheetJS (XLSX), JsBarcode, QRCode.js, Html5-QRCode
- **Cloud & Hosting**: Firebase Hosting, Firebase Cloud Firestore

---

## 🚀 로컬 실행 방법 (How to Run Locally)

### 1. 바탕화면 또는 폴더 내 원클릭 실행
`프로그램_실행.bat` (또는 `run_dashboard.bat`)을 더블클릭합니다.

### 2. 명령어로 직접 실행
```bash
# 가상환경 활성화 후 의존성 설치 (필요시)
pip install -r requirements.txt

# 서버 실행
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
브라우저에서 `http://localhost:8000` 으로 접속합니다.

---

## ☁️ Firebase 클라우드 배포 (전 세계 접속)

1. `firebase.json` 설정 확인
2. `파이어베이스_배포.bat` 실행 또는:
```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting
```
