const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { scoreItem, buildSnippet, searchIndex } = require(
    path.resolve(__dirname, '..', 'lib', 'pure.js')
);

const NOW = Date.UTC(2026, 3, 22); // fixed reference time for deterministic recency

const item = (overrides = {}) => ({
    id: 'c-1',
    title: 'Untitled',
    allText: '',
    updatedAt: NOW - 86400000, // 1 day old
    ...overrides,
});

// ----- scoreItem -----------------------------------------------------------

test('scoreItem: empty query → zero', () => {
    assert.equal(scoreItem(item({ title: 'foo' }), '', NOW), 0);
});

test('scoreItem: title-contains scores higher than body-only', () => {
    const titleHit = item({ title: 'Database selection notes', allText: '' });
    const bodyHit = item({ title: 'Random', allText: 'we discussed database selection' });
    assert.ok(scoreItem(titleHit, 'database', NOW) > scoreItem(bodyHit, 'database', NOW));
});

test('scoreItem: title-starts-with gets bonus over title-contains', () => {
    const starts = item({ title: 'Postgres setup', allText: '' });
    const contains = item({ title: 'Notes on Postgres setup', allText: '' });
    assert.ok(scoreItem(starts, 'postgres', NOW) > scoreItem(contains, 'postgres', NOW));
});

test('scoreItem: multiple body hits accumulate (capped at 5)', () => {
    const oneHit = item({ allText: 'foo' });
    const fiveHits = item({ allText: 'foo foo foo foo foo' });
    const tenHits = item({ allText: 'foo '.repeat(10) });
    const s1 = scoreItem(oneHit, 'foo', NOW);
    const s5 = scoreItem(fiveHits, 'foo', NOW);
    const s10 = scoreItem(tenHits, 'foo', NOW);
    assert.ok(s5 > s1, 'five hits beats one');
    assert.equal(s5, s10, 'tenth hit gives no extra score');
});

test('scoreItem: lowercase title compared against already-normalized query', () => {
    // scoreItem's contract: caller passes a pre-normalized (lowercase) query.
    // searchIndex handles normalization end-to-end; the case-insensitivity
    // of the public API is verified separately below.
    const a = item({ title: 'PostgreSQL Vs MySQL' });
    assert.ok(scoreItem(a, 'postgresql', NOW) > 0);
});

test('searchIndex: case-insensitive (public API contract)', () => {
    const items = [item({ id: 'a', title: 'PostgreSQL Vs MySQL' })];
    assert.equal(searchIndex(items, 'POSTGRESQL', { now: NOW }).length, 1);
    assert.equal(searchIndex(items, 'postgresql', { now: NOW }).length, 1);
    assert.equal(searchIndex(items, 'PostgreSQL', { now: NOW }).length, 1);
});

test('scoreItem: no match returns 0', () => {
    const a = item({ title: 'Something else', allText: 'completely unrelated content' });
    assert.equal(scoreItem(a, 'database', NOW), 0);
});

test('scoreItem: recency boost shifts ranking', () => {
    const old = item({ title: 'Database notes', updatedAt: NOW - 60 * 86400000 }); // 60 days
    const fresh = item({ title: 'Database notes', updatedAt: NOW - 86400000 }); // 1 day
    assert.ok(scoreItem(fresh, 'database', NOW) > scoreItem(old, 'database', NOW));
});

test('scoreItem: recency cap — never overwhelms a real body match', () => {
    const ancient = item({ title: 'X', updatedAt: 0 });
    const recentNoMatch = item({ title: 'Y', allText: '', updatedAt: NOW });
    // ancient title hit should still beat recent no-match
    assert.ok(scoreItem(ancient, 'x', NOW) > 0);
    assert.equal(scoreItem(recentNoMatch, 'x', NOW), 0);
});

// ----- buildSnippet --------------------------------------------------------

test('buildSnippet: returns context around first match', () => {
    // Long enough that the snippet must be a strict subset of full text.
    const text = 'a'.repeat(200) + ' the database choice is critical ' + 'b'.repeat(200);
    const snippet = buildSnippet(text, 'database');
    assert.ok(snippet.includes('database'));
    assert.ok(snippet.length < text.length, 'snippet should be shorter than full text');
});

test('buildSnippet: prefix ellipsis when not at start', () => {
    const text = 'a'.repeat(200) + ' database is here';
    const snippet = buildSnippet(text, 'database');
    assert.ok(snippet.startsWith('…'));
});

test('buildSnippet: no match returns null', () => {
    assert.equal(buildSnippet('hello world', 'foo'), null);
});

test('buildSnippet: empty text returns null', () => {
    assert.equal(buildSnippet('', 'anything'), null);
    assert.equal(buildSnippet(null, 'anything'), null);
});

test('buildSnippet: collapses internal whitespace', () => {
    const text = 'the    database\n\n\tis here';
    const snippet = buildSnippet(text, 'database');
    assert.ok(!snippet.includes('\n'));
    assert.ok(!/\s{2,}/.test(snippet), 'no runs of multiple spaces');
});

// ----- searchIndex --------------------------------------------------------

test('searchIndex: empty query returns []', () => {
    const items = [item({ title: 'foo' })];
    assert.deepEqual(searchIndex(items, ''), []);
    assert.deepEqual(searchIndex(items, '   '), []);
});

test('searchIndex: filters out non-matches', () => {
    const items = [
        item({ id: 'a', title: 'database notes' }),
        item({ id: 'b', title: 'cooking recipes' }),
    ];
    const results = searchIndex(items, 'database', { now: NOW });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'a');
});

test('searchIndex: sorts by score desc then updatedAt desc', () => {
    const items = [
        item({ id: 'old-strong', title: 'database', updatedAt: NOW - 30 * 86400000 }),
        item({ id: 'new-weak', title: 'X', allText: 'database', updatedAt: NOW }),
        item({ id: 'new-strong', title: 'Database setup', updatedAt: NOW }),
    ];
    const results = searchIndex(items, 'database', { now: NOW });
    assert.equal(results[0].id, 'new-strong', 'strongest + newest first');
    assert.equal(results[results.length - 1].id, 'new-weak', 'weakest last');
});

test('searchIndex: respects limit', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
        item({ id: `c-${i}`, title: `result ${i}` })
    );
    const results = searchIndex(items, 'result', { limit: 5, now: NOW });
    assert.equal(results.length, 5);
});

test('searchIndex: results carry score and snippet', () => {
    const items = [item({ id: 'a', title: 'X', allText: 'long text where database appears once' })];
    const results = searchIndex(items, 'database', { now: NOW });
    assert.equal(results.length, 1);
    assert.ok(results[0].score > 0);
    assert.ok(results[0].snippet && results[0].snippet.includes('database'));
});

test('searchIndex: title-only result still surfaces (no allText)', () => {
    const items = [item({ id: 'a', title: 'database setup', allText: '' })];
    const results = searchIndex(items, 'database', { now: NOW });
    assert.equal(results.length, 1);
    assert.equal(results[0].snippet, null, 'no body snippet when no body');
});
