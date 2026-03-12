#!/bin/bash
# Ellen Skill One-Click Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for .env file
if [ ! -f ".env" ]; then
  echo "⚠️  .env file not found, creating from .env.example..."
  cp .env.example .env
  echo "✅ .env file created, please edit and add your LLM_API_KEY"
  echo "   nano .env"
  exit 1
fi

# Check LLM_API_KEY
source .env
if [ -z "$LLM_API_KEY" ]; then
  echo "❌ LLM_API_KEY not set, please edit .env file"
  exit 1
fi

echo "🚀 Starting Ellen Skill backend..."
cd packages/skill-backend
npm run build
node dist/index.js &
BACKEND_PID=$!

echo "🎨 Starting Ellen Skill frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "✅ Ellen Skill started"
echo "   Frontend: http://localhost:5173"
echo "   Backend WS: ws://127.0.0.1:8080"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
