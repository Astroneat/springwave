import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.get(key) || null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

globalThis.window = {
    localStorage: new MemoryStorage(),
    location: { href: '' },
};

const { setToken, getSigningKey, removeSigningKey } = await import('../../lib/session.js');
const { ensureSigningKey } = await import('../client.js');

test('ensureSigningKey restores a missing key from the authenticated session endpoint', async () => {
    setToken('session-token');
    removeSigningKey();

    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ signingKey: 'restored-signing-key' }), { status: 200 });
    };

    try {
        assert.equal(await ensureSigningKey(), 'restored-signing-key');
        assert.equal(getSigningKey(), 'restored-signing-key');
        assert.match(request.url, /\/auth\/session\/init$/);
        assert.equal(request.options.headers.Authorization, 'Bearer session-token');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
