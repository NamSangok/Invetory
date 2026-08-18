@echo off
chcp 65001 > nul
echo ==============================================
echo 재고 관리 시스템 서버를 시작합니다...
echo ==============================================
echo.
echo [외부 컴퓨터/스마트폰에서 접속하는 방법]
echo 같은 와이파이나 사내망에 연결된 기기에서 아래 주소를 입력하세요.
python -c "import socket; print('접속 주소: http://' + socket.gethostbyname(socket.gethostname()) + ':8000')"
echo.
echo *주의* 윈도우 보안 경고 창이 뜨면 반드시 [허용]을 눌러주세요!
echo.
echo [안내] 서버를 끄려면 이 까만 창의 X 버튼을 눌러 닫으세요.
echo.

:: 프로그램이 설치된 절대 경로로 무조건 이동합니다. (바탕화면 등에 빼놓아도 작동하게 함)
cd /d "C:\Users\JMT1\.gemini\antigravity\scratch\inventory_system"

start http://localhost:8000
uvicorn main:app --reload --host 0.0.0.0 --port 8000

pause
