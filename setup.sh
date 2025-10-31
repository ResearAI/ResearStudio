#!/bin/bash

# ResearStudio One-Click Installation Script
# This script installs and configures ResearStudio automatically with all dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

print_step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
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
echo "Welcome to ResearStudio Complete Installation"
echo "=============================================="
echo ""
echo "This script will install:"
echo "  • System dependencies (OpenGL, ffmpeg, etc.)"
echo "  • Python packages from requirements.txt"
echo "  • Playwright browsers for web crawling"
echo "  • Frontend dependencies (Node modules)"
echo "  • Configuration files and directories"
echo ""

# Check if running from correct directory
if [ ! -f "requirements.txt" ] || [ ! -d "agent" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the ResearStudio root directory"
    exit 1
fi

# Track installation issues
ISSUES_FOUND=0
WARNINGS_FOUND=0

# ============================================================================
# STEP 1: Install System-Level Dependencies
# ============================================================================
print_step "STEP 1: Installing System-Level Dependencies"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_NAME=$PRETTY_NAME
    print_info "Detected OS: $OS_NAME"
else
    print_warning "Cannot detect OS"
    OS="unknown"
fi

echo ""

# Install system dependencies based on OS
case $OS in
    ubuntu|debian|pop|linuxmint)
        print_info "Installing system dependencies for Ubuntu/Debian-based systems..."
        echo ""

        # Check if we can use sudo
        CAN_SUDO=false
        if sudo -n true 2>/dev/null; then
            CAN_SUDO=true
            print_status "sudo access confirmed"
        else
            print_warning "This installation requires sudo privileges for system packages"
            echo ""
            read -p "Install system dependencies? (Recommended) [Y/n]: " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                CAN_SUDO=true
            else
                print_warning "Skipping system dependencies - some features may not work"
                WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
            fi
        fi

        if [ "$CAN_SUDO" = true ]; then
            # Update package list
            print_info "Updating package list..."
            if sudo apt-get update -qq 2>/dev/null; then
                print_status "Package list updated"
            else
                print_warning "Failed to update package list"
            fi

            echo ""
            print_info "Installing required system packages..."

            # Core build tools
            print_info "  → Build essentials (gcc, make, etc.)..."
            if sudo apt-get install -y -qq build-essential python3-dev pkg-config 2>/dev/null; then
                print_status "    Build tools installed"
            else
                print_warning "    Some build tools may not be installed"
                WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
            fi

            # OpenCV dependencies (CRITICAL for opencv-python)
            print_info "  → OpenCV system libraries..."
            if sudo apt-get install -y -qq libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 2>/dev/null; then
                print_status "    OpenCV libraries installed"
            else
                print_warning "    OpenCV libraries may not be installed (opencv-python may fail)"
                WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
            fi

            # Video processing dependencies
            print_info "  → Video processing tools (ffmpeg)..."
            if sudo apt-get install -y -qq ffmpeg libavcodec-dev libavformat-dev libswscale-dev 2>/dev/null; then
                print_status "    ffmpeg installed"
            else
                print_warning "    ffmpeg may not be installed (video features will be limited)"
                WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
            fi

            # Playwright/Browser dependencies
            print_info "  → Browser libraries for web crawling..."
            if sudo apt-get install -y -qq \
                libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
                libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
                libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
                libgbm1 libpango-1.0-0 libcairo2 libasound2 2>/dev/null; then
                print_status "    Browser libraries installed"
            else
                print_warning "    Some browser libraries may not be installed (web crawling may fail)"
                WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
            fi

            echo ""
            print_status "System dependencies installation complete"
        fi
        ;;

    fedora|rhel|centos|rocky|almalinux)
        print_warning "Detected Fedora/RHEL-based system"
        print_info "Please manually install system dependencies:"
        echo "  sudo dnf install -y gcc gcc-c++ python3-devel mesa-libGL ffmpeg nss nspr"
        WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
        ;;

    arch|manjaro|endeavouros)
        print_warning "Detected Arch-based system"
        print_info "Please manually install system dependencies:"
        echo "  sudo pacman -S --noconfirm base-devel python mesa ffmpeg nss"
        WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
        ;;

    *)
        print_warning "Unknown OS detected"
        print_info "Please manually install: build-essential, python3-dev, libgl1-mesa-glx, ffmpeg, libnss3"
        WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
        ;;
esac

# ============================================================================
# STEP 2: Check System Requirements
# ============================================================================
print_step "STEP 2: Verifying System Requirements"

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | grep -Po '(?<=Python )\d+\.\d+' || echo "0.0")
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

    if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 8 ]; then
        print_status "Python $PYTHON_VERSION (>= 3.8 required)"
    else
        print_error "Python 3.8+ required, found $PYTHON_VERSION"
        exit 1
    fi
else
    print_error "Python 3 not found. Please install Python 3.8+"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | grep -Po '\d+' | head -1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        print_status "Node.js $(node --version) (>= 18 required)"
    else
        print_error "Node.js 18+ required, found $(node --version)"
        exit 1
    fi
else
    print_error "Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    print_status "npm $(npm --version)"
else
    print_error "npm not found. Please install npm"
    exit 1
fi

# Check pip
if command -v pip3 &> /dev/null; then
    print_status "pip3 $(pip3 --version | grep -Po '\d+\.\d+\.\d+' | head -1)"
else
    print_error "pip3 not found. Please install pip3"
    exit 1
fi

# ============================================================================
# STEP 3: Setup Python Environment
# ============================================================================
print_step "STEP 3: Setting Up Python Environment"

# Try to create virtual environment
USING_VENV=false
PIP_USER=""

if [ ! -d "venv" ]; then
    print_info "Creating Python virtual environment..."
    if python3 -m venv venv 2>/dev/null; then
        print_status "Virtual environment created at ./venv"
        USING_VENV=true
    else
        print_warning "Could not create virtual environment, will use user installation"
        PIP_USER="--user"
    fi
else
    print_status "Virtual environment already exists"
    USING_VENV=true
fi

# Activate virtual environment if it exists
if [ "$USING_VENV" = true ]; then
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
        print_status "Virtual environment activated"

        # Upgrade pip in venv
        print_info "Upgrading pip..."
        pip install --upgrade pip setuptools wheel > /dev/null 2>&1
        print_status "pip upgraded"
    fi
fi

# ============================================================================
# STEP 4: Install Python Dependencies
# ============================================================================
print_step "STEP 4: Installing Python Dependencies"

echo "This may take 5-10 minutes depending on your internet speed..."
echo "Installing packages from requirements.txt..."
echo ""

# Install with progress
if pip3 install $PIP_USER -r requirements.txt 2>&1 | tee /tmp/pip_install.log | grep -E "Requirement already satisfied|Successfully installed|Collecting"; then
    echo ""
    print_status "Python packages installation completed"
else
    INSTALL_EXIT=$?
    echo ""
    print_warning "Some packages may have installation issues (exit code: $INSTALL_EXIT)"

    # Try to install critical packages individually
    print_info "Installing critical packages individually..."
    CRITICAL_PKGS=("flask" "flask-cors" "openai" "python-dotenv" "mcp" "fastmcp" "requests" "aiohttp" "numpy" "pandas" "beautifulsoup4" "PyPDF2")

    for pkg in "${CRITICAL_PKGS[@]}"; do
        if pip3 install $PIP_USER "$pkg" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $pkg"
        else
            echo -e "  ${RED}✗${NC} $pkg - FAILED"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    done
fi

echo ""

# Verify critical package imports
print_info "Verifying critical Python packages..."
python3 << 'VERIFY_EOF'
import sys

packages = [
    ('flask', 'Flask'),
    ('flask_cors', 'Flask-CORS'),
    ('openai', 'OpenAI'),
    ('dotenv', 'python-dotenv'),
    ('mcp', 'MCP'),
    ('fastmcp', 'FastMCP'),
    ('requests', 'Requests'),
    ('numpy', 'NumPy'),
    ('pandas', 'Pandas'),
    ('bs4', 'BeautifulSoup4'),
    ('PyPDF2', 'PyPDF2'),
]

failed = []
for module, name in packages:
    try:
        __import__(module)
        print(f"  ✓ {name}")
    except ImportError as e:
        print(f"  ✗ {name} - MISSING")
        failed.append(name)

if failed:
    print(f"\nWARNING: {len(failed)} critical packages failed to import")
    sys.exit(1)
else:
    print("\nAll critical packages verified successfully!")
    sys.exit(0)
VERIFY_EOF

VERIFY_EXIT=$?
if [ $VERIFY_EXIT -ne 0 ]; then
    print_error "Some critical packages are missing or cannot be imported"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    print_status "All critical packages verified"
fi

# ============================================================================
# STEP 5: Install Playwright Browsers
# ============================================================================
print_step "STEP 5: Installing Playwright Browsers"

print_info "Installing Chromium browser for web crawling (crawl4ai)..."
echo "This may take a few minutes..."
echo ""

# Try different methods to install playwright
PLAYWRIGHT_INSTALLED=false

# Method 1: Direct playwright command
if command -v playwright &> /dev/null; then
    if playwright install chromium 2>&1 | tee /tmp/playwright_install.log; then
        PLAYWRIGHT_INSTALLED=true
    fi
fi

# Method 2: Python module
if [ "$PLAYWRIGHT_INSTALLED" = false ]; then
    print_info "Trying Python module method..."
    if python3 -m playwright install chromium 2>&1 | tee /tmp/playwright_install.log; then
        PLAYWRIGHT_INSTALLED=true
    fi
fi

echo ""
if [ "$PLAYWRIGHT_INSTALLED" = true ]; then
    print_status "Playwright Chromium browser installed"

    # Also try to install system dependencies for playwright
    if command -v playwright &> /dev/null; then
        print_info "Installing Playwright system dependencies..."
        playwright install-deps chromium 2>/dev/null || python3 -m playwright install-deps chromium 2>/dev/null || print_warning "Could not install Playwright system dependencies automatically"
    fi
else
    print_warning "Playwright browser installation had issues"
    print_info "You can manually install later with: python3 -m playwright install chromium"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
fi

# ============================================================================
# STEP 6: Setup Configuration Files
# ============================================================================
print_step "STEP 6: Creating Configuration Files"

# Agent .env
if [ ! -f "agent/.env" ]; then
    if [ -f "agent/.env.example" ]; then
        cp agent/.env.example agent/.env
        print_status "Created agent/.env from template"
    else
        cat > agent/.env << 'EOL'
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
    fi
    print_warning "⚠️  IMPORTANT: Edit agent/.env and add your OPENAI_API_KEY"
else
    print_status "agent/.env already exists"
fi

# Frontend .env.local
if [ ! -f "frontend/.env.local" ]; then
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env.local
    else
        cat > frontend/.env.local << 'EOL'
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

# ============================================================================
# STEP 7: Create Directories
# ============================================================================
print_step "STEP 7: Creating Project Directories"

DIRS=("agent/workspaces" "agent/agent_cache" "logs")
for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_status "Created $dir/"
    else
        print_status "$dir/ already exists"
    fi
done

# ============================================================================
# STEP 8: Install Frontend Dependencies
# ============================================================================
print_step "STEP 8: Installing Frontend Dependencies"

echo "This may take 5-10 minutes..."
echo ""

cd frontend

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    print_status "Node modules already installed"
else
    print_info "Installing Node.js packages..."
    if npm install --legacy-peer-deps > /tmp/npm_install.log 2>&1; then
        print_status "Frontend dependencies installed"
    else
        print_warning "npm install had some issues, trying with --force..."
        if npm install --force > /tmp/npm_install.log 2>&1; then
            print_status "Frontend dependencies installed (with --force)"
        else
            print_error "Failed to install frontend dependencies"
            print_info "Check /tmp/npm_install.log for details"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    fi
fi

cd ..

# ============================================================================
# STEP 9: Create Startup Scripts
# ============================================================================
print_step "STEP 9: Creating Startup Scripts"

# Create start.sh (simplified version for display)
if [ ! -f "start.sh" ] || [ ! -x "start.sh" ]; then
    chmod +x start.sh 2>/dev/null || true
    print_status "start.sh is ready"
else
    print_status "start.sh already exists"
fi

# Create stop.sh
if [ ! -f "stop.sh" ] || [ ! -x "stop.sh" ]; then
    chmod +x stop.sh 2>/dev/null || true
    print_status "stop.sh is ready"
else
    print_status "stop.sh already exists"
fi

# Create log.sh
if [ ! -f "log.sh" ] || [ ! -x "log.sh" ]; then
    chmod +x log.sh 2>/dev/null || true
    print_status "log.sh is ready"
else
    print_status "log.sh already exists"
fi

# ============================================================================
# STEP 10: Final Verification
# ============================================================================
print_step "STEP 10: Final System Verification"

echo "Running final checks..."
echo ""

# Check system dependencies
print_info "System Dependencies:"
if command -v ffmpeg &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} ffmpeg"
else
    echo -e "  ${YELLOW}⚠${NC} ffmpeg not found (video features will be limited)"
fi

if ldconfig -p 2>/dev/null | grep -q libGL.so; then
    echo -e "  ${GREEN}✓${NC} libGL (OpenGL)"
else
    echo -e "  ${YELLOW}⚠${NC} libGL not found (opencv may not work)"
fi

# Check Playwright browsers
if [ -d "$HOME/.cache/ms-playwright" ] || [ -d "$HOME/.cache/playwright" ]; then
    echo -e "  ${GREEN}✓${NC} Playwright browsers"
else
    echo -e "  ${YELLOW}⚠${NC} Playwright browsers (run: python3 -m playwright install chromium)"
fi

echo ""
print_info "Python Packages:"
PKG_COUNT=$(pip3 list 2>/dev/null | wc -l)
if [ "$PKG_COUNT" -gt 50 ]; then
    echo -e "  ${GREEN}✓${NC} $PKG_COUNT packages installed"
else
    echo -e "  ${YELLOW}⚠${NC} Only $PKG_COUNT packages (expected 100+)"
fi

echo ""
print_info "Frontend:"
if [ -d "frontend/node_modules" ]; then
    NODE_PKG_COUNT=$(ls -1 frontend/node_modules 2>/dev/null | wc -l)
    echo -e "  ${GREEN}✓${NC} $NODE_PKG_COUNT Node.js packages"
else
    echo -e "  ${RED}✗${NC} Node modules not installed"
fi

echo ""
print_info "Configuration:"
if [ -f "agent/.env" ]; then
    if grep -q "your-openai-api-key-here" agent/.env; then
        echo -e "  ${YELLOW}⚠${NC} agent/.env exists (API key not configured)"
    else
        echo -e "  ${GREEN}✓${NC} agent/.env configured"
    fi
else
    echo -e "  ${RED}✗${NC} agent/.env missing"
fi

# ============================================================================
# Installation Complete
# ============================================================================

echo ""
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ Installation Complete!${NC}"
else
    echo -e "${YELLOW}⚠️  Installation Complete with $ISSUES_FOUND issue(s)${NC}"
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}📋 Next Steps:${NC}"
echo ""
echo "1. Configure your API key:"
echo "   ${YELLOW}nano agent/.env${NC}   # Set OPENAI_API_KEY"
echo ""
echo "2. Start ResearStudio:"
echo "   ${YELLOW}./start.sh${NC}"
echo ""
echo "3. Open in browser:"
echo "   ${YELLOW}http://localhost:3000${NC}"
echo ""

echo -e "${BLUE}📚 Available Commands:${NC}"
echo ""
echo "  ${CYAN}./start.sh${NC}              Start ResearStudio"
echo "  ${CYAN}./start.sh --daemon${NC}     Start in background"
echo "  ${CYAN}./stop.sh${NC}               Stop ResearStudio"
echo "  ${CYAN}./log.sh${NC}                View logs"
echo ""

if [ $WARNINGS_FOUND -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS_FOUND warning(s) during installation${NC}"
    echo ""
    echo "Optional fixes:"
    echo "  • Install missing system packages manually"
    echo "  • Run: python3 -m playwright install chromium"
    echo "  • Run: pip3 install -r requirements.txt"
    echo ""
fi

if [ $ISSUES_FOUND -gt 0 ]; then
    echo -e "${RED}❌ $ISSUES_FOUND critical issue(s) found${NC}"
    echo ""
    echo "Please fix the issues above before starting ResearStudio"
    echo "Check installation logs:"
    echo "  • /tmp/pip_install.log (Python packages)"
    echo "  • /tmp/npm_install.log (Frontend packages)"
    echo "  • /tmp/playwright_install.log (Playwright)"
    echo ""
    exit 1
fi

echo -e "${GREEN}🎉 ResearStudio is ready to use!${NC}"
echo ""

# Check if API key is set
if grep -q "your-openai-api-key-here" agent/.env 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Don't forget to configure your OpenAI API key in agent/.env${NC}"
    echo ""
fi
