const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const lib = require(path.resolve(__dirname, '..', 'lib', 'pure.js'));
const {
    hashText,
    bgLuminance,
    conversationIdExtractors,
    findFlexibleMatch,
} = lib;

test('hashText: stable across calls', () => {
    assert.equal(hashText('hello world'), hashText('hello world'));
});

test('hashText: returns a string', () => {
    assert.equal(typeof hashText('hi'), 'string');
});

test('hashText: empty string still hashes to a stable value', () => {
    const h = hashText('');
    assert.equal(typeof h, 'string');
    assert.equal(hashText(''), h);
});

test('hashText: different inputs produce different hashes (no trivial collision)', () => {
    assert.notEqual(hashText('alpha'), hashText('beta'));
    assert.notEqual(hashText('a'), hashText('aa'));
});

test('hashText: handles unicode without throwing', () => {
    assert.doesNotThrow(() => hashText('你好世界 🌍'));
    assert.notEqual(hashText('你好'), hashText('世界'));
});

test('bgLuminance: rgb(255,255,255) is bright (>0.9)', () => {
    assert.ok(bgLuminance('rgb(255, 255, 255)') > 0.9);
});

test('bgLuminance: rgb(0,0,0) is dark (<0.1)', () => {
    assert.ok(bgLuminance('rgb(0, 0, 0)') < 0.1);
});

test('bgLuminance: rgba with alpha=0 returns null', () => {
    assert.equal(bgLuminance('rgba(0, 0, 0, 0)'), null);
});

test('bgLuminance: unrecognized strings return null', () => {
    assert.equal(bgLuminance(''), null);
    assert.equal(bgLuminance('transparent'), null);
    assert.equal(bgLuminance('#ffffff'), null); // hex not supported
    assert.equal(bgLuminance(null), null);
});

test('bgLuminance: midtone gray sits near 0.5', () => {
    const lum = bgLuminance('rgb(128, 128, 128)');
    assert.ok(lum > 0.45 && lum < 0.55, `expected ~0.5, got ${lum}`);
});

test('conversationIdExtractors.chatgpt: standard /c/ uuid', () => {
    assert.equal(
        conversationIdExtractors.chatgpt('/c/abc123-def-456'),
        'abc123-def-456'
    );
});

test('conversationIdExtractors.chatgpt: custom GPT path /g/.../c/ still finds id', () => {
    assert.equal(
        conversationIdExtractors.chatgpt('/g/g-foo/c/abc123'),
        'abc123'
    );
});

test('conversationIdExtractors.chatgpt: no match returns null', () => {
    assert.equal(conversationIdExtractors.chatgpt('/'), null);
    assert.equal(conversationIdExtractors.chatgpt('/something/else'), null);
});

test('conversationIdExtractors.claude: /chat/ uuid', () => {
    assert.equal(
        conversationIdExtractors.claude('/chat/abc-123'),
        'abc-123'
    );
});

test('conversationIdExtractors.claude: /new returns null', () => {
    assert.equal(conversationIdExtractors.claude('/new'), null);
});

test('conversationIdExtractors.gemini: /app/{id}', () => {
    assert.equal(
        conversationIdExtractors.gemini('/app/abc123xyz'),
        'abc123xyz'
    );
});

test('conversationIdExtractors.gemini: /app (new draft) returns null', () => {
    assert.equal(conversationIdExtractors.gemini('/app'), null);
});

test('conversationIdExtractors.gemini: stops at query string', () => {
    assert.equal(
        conversationIdExtractors.gemini('/app/abc123?foo=bar'),
        'abc123'
    );
});

test('findFlexibleMatch: exact match wins fast path', () => {
    const r = findFlexibleMatch('hello world', 'world');
    assert.equal(r.index, 6);
    assert.equal(r.length, 5);
});

test('findFlexibleMatch: case-insensitive', () => {
    const r = findFlexibleMatch('HELLO World', 'hello');
    assert.equal(r.index, 0);
    assert.equal(r.length, 5);
});

test('findFlexibleMatch: whitespace-flexible fallback (newlines in haystack)', () => {
    // Bookmark stores "Heading text Body paragraph" with single spaces;
    // DOM reads "Heading text\n\tBody paragraph" with newlines + tabs.
    const haystack = 'Heading text\n\n\tBody paragraph';
    const needle = 'Heading text Body paragraph';
    const r = findFlexibleMatch(haystack, needle);
    assert.equal(r.index, 0);
    assert.ok(r.length > needle.length, 'matched length should include the wider whitespace');
});

test('findFlexibleMatch: no match returns -1', () => {
    const r = findFlexibleMatch('hello world', 'goodbye');
    assert.equal(r.index, -1);
    assert.equal(r.length, 0);
});

test('findFlexibleMatch: regex metacharacters in needle are escaped', () => {
    // A '.' in the needle should not match arbitrary characters.
    const r = findFlexibleMatch('helloX world', 'hello.');
    assert.equal(r.index, -1);
});

test('findFlexibleMatch: empty needle returns -1', () => {
    const r = findFlexibleMatch('hello', '');
    assert.equal(r.index, -1);
});
