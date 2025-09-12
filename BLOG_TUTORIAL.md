# Building Your First AI Research Agent with ResearStudio: A Complete Tutorial

Welcome to ResearStudio! In this tutorial, we'll walk through building, customizing, and deploying your own AI research agent that can search the web, write code, process documents, and collaborate with you in real-time. By the end, you'll have a fully functional research assistant that you can pause, edit, and guide during execution.

## Table of Contents

1. [Introduction: Why ResearStudio?](#introduction-why-researstudio)
2. [Getting Started: Your First Agent](#getting-started-your-first-agent)
3. [Understanding the Architecture](#understanding-the-architecture)
4. [Running Your First Research Task](#running-your-first-research-task)
5. [Real-time Collaboration Features](#real-time-collaboration-features)
6. [Adding Custom Tools](#adding-custom-tools)
7. [Advanced Workflows](#advanced-workflows)
8. [Deployment and Scaling](#deployment-and-scaling)
9. [Best Practices and Tips](#best-practices-and-tips)

## Introduction: Why ResearStudio?

Imagine having an AI assistant that doesn't just execute your commands blindly, but one you can guide, correct, and collaborate with in real-time. That's what ResearStudio offers - the first open-source framework for building "human-intervenable" research agents.

### The Problem with Traditional AI Agents

Most AI agents work in a "fire-and-forget" mode:
- You give them a task
- They run autonomously
- You get results (hopefully correct)
- If something goes wrong, you start over

### The ResearStudio Difference

With ResearStudio:
- **See Everything**: Watch the agent's plan evolve in real-time
- **Intervene Anytime**: Pause execution and make corrections
- **Collaborate Actively**: Switch between AI-led and human-led modes
- **Build Trust**: Every action is transparent and reversible

## Getting Started: Your First Agent

Let's build your first research agent in under 10 minutes!

### Step 1: Quick Installation

```bash
# Clone the repository
git clone https://github.com/ResearAI/ResearStudio.git
cd ResearStudio

# Quick setup script (we'll create this)
./setup.sh
```

If you prefer manual setup:

```bash
# Install Python dependencies
pip install flask flask-cors openai python-dotenv mcp requests

# Install frontend dependencies
cd frontend
npm install

# Set up your OpenAI API key
echo "OPENAI_API_KEY=your-key-here" > ../agent/.env
```

### Step 2: Start the System

Open two terminals:

**Terminal 1 - Start the Agent System:**
```bash
cd agent
python app.py
```

You should see:
```
🚀 ResearStudio Agent System Starting...
✅ Tools loaded: search, code, document, image, video
✅ Models configured: GPT-4 (Planner), GPT-4o-mini (Executor)
🌐 API server running on http://localhost:5000
```

**Terminal 2 - Start the Frontend:**
```bash
cd frontend
npm run dev
```

You should see:
```
✅ Ready on http://localhost:3000
```

### Step 3: Your First Task

Open your browser to `http://localhost:3000`. You'll see the ResearStudio interface:

![ResearStudio Interface](./images/interface.png)

Try this simple task:
```
Search for the latest breakthroughs in quantum computing and create a summary
```

Watch as the agent:
1. Creates a plan (visible in TODO.md)
2. Searches the web
3. Analyzes results
4. Writes a summary

## Understanding the Architecture

### The Three-Layer Design

ResearStudio uses a elegant three-layer architecture:

```
┌──────────────────────────────────┐
│     Layer 3: Web Interface       │  <- You interact here
│         (Next.js + React)         │
└────────────┬─────────────────────┘
             │ Real-time updates
┌────────────▼─────────────────────┐
│     Layer 2: Agent Core          │  <- Intelligence lives here
│    Planner ←→ Executor ←→ Tools  │
└────────────┬─────────────────────┘
             │ MCP Protocol
┌────────────▼─────────────────────┐
│     Layer 1: Tool Services       │  <- Actions happen here
│  Search│Code│Docs│Video│Image    │
└──────────────────────────────────┘
```

### How Plans Work

When you submit a task, the Planner creates a `TODO.md` file:

```markdown
# Task: Research Quantum Computing Breakthroughs

## Plan
1. ✅ Search for recent quantum computing breakthroughs
2. ⏳ Analyze and categorize findings
3. ⏳ Create summary document
4. ⏳ Add visualizations if helpful
```

This plan is:
- **Visible**: You see it in real-time
- **Editable**: You can modify it anytime
- **Dynamic**: It updates as work progresses

## Running Your First Research Task

Let's walk through a complete research task with human intervention.

### Task: Analyzing Stock Market Trends

Submit this task:
```
Analyze Tesla stock performance over the last month and create a report with visualizations
```

### Step 1: Watch the Plan

The agent creates this plan:

```markdown
# Task: Analyze Tesla Stock Performance

## Steps:
1. Fetch Tesla stock data for the last 30 days
2. Calculate key metrics (volatility, returns, moving averages)
3. Create visualizations
4. Write analysis report
```

### Step 2: Intervene and Improve

Notice the agent might miss something? Click **Pause** and edit the plan:

```markdown
# Task: Analyze Tesla Stock Performance

## Steps:
1. Fetch Tesla stock data for the last 30 days
2. **Also fetch relevant news for context**  # You added this!
3. Calculate key metrics (volatility, returns, moving averages)
4. Create visualizations
5. **Correlate price movements with news events**  # And this!
6. Write analysis report
```

Click **Resume** and watch the agent follow your improved plan!

### Step 3: Real-time Code Editing

The agent writes Python code:

```python
import yfinance as yf
import pandas as pd

# Agent's code
ticker = yf.Ticker("TSLA")
data = ticker.history(period="1mo")
```

You can pause and enhance it:

```python
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Enhanced version with error handling
try:
    ticker = yf.Ticker("TSLA")
    data = ticker.history(period="1mo")
    
    # Add technical indicators
    data['MA5'] = data['Close'].rolling(window=5).mean()
    data['MA20'] = data['Close'].rolling(window=20).mean()
    data['RSI'] = calculate_rsi(data['Close'])
    
except Exception as e:
    print(f"Error fetching data: {e}")
    # Fallback logic
```

## Real-time Collaboration Features

### 1. The Activity Log

Every action appears in the activity log:

```
[10:15:23] 🤔 Planning: Breaking down task into steps
[10:15:25] 🔍 Searching: "Tesla stock news last 30 days"
[10:15:30] 📊 Executing: Running analysis code
[10:15:32] 📝 Writing: Creating report.md
```

### 2. File System Integration

See files as they're created:

```
📁 Workspace
├── 📄 TODO.md (editable plan)
├── 📄 analysis.py (main code)
├── 📊 stock_chart.png (visualization)
├── 📄 report.md (final report)
└── 📁 data/
    └── 📄 tesla_data.csv
```

### 3. Intervention Points

You can intervene at multiple levels:

- **Plan Level**: Edit TODO.md to change strategy
- **Code Level**: Modify scripts before execution
- **Data Level**: Upload additional files
- **Execution Level**: Run your own commands

### Example: Taking Control

```bash
# You can run commands directly
$ pip install ta-lib

# Or switch to human-led mode
$ python
>>> import custom_analysis
>>> custom_analysis.run_advanced_metrics(data)
```

## Adding Custom Tools

Let's add a custom tool for cryptocurrency analysis.

### Step 1: Create the Tool

Create `agent/server/crypto_tool.py`:

```python
from mcp import Tool, ToolResult
import ccxt
import pandas as pd

class CryptoTool(Tool):
    """Tool for cryptocurrency analysis"""
    
    name = "crypto_analyzer"
    description = "Fetches and analyzes cryptocurrency data"
    
    def __init__(self):
        super().__init__()
        self.exchange = ccxt.binance()
    
    async def execute(self, symbol="BTC/USDT", timeframe="1d", limit=30):
        """
        Fetch crypto data and calculate metrics
        
        Args:
            symbol: Trading pair (e.g., 'BTC/USDT')
            timeframe: Time interval ('1m', '5m', '1h', '1d')
            limit: Number of candles to fetch
        """
        try:
            # Fetch OHLCV data
            ohlcv = self.exchange.fetch_ohlcv(
                symbol, 
                timeframe=timeframe, 
                limit=limit
            )
            
            # Convert to DataFrame
            df = pd.DataFrame(
                ohlcv, 
                columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
            )
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            # Calculate indicators
            df['returns'] = df['close'].pct_change()
            df['volatility'] = df['returns'].rolling(window=20).std()
            df['sma_20'] = df['close'].rolling(window=20).mean()
            
            # Detect patterns
            patterns = self.detect_patterns(df)
            
            return ToolResult(
                success=True,
                data={
                    'dataframe': df.to_dict(),
                    'statistics': {
                        'current_price': df['close'].iloc[-1],
                        'change_24h': df['returns'].iloc[-1] * 100,
                        'volatility': df['volatility'].iloc[-1],
                        'volume_24h': df['volume'].iloc[-1]
                    },
                    'patterns': patterns
                }
            )
            
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Crypto analysis failed: {str(e)}"
            )
    
    def detect_patterns(self, df):
        """Detect common trading patterns"""
        patterns = []
        
        # Golden Cross detection
        if len(df) > 50:
            sma_50 = df['close'].rolling(window=50).mean()
            sma_200 = df['close'].rolling(window=200).mean()
            
            if sma_50.iloc[-1] > sma_200.iloc[-1] and sma_50.iloc[-2] <= sma_200.iloc[-2]:
                patterns.append("Golden Cross detected - Bullish signal")
        
        # Support/Resistance levels
        recent_high = df['high'].tail(20).max()
        recent_low = df['low'].tail(20).min()
        patterns.append(f"Resistance: ${recent_high:.2f}")
        patterns.append(f"Support: ${recent_low:.2f}")
        
        return patterns
```

### Step 2: Register the Tool

Add to `agent/server/__init__.py`:

```python
from .crypto_tool import CryptoTool

AVAILABLE_TOOLS = {
    "search_tool": SearchTool,
    "code_tool": CodeTool,
    "crypto_analyzer": CryptoTool,  # Your new tool!
    # ... other tools
}
```

### Step 3: Use Your Tool

Now you can ask:
```
Analyze Bitcoin price movements and identify trading patterns
```

The agent will automatically use your crypto tool!

## Advanced Workflows

### Building a Research Pipeline

Create `workflows/research_pipeline.py`:

```python
class ResearchPipeline:
    """Automated research workflow"""
    
    def __init__(self, agent):
        self.agent = agent
        
    async def run_complete_research(self, topic):
        """Execute complete research pipeline"""
        
        # Phase 1: Literature Review
        await self.agent.execute_task(
            f"Search for academic papers on {topic}"
        )
        
        # Phase 2: Data Collection
        await self.agent.execute_task(
            f"Collect datasets related to {topic}"
        )
        
        # Phase 3: Analysis
        await self.agent.execute_task(
            f"Analyze collected data and create visualizations"
        )
        
        # Phase 4: Report Generation
        await self.agent.execute_task(
            f"Write comprehensive report with citations"
        )
        
        return self.agent.get_workspace_files()
```

### Creating Templates

Save common workflows as templates:

```python
# templates/data_analysis_template.py
TEMPLATE = """
# Data Analysis Template

## 1. Data Loading
- Load dataset from {source}
- Validate data quality
- Handle missing values

## 2. Exploratory Analysis
- Generate descriptive statistics
- Create distribution plots
- Identify correlations

## 3. Advanced Analysis
- {custom_analysis}
- Statistical testing
- Machine learning models

## 4. Visualization
- Create interactive dashboards
- Export static charts
- Generate report
"""

def create_analysis_plan(source, custom_analysis=""):
    return TEMPLATE.format(
        source=source,
        custom_analysis=custom_analysis
    )
```

## Deployment and Scaling

### Production Deployment with Docker

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend

  backend:
    build: ./agent
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
    volumes:
      - workspaces:/app/workspaces
    depends_on:
      - redis
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G

  frontend:
    build: ./frontend
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:5000
    deploy:
      replicas: 2

  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data

volumes:
  workspaces:
  redis_data:
```

Deploy with:
```bash
docker-compose up -d --scale backend=3
```

### Scaling Considerations

1. **Task Queue**: Use Celery for distributed task processing
2. **Storage**: Implement S3 for workspace persistence
3. **Caching**: Redis for tool results caching
4. **Monitoring**: Prometheus + Grafana for metrics

## Best Practices and Tips

### 1. Effective Prompting

```python
# Good prompt - specific and structured
task = """
Research the impact of GPT-4 on software development:
1. Focus on productivity metrics
2. Include case studies from tech companies
3. Compare with previous automation tools
4. Create visualizations for key findings
"""

# Less effective - too vague
task = "Tell me about AI in coding"
```

### 2. Tool Selection

Choose tools wisely for your task:

```python
# For web research
tools = ["search_tool", "document_tool"]

# For data analysis
tools = ["code_tool", "excel_tool", "image_tool"]

# For comprehensive research
tools = ["search_tool", "code_tool", "document_tool", "image_tool"]
```

### 3. Intervention Strategies

Know when to intervene:

- **Early intervention**: Correct the plan before execution
- **Mid-task guidance**: Adjust when agent goes off-track
- **Quality control**: Review and enhance outputs
- **Expertise injection**: Add domain knowledge

### 4. Performance Optimization

```python
# Optimize task execution
config = {
    "max_workers": 5,          # Parallel tool execution
    "cache_results": True,      # Cache expensive operations
    "timeout": 1800,           # 30-minute timeout
    "checkpoint_interval": 5    # Save progress every 5 steps
}
```

### 5. Error Recovery

Build resilient workflows:

```python
# Implement retry logic
@retry(max_attempts=3, backoff=2)
async def robust_search(query):
    try:
        return await search_tool.execute(query)
    except RateLimitError:
        await asyncio.sleep(60)
        return await robust_search(query)
    except Exception as e:
        # Fallback to alternative search
        return await backup_search(query)
```

## Common Use Cases

### 1. Academic Research

```python
task = """
Conduct a literature review on 'transformer models in NLP':
1. Search for papers from 2020-2024
2. Create citation graph
3. Identify key contributions
4. Generate BibTeX file
"""
```

### 2. Market Analysis

```python
task = """
Analyze the electric vehicle market:
1. Gather sales data for top 10 EV manufacturers
2. Compare growth rates and market share
3. Analyze consumer sentiment from social media
4. Create interactive dashboard
"""
```

### 3. Content Creation

```python
task = """
Create a technical blog post about WebAssembly:
1. Research latest WASM developments
2. Include code examples
3. Benchmark performance vs JavaScript
4. Add diagrams and illustrations
"""
```

### 4. Data Pipeline

```python
task = """
Build an ETL pipeline for weather data:
1. Fetch data from NOAA API
2. Clean and normalize datasets
3. Store in PostgreSQL
4. Create daily summary reports
"""
```

## Troubleshooting

### Common Issues and Solutions

**Issue: Agent gets stuck in a loop**
```python
# Solution: Add loop detection
if step_count > MAX_STEPS:
    agent.interrupt("Maximum steps exceeded")
```

**Issue: Incorrect tool selection**
```python
# Solution: Provide tool hints
task = "Search for papers (use search_tool) and analyze data (use code_tool)"
```

**Issue: Memory limitations**
```python
# Solution: Enable workspace cleanup
agent.config.auto_cleanup = True
agent.config.max_workspace_size = "1GB"
```

## Next Steps

Congratulations! You now know how to:

1. ✅ Install and run ResearStudio
2. ✅ Execute research tasks with real-time intervention
3. ✅ Add custom tools
4. ✅ Build advanced workflows
5. ✅ Deploy to production

### Continue Learning

- **Join our Discord**: Share your agents and get help
- **Contribute**: Submit your custom tools to the repository
- **Blog**: Share your ResearStudio projects
- **Research**: Use ResearStudio in your academic work

### Resources

- [GitHub Repository](https://github.com/ResearAI/ResearStudio)
- [API Documentation](./API.md)
- [Developer Guide](./DEVELOPER.md)
- [Community Forum](https://community.researstudio.ai)

## Conclusion

ResearStudio represents a paradigm shift in how we interact with AI agents. Instead of black-box automation, we now have transparent, collaborative partners that combine the best of human expertise and AI capabilities.

Start building your research agent today, and join us in creating the future of human-AI collaboration!

---

*Have questions? Found a bug? Want to share what you built?*

- 📧 Email: resear.ai@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/ResearAI/ResearStudio/issues)
- 💬 Discord: [Join our community](https://discord.gg/researstudio)

Happy researching! 🚀