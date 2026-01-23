#!/usr/bin/env node

/**
 * Automated tests for Dynamsoft MCP Server
 * Run with: node test/server.test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '..', 'src', 'index.js');

let passed = 0;
let failed = 0;
const results = [];

async function sendRequest(request) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', () => {
            try {
                const lines = stdout.trim().split('\n');
                const jsonLine = lines.find(line => {
                    try {
                        const parsed = JSON.parse(line);
                        return parsed.jsonrpc === '2.0';
                    } catch {
                        return false;
                    }
                });

                if (jsonLine) {
                    resolve(JSON.parse(jsonLine));
                } else {
                    reject(new Error(`No valid JSON-RPC response. stdout: ${stdout}, stderr: ${stderr}`));
                }
            } catch (e) {
                reject(new Error(`Failed to parse response: ${e.message}. stdout: ${stdout}`));
            }
        });

        proc.on('error', reject);

        proc.stdin.write(JSON.stringify(request) + '\n');
        proc.stdin.end();
    });
}

async function test(name, fn) {
    try {
        await fn();
        passed++;
        results.push({ name, status: 'PASSED' });
        console.log(`OK ${name}`);
    } catch (error) {
        failed++;
        results.push({ name, status: 'FAILED', error: error.message });
        console.log(`FAIL ${name}`);
        console.log(`  Error: ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

console.log('\nDynamsoft MCP Server Test Suite\n');
console.log('='.repeat(50));

await test('Server responds to initialize request', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.serverInfo, 'Should have serverInfo');
    assert(response.result.serverInfo.name === 'simple-dynamsoft-mcp', 'Server name should match');
});

await test('tools/list returns the minimal tool surface', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
    });

    assert(response.result, 'Should have result');
    assert(response.result.tools, 'Should have tools array');

    const toolNames = response.result.tools.map(t => t.name);
    const expectedTools = [
        'get_index',
        'search',
        'resolve_version',
        'get_quickstart',
        'generate_project'
    ];

    assert(response.result.tools.length === expectedTools.length, `Expected ${expectedTools.length} tools`);
    for (const expected of expectedTools) {
        assert(toolNames.includes(expected), `Missing tool: ${expected}`);
    }
});

await test('get_index returns product data', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_index',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    const parsed = JSON.parse(text);
    assert(parsed.products.dbr, 'Should include DBR');
    assert(parsed.products.dwt, 'Should include DWT');
    assert(parsed.products.ddv, 'Should include DDV');
});

await test('search returns resource links for DWT', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'basic-scan', product: 'dwt' }
        }
    });

    assert(response.result, 'Should have result');
    const link = response.result.content.find(item => item.type === 'resource_link');
    assert(link, 'Should return at least one resource link');
});

await test('search returns resource links for DDV', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'hello-world', product: 'ddv' }
        }
    });

    assert(response.result, 'Should have result');
    const link = response.result.content.find(item => item.type === 'resource_link');
    assert(link, 'Should return at least one resource link');
});

await test('resources/list returns pinned resources', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list'
    });

    assert(response.result, 'Should have result');
    assert(response.result.resources.length > 0, 'Should have pinned resources');

    const uris = response.result.resources.map(r => r.uri);
    assert(uris.includes('doc://index'), 'Should include doc://index');
    assert(uris.includes('doc://version-policy'), 'Should include doc://version-policy');
});

await test('search + resources/read works together', async () => {
    const searchResponse = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'ScanSingleBarcode', product: 'dbr' }
        }
    });

    const link = searchResponse.result.content.find(item => item.type === 'resource_link');
    assert(link, 'Should return resource link');

    const readResponse = await sendRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/read',
        params: { uri: link.uri }
    });

    assert(readResponse.result, 'Should have read result');
    assert(readResponse.result.contents.length > 0, 'Should return content');
});

await test('resolve_version returns latest for DBR web', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'dbr', edition: 'web' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Resolved version'), 'Should include resolved version');
});

await test('resolve_version returns latest for DDV', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'ddv' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('DDV Version Resolution'), 'Should include DDV resolution');
});

await test('resolve_version rejects old major version', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'dbr', edition: 'web', constraint: '10' }
        }
    });

    assert(response.result && response.result.isError, 'Should return error for old major');
    const text = response.result.content[0].text;
    assert(text.includes('latest major'), 'Should mention latest major policy');
});

await test('get_quickstart returns a DDV quickstart', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'ddv' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Quick Start: Dynamsoft Document Viewer'), 'Should include DDV quickstart header');
});

await test('generate_project returns DDV project structure', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'generate_project',
            arguments: { product: 'ddv', edition: 'web', sample_id: 'hello-world' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('# Project Generation:'), 'Should include project generation header');
});

await test('Invalid tool call returns error', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'nonexistent_tool',
            arguments: {}
        }
    });

    assert(response.error || (response.result && response.result.isError),
        'Should return error for invalid tool');
});

console.log('\n' + '='.repeat(50));
console.log('\nTest Summary\n');
console.log(`Total:  ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Rate:   ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
        console.log(`- ${r.name}: ${r.error}`);
    });
}

console.log('\n' + '='.repeat(50));
process.exit(failed > 0 ? 1 : 0);
