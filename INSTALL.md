# Installation Guide

This guide provides detailed instructions for installing and setting up ResearStudio on various platforms.

## Table of Contents

- [System Requirements](#system-requirements)
- [Installation Steps](#installation-steps)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Clone Repository](#2-clone-repository)
  - [3. Backend Setup](#3-backend-setup)
  - [4. Frontend Setup](#4-frontend-setup)
  - [5. Environment Configuration](#5-environment-configuration)
- [Running the Application](#running-the-application)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements

- **CPU**: 4 cores
- **RAM**: 8 GB
- **Storage**: 10 GB free space
- **OS**: Ubuntu 20.04+, macOS 12+, or Windows 10/11 with WSL2

### Recommended Requirements

- **CPU**: 8+ cores
- **RAM**: 16 GB
- **Storage**: 20 GB free space
- **GPU**: Optional, for faster model inference

### Software Requirements

- Python 3.8 or higher
- Node.js 18.0 or higher
- npm 9.0 or higher
- Git

## Quick Installation

### One-Click Install (Recommended)

For the fastest setup, use our automated installer:

```bash
# Clone the repository
git clone https://github.com/ResearAI/ResearStudio.git
cd ResearStudio

# Run the installer
./setup.sh

# Add your OpenAI API key
nano agent/.env  # Edit and add your API key

# Start ResearStudio
./start.sh
```

The installer will:
- Check system requirements
- Install all dependencies
- Create environment files
- Set up directories
- Create startup scripts

## Manual Installation Steps

### 1. Prerequisites

#### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install Python and pip
sudo apt install python3 python3-pip python3-venv

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

# Verify installations
python3 --version
node --version
npm --version
```

#### macOS

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.11

# Install Node.js
brew install node

# Verify installations
python3 --version
node --version
npm --version
```

#### Windows (WSL2)

1. Install WSL2 following [Microsoft's guide](https://docs.microsoft.com/en-us/windows/wsl/install)
2. Install Ubuntu from Microsoft Store
3. Follow the Ubuntu installation steps above

### 2. Clone Repository

```bash
# Clone the repository
git clone https://github.com/ResearAI/ResearStudio.git
cd ResearStudio
```

### 3. Backend Setup

#### Python Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip
```

#### Install Python Dependencies

```bash
# Install core dependencies
pip install flask flask-cors openai python-dotenv

# Install MCP and tool dependencies
pip install mcp requests aiohttp

# Install document processing dependencies
pip install pypdf2 python-docx openpyxl pandas pillow

# Install search and web scraping dependencies
pip install beautifulsoup4 crawl4ai selenium

# Install video and audio processing
pip install opencv-python moviepy assemblyai

# Or install all from requirements.txt
pip install -r requirements.txt
```

### 4. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Build the application
npm run build
```

### 5. Environment Configuration

#### Agent Environment Variables

Create `.env` file in the `agent` directory:

```bash
cd agent
cp .env.example .env
```

Edit `.env` with your settings:

```env
# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# Model Configuration
PLANNER_MODEL=gpt-4
EXECUTOR_MODEL=gpt-4o-mini
IMAGE_MODEL=gpt-4o
VIDEO_MODEL=gemini-2.0-flash-exp

# Tool Configuration
SEARCH_ENGINE_URL=http://localhost:8888
ENABLE_CODE_EXECUTION=true
MAX_EXECUTION_TIME=120

# Security
SANDBOX_MODE=true
ALLOWED_PACKAGES=numpy,pandas,matplotlib,scipy,scikit-learn
```

#### Frontend Environment Variables

Create `.env.local` file in the `frontend` directory:

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_WS_URL=ws://localhost:5000

# OpenAI Configuration (for frontend features)
OPENAI_API_KEY=your-openai-api-key-here

# Feature Flags
NEXT_PUBLIC_ENABLE_3D=true
NEXT_PUBLIC_ENABLE_REALTIME=true
```

## Running the Application

### Development Mode

#### Start the Agent System

```bash
# Terminal 1: Start the Flask API server
cd agent
python app.py
```

The agent system will start on `http://localhost:5000`

#### Start the Frontend

```bash
# Terminal 2: Start the Next.js development server
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Production Mode

#### Using Process Managers

##### With PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start backend
pm2 start agent/app.py --name researstudio-backend --interpreter python3

# Start frontend
cd frontend
npm run build
pm2 start npm --name researstudio-frontend -- start

# Save PM2 configuration
pm2 save
pm2 startup
```

##### With systemd (Linux)

Create service files:

`/etc/systemd/system/researstudio-backend.service`:

```ini
[Unit]
Description=ResearStudio Backend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ResearStudio/agent
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/researstudio-frontend.service`:

```ini
[Unit]
Description=ResearStudio Frontend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ResearStudio/frontend
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start services:

```bash
sudo systemctl enable researstudio-backend researstudio-frontend
sudo systemctl start researstudio-backend researstudio-frontend
```

## Troubleshooting

### Common Issues

#### Installation Issues

**1. Virtual Environment Creation Fails**

If you see: `ensurepip is not available`

Solution:
```bash
# Ubuntu/Debian
sudo apt-get install python3-venv

# Or use without virtual environment
pip3 install --user -r requirements.txt
```

**2. npm install fails with peer dependency errors**

Solution:
```bash
cd frontend
npm install --legacy-peer-deps
# or
npm install --force
```

**3. MCP installation fails**

This is optional. The system will work without it, but some features may be limited.

#### Runtime Issues

#### 1. Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Check what's using port 5000
lsof -i :5000

# Kill process using port
kill -9 <PID>
```

#### 2. OpenAI API Key Issues

- Verify your API key is correct
- Check you have sufficient credits
- Ensure the key has the necessary permissions

#### 3. Node.js Version Issues

```bash
# Use Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

#### 4. Python Package Conflicts

```bash
# Clean install in virtual environment
deactivate
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 5. Frontend Build Errors

```bash
# Clear Next.js cache
rm -rf frontend/.next
rm -rf frontend/node_modules
cd frontend
npm install
npm run build
```

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/ResearAI/ResearStudio/issues)
2. Email support: resear.ai@gmail.com

## Next Steps

After successful installation:

1. Read the [Developer Guide](./DEVELOPER.md) to understand the architecture
2. Follow the [Blog Tutorial](./BLOG_TUTORIAL.md) for a hands-on walkthrough
3. Check the [API Documentation](./API.md) for integration details