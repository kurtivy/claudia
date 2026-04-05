#!/bin/bash
# Helper to call computer-use MCP tools
# Usage: computer-use.sh <tool_name> '<json_args>'
TOOL=$1
ARGS=${2:-"{}"}
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"claudia","version":"1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"%s","arguments":%s},"id":2}\n' "$TOOL" "$ARGS" | timeout 30 "C:/Users/kurtw/.local/bin/computer-control-mcp.exe" 2>/dev/null | tail -1 | python3 -c "
import sys, json
r = json.load(sys.stdin)
result = r.get('result', {})
for c in result.get('content', []):
    if c.get('type') == 'text':
        print(c['text'])
    elif c.get('type') == 'image':
        print('[image returned]')
structured = result.get('structuredContent', {}).get('result')
if structured and isinstance(structured, str):
    pass  # already printed via content
elif structured:
    print(json.dumps(structured, indent=2))
" 2>/dev/null
