#!/usr/bin/env python
"""
ResearStudio Flask Multi-Agent Application Launcher

This script handles dependency installation and application startup
for the ResearStudio multi-agent system.
"""

import subprocess
import sys
import os
from pathlib import Path

def install_dependencies():
    """Install required dependencies for the Flask application."""
    print("🔧 Checking and installing dependencies...")
    
    # Core dependencies required for the application
    dependencies = [
        "flask",
        "flask-cors", 
        "openai",
        "python-dotenv"
    ]
    
    # MCP (Model Context Protocol) packages - handled separately due to potential install issues
    mcp_packages = ["mcp"]
    
    # Install basic dependencies
    for dep in dependencies:
        try:
            __import__(dep.replace("-", "_"))
            print(f"✅ {dep} already installed")
        except ImportError:
            print(f"📦 Installing {dep}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
    
    # Install MCP modules with error handling
    for dep in mcp_packages:
        try:
            __import__(dep)
            print(f"✅ {dep} already installed")
        except ImportError:
            print(f"📦 Installing {dep}...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
            except subprocess.CalledProcessError:
                print(f"⚠️ Unable to auto-install {dep}. Please install manually:")
                print(f"   pip install {dep}")
                print("Or refer to MCP official documentation for installation guidance")

def check_server_scripts():
    """Check if required server tool scripts exist."""
    print("🔍 Checking for server tool scripts...")
    
    server_dir = Path("server")
    if not server_dir.exists():
        print("❌ Server directory does not exist!")
        return False
    
    # List of required server tool scripts
    required_scripts = [
        "search_tool.py",       # Web search functionality
        "code_tool.py",         # Code execution environment
        "web_crawler.py",       # Web scraping capabilities
        "video_tool.py",        # Video processing
        "image_tool.py",        # Image processing
        "documents_tool.py"     # Document processing
    ]
    
    found_scripts = []
    missing_scripts = []
    
    # Check which scripts are available
    for script in required_scripts:
        script_path = server_dir / script
        if script_path.exists():
            found_scripts.append(script)
        else:
            missing_scripts.append(script)
    
    print(f"✅ Found {len(found_scripts)} server tool scripts:")
    for script in found_scripts:
        print(f"   - {script}")
    
    if missing_scripts:
        print(f"⚠️ Missing {len(missing_scripts)} server tool scripts:")
        for script in missing_scripts:
            print(f"   - {script}")
    
    return len(found_scripts) > 0

def main():
    """Launch the Flask multi-agent application."""
    print("🚀 Starting Flask multi-agent application...")
    
    # Set default environment variables
    os.environ.setdefault("FLASK_DEBUG", "True")
    # Check for BACKEND_PORT first (from start.sh), then PORT, then default to 5000
    if "BACKEND_PORT" in os.environ:
        os.environ["PORT"] = os.environ["BACKEND_PORT"]
    os.environ.setdefault("PORT", "5000")
    
    # Ensure workspaces directory exists for task storage
    workspaces_dir = Path("workspaces")
    workspaces_dir.mkdir(exist_ok=True)
    
    # Verify we're in the correct directory
    if not Path("client/agent_controller.py").exists():
        print("❌ Cannot find client/agent_controller.py")
        print("Please ensure you're running this script from the agent project root directory")
        return False
    
    # Add client directory to Python path for imports
    sys.path.insert(0, str(Path("client").absolute()))
    
    try:
        import atexit
        from agent_controller import (
            app, logger, 
            initialize_global_tools_sync, 
            cleanup_global_tools,
            get_global_tools_info,
            tools_initialized
        )
        
        # Get configuration from environment
        port = int(os.environ.get('PORT', 5000))
        debug_mode = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
        
        # Log startup configuration
        logger.info(f"🚀 Starting multi-agent Flask application...")
        logger.info(f"📡 Port: {port}")
        logger.info(f"🔧 Debug mode: {debug_mode}")
        logger.info(f"🏠 Workspace directory: ./workspaces/")
        
        # Initialize global tool pool - using sync version to avoid event loop conflicts
        success = initialize_global_tools_sync()
        if not success:
            logger.error("❌ Tool pool initialization failed, application cannot start")
            return False
        
        # Check tool pool status
        tools_info = get_global_tools_info()
        logger.info("✅ Global tool pool initialized successfully")
        logger.info(f"🎉 Connected to {tools_info['tools_count']} tools: {tools_info['tool_names']}")
        logger.info("🚀 All tasks will share the same tool service pool, avoiding duplicate startups")
        
        # Register cleanup function for application shutdown
        def cleanup_on_exit():
            """Clean up global tool pool when application shuts down."""
            logger.info("🧹 Application shutting down, cleaning up global tool pool...")
            if tools_initialized:
                try:
                    import asyncio
                    cleanup_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(cleanup_loop)
                    cleanup_loop.run_until_complete(cleanup_global_tools())
                    cleanup_loop.close()
                except Exception as e:
                    logger.error(f"Error occurred while cleaning up tool pool: {e}")
        
        atexit.register(cleanup_on_exit)
        
        logger.info(f"🌐 Access URL: http://0.0.0.0:{port}")
        
        # Start the Flask application
        app.run(
            host='0.0.0.0',
            port=port,
            debug=debug_mode,
            threaded=True
        )
        
        return True
        
    except KeyboardInterrupt:
        print("\n👋 Flask application stopped")
        return True
    except Exception as e:
        print(f"❌ Startup failed: {e}")
        print("\nPossible solutions:")
        print("1. Ensure all dependencies are installed")
        print("2. Check Python environment and version")
        print("3. Review the error message above")
        return False

if __name__ == "__main__":
    try:
        print("ResearStudio Flask Multi-Agent Application Launcher")
        print("=" * 52)
        
        # Install required dependencies
        install_dependencies()
        print()
        
        # Check for server tool scripts
        if not check_server_scripts():
            print("❌ Required server tool scripts not found, application may not work properly")
            response = input("Continue startup anyway? (y/N): ")
            if response.lower() != 'y':
                print("Startup cancelled")
                sys.exit(1)
        print()
        
        # Launch the application
        success = main()
        if not success:
            sys.exit(1)
        
    except KeyboardInterrupt:
        print("\n👋 Startup process interrupted")
    except Exception as e:
        print(f"❌ Startup failed: {e}")
        sys.exit(1)