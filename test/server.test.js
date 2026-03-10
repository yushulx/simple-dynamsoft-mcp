#!/usr/bin/env node

/**
 * Automated tests for Dynamsoft MCP Server
 * Run with: node test/server.test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resourceIndex } from "../src/server/resource-index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '..', 'src', 'index.js');

let passed = 0;
let failed = 0;
const results = [];

async function sendRequest(request) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, RAG_PROVIDER: 'fuse' }
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
        'list_samples',
        'resolve_version',
        'get_quickstart',
        'get_sample_files'
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
    assert(parsed.products.dcv, 'Should include DCV');
    assert(parsed.products.dbr, 'Should include DBR');
    assert(parsed.products.dwt, 'Should include DWT');
    assert(parsed.products.ddv, 'Should include DDV');
    assert(parsed.productSelection?.dcvSupersetSummary, 'Should include DCV superset summary');

    const heavyFields = ['docTitles', 'samples', 'sampleCategories', 'docs', 'articles'];

    for (const [productName, product] of Object.entries(parsed.products)) {
        assert(typeof product.latestMajor === 'number', `${productName} should include numeric latestMajor`);
        assert(product.editions && typeof product.editions === 'object', `${productName} should include editions object`);
        assert(!('docs' in product), `${productName} should not include docs`);
        assert(!('samples' in product), `${productName} should not include samples`);

        for (const [editionName, edition] of Object.entries(product.editions)) {
            assert(edition.version, `${productName}.${editionName} should include version`);
            assert(Array.isArray(edition.platforms), `${productName}.${editionName} should include platforms`);
            assert(typeof edition.docCount === 'number', `${productName}.${editionName} should include docCount`);
            assert(typeof edition.sampleCount === 'number', `${productName}.${editionName} should include sampleCount`);

            const compactKeys = ['version', 'platforms', 'docCount', 'sampleCount'];
            const unexpectedKeys = Object.keys(edition).filter((key) => !compactKeys.includes(key));
            assert(unexpectedKeys.length === 0, `${productName}.${editionName} should only include compact keys`);

            for (const field of heavyFields) {
                assert(!(field in edition), `${productName}.${editionName} should not include ${field}`);
            }
        }
    }
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
    const plain = response.result.content.find(item => item.type === 'text' && item.text.includes('Plain URIs'));
    assert(plain, 'Should include plain URIs for copy/paste');
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
    const plain = response.result.content.find(item => item.type === 'text' && item.text.includes('Plain URIs'));
    assert(plain, 'Should include plain URIs for copy/paste');
});

await test('list_samples returns sample URIs and JSON payload', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'dwt' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Plain URIs'), 'Should include plain URIs section');

    const jsonIndex = text.indexOf('JSON:');
    assert(jsonIndex !== -1, 'Should include JSON section');
    const jsonText = text.slice(jsonIndex + 5).trim();
    const parsed = JSON.parse(jsonText);
    assert(Array.isArray(parsed.samples), 'JSON should include samples array');
    assert(parsed.samples.length > 0, 'Should return at least one sample');
});

await test('list_samples returns DBR nodejs server samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'dbr', edition: 'server', platform: 'nodejs' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    const jsonIndex = text.indexOf('JSON:');
    assert(jsonIndex !== -1, 'Should include JSON section');
    const parsed = JSON.parse(text.slice(jsonIndex + 5).trim());
    assert(parsed.samples.length > 0, 'Should return nodejs samples');
    assert(parsed.samples.every(s => s.platform === 'nodejs'), 'All samples should be nodejs platform');
});

await test('list_samples returns DCV python server samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'dcv', edition: 'server', platform: 'python' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    const jsonIndex = text.indexOf('JSON:');
    assert(jsonIndex !== -1, 'Should include JSON section');
    const parsed = JSON.parse(text.slice(jsonIndex + 5).trim());
    assert(parsed.samples.length > 0, 'Should return DCV python samples');
    assert(parsed.samples.every(s => s.platform === 'python'), 'All samples should be python platform');
});

await test('list_samples returns DBR maui mobile samples', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'dbr', edition: 'mobile', platform: 'maui' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    const jsonIndex = text.indexOf('JSON:');
    assert(jsonIndex !== -1, 'Should include JSON section');
    const parsed = JSON.parse(text.slice(jsonIndex + 5).trim());
    assert(parsed.samples.length > 0, 'Should return maui samples');
    assert(parsed.samples.every(s => s.platform === 'maui'), 'All samples should be maui platform');
});

await test('search returns exact match for a DWT sample ID', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'basic-scan', product: 'dwt', type: 'sample' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Found'), 'Should report matches');
    assert(text.includes('exact match'), 'Should indicate exact match');
    const link = response.result.content.find(item => item.type === 'resource_link');
    assert(link, 'Should include resource link');
});

await test('search returns suggestions for non-existent sample ID', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'nonexistent-sample-xyz', product: 'dwt', type: 'sample' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    // Should either return suggestions or a no-results message, not crash
    assert(text.includes('Related samples') || text.includes('No results'), 'Should return suggestions or no-results message');
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
    assert(uris.includes('doc://product-selection'), 'Should include doc://product-selection guidance');
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

await test('resources/read tolerates doc URI with decoded slash in slug', async () => {
    const uriWithEncodedSlash = resourceIndex.find(
        (entry) => entry.type === 'doc' && entry.uri.startsWith('doc://') && entry.uri.includes('%2F')
    )?.uri;
    assert(uriWithEncodedSlash, 'Expected at least one doc URI containing an encoded slash');

    const malformedUri = decodeURIComponent(uriWithEncodedSlash);
    assert(malformedUri !== uriWithEncodedSlash, 'Decoded URI should differ from canonical URI');

    const readResponse = await sendRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/read',
        params: { uri: malformedUri }
    });

    assert(readResponse.result, 'Should have read result');
    assert(readResponse.result.contents.length > 0, 'Should return content for decoded-slash URI');
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

await test('resolve_version returns latest for DCV', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'dcv' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('DCV Version Resolution'), 'Should include DCV resolution');
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

await test('get_quickstart returns a DCV quickstart', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'dcv', edition: 'server', platform: 'python', scenario: 'mrz' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Quick Start: DCV Server'), 'Should include DCV quickstart header');
});

await test('get_sample_files returns DDV project structure', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_sample_files',
            arguments: { product: 'ddv', edition: 'web', sample_id: 'hello-world' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('# Sample Files:'), 'Should include sample files header');
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
