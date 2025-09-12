#!/bin/bash

# ResearStudio Startup Script
# Usage: ./start.sh [backend_port] [frontend_port] [--daemon]
# Example: ./start.sh 5000 3000 --daemon

# Default ports
BACKEND_PORT=${1:-5000}
FRONTEND_PORT=${2:-3000}
DAEMON_MODE=false

# Check for daemon flag
for arg in "$@"; do
    case $arg in
        --daemon|-d)
            DAEMON_MODE=true
            shift
            ;;
    esac
done

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Create logs directory if it doesn't exist
mkdir -p logs

# Generate timestamp for this session
SESSION_ID=$(date +%Y%m%d_%H%M%S)
LOG_DIR="logs/session_${SESSION_ID}"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}Starting ResearStudio...${NC}"
echo "========================"
echo "Session ID: $SESSION_ID"
echo "Backend Port: $BACKEND_PORT"
echo "Frontend Port: $FRONTEND_PORT"
echo "Daemon Mode: $DAEMON_MODE"
echo "Logs Directory: $LOG_DIR"
echo ""

# Save session info
cat > "$LOG_DIR/session_info.txt" << EOF
Session ID: $SESSION_ID
Start Time: $(date)
Backend Port: $BACKEND_PORT
Frontend Port: $FRONTEND_PORT
Daemon Mode: $DAEMON_MODE
PID File: $LOG_DIR/pids.txt
EOF

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down ResearStudio..."
    if [ -f "$LOG_DIR/pids.txt" ]; then
        while IFS= read -r pid; do
            kill "$pid" 2>/dev/null
        done < "$LOG_DIR/pids.txt"
        rm -f "$LOG_DIR/pids.txt"
    fi
    exit
}

# Only trap signals if not in daemon mode
if [ "$DAEMON_MODE" = false ]; then
    trap cleanup EXIT INT TERM
fi

# Start backend
echo -e "${GREEN}[1/2]${NC} Starting backend server on port $BACKEND_PORT..."
cd agent

# Update backend port in environment if needed
if [ "$BACKEND_PORT" != "5000" ]; then
    export PORT=$BACKEND_PORT
    export BACKEND_PORT=$BACKEND_PORT
    echo -e "${YELLOW}[INFO]${NC} Using custom backend port: $BACKEND_PORT"
fi

python3 app.py > "../$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "../$LOG_DIR/pids.txt"
cd ..

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 3

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Backend failed to start. Check $LOG_DIR/backend.log for details${NC}"
    exit 1
fi

echo -e "   ${GREEN}✓${NC} Backend running on http://0.0.0.0:$BACKEND_PORT"

# Start frontend
echo -e "${GREEN}[2/2]${NC} Starting frontend server on port $FRONTEND_PORT..."
cd frontend

# Update .env.local with correct backend port
if [ -f ".env.template" ]; then
    cp .env.template .env.local
    sed -i "s/BACKEND_PORT/$BACKEND_PORT/g" .env.local
    echo -e "${YELLOW}[INFO]${NC} Updated .env.local with backend port: $BACKEND_PORT"
else
    # Create .env.local if template doesn't exist
    cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT/api

NODE_ENV=development

NEXT_PUBLIC_APP_NAME=Manus Pro PLUS
NEXT_PUBLIC_APP_VERSION=1.0.0
EOF
    echo -e "${YELLOW}[INFO]${NC} Created .env.local with backend port: $BACKEND_PORT"
fi

# Update frontend port
export PORT=$FRONTEND_PORT
if [ "$FRONTEND_PORT" != "3000" ]; then
    echo -e "${YELLOW}[INFO]${NC} Using custom frontend port: $FRONTEND_PORT"
fi

npm run dev -- --port $FRONTEND_PORT > "../$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "../$LOG_DIR/pids.txt"
cd ..

# Wait for frontend to start
echo "Waiting for frontend to initialize..."
sleep 5

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}Frontend failed to start. Check $LOG_DIR/frontend.log for details${NC}"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${GREEN}✅ ResearStudio is running!${NC}"
echo ""
echo "  Frontend: http://0.0.0.0:$FRONTEND_PORT"
echo "  Backend:  http://0.0.0.0:$BACKEND_PORT"
echo "  Session:  $SESSION_ID"
echo "  Logs:     $LOG_DIR/"
echo ""

if [ "$DAEMON_MODE" = true ]; then
    echo -e "${YELLOW}Running in daemon mode.${NC}"
    echo "To view logs: ./log.sh $SESSION_ID"
    echo "To stop: ./stop.sh $BACKEND_PORT $FRONTEND_PORT"
    echo ""
    # Save current session as latest
    echo "$SESSION_ID" > logs/latest_session.txt
    echo "$BACKEND_PORT" > logs/latest_backend_port.txt
    echo "$FRONTEND_PORT" > logs/latest_frontend_port.txt
    exit 0
else
    echo "Press Ctrl+C to stop"
    echo "To view logs in another terminal: ./log.sh $SESSION_ID"
    echo ""
    # Keep script running
    wait
fi
