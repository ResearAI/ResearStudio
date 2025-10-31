#!/bin/bash

# ResearStudio Stop Script
# Usage: ./stop.sh [backend_port] [frontend_port]
# Example: ./stop.sh 5001 3001

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get ports from arguments or use defaults
BACKEND_PORT=${1:-}
FRONTEND_PORT=${2:-}

echo -e "${BLUE}Stopping ResearStudio...${NC}"
echo "======================="

# Function to kill processes on a specific port
kill_port() {
    local port=$1
    local service_name=$2
    
    if [ -n "$port" ]; then
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo -e "${YELLOW}Stopping $service_name on port $port...${NC}"
            echo "$pids" | xargs kill -9 2>/dev/null
            echo -e "  ${GREEN}✓${NC} $service_name stopped"
            return 0
        else
            echo -e "  ${YELLOW}ℹ${NC} No $service_name process found on port $port"
            return 1
        fi
    fi
}

# Function to stop processes by PID file
stop_by_pids() {
    local session_id=$1
    local log_dir="logs/session_${session_id}"
    local pid_file="$log_dir/pids.txt"
    
    if [ -f "$pid_file" ]; then
        echo -e "${YELLOW}Stopping processes from session $session_id...${NC}"
        local stopped=0
        while IFS= read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null
                if [ $? -eq 0 ]; then
                    echo -e "  ${GREEN}✓${NC} Stopped process $pid"
                    stopped=$((stopped + 1))
                fi
            fi
        done < "$pid_file"
        
        if [ $stopped -gt 0 ]; then
            rm -f "$pid_file"
            echo -e "  ${GREEN}✓${NC} Session $session_id stopped ($stopped processes)"
            return 0
        fi
    fi
    return 1
}

# If no ports specified, try to get them from latest session
if [ -z "$BACKEND_PORT" ] && [ -z "$FRONTEND_PORT" ]; then
    if [ -f "logs/latest_backend_port.txt" ] && [ -f "logs/latest_frontend_port.txt" ]; then
        BACKEND_PORT=$(cat logs/latest_backend_port.txt 2>/dev/null)
        FRONTEND_PORT=$(cat logs/latest_frontend_port.txt 2>/dev/null)
        echo "Using ports from latest session: Backend=$BACKEND_PORT, Frontend=$FRONTEND_PORT"
    fi
fi

# Try to stop by PID files from latest session first
latest_session=""
if [ -f "logs/latest_session.txt" ]; then
    latest_session=$(cat logs/latest_session.txt)
    if stop_by_pids "$latest_session"; then
        echo -e "${GREEN}✅ ResearStudio stopped successfully${NC}"
        exit 0
    fi
fi

# Ensure we have port values for any missing inputs
if [ -z "$BACKEND_PORT" ] && [ -z "$FRONTEND_PORT" ]; then
    BACKEND_PORT="5000"
    FRONTEND_PORT="3000"
    echo "No ports specified, using defaults: Backend=5000, Frontend=3000"
else
    if [ -z "$BACKEND_PORT" ]; then
        BACKEND_PORT="5000"
        echo "No backend port provided, defaulting to 5000"
    fi
    if [ -z "$FRONTEND_PORT" ]; then
        FRONTEND_PORT="3000"
        echo "No frontend port provided, defaulting to 3000"
    fi
fi

# Stop services by port
backend_stopped=false
frontend_stopped=false

if [ -n "$BACKEND_PORT" ]; then
    if kill_port "$BACKEND_PORT" "Backend"; then
        backend_stopped=true
    fi
fi

if [ -n "$FRONTEND_PORT" ]; then
    if kill_port "$FRONTEND_PORT" "Frontend"; then
        frontend_stopped=true
    fi
fi

# Fallback: Kill any remaining processes by name
echo -e "${YELLOW}Cleaning up remaining processes...${NC}"

# Kill any remaining python/node processes related to ResearStudio
killed_processes=0

# Kill Python app.py processes
python_pids=$(pgrep -f "python3.*app.py" 2>/dev/null)
if [ -n "$python_pids" ]; then
    echo "$python_pids" | xargs kill -9 2>/dev/null
    killed_processes=$((killed_processes + 1))
    echo -e "  ${GREEN}✓${NC} Stopped Python backend processes"
fi

# Kill npm/next processes
npm_pids=$(pgrep -f "npm run dev\|next.*dev" 2>/dev/null)
if [ -n "$npm_pids" ]; then
    echo "$npm_pids" | xargs kill -9 2>/dev/null
    killed_processes=$((killed_processes + 1))
    echo -e "  ${GREEN}✓${NC} Stopped Node.js frontend processes"
fi

# Final check for any remaining processes on the ports
remaining_backend=$(lsof -ti:${BACKEND_PORT:-5000} 2>/dev/null)
remaining_frontend=$(lsof -ti:${FRONTEND_PORT:-3000} 2>/dev/null)

if [ -n "$remaining_backend" ] || [ -n "$remaining_frontend" ]; then
    echo -e "${YELLOW}Force killing remaining processes...${NC}"
    [ -n "$remaining_backend" ] && echo "$remaining_backend" | xargs kill -9 2>/dev/null
    [ -n "$remaining_frontend" ] && echo "$remaining_frontend" | xargs kill -9 2>/dev/null
fi

echo ""
if [ "$backend_stopped" = true ] || [ "$frontend_stopped" = true ] || [ $killed_processes -gt 0 ]; then
    echo -e "${GREEN}✅ ResearStudio stopped successfully${NC}"
else
    echo -e "${YELLOW}⚠ No running ResearStudio processes found${NC}"
fi

# Show currently running processes on these ports (for verification)
echo ""
echo -e "${BLUE}Verification:${NC}"
backend_check=$(lsof -ti:${BACKEND_PORT:-5000} 2>/dev/null)
frontend_check=$(lsof -ti:${FRONTEND_PORT:-3000} 2>/dev/null)

if [ -z "$backend_check" ]; then
    echo -e "  ${GREEN}✓${NC} Port ${BACKEND_PORT:-5000} (backend) is free"
else
    echo -e "  ${RED}✗${NC} Port ${BACKEND_PORT:-5000} (backend) still has processes: $backend_check"
fi

if [ -z "$frontend_check" ]; then
    echo -e "  ${GREEN}✓${NC} Port ${FRONTEND_PORT:-3000} (frontend) is free"
else
    echo -e "  ${RED}✗${NC} Port ${FRONTEND_PORT:-3000} (frontend) still has processes: $frontend_check"
fi
