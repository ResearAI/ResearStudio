# Developer Guide

This guide provides comprehensive information for developers who want to extend, modify, or contribute to ResearStudio.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Core Components](#core-components)
- [Adding New Tools](#adding-new-tools)
- [Modifying the Agent System](#modifying-the-agent-system)
- [Debugging](#debugging)
- [Contributing](#contributing)

## Architecture Overview

ResearStudio follows a three-layer architecture designed for modularity and extensibility:

```
┌─────────────────────────────────────────────────┐
│                 User Interface                   │
│            Next.js + React + Tailwind            │
└───────────────────┬─────────────────────────────┘
                    │ SSE/WebSocket
┌───────────────────▼─────────────────────────────┐
│              Agent Orchestration                 │
│         Planner ←→ Executor ←→ Tools            │
└───────────────────┬─────────────────────────────┘
                    │ MCP Protocol
┌───────────────────▼─────────────────────────────┐
│                Tool Services                     │
│   Search │ Code │ Docs │ Video │ Image │ ...    │
└─────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**: Each layer handles specific responsibilities
2. **Tool Isolation**: Tools run in sandboxed environments
3. **Event-Driven Communication**: Real-time updates via SSE
4. **State Persistence**: Task workspaces maintain state across sessions

## Project Structure

```
ResearStudio/
├── frontend/                 # Next.js frontend application
│   ├── app/                 # Next.js 15 app router
│   │   ├── api/            # API routes
│   │   ├── components/     # Page components
│   │   └── layout.tsx      # Root layout
│   ├── components/          # Reusable React components
│   │   ├── ui/            # shadcn/ui components
│   │   ├── chat/          # Chat interface components
│   │   └── workspace/     # File system components
│   ├── lib/                # Utility functions
│   │   ├── api.ts         # API client
│   │   ├── hooks/         # React hooks
│   │   └── utils.ts       # Helper functions
│   └── server.py          # Flask backend server
│
├── agent/                   # Agent system
│   ├── client/             # Agent orchestration
│   │   ├── agent_core.py  # Main agent controller
│   │   └── config.py      # Configuration
│   ├── server/             # Tool implementations
│   │   ├── code_tool.py   # Code execution
│   │   ├── search_tool.py # Web search
│   │   └── ...           # Other tools
│   └── app.py             # Flask API server
│
└── docs/                   # Documentation
    ├── api/               # API documentation
    └── examples/          # Example code
```

## Core Components

### 1. Agent System (`agent/client/agent_core.py`)

The multi-agent system consists of two main components:

#### Planner
- Generates high-level plans
- Breaks down complex tasks
- Updates TODO.md in real-time

```python
class Planner:
    def __init__(self, model="gpt-4"):
        self.model = model
        
    def create_plan(self, task: str) -> Plan:
        # Generate structured plan
        response = self.llm.generate(
            prompt=self.plan_prompt(task),
            model=self.model
        )
        return self.parse_plan(response)
```

#### Executor
- Executes plan steps
- Manages tool calls
- Reports progress

```python
class Executor:
    def __init__(self, model="gpt-4o-mini"):
        self.model = model
        self.tools = ToolRegistry()
        
    def execute_step(self, step: Step) -> Result:
        # Execute single step with tools
        tool = self.tools.get(step.tool)
        return tool.execute(step.params)
```

### 2. Tool System (`agent/server/`)

Tools follow the Model Context Protocol (MCP) standard:

```python
from mcp import Tool, ToolResult

class CustomTool(Tool):
    name = "custom_tool"
    description = "Description of what the tool does"
    
    def __init__(self):
        super().__init__()
        
    async def execute(self, **params) -> ToolResult:
        # Tool implementation
        result = self.process(params)
        return ToolResult(success=True, data=result)
```

### 3. Frontend (`frontend/`)

The frontend uses Next.js 15 with React 19:

```typescript
// components/chat/ChatInterface.tsx
export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  
  const handleSubmit = async (task: string) => {
    const response = await api.executeTask(task)
    // Handle streaming response
  }
  
  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <InputArea onSubmit={handleSubmit} />
    </div>
  )
}
```

## Adding New Tools

### Step 1: Create Tool Implementation

Create a new file in `agent/server/`:

```python
# agent/server/my_custom_tool.py
from mcp import Tool, ToolResult
import logging

logger = logging.getLogger(__name__)

class MyCustomTool(Tool):
    name = "my_custom_tool"
    description = "Performs custom operations"
    
    parameters = {
        "input": {"type": "string", "required": True},
        "options": {"type": "object", "required": False}
    }
    
    async def execute(self, input: str, options: dict = None) -> ToolResult:
        try:
            # Your tool logic here
            result = self.process_input(input, options)
            
            return ToolResult(
                success=True,
                data=result,
                metadata={"processed_at": datetime.now()}
            )
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return ToolResult(
                success=False,
                error=str(e)
            )
    
    def process_input(self, input: str, options: dict):
        # Implementation details
        return {"processed": input}
```

### Step 2: Register Tool

Add your tool to the registry in `agent/server/__init__.py`:

```python
from .my_custom_tool import MyCustomTool

AVAILABLE_TOOLS = {
    "my_custom_tool": MyCustomTool,
    # ... other tools
}
```

### Step 3: Update Tool Whitelist

Add to the executor's tool whitelist in `agent/client/config.py`:

```python
ALLOWED_TOOLS = [
    "search_tool",
    "code_tool",
    "my_custom_tool",  # Add your tool here
    # ... other tools
]
```

### Step 4: Test Your Tool

Create a test file:

```python
# tests/test_my_custom_tool.py
import pytest
from agent.server.my_custom_tool import MyCustomTool

@pytest.mark.asyncio
async def test_custom_tool():
    tool = MyCustomTool()
    result = await tool.execute(input="test data")
    
    assert result.success
    assert result.data["processed"] == "test data"
```

## Modifying the Agent System

### Changing Models

Update model configurations in `agent/client/config.py`:

```python
MODELS = {
    "planner": "gpt-4",          # Change planner model
    "executor": "gpt-4o-mini",   # Change executor model
    "vision": "gpt-4o",          # Change vision model
    "video": "gemini-2.0-flash"  # Change video model
}
```

### Customizing Prompts

Modify system prompts in `agent/client/prompts.py`:

```python
PLANNER_PROMPT = """
You are a research planner. Your role is to:
1. Analyze the user's request
2. Break it down into actionable steps
3. Create a structured plan

{custom_instructions}
"""

EXECUTOR_PROMPT = """
You are a task executor. Follow the plan and:
1. Execute each step using available tools
2. Report progress in real-time
3. Handle errors gracefully

{custom_instructions}
"""
```

## Debugging

### Enable Debug Logging

Set environment variables:

```bash
# Enable debug logging
export DEBUG=true
export LOG_LEVEL=DEBUG

# Run with verbose output
python app.py --debug
```

### Using Debug Tools

```python
# Add breakpoints in code
import pdb

def complex_function():
    pdb.set_trace()  # Debugger will stop here
    result = process_data()
    return result
```

### Frontend Debugging

```typescript
// Use React DevTools and console logging
useEffect(() => {
  console.log('Component mounted', { props, state })
  
  return () => {
    console.log('Component unmounting')
  }
}, [])
```

## Contributing

### Code Style

- Python: Follow PEP 8
- TypeScript: Use ESLint and Prettier
- Commit messages: Follow conventional commits

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit PR with description

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes and test
# ... edit files ...
pytest tests/
npm test

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/my-new-feature
```

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [React 19 Features](https://react.dev/blog/2024/12/05/react-19)

## Support

- GitHub Issues: [https://github.com/ResearAI/ResearStudio/issues](https://github.com/ResearAI/ResearStudio/issues)
- Email: resear.ai@gmail.com