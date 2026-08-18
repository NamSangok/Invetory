@echo off
chcp 65001 > nul
title 생산 부품 및 완제품 입출고 관리 시스템

cd /d "%~dp0"

set PYTHON_EXE=python
where python >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Users\JMT1\AppData\Local\Programs\Python\Python314\python.exe" (
        set PYTHON_EXE="C:\Users\JMT1\AppData\Local\Programs\Python\Python314\python.exe"
    ) else (
        where py >nul 2>nul
        if %errorlevel% equ 0 (
            set PYTHON_EXE=py
        )
    )
)

start "" http://localhost:8000
%PYTHON_EXE% -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
