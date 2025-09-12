#!/bin/bash

# ResearStudio One-Click Installation Script
# This script installs and configures ResearStudio automatically

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# ASCII Art Banner
echo -e "${BLUE}"
cat << "EOF"
 ____                                _             _ _       
|  _ \ ___  ___  ___  __ _ _ __ ___ | |_ _   _  __| (_) ___  
| |_) / _ \/ __|/ _ \/ _` | '__/ __|| __| | | |/ _` | |/ _ \ 
|  _ <  __/\__ \  __/ (_| | |  \__ \| |_| |_| | (_| | | (_) |
|_| \_\___||___/\___|\__,_|_|  |___/ \__|\__,_|\__,_|_|\___/ 
                                                               
EOF
echo -e "${NC}"
echo "Welcome to ResearStudio Installation"
echo "====================================="
echo ""

# Check if running from correct directory
if [ ! -f "README.md" ] || [ ! -d "agent" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the ResearStudio root directory"
    exit 1
fi

# Step 1: Check System Requirements
print_info "Checking system requirements..."

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | grep -Po '(?<=Python )\d+\.\d+')
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
    
    if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 8 ]; then
        print_status "Python $PYTHON_VERSION found"
    else
        print_error "Python 3.8+ required, found $PYTHON_VERSION"
        exit 1
    fi
else
    print_error "Python 3 not found. Please install Python 3.8 or higher"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | grep -Po '\d+' | head -1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        print_status "Node.js $(node --version) found"
    else
        print_error "Node.js 18+ required, found $(node --version)"
        exit 1
    fi
else
    print_error "Node.js not found. Please install Node.js 18 or higher"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    print_status "npm $(npm --version) found"
else
    print_error "npm not found. Please install npm"
    exit 1
fi

# Step 2: Install Python Dependencies
echo ""
print_info "Installing Python dependencies..."

# Core dependencies
PYTHON_DEPS=(
    "flask"
    "flask-cors"
    "openai"
    "python-dotenv"
    "aiohttp"
    "websockets"
    "httpx"
    "requests"
    "pyyaml"
    "numpy"
    "pandas"
)

# Try to create virtual environment
if python3 -m venv venv 2>/dev/null; then
    print_status "Virtual environment created"
    source venv/bin/activate
    pip install --upgrade pip > /dev/null 2>&1
else
    print_warning "Could not create virtual environment, using user installation"
    PIP_USER="--user"
fi

# Install Python packages
for dep in "${PYTHON_DEPS[@]}"; do
    if pip3 install $PIP_USER "$dep" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $dep"
    else
        echo -e "  ${YELLOW}⚠${NC} $dep (may already be installed)"
    fi
done

# Install MCP separately as it might fail
if pip3 install $PIP_USER mcp > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} mcp"
else
    echo -e "  ${YELLOW}⚠${NC} mcp (optional, some features may be limited)"
fi

# Install document processing tools (optional)
OPTIONAL_DEPS=(
    "beautifulsoup4"
    "pypdf2"
    "python-docx"
    "openpyxl"
    "pillow"
)

print_info "Installing optional dependencies..."
for dep in "${OPTIONAL_DEPS[@]}"; do
    if pip3 install $PIP_USER "$dep" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $dep"
    else
        echo -e "  ${YELLOW}⚠${NC} $dep (optional)"
    fi
done

# Step 3: Setup Environment Files
echo ""
print_info "Setting up environment files..."

# Agent .env
if [ ! -f "agent/.env" ]; then
    if [ -f "agent/.env.example" ]; then
        cp agent/.env.example agent/.env
        print_status "Created agent/.env from template"
        print_warning "Please edit agent/.env and add your OpenAI API key"
    else
        cat > agent/.env << EOL
# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# Model Configuration
PLANNER_MODEL=gpt-4
EXECUTOR_MODEL=gpt-4o-mini
IMAGE_MODEL=gpt-4o
VIDEO_MODEL=gemini-2.0-flash-exp

# Tool Configuration
ENABLE_CODE_EXECUTION=true
MAX_EXECUTION_TIME=120

# Security
SANDBOX_MODE=true
EOL
        print_status "Created agent/.env with defaults"
        print_warning "Please edit agent/.env and add your OpenAI API key"
    fi
else
    print_status "agent/.env already exists"
fi

# Frontend .env.local
if [ ! -f "frontend/.env.local" ]; then
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env.local
    else
        cat > frontend/.env.local << EOL
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_WS_URL=ws://localhost:5000

# OpenAI Configuration (for frontend features)
OPENAI_API_KEY=your-openai-api-key-here

# Feature Flags
NEXT_PUBLIC_ENABLE_3D=true
NEXT_PUBLIC_ENABLE_REALTIME=true
EOL
    fi
    print_status "Created frontend/.env.local"
else
    print_status "frontend/.env.local already exists"
fi

# Step 4: Install Frontend Dependencies
echo ""
print_info "Installing frontend dependencies (this may take a few minutes)..."

cd frontend

# Check if node_modules exists and is recent
if [ -d "node_modules" ]; then
    if [ -f "node_modules/.package-lock.json" ]; then
        print_status "Node modules already installed"
    else
        print_warning "Reinstalling node modules..."
        rm -rf node_modules package-lock.json
        npm install --legacy-peer-deps > /dev/null 2>&1 || npm install --force > /dev/null 2>&1
    fi
else
    npm install --legacy-peer-deps > /dev/null 2>&1 || npm install --force > /dev/null 2>&1
    print_status "Frontend dependencies installed"
fi

cd ..

# Step 5: Create necessary directories
echo ""
print_info "Creating necessary directories..."
mkdir -p agent/workspaces
mkdir -p agent/agent_cache
print_status "Directories created"

# Step 6: Create startup scripts
echo ""
print_info "Creating startup scripts..."

# Create logs directory
mkdir -p logs
print_status "Created logs directory"

# Create start script with port support and daemon mode
cat > start.sh << 'EOL'
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

echo -e "   ${GREEN}✓${NC} Backend running on http://localhost:$BACKEND_PORT"

# Start frontend
echo -e "${GREEN}[2/2]${NC} Starting frontend server on port $FRONTEND_PORT..."
cd frontend

# Update frontend port
export PORT=$FRONTEND_PORT
if [ "$FRONTEND_PORT" != "3000" ]; then
    echo -e "${YELLOW}[INFO]${NC} Using custom frontend port: $FRONTEND_PORT"
fi

# Update API URL in environment if backend port changed
if [ "$BACKEND_PORT" != "5000" ]; then
    export NEXT_PUBLIC_API_URL="http://localhost:$BACKEND_PORT"
    echo -e "${YELLOW}[INFO]${NC} Updated API URL to: http://localhost:$BACKEND_PORT"
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
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend:  http://localhost:$BACKEND_PORT"
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
EOL

chmod +x start.sh
print_status "Created enhanced start.sh with port support and daemon mode"

# Create stop script with dynamic port support
cat > stop.sh << 'EOL'
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

# If no specific ports provided, use defaults
if [ -z "$BACKEND_PORT" ] && [ -z "$FRONTEND_PORT" ]; then
    BACKEND_PORT="5000"
    FRONTEND_PORT="3000"
    echo "No ports specified, using defaults: Backend=5000, Frontend=3000"
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
EOL

chmod +x stop.sh
print_status "Created enhanced stop.sh with dynamic port support"

# Create log viewer script
cat > log.sh << 'EOL'
#!/bin/bash

# ResearStudio Log Viewer Script
# Usage: ./log.sh [session_id] [--backend|--frontend|--all|--tail|--follow]
# Examples:
#   ./log.sh                    # Show latest session logs
#   ./log.sh 20241213_143055    # Show specific session logs
#   ./log.sh --tail             # Tail latest session logs
#   ./log.sh --backend          # Show only backend logs
#   ./log.sh session_id --tail  # Tail specific session logs

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
SESSION_ID=""
LOG_TYPE="all"
TAIL_MODE=false
FOLLOW_MODE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --backend|-b)
            LOG_TYPE="backend"
            shift
            ;;
        --frontend|-f)
            LOG_TYPE="frontend"
            shift
            ;;
        --all|-a)
            LOG_TYPE="all"
            shift
            ;;
        --tail|-t)
            TAIL_MODE=true
            shift
            ;;
        --follow|--watch|-w)
            FOLLOW_MODE=true
            shift
            ;;
        --help|-h)
            echo "ResearStudio Log Viewer"
            echo ""
            echo "Usage: ./log.sh [session_id] [options]"
            echo ""
            echo "Options:"
            echo "  --backend, -b     Show only backend logs"
            echo "  --frontend, -f    Show only frontend logs"
            echo "  --all, -a         Show all logs (default)"
            echo "  --tail, -t        Show last 50 lines and exit"
            echo "  --follow, -w      Follow logs (like tail -f)"
            echo "  --help, -h        Show this help"
            echo ""
            echo "Examples:"
            echo "  ./log.sh                    # Show latest session logs"
            echo "  ./log.sh 20241213_143055    # Show specific session logs"
            echo "  ./log.sh --tail             # Tail latest session logs"
            echo "  ./log.sh --backend          # Show only backend logs"
            echo "  ./log.sh session_id --tail  # Tail specific session logs"
            echo ""
            exit 0
            ;;
        --*)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            if [ -z "$SESSION_ID" ]; then
                SESSION_ID="$arg"
            fi
            shift
            ;;
    esac
done

# Function to get latest session ID
get_latest_session() {
    if [ -f "logs/latest_session.txt" ]; then
        cat logs/latest_session.txt
    else
        # Find the most recent session directory
        ls -1 logs/ | grep "^session_" | sort -r | head -1 | sed 's/session_//'
    fi
}

# Get session ID if not provided
if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(get_latest_session)
    if [ -z "$SESSION_ID" ]; then
        echo -e "${RED}No sessions found. Have you started ResearStudio yet?${NC}"
        echo "Run ./start.sh to start ResearStudio first."
        exit 1
    fi
    echo -e "${YELLOW}Using latest session: $SESSION_ID${NC}"
fi

# Set log directory
LOG_DIR="logs/session_${SESSION_ID}"

# Check if session exists
if [ ! -d "$LOG_DIR" ]; then
    echo -e "${RED}Session not found: $SESSION_ID${NC}"
    echo ""
    echo "Available sessions:"
    ls -1 logs/ | grep "^session_" | sed 's/session_/  /' | sort -r
    exit 1
fi

# Display session info
echo -e "${BLUE}ResearStudio Logs${NC}"
echo "=================="
if [ -f "$LOG_DIR/session_info.txt" ]; then
    cat "$LOG_DIR/session_info.txt"
else
    echo "Session: $SESSION_ID"
fi
echo ""

# Function to show logs with proper formatting
show_logs() {
    local file="$1"
    local title="$2"
    local color="$3"
    
    if [ -f "$file" ]; then
        echo -e "${color}$title${NC}"
        echo "$(printf '=%.0s' {1..40})"
        
        if [ "$TAIL_MODE" = true ]; then
            tail -n 50 "$file"
        elif [ "$FOLLOW_MODE" = true ]; then
            tail -f "$file"
        else
            cat "$file"
        fi
        echo ""
    else
        echo -e "${RED}$title - File not found: $file${NC}"
        echo ""
    fi
}

# Function to show all logs with timestamps
show_all_logs() {
    if [ "$FOLLOW_MODE" = true ]; then
        echo -e "${CYAN}Following all logs (Ctrl+C to exit)...${NC}"
        echo ""
        # Use multitail if available, otherwise use tail
        if command -v multitail &> /dev/null; then
            multitail -cT ANSI \
                -l "tail -f $LOG_DIR/backend.log" \
                -l "tail -f $LOG_DIR/frontend.log"
        else
            # Fallback to simple tail with process substitution
            tail -f "$LOG_DIR/backend.log" &
            BACKEND_TAIL_PID=$!
            tail -f "$LOG_DIR/frontend.log" &
            FRONTEND_TAIL_PID=$!
            
            # Cleanup function
            cleanup_tails() {
                kill $BACKEND_TAIL_PID $FRONTEND_TAIL_PID 2>/dev/null
                exit
            }
            trap cleanup_tails EXIT INT TERM
            wait
        fi
    else
        show_logs "$LOG_DIR/backend.log" "Backend Logs" "$GREEN"
        show_logs "$LOG_DIR/frontend.log" "Frontend Logs" "$BLUE"
    fi
}

# Show logs based on type
case $LOG_TYPE in
    backend)
        if [ "$FOLLOW_MODE" = true ]; then
            echo -e "${GREEN}Following backend logs (Ctrl+C to exit)...${NC}"
            echo ""
        fi
        show_logs "$LOG_DIR/backend.log" "Backend Logs" "$GREEN"
        ;;
    frontend)
        if [ "$FOLLOW_MODE" = true ]; then
            echo -e "${BLUE}Following frontend logs (Ctrl+C to exit)...${NC}"
            echo ""
        fi
        show_logs "$LOG_DIR/frontend.log" "Frontend Logs" "$BLUE"
        ;;
    all)
        show_all_logs
        ;;
esac

# Show available sessions at the end (except in follow mode)
if [ "$FOLLOW_MODE" = false ] && [ "$TAIL_MODE" = false ]; then
    echo -e "${YELLOW}Available sessions:${NC}"
    ls -1 logs/ | grep "^session_" | sed 's/session_/  /' | sort -r | head -10
    if [ $(ls -1 logs/ | grep "^session_" | wc -l) -gt 10 ]; then
        echo "  ... and more"
    fi
fi
EOL

chmod +x log.sh
print_status "Created log.sh for viewing session logs"

# Final summary
echo ""
echo "====================================="
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo "====================================="
echo ""
echo "Available Scripts:"
echo ""
echo -e "${BLUE}Starting ResearStudio:${NC}"
echo "  ./start.sh                    # Default ports (5000, 3000)"
echo "  ./start.sh 5001 3001          # Custom ports"
echo "  ./start.sh 5000 3000 --daemon # Background mode"
echo ""
echo -e "${BLUE}Stopping ResearStudio:${NC}"
echo "  ./stop.sh                     # Stop latest session"
echo "  ./stop.sh 5001 3001           # Stop specific ports"
echo ""
echo -e "${BLUE}Viewing Logs:${NC}"
echo "  ./log.sh                      # Show latest session logs"
echo "  ./log.sh --tail               # Show last 50 lines"
echo "  ./log.sh --follow             # Follow logs in real-time"
echo "  ./log.sh --backend            # Show only backend logs"
echo "  ./log.sh --frontend           # Show only frontend logs"
echo "  ./log.sh session_id           # Show specific session logs"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Add your OpenAI API key:"
echo "   Edit agent/.env and set OPENAI_API_KEY"
echo ""
echo "2. Start ResearStudio:"
echo "   ./start.sh"
echo ""
echo "3. Open in browser:"
echo "   http://localhost:3000"
echo ""
echo -e "${BLUE}Log Management:${NC}"
echo "- All logs are saved to logs/session_YYYYMMDD_HHMMSS/"
echo "- Session info includes ports, start time, and process IDs"
echo "- Use ./log.sh to view logs even after stopping ResearStudio"
echo ""
echo "For more information, see README.md"
echo ""

# Check if API key is set
if grep -q "your-openai-api-key-here" agent/.env 2>/dev/null; then
    print_warning "Don't forget to add your OpenAI API key to agent/.env!"
fi