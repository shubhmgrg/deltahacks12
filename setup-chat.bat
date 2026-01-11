@echo off
echo ==========================================
echo Setting up AI Agent Chat with Socket.io
echo ==========================================
echo.

REM Backend setup
echo Installing backend dependencies...
cd backend
call npm install socket.io @google/generative-ai
if %errorlevel% neq 0 (
    echo Failed to install backend dependencies
    exit /b 1
)
echo Backend dependencies installed

REM Check for .env file
if not exist .env (
    echo.
    echo No .env file found in backend/
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Created backend/.env
    echo IMPORTANT: Edit backend/.env and add your GEMINI_API_KEY
    echo Get your key from: https://makersuite.google.com/app/apikey
) else (
    echo backend/.env already exists
)

cd ..

REM Frontend setup
echo.
echo Installing frontend dependencies...
cd frontend
call npm install socket.io-client
if %errorlevel% neq 0 (
    echo Failed to install frontend dependencies
    exit /b 1
)
echo Frontend dependencies installed

REM Check for .env file
if not exist .env (
    echo.
    echo No .env file found in frontend/
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Created frontend/.env
) else (
    echo frontend/.env already exists
)

cd ..

echo.
echo ==========================================
echo Setup complete!
echo ==========================================
echo.
echo Next steps:
echo 1. Add your GEMINI_API_KEY to backend\.env
echo    Get it from: https://makersuite.google.com/app/apikey
echo.
echo 2. Ensure MongoDB is running
echo.
echo 3. Start the backend:
echo    cd backend ^&^& npm run dev
echo.
echo 4. Start the frontend (in a new terminal):
echo    cd frontend ^&^& npm run dev
echo.
echo 5. Open http://localhost:5173/app and look for the chat icon!
echo.
echo For more details, see CHAT_SETUP.md
echo ==========================================
pause
