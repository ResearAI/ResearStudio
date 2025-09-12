# API Documentation

Complete API reference for ResearStudio's backend services and frontend integration.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Core Endpoints](#core-endpoints)
  - [Task Execution](#task-execution)
  - [File Operations](#file-operations)
  - [Streaming](#streaming)
  - [Settings](#settings)
- [WebSocket Events](#websocket-events)
- [Tool APIs](#tool-apis)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

## Overview

ResearStudio provides a RESTful API for task execution and real-time communication via Server-Sent Events (SSE) and WebSockets.

### Base URLs

- Development: `http://localhost:5000`
- Production: Configure in environment variables

### Request Format

All requests should include:

```http
Content-Type: application/json
Accept: application/json
```

### Response Format

Standard response structure:

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Authentication

Currently uses API key authentication. Include in headers:

```http
Authorization: Bearer YOUR_API_KEY
```

## Core Endpoints

### Task Execution

#### Execute Task

`POST /api/tasks`

Executes a complex task using the multi-agent system.

**Request:**

```json
{
  "task": "Research the latest AI trends and create a report",
  "options": {
    "max_steps": 30,
    "timeout": 1800,
    "tools": ["search", "code", "document"],
    "output_format": "markdown"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "task_id": "task_abc123",
    "status": "in_progress",
    "workspace": "/workspaces/task_abc123",
    "stream_url": "/api/stream/task_abc123"
  }
}
```

**Status Codes:**

- `200` - Task started successfully
- `400` - Invalid request parameters
- `503` - Service unavailable

#### Get Task Status

`GET /api/tasks/{task_id}`

Retrieves the current status of a task.

**Response:**

```json
{
  "success": true,
  "data": {
    "task_id": "task_abc123",
    "status": "completed",
    "progress": 100,
    "steps_completed": 15,
    "total_steps": 15,
    "current_step": "Finalizing report",
    "elapsed_time": 245.6
  }
}
```

#### Pause Task

`POST /api/tasks/{task_id}/pause`

Pauses task execution.

**Response:**

```json
{
  "success": true,
  "message": "Task paused",
  "data": {
    "task_id": "task_abc123",
    "status": "paused",
    "can_resume": true
  }
}
```

#### Resume Task

`POST /api/tasks/{task_id}/resume`

Resumes paused task execution.

**Response:**

```json
{
  "success": true,
  "message": "Task resumed",
  "data": {
    "task_id": "task_abc123",
    "status": "in_progress"
  }
}
```

#### Connect to Task

`POST /api/tasks/{task_id}/connect`

Cancels task execution.

**Response:**

```json
{
  "success": true,
  "message": "Task cancelled",
  "data": {
    "task_id": "task_abc123",
    "status": "cancelled",
    "cleanup_completed": true
  }
}
```

### File Operations

#### List Files

`GET /api/tasks/{task_id}/files`

Lists all files in a task workspace.

**Response:**

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "path": "/report.md",
        "size": 2048,
        "modified": "2024-01-01T10:00:00Z",
        "type": "file"
      },
      {
        "path": "/data",
        "type": "directory",
        "children": []
      }
    ]
  }
}
```

#### Read File

`GET /api/tasks/{task_id}/files/{file_path}`

Reads file contents.

**Response:**

```json
{
  "success": true,
  "data": {
    "path": "/report.md",
    "content": "# AI Trends Report\n\n...",
    "encoding": "utf-8",
    "size": 2048
  }
}
```

#### Write File

`POST /api/tasks/{task_id}/save-file`

Creates or updates a file.

**Request:**

```json
{
  "filename": "report.md",
  "content": "# Updated Report\n\n...",
  "editable": true
}
```

**Response:**

```json
{
  "success": true,
  "message": "File saved",
  "data": {
    "path": "/report.md",
    "size": 2156
  }
}
```

#### Terminal Command

`POST /api/tasks/{task_id}/terminal`

Executes a terminal command in the task workspace.

**Request:**

```json
{
  "command": "ls -la"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "output": "total 16\ndrwxr-xr-x 2 user user 4096 Jan 1 10:00 .\n...",
    "exit_code": 0
  }
}
```

#### Export Workspace

`GET /api/tasks/{task_id}/export`

Downloads entire workspace as ZIP.

**Response:**

Binary ZIP file with appropriate headers:

```http
Content-Type: application/zip
Content-Disposition: attachment; filename="workspace_task_abc123.zip"
```

### Streaming

#### Server-Sent Events

`GET /api/tasks/{task_id}/connect`

Establishes SSE connection for real-time updates.

**Event Types:**

```javascript
// Plan update
event: plan_update
data: {"content": "1. Search for AI trends\n2. Analyze data\n3. Create report"}

// Step execution
event: step_execution
data: {"step": 2, "action": "Analyzing search results", "progress": 45}

// Tool call
event: tool_call
data: {"tool": "search_tool", "params": {"query": "AI trends 2024"}}

// Tool result
event: tool_result
data: {"tool": "search_tool", "success": true, "result_summary": "Found 25 relevant articles"}

// File created
event: file_created
data: {"path": "/summary.md", "size": 1024}

// Error
event: error
data: {"message": "API rate limit exceeded", "recoverable": true}

// Task complete
event: task_complete
data: {"status": "completed", "files_created": 3, "duration": 245.6}
```

**Client Example:**

```javascript
const eventSource = new EventSource('/api/stream/task_abc123');

eventSource.addEventListener('plan_update', (e) => {
  const data = JSON.parse(e.data);
  updatePlanDisplay(data.content);
});

eventSource.addEventListener('error', (e) => {
  console.error('SSE Error:', e);
  eventSource.close();
});
```

### Settings

#### Get Settings

`GET /api/settings`

Retrieves current system settings.

**Response:**

```json
{
  "success": true,
  "data": {
    "models": {
      "planner": "gpt-4",
      "executor": "gpt-4o-mini",
      "vision": "gpt-4o"
    },
    "limits": {
      "max_steps": 50,
      "max_execution_time": 3600,
      "max_file_size": 10485760
    },
    "features": {
      "code_execution": true,
      "web_search": true,
      "document_processing": true
    }
  }
}
```

#### Update Settings

`PUT /api/settings`

Updates system settings.

**Request:**

```json
{
  "models": {
    "executor": "gpt-4"
  },
  "limits": {
    "max_steps": 100
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Settings updated",
  "data": {
    "updated_fields": ["models.executor", "limits.max_steps"]
  }
}
```

## Tool Status

#### Get Tool Status

`GET /api/tools/status`

Retrieves the status of all available tools.

### Message Types

#### From Client

```json
{
  "type": "edit_plan",
  "task_id": "task_abc123",
  "content": "Updated plan content..."
}
```

```json
{
  "type": "execute_command",
  "task_id": "task_abc123",
  "command": "ls -la"
}
```

#### From Server

```json
{
  "type": "plan_updated",
  "task_id": "task_abc123",
  "content": "New plan content..."
}
```

```json
{
  "type": "command_output",
  "task_id": "task_abc123",
  "output": "file1.txt\nfile2.txt\n"
}
```

## Tool APIs

### Reload Workspaces

`POST /api/tasks/reload-workspaces`

Reloads all task workspaces from disk.

**Response:**

```json
{
  "success": true,
  "message": "Workspaces reloaded",
  "data": {
    "tasks_loaded": 5,
    "tasks": ["task_abc123", "task_def456", ...]
  }
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID task_xyz not found",
    "details": {
      "task_id": "task_xyz",
      "suggestion": "Check task ID or create new task"
    }
  }
}
```

### Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_REQUEST` | Malformed request | 400 |
| `UNAUTHORIZED` | Missing or invalid API key | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `RATE_LIMITED` | Too many requests | 429 |
| `INTERNAL_ERROR` | Server error | 500 |
| `SERVICE_UNAVAILABLE` | Service temporarily down | 503 |

### Handling Errors

```javascript
try {
  const response = await fetch('/api/task/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ task: 'Research AI' })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error(`Error: ${error.error.code} - ${error.error.message}`);
    
    // Handle specific errors
    switch(error.error.code) {
      case 'RATE_LIMITED':
        await delay(60000); // Wait 1 minute
        return retry();
      case 'UNAUTHORIZED':
        return redirectToLogin();
      default:
        showError(error.error.message);
    }
  }
  
  const data = await response.json();
  return data;
} catch (err) {
  console.error('Network error:', err);
  showError('Network connection failed');
}
```

## Rate Limiting

### Limits

- **Default**: 100 requests per minute
- **Authenticated**: 1000 requests per minute
- **Task Execution**: 10 concurrent tasks

### Headers

Rate limit information in response headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

### Handling Rate Limits

```javascript
async function makeRequest(url, options) {
  const response = await fetch(url, options);
  
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  if (response.status === 429) {
    const waitTime = reset * 1000 - Date.now();
    console.log(`Rate limited. Waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return makeRequest(url, options); // Retry
  }
  
  return response;
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ResearStudioClient } from '@researstudio/client';

const client = new ResearStudioClient({
  apiKey: process.env.RESEARSTUDIO_API_KEY,
  baseUrl: 'http://localhost:5000'
});

// Execute task
const task = await client.executeTask({
  task: 'Research quantum computing',
  options: {
    maxSteps: 30,
    tools: ['search', 'document']
  }
});

// Monitor progress
task.on('progress', (data) => {
  console.log(`Progress: ${data.progress}%`);
});

// Get results
const results = await task.waitForCompletion();
console.log('Files created:', results.files);
```

### Python

```python
from researstudio import ResearStudioClient

client = ResearStudioClient(
    api_key=os.environ['RESEARSTUDIO_API_KEY'],
    base_url='http://localhost:5000'
)

# Execute task
task = client.execute_task(
    task='Research quantum computing',
    options={
        'max_steps': 30,
        'tools': ['search', 'document']
    }
)

# Monitor progress
for event in task.stream_events():
    if event['type'] == 'progress':
        print(f"Progress: {event['data']['progress']}%")

# Get results
results = task.wait_for_completion()
print(f"Files created: {results['files']}")
```

## Webhooks

Configure webhooks for task events:

### Register Webhook

`POST /api/webhooks`

```json
{
  "url": "https://your-server.com/webhook",
  "events": ["task.completed", "task.failed"],
  "secret": "your-webhook-secret"
}
```

### Webhook Payload

```json
{
  "event": "task.completed",
  "task_id": "task_abc123",
  "timestamp": "2024-01-01T10:00:00Z",
  "data": {
    "status": "completed",
    "files_created": 3,
    "duration": 245.6
  },
  "signature": "sha256=..."
}
```

### Verify Webhook

```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"sha256={expected}" == signature
```

## Support

- API Status: [status.researstudio.ai](https://status.researstudio.ai)
- Documentation: [docs.researstudio.ai](https://docs.researstudio.ai)
- Support: resear.ai@gmail.com