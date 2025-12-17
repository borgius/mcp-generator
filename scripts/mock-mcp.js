#!/usr/bin/env node
// Minimal MCP mock server that speaks NDJSON or Content-Length JSON-RPC over stdio.
const readline = require('readline');

function write(obj) {
  const json = JSON.stringify(obj);
  // prefer ndjson framing for simplicity
  process.stdout.write(json + '\n');
}

function makeId() {
  return Math.floor(Math.random() * 1000000);
}

const tools = [
  {
    name: 'mock_echo',
    description: 'Echo back the provided message',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false }
  },
  {
    name: 'mock_sum',
    description: 'Sum two numbers',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a','b'], additionalProperties: false }
  }
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return;
  }
  if (msg.method === 'initialize') {
    write({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'mock-mcp', version: '0.0.1' } } });
  } else if (msg.method === 'tools/list') {
    write({ jsonrpc: '2.0', id: msg.id, result: { tools } });
  } else if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    if (name === 'mock_echo') {
      write({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: String(args.message ?? '') }] } });
    } else if (name === 'mock_sum') {
      const a = Number(args.a ?? 0);
      const b = Number(args.b ?? 0);
      write({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: String(a + b) }] } });
    } else {
      write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'Unknown tool' } });
    }
  }
});

process.stdin.on('end', () => process.exit(0));
