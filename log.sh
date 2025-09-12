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
    # Always find the most recent session directory by timestamp
    # This ensures we get the actual latest session, not a stale file
    latest=$(ls -1t logs/ 2>/dev/null | grep "^session_" | head -1 | sed 's/session_//')
    
    # If we found a session, update the latest_session.txt file
    if [ -n "$latest" ]; then
        echo "$latest" > logs/latest_session.txt 2>/dev/null
        echo "$latest"
    elif [ -f "logs/latest_session.txt" ]; then
        # Fallback to saved file if no sessions found
        cat logs/latest_session.txt
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
