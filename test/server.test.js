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
const testFilter = process.env.TEST_FILTER || '';

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
    if (testFilter && !name.includes(testFilter)) {
        return;
    }

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

async function expectDeprecatedDcvProduct(toolName, args = {}) {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: toolName,
            arguments: { product: 'dcv', ...args }
        }
    });

    assert(response.result && response.result.isError, `${toolName} should reject deprecated public dcv input`);
    const text = response.result.content[0].text;
    assert(/public MCP contract/i.test(text), `${toolName} should explain the public contract`);
    assert(/dbr, dwt, ddv, mrz, and mds/i.test(text), `${toolName} should list supported public products`);
    assert(/mrz/i.test(text), `${toolName} should guide MRZ usage`);
    assert(/mds/i.test(text), `${toolName} should guide MDS usage`);
}

async function expectDeprecatedDcvAlias(toolName, alias, args = {}) {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: toolName,
            arguments: { product: alias, ...args }
        }
    });

    assert(response.result && response.result.isError, `${toolName} should reject deprecated public alias ${alias}`);
    const text = response.result.content[0].text;
    assert(/public MCP contract/i.test(text), `${toolName} should explain the public contract for alias ${alias}`);
    assert(/dbr, dwt, ddv, mrz, and mds/i.test(text), `${toolName} should list supported public products for alias ${alias}`);
}

await test('deprecated public dcv product is rejected by search', async () => {
    await expectDeprecatedDcvProduct('search', { query: 'mrz', type: 'sample' });
});

await test('deprecated public dcv product is rejected by list_samples', async () => {
    await expectDeprecatedDcvProduct('list_samples', { edition: 'server', platform: 'python' });
});

await test('deprecated public dcv product is rejected by resolve_version', async () => {
    await expectDeprecatedDcvProduct('resolve_version');
});

await test('deprecated public dcv product is rejected by get_quickstart', async () => {
    await expectDeprecatedDcvProduct('get_quickstart', { edition: 'server', platform: 'python' });
});

await test('deprecated public dcv product is rejected by get_sample_files', async () => {
    await expectDeprecatedDcvProduct('get_sample_files', { edition: 'server', platform: 'python', sample_id: 'mrz_scanner' });
});

await test('deprecated public capture vision alias is rejected by search', async () => {
    await expectDeprecatedDcvAlias('search', 'capture vision', { query: 'mrz', type: 'sample' });
});

await test('deprecated public capture vision bundle alias is rejected by search', async () => {
    await expectDeprecatedDcvAlias('search', 'capture vision bundle', { query: 'mrz', type: 'sample' });
});

await test('get_index returns only public product offerings', async () => {
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

    const productNames = Object.keys(parsed.products).sort();
    assert(JSON.stringify(productNames) === JSON.stringify(['dbr', 'ddv', 'dwt', 'mds', 'mrz']), 'Should expose only public offerings');
    assert(parsed.products.dbr, 'Should include DBR');
    assert(parsed.products.dwt, 'Should include DWT');
    assert(parsed.products.ddv, 'Should include DDV');
    assert(parsed.products.mrz, 'Should include MRZ');
    assert(parsed.products.mds, 'Should include MDS');
    assert(!parsed.products.dcv, 'Should not include DCV');

    const heavyFields = ['docTitles', 'samples', 'sampleCategories'];

    for (const [productName, product] of Object.entries(parsed.products)) {
        assert(Number.isFinite(product.latestMajor), `${productName} should include finite numeric latestMajor`);
        assert(product.editions && typeof product.editions === 'object', `${productName} should include editions object`);
        for (const [editionName, edition] of Object.entries(product.editions)) {
            assert(typeof edition.version === 'string', `${productName}.${editionName} should include string version`);
            assert(Array.isArray(edition.platforms), `${productName}.${editionName} should include platforms`);
            assert(Number.isFinite(edition.docCount), `${productName}.${editionName} should include finite docCount`);
            assert(Number.isFinite(edition.sampleCount), `${productName}.${editionName} should include finite sampleCount`);

            const compactKeys = ['version', 'platforms', 'docCount', 'sampleCount'];
            const unexpectedKeys = Object.keys(edition).filter((key) => !compactKeys.includes(key));
            assert(unexpectedKeys.length === 0, `${productName}.${editionName} should only include compact keys`);

            for (const field of heavyFields) {
                assert(!(field in edition), `${productName}.${editionName} should not include ${field}`);
            }
        }
    }
});

await test('search returns redirect links for unsupported MRZ server scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'mrz', product: 'mrz', edition: 'server', platform: 'python', type: 'sample' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ scope');
    assert(/reference|redirect/i.test(text), 'Should return redirect/reference guidance');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include server docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-python-samples'), 'Should include server samples link');
    const links = response.result.content.filter(item => item.type === 'resource_link');
    assert(links.length === 0, 'Should not leak indexed MRZ server results');
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

await test('list_samples returns redirect links for unsupported MRZ server scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'mrz', edition: 'server', platform: 'python' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ scope');
    assert(/reference/i.test(text), 'Should return reference links');
    assert(!text.includes('JSON:'), 'Should not return sample JSON for unsupported MRZ server scope');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include server docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-python-samples'), 'Should include server samples link');
});

await test('list_samples returns redirect links for unsupported MDS mobile scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'mds', edition: 'mobile', platform: 'android' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MDS/i.test(text), 'Should identify the MDS scope');
    assert(/reference/i.test(text), 'Should return reference links');
    assert(!text.includes('JSON:'), 'Should not return sample JSON for unsupported MDS mobile scope');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/mobile/'), 'Should include mobile docs link');
});

await test('public MRZ search results do not expose DCV branding', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'mrz', product: 'mrz', edition: 'mobile', type: 'sample' }
        }
    });

    assert(response.result, 'Should have result');
    const links = response.result.content.filter(item => item.type === 'resource_link');
    assert(links.length > 0, 'Should return public MRZ sample links');
    assert(links.every(link => !/DCV/i.test(link.name)), 'Public MRZ link names should not expose DCV branding');
    assert(links.every(link => !/DCV/i.test(link.description)), 'Public MRZ link descriptions should not expose DCV branding');
});

await test('public MRZ doc search results do not expose Capture Vision branding', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'mrz', product: 'mrz', edition: 'web', type: 'doc' }
        }
    });

    assert(response.result, 'Should have result');
    const links = response.result.content.filter(item => item.type === 'resource_link');
    assert(links.length > 0, 'Should return public MRZ doc links');
    assert(links.every(link => !/capture vision/i.test(link.name)), 'Public MRZ doc names should not expose Capture Vision branding');
    assert(links.every(link => !/capture vision/i.test(link.description)), 'Public MRZ doc descriptions should not expose Capture Vision branding');
});

await test('search returns redirect links for unsupported MDS mobile scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'search',
            arguments: { query: 'document', product: 'mds', edition: 'mobile', platform: 'android', type: 'sample' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MDS/i.test(text), 'Should identify the MDS scope');
    assert(/reference|redirect/i.test(text), 'Should return redirect/reference guidance');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/mobile/'), 'Should include mobile docs link');
    const links = response.result.content.filter(item => item.type === 'resource_link');
    assert(links.length === 0, 'Should not leak indexed MDS mobile results');
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

    const productSelection = response.result.resources.find(r => r.uri === 'doc://product-selection');
    assert(productSelection, 'Should expose product-selection metadata');
    assert(!/DCV vs DBR/i.test(productSelection.description), 'Should not use legacy DCV vs DBR wording');
    assert(/MRZ/i.test(productSelection.description), 'Should mention MRZ in public product guidance');
    assert(/MDS/i.test(productSelection.description), 'Should mention MDS in public product guidance');
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

await test('resolve_version returns latest for MRZ with public labeling', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'mrz' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('MRZ Version Resolution'), 'Should include MRZ resolution');
    assert(!text.includes('DCV Version Resolution'), 'Should not present MRZ as DCV');
});

await test('resolve_version for MRZ without edition only shows supported public editions', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'mrz' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('MRZ Version Resolution'), 'Should include MRZ resolution');
    assert(text.includes('Web:'), 'Should include supported MRZ web edition');
    assert(text.includes('Mobile:'), 'Should include supported MRZ mobile edition');
    assert(!text.includes('Server/Desktop:'), 'Should not advertise unsupported MRZ server edition');
});

await test('resolve_version for MDS without edition only shows supported public editions', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'resolve_version',
            arguments: { product: 'mds' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('MDS Version Resolution'), 'Should include MDS resolution');
    assert(text.includes('Web:'), 'Should include supported MDS web edition');
    assert(!text.includes('Mobile:'), 'Should not advertise unsupported MDS mobile edition');
    assert(!text.includes('Server/Desktop:'), 'Should not advertise unsupported MDS server edition');
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

await test('get_quickstart defaults DBR web to foundational messaging', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'dbr', edition: 'web' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(text.includes('Quick Start: DBR Web'), 'Should include DBR web quickstart header');
    assert(/foundational/i.test(text), 'Should steer DBR web quickstart to foundational messaging');
    assert(!text.includes('hello-world'), 'Should not default to the hello-world sample');
});

await test('get_quickstart returns redirect links for unsupported MRZ server scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'mrz', edition: 'server', platform: 'python' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ request');
    assert(/redirect|reference/i.test(text), 'Should present a redirect/reference response');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include public server docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-python-samples'), 'Should include public server samples link');
});

await test('get_quickstart returns redirect links for unsupported MDS mobile scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'mds', edition: 'mobile', platform: 'android' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MDS/i.test(text), 'Should identify the MDS request');
    assert(/redirect|reference/i.test(text), 'Should present a redirect/reference response');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/mobile/'), 'Should include public mobile docs link');
});

await test('get_quickstart returns a non-error public response for MRZ web', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'mrz', edition: 'web' }
        }
    });

    assert(response.result, 'Should have result');
    assert(!response.result.isError, 'Should not return an error for MRZ web quickstart');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ quickstart');
    assert(/reference|quick start/i.test(text), 'Should return a usable quickstart response');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/web/programming/javascript/user-guide/'), 'Should include public MRZ web docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-javascript-samples'), 'Should include public MRZ web samples link');
    assert(!text.includes('web / web'), 'Should not repeat the web scope label');
});

await test('get_quickstart returns a non-error public response for MDS web', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_quickstart',
            arguments: { product: 'mds', edition: 'web' }
        }
    });

    assert(response.result, 'Should have result');
    assert(!response.result.isError, 'Should not return an error for MDS web quickstart');
    const text = response.result.content[0].text;
    assert(/MDS/i.test(text), 'Should identify the MDS quickstart');
    assert(/reference|quick start/i.test(text), 'Should return a usable quickstart response');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/web/programming/javascript/user-guide/'), 'Should include public MDS web docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-javascript-samples'), 'Should include public MDS web samples link');
    assert(!text.includes('web / web'), 'Should not repeat the web scope label');
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

await test('get_sample_files returns redirect links for unsupported MRZ server scope when resource_uri is used', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_sample_files',
            arguments: {
                product: 'mrz',
                resource_uri: 'sample://mrz/server/python/3.4.1000/mrz_scanner'
            }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ scope');
    assert(/reference|redirect/i.test(text), 'Should return reference links');
    assert(!text.includes('# Sample Files:'), 'Should not return backing sample files for unsupported MRZ server scope');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include server docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-python-samples'), 'Should include python server samples link');
});

await test('get_sample_files returns redirect links for unsupported MRZ server scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'get_sample_files',
            arguments: { product: 'mrz', edition: 'server', platform: 'python', sample_id: 'mrz_scanner' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MRZ/i.test(text), 'Should identify the MRZ scope');
    assert(/reference|redirect/i.test(text), 'Should return reference links');
    assert(!text.includes('# Sample Files:'), 'Should not return backing sample files for unsupported MRZ server scope');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include server docs link');
});

await test('list_samples returns platform-aware redirect links for unsupported MDS server scope', async () => {
    const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'list_samples',
            arguments: { product: 'mds', edition: 'server', platform: 'nodejs' }
        }
    });

    assert(response.result, 'Should have result');
    const text = response.result.content[0].text;
    assert(/MDS/i.test(text), 'Should identify the MDS scope');
    assert(/reference|redirect/i.test(text), 'Should return reference links');
    assert(!text.includes('JSON:'), 'Should not return sample JSON for unsupported MDS server scope');
    assert(text.includes('https://www.dynamsoft.com/capture-vision/docs/server/'), 'Should include server docs link');
    assert(text.includes('https://github.com/Dynamsoft/capture-vision-nodejs-samples'), 'Should include nodejs server samples link');
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
