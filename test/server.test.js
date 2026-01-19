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

// Test counters
let passed = 0;
let failed = 0;
const results = [];

/**
 * Send a JSON-RPC request to the server and get the response
 */
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

        proc.on('close', (code) => {
            try {
                // Parse only the JSON-RPC response (last complete JSON object)
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

        // Send the request and close stdin
        proc.stdin.write(JSON.stringify(request) + '\n');
        proc.stdin.end();
    });
}

/**
 * Run a test case
 */
async function test(name, fn) {
    try {
        await fn();
        passed++;
        results.push({ name, status: '✅ PASSED' });
        console.log(`✅ ${name}`);
    } catch (error) {
        failed++;
        results.push({ name, status: '❌ FAILED', error: error.message });
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
    }
}

/**
 * Assert helper
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// ============================================
// Test Cases
// ============================================

console.log('\n🧪 Dynamsoft MCP Server Test Suite\n');
console.log('='.repeat(50));

// Test 1: Server initialization
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

// Test 2: List tools
await test('tools/list returns all 18 tools', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
    });

    assert(response.result, 'Should have result');
    assert(response.result.tools, 'Should have tools array');
    assert(response.result.tools.length === 18, `Expected 18 tools, got ${response.result.tools.length}`);

    const toolNames = response.result.tools.map(t => t.name);
    const expectedTools = [
        'list_sdks', 'get_sdk_info', 'list_samples', 'list_python_samples',
        'list_web_samples', 'list_dwt_categories', 'get_code_snippet',
        'get_web_sample', 'get_python_sample', 'get_dwt_sample', 'get_quick_start',
        'get_gradle_config', 'get_license_info', 'get_api_usage', 'search_samples',
        'generate_project', 'search_dwt_docs', 'get_dwt_api_doc'
    ];

    for (const expected of expectedTools) {
        assert(toolNames.includes(expected), `Missing tool: ${expected}`);
    }
});

// Test 3: list_sdks tool
await test('list_sdks returns SDK information', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_sdks',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    assert(response.result.content.length > 0, 'Should have content items');

    const text = response.result.content[0].text;
    assert(text.includes('dbr-mobile'), 'Should include dbr-mobile');
    assert(text.includes('dbr-python'), 'Should include dbr-python');
    assert(text.includes('dbr-web'), 'Should include dbr-web');
    assert(text.includes('dwt'), 'Should include dwt');
});

// Test 4: get_sdk_info tool
await test('get_sdk_info returns detailed SDK info', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_sdk_info',
            arguments: { sdk_id: 'dbr-mobile' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');

    const text = response.result.content[0].text;
    assert(text.includes('Android') || text.includes('android'), 'Should include Android');
    assert(text.includes('11.2.5000'), 'Should include version');
});

// Test 5: get_license_info tool (requires platform parameter)
await test('get_license_info returns trial license', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_license_info',
            arguments: { platform: 'android' }
        }
    });

    assert(response.result, 'Should have result');
    assert(!response.result.isError, 'Should not be an error');

    const text = response.result.content[0].text;
    assert(text.includes('DLS2') || text.includes('License'), 'Should include license info');
});

// Test 6: list_samples tool
await test('list_samples returns mobile samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { platform: 'android' }
        }
    });

    assert(response.result, 'Should have result');

    const text = response.result.content[0].text;
    assert(text.includes('android'), 'Should include android');
});

// Test 7: list_python_samples tool
await test('list_python_samples returns Python samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_python_samples',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');
    // Should return samples or indicate no local samples
    assert(response.result.content, 'Should have content');
});

// Test 8: list_dwt_categories tool
await test('list_dwt_categories returns DWT categories', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_dwt_categories',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');
    // Should return categories or indicate they exist
    assert(response.result.content, 'Should have content');
});

// Test 9: get_quick_start tool
await test('get_quick_start returns quick start guide', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quick_start',
            arguments: { sdk_id: 'dbr-mobile', platform: 'android' }
        }
    });

    assert(response.result, 'Should have result');

    const text = response.result.content[0].text;
    assert(text.includes('Quick Start') || text.includes('Android'), 'Should include quick start info');
});

// Test 10: get_gradle_config tool
await test('get_gradle_config returns Gradle configuration', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_gradle_config',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');

    const text = response.result.content[0].text;
    assert(text.includes('gradle') || text.includes('Gradle') || text.includes('implementation'),
        'Should include Gradle config');
});

// Test 11: get_api_usage tool
await test('get_api_usage returns API usage info', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_api_usage',
            arguments: { sdk_id: 'dbr-mobile', api_name: 'decode' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
});

// Test 12: search_samples tool
await test('search_samples finds samples by keyword', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search_samples',
            arguments: { query: 'barcode' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
});

// Test 13: generate_project tool
await test('generate_project returns project structure', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'generate_project',
            arguments: { platform: 'android', sample_name: 'ScanSingleBarcode' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    const text = response.result.content[0].text;
    assert(text.includes('# Project Generation:'), 'Should include project generation header');
    assert(text.includes('AndroidManifest.xml') || text.includes('build.gradle'), 'Should include project files');
});

// Test 14: list_web_samples tool
await test('list_web_samples returns web barcode samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_web_samples',
            arguments: {}
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    const text = response.result.content[0].text;
    assert(text.includes('Web Barcode Reader Samples'), 'Should include web samples header');
});

// Test 15: get_web_sample tool
await test('get_web_sample returns web barcode sample code', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_web_sample',
            arguments: { sample_name: 'hello-world' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    const text = response.result.content[0].text;
    assert(text.includes('Web Barcode Reader') || text.includes('html') || text.includes('not found'), 'Should return sample or indicate not found');
});

// Test 16: search_dwt_docs tool
await test('search_dwt_docs finds documentation articles', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search_dwt_docs',
            arguments: { query: 'PDF' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    const text = response.result.content[0].text;
    assert(text.includes('DWT Documentation Search'), 'Should include search header');
    assert(text.includes('PDF') || text.includes('pdf'), 'Should find PDF-related articles');
});

// Test 17: get_dwt_api_doc tool
await test('get_dwt_api_doc returns documentation article', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_dwt_api_doc',
            arguments: { title: 'OCR' }
        }
    });

    assert(response.result, 'Should have result');
    assert(response.result.content, 'Should have content');
    const text = response.result.content[0].text;
    // Should return either the article or suggestions
    assert(text.includes('OCR') || text.includes('not found'), 'Should handle OCR query');
});

// Test 18: resources/list returns registered resources
await test('resources/list returns registered resources', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list'
    });

    assert(response.result, 'Should have result');
    assert(response.result.resources, 'Should have resources array');
    assert(response.result.resources.length > 0, 'Should have at least one resource');

    // Check for expected resource types
    const uris = response.result.resources.map(r => r.uri);
    assert(uris.some(u => u.includes('sdk-info')), 'Should have sdk-info resources');
    assert(uris.some(u => u.includes('docs/dwt')), 'Should have DWT doc resources');
});

// Test 19: Invalid tool call returns error
await test('Invalid tool call returns proper error', async () => {
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

// Test 20: Tool with invalid arguments returns error
await test('Tool with missing required arguments returns error', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_license_info',
            arguments: {} // Missing required platform
        }
    });

    assert(response.result && response.result.isError,
        'Should return error for missing required argument');
});

// ============================================
// Test Summary
// ============================================

console.log('\n' + '='.repeat(50));
console.log('\n📊 Test Summary\n');
console.log(`   Total:  ${passed + failed}`);
console.log(`   Passed: ${passed} ✅`);
console.log(`   Failed: ${failed} ❌`);
console.log(`   Rate:   ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => r.status.includes('FAILED')).forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
    });
}

console.log('\n' + '='.repeat(50));

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
