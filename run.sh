#!/bin/bash
echo "Starting Self-Correcting RAG Pipeline..."

# Start Backend
echo "Starting Backend on port 8000..."
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend on port 5173..."
cd ../frontend
npm run dev -- --port 5173 &
FRONTEND_PID=$!

echo "Both servers are running."
echo "Frontend URL: http://localhost:5173"
echo "Backend Swagger UI: http://localhost:8000/docs"
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
