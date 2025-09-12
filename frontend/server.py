from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
import json
import time
import uuid
import zipfile
import io
import os
import mimetypes
from pathlib import Path
from threading import Thread
import queue
from typing import Dict, Any, Optional
import logging

# Initialize Flask application
app = Flask(__name__)
CORS(app)  # Enable cross-origin requests

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global status management
active_tasks: Dict[str, Dict[str, Any]] = {}  # Active task storage
task_queues: Dict[str, queue.Queue] = {}  # Task message queues
task_executors: Dict[str, 'TaskExecutor'] = {}  # Task executor instances
# Store completed task history for longer retention
completed_tasks_history: Dict[str, Dict[str, Any]] = {}  # Completed task history

# Define file types that need URL transmission mode
URL_FILE_TYPES = {
    # Image files
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
    # Video files  
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
    # PDF files
    '.pdf',
    # Audio files
    '.mp3', '.wav', '.aac', '.ogg', '.m4a',
    # Other binary files
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.exe', '.msi', '.dmg', '.deb', '.rpm'
}

# Define editable text file types
EDITABLE_FILE_TYPES = {
    '.md', '.txt', '.py', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss', '.less',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.sh', '.bat', '.ps1', '.sql', '.csv', '.log'
}

def should_use_url_mode(filename: str) -> bool:
    """Determine if a file should use URL transmission mode."""
    file_ext = Path(filename).suffix.lower()
    return file_ext in URL_FILE_TYPES

def is_editable_file(filename: str) -> bool:
    """Determine if a file is editable."""
    file_ext = Path(filename).suffix.lower()
    return file_ext in EDITABLE_FILE_TYPES or file_ext == '.html'

# Sample multimedia content - using real URLs
SAMPLE_MEDIA = {
    'research_paper.pdf': {
        'type': 'pdf',
        'url': 'https://openreview.net/pdf?id=bjcsVLoHYs',
        'description': 'A research paper on neural networks from OpenReview'
    },
    'brand_logo.png': {
        'type': 'image',
        'url': 'https://pic2.zhimg.com/v2-98b7321bf9cf8e591a18ffa7b6b7d041_1440w.jpg',
        'description': 'Brand logo image for demonstration'
    },
    'demo_chart.svg': {
        'type': 'image',
        'content': '''<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="50" y="50" width="60" height="150" fill="#3b82f6"/>
  <rect x="130" y="80" width="60" height="120" fill="#06d6a0"/>
  <rect x="210" y="100" width="60" height="100" fill="#f72585"/>
  <rect x="290" y="70" width="60" height="130" fill="#ffd60a"/>
  <text x="200" y="30" text-anchor="middle" font-family="Arial" font-size="16" fill="#1e293b">Sample Chart Data</text>
  <text x="80" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q1</text>
  <text x="160" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q2</text>
  <text x="240" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q3</text>
  <text x="320" y="230" text-anchor="middle" font-size="12" fill="#64748b">Q4</text>
</svg>''',
        'description': 'A sample chart for data visualization demo'
    },
    'demo_page.html': {
        'type': 'html',
        'content': '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>演示页面 - ResearShop</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        h1 { 
            color: #fff; 
            text-align: center; 
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin: 2rem 0;
        }
        .feature-card {
            background: rgba(255, 255, 255, 0.2);
            padding: 1.5rem;
            border-radius: 15px;
            text-align: center;
            transition: transform 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
        }
        .emoji { font-size: 3rem; margin-bottom: 1rem; }
        button {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        button:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }
        .demo-section {
            background: rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            border-radius: 15px;
            margin: 1.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ResearShop 演示页面</h1>
        
        <div class="demo-section">
            <h2>🎯 多媒体支持展示</h2>
            <p>这是一个现代化的HTML演示页面，展示了ResearShop的多媒体file支持能力。</p>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <div class="emoji">📄</div>
                <h3>PDF 查看器</h3>
                <p>支持直接在界面中查看PDFdocumentation，无需外部软件。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">🖼️</div>
                <h3>图像显示</h3>
                <p>支持多种图像格式的实时预览和显示。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">🌐</div>
                <h3>HTML 预览</h3>
                <p>即时HTML页面渲染，支持代码和预览双模式。</p>
            </div>
            
            <div class="feature-card">
                <div class="emoji">📊</div>
                <h3>data可视化</h3>
                <p>SVG图表和交互式data展示功能。</p>
            </div>
        </div>

        <div class="demo-section">
            <h2>⚡ 交互功能test</h2>
            <button onclick="showAlert()">点击testJavaScript</button>
            <button onclick="changeColor()">改变背景色</button>
            <button onclick="addTimestamp()">添加时间戳</button>
            
            <div id="output" style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 10px;">
                <p>交互output区域：等待用户操作...</p>
            </div>
        </div>

        <div class="demo-section">
            <h2>📝 实时编辑test</h2>
            <p>您可以在代码模式下编辑此HTMLfile，然后切换到预览模式查看效果。</p>
            <p><strong>create时间：</strong> <span id="timestamp"></span></p>
        </div>
    </div>

    <script>
        // setupcreate时间
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        
        function showAlert() {
            document.getElementById('output').innerHTML = 
                '<p style="color: #4CAF50;">✅ JavaScript 功能正常run！</p>';
        }
        
        function changeColor() {
            const colors = [
                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
            ];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            document.body.style.background = randomColor;
            document.getElementById('output').innerHTML = 
                '<p style="color: #FF9800;">🎨 背景颜色已更改！</p>';
        }
        
        function addTimestamp() {
            const now = new Date().toLocaleTimeString();
            document.getElementById('output').innerHTML = 
                `<p style="color: #2196F3;">⏰ 当前时间：${now}</p>`;
        }
    </script>
</body>
</html>''',
        'description': 'Interactive HTML demonstration page with modern styling'
    }
}


class TaskExecutor:
    """
    AI Task Executor class
    Responsible for simulating the complete AI assistant task execution process.
    """

    def __init__(self, task_id: str, prompt: str):
        """
        Initialize task executor.

        Args:
            task_id: Unique task identifier
            prompt: User input task description
        """
        self.task_id = task_id
        self.prompt = prompt
        self.current_file = "todo.md"
        self.file_content = ""
        self.is_paused = False
        self.all_files = {}  # Store all created files
        self.execution_log = []  # Execution log
        self.task_status = "created"  # Task status tracking
        self.step_interval = 3.0  # 3 second interval between steps
        self.messages_sent = 0  # Message sequence counter
        self.is_running = False  # Running status flag
        # Message history for replay functionality
        self.message_history = []  # All sent message history

    def emit_activity(self, activity_type: str, text: str, **kwargs) -> int:
        """
        Send activity update to frontend.

        Args:
            activity_type: Activity type (thinking, command, file, edit, etc.)
            text: Activity description text
            **kwargs: Other activity-related parameters

        Returns:
            Activity ID for subsequent status updates
        """
        activity_id = int(time.time() * 1000000)  # Use microseconds to ensure uniqueness
        activity = {
            "id": activity_id,
            "text": text,
            "type": activity_type,
            "status": kwargs.get("status", "in-progress"),
            "timestamp": time.time()
        }
        
        # Add specific data based on activity type
        if activity_type == "command":
            activity["command"] = kwargs.get("command", "")
        elif activity_type in ["file", "edit"]:
            activity["filename"] = kwargs.get("filename", "")
        elif activity_type == "browse":
            activity["path"] = kwargs.get("path", "")
        elif activity_type == "terminal":
            activity["output"] = kwargs.get("output", "")
            activity["command"] = kwargs.get("command", "")
        
        logger.info(f"Task {self.task_id} - Activity: {activity}")
        # Record to execution log
        self.execution_log.append(activity)

        # Send to frontend
        self._send_message("activity", activity)

        return activity_id

    def update_activity_status(self, activity_id: int, status: str, **kwargs):
        """
        Update activity status.

        Args:
            activity_id: Activity ID
            status: New status (completed, failed, in-progress)
            **kwargs: Other update parameters
        """
        update_data = {
            "id": activity_id,
            "status": status,
            **kwargs
        }
        self._send_message("activity_update", update_data)

    def _send_message(self, msg_type: str, data: dict):
        """
        Unified method to send messages to queue.
        
        Args:
            msg_type: Message type
            data: Message data
        """
        if self.task_id in task_queues:
            message = {
                "type": msg_type,
                "data": data,
                "sequence": self.messages_sent
            }
            task_queues[self.task_id].put(message)
            self.messages_sent += 1
            logger.info(f"Message sent: {msg_type}, sequence: {self.messages_sent}, task: {self.task_id}")

    def emit_file_update(self, filename: str, content: str, is_url: bool = False):
        """
        Send file content update - supports both text and URL modes.
        
        Args:
            filename: File name
            content: File content or URL
            is_url: Whether it's URL mode
        """
        # Save file to memory - use filename directly without directory prefix
        self.all_files[filename] = content
        
        # Prepare file data including transmission mode info
        file_data = {
            "filename": filename,
            "content": content,
            "is_url": is_url,
            "is_editable": is_editable_file(filename),
            "file_type": self._detect_file_type(filename),
            "content_mode": "url" if is_url else "text"
        }
        
        # Add debug logs
        if filename.endswith('.png') or filename.endswith('.pdf'):
            logger.info(f"📁 Sending file: {filename}")
            logger.info(f"📄 Content: {content[:200]}{'...' if len(content) > 200 else ''}")
            logger.info(f"🔗 URL mode: {is_url}")
            logger.info(f"📋 Content mode: {file_data['content_mode']}")
        
        # Send file content update
        self._send_message("file_update", file_data)
        
        # Set current active file
        self.current_file = filename
        self.file_content = content

    def _detect_file_type(self, filename: str) -> str:
        """Detect file type based on extension."""
        file_ext = Path(filename).suffix.lower()
        
        if file_ext in {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'}:
            return 'image'
        elif file_ext in {'.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'}:
            return 'video'
        elif file_ext == '.pdf':
            return 'pdf'
        elif file_ext == '.html':
            return 'html'
        elif file_ext == '.md':
            return 'markdown'
        elif file_ext in {'.mp3', '.wav', '.aac', '.ogg', '.m4a'}:
            return 'audio'
        else:
            return 'text'

    def update_file_structure(self):
        """Deprecated method - file structure updates are no longer used."""
        pass

    def emit_terminal_output(self, command: str, output: str, status: str = "completed"):
        """
        Send terminal output.

        Args:
            command: Executed command
            output: Command output result
            status: Execution status
        """
        terminal_data = {
            "command": command,
            "output": output,
            "status": status,
            "timestamp": time.time()
        }
        self._send_message("terminal", terminal_data)

    def emit_task_update(self, status: str, **kwargs):
        """
        Send task status update.

        Args:
            status: Task status (started, completed, failed, paused)
            **kwargs: Other status information
        """
        # Update internal status
        self.task_status = status
        
        task_data = {
            "status": status,
            **kwargs
        }
        self._send_message("task_update", task_data)

    def pause_task(self):
        """Pause task execution."""
        self.is_paused = True
        logger.info(f"Task {self.task_id} paused")

    def resume_task(self):
        """Resume task execution."""
        self.is_paused = False
        logger.info(f"Task {self.task_id} resumed")

    def wait_if_paused(self, duration: float = None):
        """
        Check pause status and wait if paused.

        Args:
            duration: Wait duration, defaults to step_interval
        """
        if duration is None:
            duration = self.step_interval
            
        if self.is_paused:
            while self.is_paused:
                time.sleep(0.5)  # Check every 0.5 seconds during pause
        else:
            time.sleep(duration)

    def execute_step(self, step_num: int, activity_type: str, text: str, **kwargs):
        """
        Execute a single step with common pattern.
        
        Args:
            step_num: Step number
            activity_type: Activity type
            text: Step description
            **kwargs: Other parameters
        """
        logger.info(f"Task {self.task_id} - Step {step_num}: {text}")
        
        # Send activity start
        activity_id = self.emit_activity(activity_type, f"Step {step_num}: {text}", 
                                       status="in-progress", **kwargs)
        
        # Wait (check pause status)
        self.wait_if_paused()
        logger.info(f"SUCCESS Task {self.task_id} - Step {step_num}: {text}")
        # Mark as completed
        self.update_activity_status(activity_id, "completed")
        
        return activity_id

    def execute_task(self):
        """
        Refactored task execution process - simplified to 10 main steps with 3-second intervals.
        """
        self.is_running = True
        try:
            # Task start
            self.emit_task_update("started")
            
            # Step 1: Task analysis and initialization
            self.execute_step(1, "thinking", "Analyzing task requirements and initializing multimedia workspace")
            
            # Step 2: Create working directory
            command = "mkdir -p workspace/media && cd workspace"
            activity_id = self.execute_step(2, "command", "Creating multimedia workspace", command=command)
            self.emit_terminal_output(command, 
                "✅ Working directory created successfully\n📁 Multimedia workspace initialized\n🎯 Ready to support PDF, images and interactive content")

            # Step 3: Create task checklist file
            todo_content = f"""# Task: {self.prompt}

## 📋 Task Progress
- [x] Analyze user requirements
- [x] Set up multimedia workspace
- [ ] Create real-time multimedia demo
- [ ] Generate PDF and image content
- [ ] Create interactive examples
- [ ] Test multimedia support
- [ ] Complete task

## 🎯 Multimedia Demo Features
- 📸 Real image display (brand_logo.png)
- 📄 Real-time PDF viewing (research_paper.pdf) 
- 📊 Interactive charts and graphics
- 🎨 SVG graphics and data visualization

## 🌐 Real-time Demo Sources
- PDF: https://openreview.net/pdf?id=bjcsVLoHYs
- Image: https://pic2.zhimg.com/v2-98b7321bf9cf8e591a18ffa7b6b7d041_1440w.jpg

## 📊 Execution Log
Start time: {time.strftime('%Y-%m-%d %H:%M:%S')}
Status: 🟡 In progress
"""
            self.execute_step(3, "file", "Creating task checklist file", filename="todo.md")
            self.emit_file_update("todo.md", todo_content)
            self.file_content = todo_content

            # Step 4: Create configuration file
            config_content = json.dumps({
                "project": {
                    "name": "ResearStudio Task - Real Multimedia Version",
                    "version": "2.0.0",
                    "description": "AI Research Assistant with Real Multimedia Support",
                    "created": time.strftime('%Y-%m-%d %H:%M:%S')
                },
                "multimedia": {
                    "real_urls": True,
                    "pdf_source": "https://openreview.net/pdf?id=bjcsVLoHYs",
                    "image_source": "https://pic2.zhimg.com/v2-98b7321bf9cf8e591a18ffa7b6b7d041_1440w.jpg",
                    "preview_enabled": True
                },
                "task": {
                    "description": self.prompt,
                    "priority": "normal",
                    "multimedia_demo": True
                }
            }, indent=2, ensure_ascii=False)
            
            self.execute_step(4, "file", "Creating project configuration file", filename="config.json")
            self.emit_file_update("config.json", config_content)

            # Step 5: Create multimedia files
            self.execute_step(5, "thinking", "Downloading and preparing real multimedia files")
            
            # Create multimedia files - choose transmission mode based on file type
            for filename, media_info in SAMPLE_MEDIA.items():
                if 'url' in media_info:
                    # URL-type files, use URL mode transmission
                    if should_use_url_mode(filename):
                        self.emit_file_update(filename, media_info['url'], is_url=True)
                    else:
                        # HTML files use text mode even if they have URLs, for easier editing
                        content = media_info.get('content', media_info['url'])
                        self.emit_file_update(filename, content, is_url=False)
                elif 'content' in media_info:
                    # Files with direct content, use text mode
                    self.emit_file_update(filename, media_info['content'], is_url=False)
                else:
                    # Other cases, decide based on file type
                    content = f'Content for {filename}'
                    self.emit_file_update(filename, content, is_url=should_use_url_mode(filename))

            # Step 6: Verify multimedia links
            command = "curl -I https://openreview.net/pdf?id=bjcsVLoHYs"
            self.execute_step(6, "command", "Verifying PDF document accessibility", command=command)
            self.emit_terminal_output(command, 
                "HTTP/2 200 OK\ncontent-type: application/pdf\n✅ PDF document accessible and ready\n📄 Research paper loaded successfully")

            # English: 步骤7：create演示报告
            demo_content = f"""# 🎯 真实多媒体演示报告

## English: 任务概述
**任务:** {self.prompt}  
**create时间:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**status:** ✅ 进行中

## 🎥 实时多媒体能力

### 📸 真实图像支持
来自网络的实际图像显示：
![品牌Logo](https://pic2.zhimg.com/v2-98b7321bf9cf8e591a18ffa7b6b7d041_1440w.jpg)

### 📊 交互式data可视化
SVG实时图表渲染：
![演示图表](demo_chart.svg)

### 📄 实时PDFdocumentation查看
带完整查看器功能的真实研究论文：
[查看研究论文](https://openreview.net/pdf?id=bjcsVLoHYs)

## ✨ 功能展示
- ✅ 网络URL实时图像load
- ✅ 实时PDFdocumentation查看与导航
- ✅ 交互式SVG图表渲染
- ✅ 嵌入媒体的Markdown预览

---
*由ResearShop AI助手生成 - 真实多媒体URL版* 🚀
 [Contains Chinese - needs translation]"""
            self.execute_step(7, "file", "create多媒体演示报告", filename="demo_report.md")
            self.emit_file_update("demo_report.md", demo_content)

            # English: 步骤8：test多媒体功能并收集反馈
            self.execute_step(8, "command", "verify多媒体fileload和渲染性能", command="test -f workspace/*")
            self.emit_terminal_output("echo '多媒体verifycomplete'", """
=== 多媒体testresult ===
PDFload: ✅ 通过 (2.3s)
图像load: ✅ 通过 (0.8s) 
SVG渲染: ✅ 通过 (0.2s)
URLverify: ✅ 通过

🎉 所有真实多媒体功能完美run！ [Contains Chinese - needs translation]""")

            # 🆕 步骤8.5：发送搜索resultfile (.jsonsearch)
            search_results_content = [
                json.dumps({
                    "title": "China GDP 1960-2025 - Macrotrends",
                    "link": "https://www.macrotrends.net/global-metrics/countries/chn/china/gdp-gross-domestic-product",
                    "snippet": "China GDP for 2023 was 17.795 trillion US dollars, a 0.49% decline from 2022.. China GDP for 2022 was 17.882 trillion US dollars, a 0.34% increase from 2021.; China GDP for 2021 was 17.820 trillion US dollars, a 21.33% increase from 2020.; China GDP for 2020 was 14.688 trillion US dollars, a 2.86% increase from 2019.; GDP at purchaser's prices is the sum of gross value added by all resident ..."
                }),
                json.dumps({
                    "title": "GDP growth (annual %) - China | Data - World Bank Data",
                    "link": "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=CN",
                    "snippet": "GDP growth (annual %) - China. World Bank national accounts data, and OECD National Accounts data files. License : CC BY-4.0"
                }),
                json.dumps({
                    "title": "Historical GDP of China - Wikipedia",
                    "link": "https://en.wikipedia.org/wiki/Historical_GDP_of_China",
                    "snippet": "Proportion of world (countries with data) nominal GDP for the countries with the top 10 highest nominal GDP in 2018, from 1980 to 2018 with IMF projections until 2024 [3]. The gross domestic product of China in 2019 was CN¥ 99.08651 trillion, [4] or US$14.4 trillion (nominal). [5]China's nominal GDP surpassed that of Italy in 2000, France in 2005, the United Kingdom in 2006, Germany in 2007 ..."
                }),
                json.dumps({
                    "title": "China GDP Growth Rate 1961-2025 - Macrotrends",
                    "link": "https://www.macrotrends.net/global-metrics/countries/chn/china/gdp-growth-rate",
                    "snippet": "China gdp growth rate for 2021 was 8.45%, a 6.21% increase from 2020. China gdp growth rate for 2020 was 2.24%, a 3.71% decline from 2019. Annual percentage growth rate of GDP at market prices based on constant local currency. Aggregates are based on constant 2010 U.S. dollars. GDP is the sum of gross value added by all resident producers in ..."
                }),
                json.dumps({
                    "title": "中国历年财政收入(2001-2024)_财富号_东方财富网",
                    "link": "https://caifuhao.eastmoney.com/news/20250126094445535814510",
                    "snippet": "中国历年财政收入(2001-2024) 炒股第一步,先开个股票账户 2024年,中国财政收入21.97万亿元,创历史新高,同比增长1.3%。 根据dataGO 1月18日发布的《中国历年GDP(1952-2024)》测算,2024年财政收入与GDP增速差是-3.7%。从1990年至今的对比data看,一般都是财政收入增速大幅超过GDP增速,而最近几年"
                })
            ]
            self.execute_step(8.5, "file", "生成搜索resultdatafile", filename="search_results.jsonsearch")
            self.emit_file_update("search_results.jsonsearch", json.dumps(search_results_content))

            # 🆕 步骤8.6：发送Web页面file (Web.html)
            web_url = "https://www.example.com/"
            self.execute_step(8.6, "file", "生成Web页面展示file", filename="Web.html")
            self.emit_file_update("Web.html", web_url, is_url=True)

            # English: 步骤9：update任务进度
            updated_todo = self.file_content.replace(
                "- [ ] create实时多媒体演示", "- [x] create实时多媒体演示"
            ).replace(
                "- [ ] 生成PDF和图像content", "- [x] 生成PDF和图像content"
            ).replace(
                "- [ ] create交互example", "- [x] create交互example"
            ).replace(
                "- [ ] test多媒体支持", "- [x] test多媒体支持"
            ).replace(
                "- [ ] complete任务", "- [x] complete任务"
            ).replace(
                "status: 🟡 进行中", 
                f"status: ✅ 已complete\ncomplete时间: {time.strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            self.execute_step(9, "edit", "update任务completestatus", filename="todo.md")
            self.emit_file_update("todo.md", updated_todo)
            self.file_content = updated_todo

            # English: 步骤10：生成最终报告
            self.execute_step(10, "thinking", "生成任务complete报告和总结")
            
            # English: 发送最终总结
            self.emit_terminal_output(
                "echo '真实多媒体任务executecomplete'",
                f"""
🎊 === ResearShop 真实多媒体任务execute报告 ===

📋 任务info
任务ID: {self.task_id[:8]}...
任务描述: {self.prompt}
complete时间: {time.strftime('%Y-%m-%d %H:%M:%S')}

📊 统计data
createfile: {len(self.all_files)} 个
多媒体file: {len(SAMPLE_MEDIA)} 个
execute步骤: 10 步
总耗时: 约30秒

🌐 实时多媒体源
📄 PDF: https://openreview.net/pdf?id=bjcsVLoHYs
🖼️ 图像: https://pic2.zhimg.com/v2-98b7321bf9cf8e591a18ffa7b6b7d041_1440w.jpg

✅ 任务status: successcomplete
🎯 所有真实多媒体file准备就绪，可在仪表板中查看！
 [Contains Chinese - needs translation]"""
            )

            # English: 任务complete
            self.emit_task_update("completed")
            logger.info(f"Task {self.task_id} completed successfully")

        except Exception as e:
            logger.error(f"Task {self.task_id} failed: {str(e)}")
            self.emit_activity("thinking", f"任务executeerror: {str(e)}", status="error")
            self.emit_task_update("failed", error=str(e))
        finally:
            self.is_running = False

    def emit_file_delete(self, filename: str):
        """发送filedelete事件 [Contains Chinese - needs translation]"""
        if filename in self.all_files:
            del self.all_files[filename]
        
        self._send_message("file_delete", {"filename": filename})

    def normalize_filename(self, filename: str) -> str:
        """规范化file名 - 确保在file结构中的一致性 [Contains Chinese - needs translation]"""
        if not filename:
            return filename
            
        # English: 如果file名已经包含根directory，直接返回
        if filename.startswith('resear-pro-task/'):
            return filename
            
        # English: 如果是根directory本身
        if filename == 'resear-pro-task':
            return filename
            
        # English: 否则添加根directory前缀
        return f"resear-pro-task/{filename}"

    def emit_file_rename(self, old_name: str, new_name: str):
        """发送file重命名事件 [Contains Chinese - needs translation]"""
        if old_name in self.all_files:
            content = self.all_files[old_name]
            del self.all_files[old_name]
            self.all_files[new_name] = content
        
        rename_data = {
            "old_name": old_name,
            "new_name": new_name
        }
        self._send_message("file_rename", rename_data)

    def create_folder(self, folder_name: str, parent_path: str = '/'):
        """createfile夹 - 支持在根directory或子directorycreate [Contains Chinese - needs translation]"""
        if parent_path == '/' or parent_path == '':
            full_path = folder_name
        else:
            full_path = f"{parent_path}/{folder_name}"
        
        folder_data = {
            "folder_name": full_path,
            "parent_path": parent_path
        }
        self._send_message("folder_create", folder_data)

    def update_file_structure_for_folder(self, folder_path: str):
        """已废弃的method [Contains Chinese - needs translation]"""
        pass


def create_task_export_zip(task_executor: TaskExecutor) -> bytes:
    """create任务导出ZIPfile [Contains Chinese - needs translation]"""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # English: 添加所有create的file
        for filename, content in task_executor.all_files.items():
            zip_file.writestr(f"files/{filename}", content)

        # English: 添加execute日志
        log_content = json.dumps(task_executor.execution_log, indent=2, ensure_ascii=False)
        zip_file.writestr("execution_log.json", log_content)

        # English: 添加任务info
        task_info = {
            "task_id": task_executor.task_id,
            "prompt": task_executor.prompt,
            "created_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "total_files": len(task_executor.all_files),
            "total_activities": len(task_executor.execution_log),
            "file_list": list(task_executor.all_files.keys()),
            "multimedia_support": True,
            "real_urls": True
        }
        zip_file.writestr("task_info.json", json.dumps(task_info, indent=2, ensure_ascii=False))

        # English: 添加README
        readme_content = f"""# ResearShop 真实多媒体任务导出

## English: 任务info
- 任务ID: {task_executor.task_id}
- 任务描述: {task_executor.prompt}
- 导出时间: {time.strftime('%Y-%m-%d %H:%M:%S')}

## file结构
- `files/` - 任务execute期间create的所有file
- `execution_log.json` - 详细execute日志
- `task_info.json` - 任务info和元data

## create的file
{chr(10).join(f"- {filename}" for filename in task_executor.all_files.keys())}

---
由ResearShop AI助手生成 - 真实多媒体版 🚀
"""
        zip_file.writestr("README.md", readme_content)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


# ==================== API 路由定义 ====================

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """create新的AI任务 [Contains Chinese - needs translation]"""
    data = request.get_json()
    prompt = data.get('prompt', '')
    attachments = data.get('attachments', [])

    if not prompt.strip():
        return jsonify({'error': 'Prompt is required'}), 400

    # English: 生成唯一任务ID
    task_id = str(uuid.uuid4())
    task_queues[task_id] = queue.Queue()

    # create任务记录
    active_tasks[task_id] = {
        'id': task_id,
        'prompt': prompt,
        'attachments': attachments,
        'status': 'created',
        'created_at': time.time(),
        'multimedia_support': True,
        'real_urls': True
    }

    # create任务execute器（但不立即start）
    executor = TaskExecutor(task_id, prompt)
    task_executors[task_id] = executor

    logger.info(f"Created task {task_id}: {prompt[:50]}...")

    return jsonify({
        'task_id': task_id,
        'status': 'created',
        'multimedia_support': True,
        'real_urls': True
    })


@app.route('/api/tasks/<task_id>/connect', methods=['POST', 'OPTIONS'])
def connect_task(task_id):
    """连接并startexecute任务（POST模式）- 增强版本，支持重连和历史回放 + 代理兼容性 [Contains Chinese - needs translation]"""
    
    # processCORS预检请求
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    logger.info(f"Frontend connecting to task: {task_id}")
    
    # 🆕 check是否使用简单模式（兼容代理服务器）
    simple_mode = request.args.get('mode') == 'simple'
    
    # check任务是否存在（包括已complete的任务）
    if task_id not in task_executors and task_id not in completed_tasks_history:
        logger.error(f"Task {task_id} not found in active or completed tasks")
        return jsonify({'error': 'Task not found'}), 404
    
    # 🆕 简单模式：返回当前status快照，不使用流式响应
    if simple_mode:
        logger.info(f"Using simple mode for task {task_id} (proxy compatibility)")
        
        try:
            # English: 如果任务已complete，从历史中返回status
            if task_id in completed_tasks_history:
                history_data = completed_tasks_history[task_id]
                return jsonify({
                    'mode': 'simple',
                    'status': 'completed',
                    'task_id': task_id,
                    'completed_at': history_data.get('completed_at'),
                    'final_status': history_data.get('final_status'),
                    'message_count': len(history_data.get('messages', [])),
                    'files_created': len(history_data.get('executor_data', {}).get('all_files', {})),
                    'note': '任务已complete，使用简单模式返回status'
                })
            
            # English: 如果任务仍在execute
            if task_id in task_executors:
                executor = task_executors[task_id]
                
                # start任务execute（如果还没有start）
                if not executor.is_running:
                    logger.info(f"Starting task execution thread for {task_id}...")
                    thread = Thread(target=executor.execute_task)
                    thread.daemon = True
                    thread.start()
                
                return jsonify({
                    'mode': 'simple',
                    'status': 'running',
                    'task_id': task_id,
                    'is_paused': executor.is_paused,
                    'messages_sent': executor.messages_sent,
                    'files_created': len(executor.all_files),
                    'current_status': executor.task_status,
                    'note': '任务正在execute，使用简单模式返回status'
                })
            
            return jsonify({
                'mode': 'simple',
                'status': 'unknown',
                'task_id': task_id,
                'note': '任务status未知'
            })
            
        except Exception as e:
            logger.error(f"Simple mode error for task {task_id}: {e}")
            return jsonify({
                'mode': 'simple',
                'status': 'error',
                'task_id': task_id,
                'error': str(e)
            }), 500
    
    # English: 原有的流式响应模式
    def generate_chunked_response():
        """生成分块响应 - 支持重连和历史回放 [Contains Chinese - needs translation]"""
        try:
            # English: 如果任务已complete，从历史中回放所有消息
            if task_id in completed_tasks_history:
                logger.info(f"Replaying completed task {task_id} from history")
                history_data = completed_tasks_history[task_id]
                
                # English: 重新发送所有历史消息
                for i, message in enumerate(history_data.get('messages', [])):
                    logger.info(f"Replaying message {i+1}/{len(history_data['messages'])}: {message.get('type')}")
                    chunk = json.dumps(message) + '\n'
                    yield chunk
                    # English: 加快历史回放速度
                    time.sleep(0.1)
                
                logger.info(f"Completed task {task_id} history replay finished")
                return
            
            # English: 如果任务仍在execute
            executor = task_executors[task_id]
            
            # create或重用任务队列
            if task_id not in task_queues:
                task_queues[task_id] = queue.Queue()
            
            task_queue = task_queues[task_id]
            
            # start任务execute（如果还没有start）
            if not executor.is_running:
                logger.info(f"Starting task execution thread for {task_id}...")
                thread = Thread(target=executor.execute_task)
                thread.daemon = True
                thread.start()
            
            message_count = 0
            
            while True:
                try:
                    # English: 等待消息，超时30秒
                    message = task_queue.get(timeout=30)
                    message_count += 1
                    
                    logger.info(f"Sending to frontend: Message {message_count}, Type: {message.get('type')}, Task: {task_id}")
                    
                    # English: 发送消息（使用换行符分隔）
                    chunk = json.dumps(message) + '\n'
                    yield chunk
                    
                    # English: 如果任务complete或failed，save历史并准备end连接
                    if (message.get('type') == 'task_update' and 
                        message.get('data', {}).get('status') in ['completed', 'failed']):
                        
                        # 🆕 savecomplete任务的历史记录，不立即清理
                        logger.info(f"Task {task_id} completed, saving to history")
                        completed_tasks_history[task_id] = {
                            'task_id': task_id,
                            'completed_at': time.time(),
                            'final_status': message.get('data', {}).get('status'),
                            'executor_data': {
                                'all_files': dict(executor.all_files),
                                'execution_log': list(executor.execution_log),
                                'prompt': executor.prompt
                            },
                            'messages': list(executor.message_history) if hasattr(executor, 'message_history') else []
                        }
                        
                        # English: 延迟清理，给frontend足够时间接收所有消息
                        def delayed_cleanup():
                            time.sleep(10)  # 10秒后清理
                            logger.info(f"Delayed cleanup for task {task_id}")
                            if task_id in task_queues:
                                del task_queues[task_id]
                            if task_id in task_executors:
                                del task_executors[task_id]
                            if task_id in active_tasks:
                                del active_tasks[task_id]
                        
                        cleanup_thread = Thread(target=delayed_cleanup)
                        cleanup_thread.daemon = True
                        cleanup_thread.start()
                        
                        logger.info(f"Task {task_id} completed, sent {message_count} messages total")
                        break
                        
                except queue.Empty:
                    # English: 发送心跳
                    heartbeat = json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n'
                    yield heartbeat
                    continue
                    
        except Exception as e:
            logger.error(f"Connection error for task {task_id}: {e}")
            error_msg = json.dumps({
                'type': 'error', 
                'message': str(e),
                'timestamp': time.time()
            }) + '\n'
            yield error_msg
    
    return Response(
        generate_chunked_response(),
        mimetype='text/plain',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Transfer-Encoding': 'chunked'
        }
    )

@app.route('/api/tasks/<task_id>/pause', methods=['POST'])
def pause_task(task_id):
    """pause或恢复任务execute [Contains Chinese - needs translation]"""
    if task_id not in task_executors:
        return jsonify({'error': 'Task not found'}), 404

    executor = task_executors[task_id]

    if executor.is_paused:
        executor.resume_task()
        status = 'resumed'
    else:
        executor.pause_task()
        status = 'paused'

    return jsonify({
        'task_id': task_id,
        'status': status,
        'is_paused': executor.is_paused
    })

@app.route('/api/tasks/<task_id>/save-file', methods=['POST', 'OPTIONS'])
def save_file(task_id):
    """savefilecontent - 增强版本，支持已complete任务 [Contains Chinese - needs translation]"""
    # processCORS预检请求
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    # check任务是否存在（包括已complete的任务）
    if task_id not in task_executors and task_id not in completed_tasks_history:
        logger.error(f"Save file failed: Task {task_id} not found")
        return jsonify({'error': 'Task not found'}), 404
    
    try:
        data = request.get_json()
        filename = data.get('filename', '')
        content = data.get('content', '')
        
        if not filename:
            return jsonify({'error': 'Filename is required'}), 400
        
        # English: 如果任务仍在execute，使用execute器
        if task_id in task_executors:
            executor = task_executors[task_id]
            executor.all_files[filename] = content
            executor.emit_file_update(filename, content)
        
        # English: 如果任务已complete，update历史记录
        elif task_id in completed_tasks_history:
            logger.info(f"Updating completed task {task_id} file: {filename}")
            completed_tasks_history[task_id]['executor_data']['all_files'][filename] = content
        
        logger.info(f"File saved: {filename} ({len(content)} characters) for task {task_id}")
        
        return jsonify({
            'success': True,
            'message': f'File {filename} saved successfully',
            'filename': filename,
            'size': len(content)
        })
        
    except Exception as e:
        logger.error(f"Failed to save file for task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<task_id>/terminal', methods=['POST', 'OPTIONS'])
def execute_terminal(task_id):
    """execute终端命令 [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
        
    try:
        data = request.get_json()
        command = data.get('command', '')
        
        if not command.strip():
            return jsonify({'error': 'Command is required'}), 400
            
        # check任务是否存在
        if task_id not in task_executors:
            return jsonify({'error': 'Task not found or not active'}), 404
            
        executor = task_executors[task_id]
        
        # 🆕 模拟终端命令execute
        logger.info(f"Executing terminal command for task {task_id}: {command}")
        
        # English: 简单的命令模拟
        output = ""
        status = "completed"
        
        command_lower = command.lower().strip()
        
        if command_lower in ['ls', 'dir']:
            # English: 模拟directory列表
            file_list = list(executor.all_files.keys())
            if file_list:
                output = "Files:\n" + "\n".join(f"  {filename}" for filename in file_list)
            else:
                output = "No files found."
                
        elif command_lower in ['pwd', 'cd']:
            output = "/workspace"
            
        elif command_lower.startswith('echo '):
            # English: 回显命令
            echo_text = command[5:].strip()
            output = echo_text
            
        elif command_lower in ['whoami']:
            output = "user"
            
        elif command_lower in ['date']:
            from datetime import datetime
            output = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
        elif command_lower.startswith('cat '):
            # English: 模拟查看filecontent
            filename = command[4:].strip()
            if filename in executor.all_files:
                content = executor.all_files[filename]
                # English: 限制output长度
                if len(content) > 500:
                    output = content[:500] + "\n... (truncated)"
                else:
                    output = content
            else:
                output = f"cat: {filename}: No such file or directory"
                status = "failed"
                
        elif command_lower in ['clear', 'cls']:
            output = "Terminal cleared."
            
        elif command_lower in ['help', '--help', '-h']:
            output = """Available commands:
  ls, dir     - List files
  pwd         - Show current directory  
  echo <text> - Display text
  whoami      - Show current user
  date        - Show current date and time
  cat <file>  - Display file contents
  clear, cls  - Clear terminal
  help        - Show this help message"""
  
        else:
            # default响应
            output = f"Command '{command}' executed successfully.\nThis is a simulated terminal environment."
            
        # English: 使用execute器的emit_terminal_outputmethod
        executor.emit_terminal_output(command, output, status)
        
        return jsonify({
            'success': True,
            'command': command,
            'output': output,
            'status': status
        })
        
    except Exception as e:
        logger.error(f"Error executing terminal command for task {task_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/files/<path:filename>', methods=['GET', 'OPTIONS'])
def get_file_content(task_id, filename):
    """get指定file的content - 增强版本，支持已complete任务和file元data [Contains Chinese - needs translation]"""
    # processCORS预检请求
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    # check任务是否存在
    if task_id not in task_executors and task_id not in completed_tasks_history:
        return jsonify({'error': 'Task not found'}), 404
    
    try:
        content = None
        
        # English: 从活跃任务get
        if task_id in task_executors:
            executor = task_executors[task_id]
            if filename in executor.all_files:
                content = executor.all_files[filename]
        
        # English: 从历史记录get
        elif task_id in completed_tasks_history:
            history_data = completed_tasks_history[task_id]
            all_files = history_data.get('executor_data', {}).get('all_files', {})
            if filename in all_files:
                content = all_files[filename]
        
        if content is None:
            return jsonify({
                'success': False,
                'error': f'File {filename} not found'
            }), 404
        
        # English: 检测fileclass型和元data
        file_ext = Path(filename).suffix.lower()
        is_url_mode = should_use_url_mode(filename)
        is_editable = is_editable_file(filename)
        
        # English: 检测fileclass型
        if file_ext in {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'}:
            file_type = 'image'
        elif file_ext in {'.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'}:
            file_type = 'video'
        elif file_ext == '.pdf':
            file_type = 'pdf'
        elif file_ext == '.html':
            file_type = 'html'
        elif file_ext == '.md':
            file_type = 'markdown'
        elif file_ext in {'.mp3', '.wav', '.aac', '.ogg', '.m4a'}:
            file_type = 'audio'
        else:
            file_type = 'text'
        
        return jsonify({
            'success': True,
            'content': content,
            'filename': filename,
            'size': len(content),
            'is_url': is_url_mode,
            'is_editable': is_editable,
            'file_type': file_type,
            'content_mode': 'url' if is_url_mode else 'text'
        })
        
    except Exception as e:
        logger.error(f"Failed to get file content for task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<task_id>/files', methods=['GET', 'OPTIONS'])
def get_all_files_content(task_id):
    """get任务的所有filecontent - 增强版本，支持已complete任务 [Contains Chinese - needs translation]"""
    # processCORS预检请求
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    # check任务是否存在
    if task_id not in task_executors and task_id not in completed_tasks_history:
        return jsonify({'error': 'Task not found'}), 404
    
    try:
        all_files = {}
        
        # English: 从活跃任务get
        if task_id in task_executors:
            executor = task_executors[task_id]
            all_files = dict(executor.all_files)
        
        # English: 从历史记录get
        elif task_id in completed_tasks_history:
            history_data = completed_tasks_history[task_id]
            all_files = history_data.get('executor_data', {}).get('all_files', {})
        
        return jsonify({
            'success': True,
            'files': all_files,
            'count': len(all_files)
        })
        
    except Exception as e:
        logger.error(f"Failed to get all files content for task {task_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<task_id>/export')
def export_task(task_id):
    """导出任务的所有file和execute记录 - 增强版本，支持已complete任务 [Contains Chinese - needs translation]"""
    # check任务是否存在（包括已complete的任务）
    if task_id not in task_executors and task_id not in completed_tasks_history:
        return jsonify({'error': 'Task not found'}), 404

    try:
        # English: 如果任务还在execute，直接导出
        if task_id in task_executors:
            executor = task_executors[task_id]
            zip_data = create_task_export_zip(executor)
        
        # English: 如果任务已complete，从历史记录create导出
        elif task_id in completed_tasks_history:
            history_data = completed_tasks_history[task_id]
            executor_data = history_data.get('executor_data', {})
            
            # create临时execute器对象用于导出
            temp_executor = TaskExecutor(task_id, history_data.get('prompt', 'Completed Task'))
            temp_executor.all_files = executor_data.get('all_files', {})
            temp_executor.execution_log = executor_data.get('execution_log', [])
            
            zip_data = create_task_export_zip(temp_executor)

        response = Response(
            zip_data,
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename=resear-pro-task-{task_id}.zip',
                'Content-Length': str(len(zip_data)),
                'Access-Control-Allow-Origin': '*'
            }
        )

        logger.info(f"Exported task {task_id} ({len(zip_data)} bytes)")
        return response

    except Exception as e:
        logger.error(f"Export failed for task {task_id}: {str(e)}")
        return jsonify({'error': 'Export failed'}), 500

@app.route('/api/tasks/<task_id>')
def get_task(task_id):
    """get任务详细info - 增强版本，支持已complete任务 [Contains Chinese - needs translation]"""
    # English: 先check活跃任务
    if task_id in active_tasks:
        task_info = active_tasks[task_id].copy()

        if task_id in task_executors:
            executor = task_executors[task_id]
            task_info.update({
                'is_paused': executor.is_paused,
                'files_created': len(executor.all_files),
                'activities_count': len(executor.execution_log),
                'multimedia_support': True,
                'real_urls': True
            })

        return jsonify(task_info)
    
    # check已complete任务历史
    elif task_id in completed_tasks_history:
        history_data = completed_tasks_history[task_id]
        executor_data = history_data.get('executor_data', {})
        
        task_info = {
            'id': task_id,
            'status': history_data.get('final_status', 'completed'),
            'completed_at': history_data.get('completed_at'),
            'files_created': len(executor_data.get('all_files', {})),
            'activities_count': len(executor_data.get('execution_log', [])),
            'multimedia_support': True,
            'real_urls': True,
            'prompt': executor_data.get('prompt', '')
        }
        
        return jsonify(task_info)
    
    return jsonify({'error': 'Task not found'}), 404

@app.route('/api/tasks')
def list_tasks():
    """列出所有活跃任务 [Contains Chinese - needs translation]"""
    return jsonify(list(active_tasks.values()))

@app.route('/api/health')
def health_check():
    """系统健康check - 增强版本 [Contains Chinese - needs translation]"""
    return jsonify({
        'status': 'healthy',
        'active_tasks': len(active_tasks),
        'running_executors': len(task_executors),
        'completed_tasks_in_history': len(completed_tasks_history),
        'timestamp': time.time(),
        'version': '2.2.0',
        'communication_mode': 'POST + Chunked Transfer + History Replay',
        'features': ['real-multimedia', 'live-urls', 'post-streaming', 'reliable-messaging', 'task-history', 'reconnection-support']
    })

@app.route('/api/test-503-fix', methods=['GET', 'POST', 'OPTIONS'])
def test_503_fix():
    """test503error修复的简单端点 [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    return jsonify({
        'status': 'success',
        'message': '503error修复test端点',
        'version': '2.2.0-fix',
        'timestamp': time.time(),
        'method': request.method,
        'note': '如果能看到这个响应，description代码已update'
    })

@app.route('/api/file_load/<task_id>/<path:filename>', methods=['GET', 'OPTIONS'])
def load_file(task_id, filename):
    """
    直接loadfilecontent - 用于URL模式的file访问
    支持图片、视频、PDF等二进制file的直接访问
     [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    try:
        # check任务是否存在
        if task_id not in active_tasks and task_id not in completed_tasks_history:
            logger.warning(f"File load request for non-existent task: {task_id}")
            return jsonify({'error': 'Task not found'}), 404

        # get任务execute器
        executor = None
        if task_id in task_executors:
            executor = task_executors[task_id]
        elif task_id in completed_tasks_history:
            # English: 对于已complete的任务，尝试从历史中getfile
            task_data = completed_tasks_history[task_id]
            if 'files' in task_data and filename in task_data['files']:
                content = task_data['files'][filename]
                
                # English: 检测MIMEclass型
                mime_type, _ = mimetypes.guess_type(filename)
                if not mime_type:
                    mime_type = 'application/octet-stream'
                
                # English: 如果是URL，重定向到实际地址
                if content.startswith('http'):
                    return jsonify({'redirect': content}), 302
                
                # English: 返回filecontent
                return Response(
                    content,
                    mimetype=mime_type,
                    headers={
                        'Content-Disposition': f'inline; filename="{filename}"',
                        'Access-Control-Allow-Origin': '*'
                    }
                )
            else:
                return jsonify({'error': 'File not found in task history'}), 404

        if not executor:
            return jsonify({'error': 'Task executor not found'}), 404

        # checkfile是否存在
        if filename not in executor.all_files:
            logger.warning(f"File not found in task {task_id}: {filename}")
            return jsonify({'error': 'File not found'}), 404

        content = executor.all_files[filename]
        
        # English: 检测MIMEclass型
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = 'application/octet-stream'

        # English: 如果content是URL，返回重定向指令
        if content.startswith('http'):
            return jsonify({'redirect': content}), 302

        # English: 返回filecontent
        return Response(
            content,
            mimetype=mime_type,
            headers={
                'Content-Disposition': f'inline; filename="{filename}"',
                'Access-Control-Allow-Origin': '*'
            }
        )

    except Exception as e:
        logger.error(f"Error loading file {filename} for task {task_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ==================== 应用start ====================

if __name__ == '__main__':
    # checkrun环境
    port = int(os.environ.get('PORT', 5008))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"🚀 start Flask 应用...")
    logger.info(f"📡 端口: {port}")
    logger.info(f"🔧 debug模式: {debug_mode}")
    logger.info(f"🌐 CORS: 已启用")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug_mode,
        threaded=True
    )