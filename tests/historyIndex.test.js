const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { mergeHistoryEntries, trimHistoryEntries } = require(
    path.resolve(__dirname, '..', 'lib', 'pure.js')
);

const NOW = Date.UTC(2026, 3, 22);

test('mergeHistoryEntries: appends new ids', () => {
    const existing = [{ id: 'a', title: 'old', allText: '', updatedAt: NOW }];
    const incoming = [{ id: 'b', title: 'new', allText: '', updatedAt: NOW }];
    const merged = mergeHistoryEntries(existing, incoming);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map(m => m.id).sort(), ['a', 'b']);
});

test('mergeHistoryEntries: updates title for existing id', () => {
    const existing = [{ id: 'a', title: 'New Chat', allText: '', updatedAt: NOW - 100 }];
    const incoming = [{ id: 'a', title: 'Database notes', updatedAt: NOW }];
    const merged = mergeHistoryEntries(existing, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, 'Database notes');
});

test('mergeHistoryEntries: preserves allText when incoming has no body', () => {
    // The list-only scrape produces entries with title only; it must not
    // overwrite the full text captured by an earlier visit-time scrape.
    const existing = [{
        id: 'a', title: 'old title', allText: 'long stored transcript',
        updatedAt: NOW - 100,
    }];
    const incoming = [{ id: 'a', title: 'updated title', updatedAt: NOW }];
    const merged = mergeHistoryEntries(existing, incoming);
    assert.equal(merged[0].allText, 'long stored transcript');
    assert.equal(merged[0].title, 'updated title');
});

test('mergeHistoryEntries: incoming allText replaces empty existing', () => {
    const existing = [{ id: 'a', title: 'x', allText: '', updatedAt: NOW - 100 }];
    const incoming = [{ id: 'a', title: 'x', allText: 'fresh body', updatedAt: NOW }];
    const merged = mergeHistoryEntries(existing, incoming);
    assert.equal(merged[0].allText, 'fresh body');
});

test('mergeHistoryEntries: incoming allText replaces existing allText', () => {
    // A re-scrape of an opened conversation should overwrite stale body
    // (e.g. the user added more messages since the last index).
    const existing = [{ id: 'a', title: 'x', allText: 'OLD', updatedAt: NOW - 100 }];
    const incoming = [{ id: 'a', title: 'x', allText: 'NEW', updatedAt: NOW }];
    const merged = mergeHistoryEntries(existing, incoming);
    assert.equal(merged[0].allText, 'NEW');
});

test('mergeHistoryEntries: updatedAt takes incoming when present', () => {
    const existing = [{ id: 'a', title: 'x', allText: '', updatedAt: 100 }];
    const incoming = [{ id: 'a', title: 'x', allText: '', updatedAt: 200 }];
    assert.equal(mergeHistoryEntries(existing, incoming)[0].updatedAt, 200);
});

test('mergeHistoryEntries: undefined inputs are safe', () => {
    assert.deepEqual(mergeHistoryEntries(undefined, undefined), []);
    assert.deepEqual(mergeHistoryEntries(null, null), []);
});

test('mergeHistoryEntries: skips items without id', () => {
    const merged = mergeHistoryEntries(
        [{ title: 'no id' }],
        [{ title: 'still no id' }]
    );
    assert.equal(merged.length, 0);
});

test('trimHistoryEntries: under the cap returns as-is (cloned)', () => {
    const arr = [
        { id: 'a', updatedAt: 1 },
        { id: 'b', updatedAt: 2 },
    ];
    const result = trimHistoryEntries(arr, 10);
    assert.equal(result.length, 2);
    assert.notEqual(result, arr, 'result should not be the same reference');
});

test('trimHistoryEntries: keeps the most recent N when over cap', () => {
    const arr = Array.from({ length: 6 }, (_, i) => ({
        id: `c-${i}`, updatedAt: i,
    }));
    const result = trimHistoryEntries(arr, 3);
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(r => r.id), ['c-5', 'c-4', 'c-3']);
});

test('trimHistoryEntries: handles missing updatedAt', () => {
    const arr = [{ id: 'a' }, { id: 'b', updatedAt: 100 }, { id: 'c' }];
    const result = trimHistoryEntries(arr, 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'b');
});

test('trimHistoryEntries: empty input', () => {
    assert.deepEqual(trimHistoryEntries([], 5), []);
    assert.deepEqual(trimHistoryEntries(null, 5), []);
});
