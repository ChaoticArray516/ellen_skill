@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Ellen Skill Windows Startup Script
:: 艾莲技能 Windows 启动脚本

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Create logs directory
if not exist "logs" mkdir "logs"

set "LOG_FILE=%SCRIPT_DIR%logs\startup.log"
set "BACKEND_LOG=%SCRIPT_DIR%logs\backend.log"
set "FRONTEND_LOG=%SCRIPT_DIR%logs\frontend.log"

:: Get timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a:%%b)
set "TIMESTAMP=%mydate% %mytime%"

echo ============================================ >> "%LOG_FILE%"
echo [%TIMESTAMP%] Ellen Skill Starting... >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

:: Check for .env file
if not exist ".env" (
    echo [%TIMESTAMP%] ⚠️  .env file not found, creating from .env.example... >> "%LOG_FILE%"
    echo ⚠️  .env file not found, creating from .env.example...
    copy ".env.example" ".env" >nul
    echo [%TIMESTAMP%] ✅ .env file created, please edit and add your LLM_API_KEY >> "%LOG_FILE%"
    echo ✅ .env file created, please edit and add your LLM_API_KEY
    echo    Please edit .env file and add your API key
    pause
    exit /b 1
)

:: Check LLM_API_KEY
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="LLM_API_KEY" (
        set "API_KEY=%%b"
        :: Remove quotes if present
        set "API_KEY=!API_KEY:"=!"
    )
)

if "%API_KEY%"=="" (
    echo [%TIMESTAMP%] ❌ LLM_API_KEY not set, please edit .env file >> "%LOG_FILE%"
    echo ❌ LLM_API_KEY not set, please edit .env file
    pause
    exit /b 1
)

if "%API_KEY%"=="sk-your-api-key-here" (
    echo [%TIMESTAMP%] ❌ LLM_API_KEY not configured, please edit .env file >> "%LOG_FILE%"
    echo ❌ LLM_API_KEY not configured, please edit .env file
    pause
    exit /b 1
)

echo [%TIMESTAMP%] ✅ Environment check passed >> "%LOG_FILE%"

:: Log system info
echo [%TIMESTAMP%] System: %OS% >> "%LOG_FILE%"
echo [%TIMESTAMP%] Working Directory: %CD% >> "%LOG_FILE%"

:: Start Backend
echo [%TIMESTAMP%] 🚀 Starting Ellen Skill backend... >> "%LOG_FILE%"
echo 🚀 Starting Ellen Skill backend...
cd /d "%SCRIPT_DIR%packages\skill-backend"

:: Build backend if needed
if not exist "dist\index.js" (
    echo [%TIMESTAMP%] 📦 Building backend... >> "%LOG_FILE%"
    echo 📦 Building backend...
    call npm run build >> "%BACKEND_LOG%" 2>&1
    if errorlevel 1 (
        echo [%TIMESTAMP%] ❌ Backend build failed >> "%LOG_FILE%"
        echo ❌ Backend build failed, check %BACKEND_LOG%
        pause
        exit /b 1
    )
)

:: Start backend server
echo [%TIMESTAMP%] ▶️  Starting backend server... >> "%BACKEND_LOG%"
start /b "Ellen Skill Backend" cmd /c "node dist/index.js >> "%BACKEND_LOG%" 2>&1"
set "BACKEND_PID=!ERRORLEVEL!"
echo [%TIMESTAMP%] ✅ Backend started with PID: !BACKEND_PID! >> "%LOG_FILE%"

:: Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [%TIMESTAMP%] 🎨 Starting Ellen Skill frontend... >> "%LOG_FILE%"
echo 🎨 Starting Ellen Skill frontend...
cd /d "%SCRIPT_DIR%packages\frontend"

echo [%TIMESTAMP%] ▶️  Starting frontend dev server... >> "%FRONTEND_LOG%"
start /b "Ellen Skill Frontend" cmd /c "npm run dev >> "%FRONTEND_LOG%" 2>&1"
set "FRONTEND_PID=!ERRORLEVEL!"
echo [%TIMESTAMP%] ✅ Frontend started with PID: !FRONTEND_PID! >> "%LOG_FILE%"

:: Wait for frontend to initialize
timeout /t 5 /nobreak >nul

:: Print success message
cls
echo ============================================
echo    ✅ Ellen Skill 艾莲技能 已启动
echo ============================================
echo.
echo 🌐 Frontend: http://localhost:5173
echo 🔌 Backend WS: ws://127.0.0.1:8080
echo.
echo 📁 Log Files:
echo    - Startup: logs\startup.log
echo    - Backend: logs\backend.log
echo    - Frontend: logs\frontend.log
echo.
echo ============================================
echo Press any key to stop all services...
echo ============================================

:: Log startup completion
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a:%%b)
set "TIMESTAMP=%mydate% %mytime%"
echo [%TIMESTAMP%] ✅ All services started successfully >> "%LOG_FILE%"
echo [%TIMESTAMP%] Frontend: http://localhost:5173 >> "%LOG_FILE%"
echo [%TIMESTAMP%] Backend: ws://127.0.0.1:8080 >> "%LOG_FILE%"

:: Wait for key press
pause >nul

:: Shutdown
echo.
echo 🛑 Shutting down services...

:: Kill node processes (backend and frontend)
taskkill /f /im node.exe /fi "WINDOWTITLE eq Ellen Skill*" 2>nul

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a:%%b)
set "TIMESTAMP=%mydate% %mytime%"
echo [%TIMESTAMP%] 🛑 Services stopped by user >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

echo ✅ Services stopped
timeout /t 2 /nobreak >nul
endlocal
