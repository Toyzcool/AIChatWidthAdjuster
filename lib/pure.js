// Pure utility functions shared between the content script and unit tests.
//
// This file MUST stay free of DOM, chrome.*, and any browser-only globals so
// that Node's test runner can `require()` it directly. content.js loads this
// first via the manifest's content_scripts[].js array; it exposes the
// helpers on `globalThis.AIToolboxPure`.

(function (root, factory) {
    const lib = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = lib;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.AIToolboxPure = lib;
    } else if (typeof window !== 'undefined') {
        window.AIToolboxPure = lib;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // djb2 — fast non-cryptographic hash. Used to detect "is this the same
    // message content" across DOM re-renders. Collisions are harmless because
    // they only cause a scroll to the wrong message, and an index is also
    // carried as a primary key.
    function hashText(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        return String(h);
    }

    // Parse a CSS color value (rgb/rgba) and return Rec. 601 luma in [0, 1].
    // Returns null for unrecognized or fully-transparent colors so the caller
    // can fall through to other heuristics.
    function bgLuminance(str) {
        if (!str) return null;
        const m = str.match(/rgba?\(([^)]+)\)/i);
        if (!m) return null;
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        const [r, g, b, a = 1] = parts;
        if (!Number.isFinite(r) || a === 0) return null;
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    // Per-site URL → conversation id extractors. Pulled out of the site
    // adapters so we can unit-test the regex behavior without bringing in
    // the rest of the bookmark engine.
    const conversationIdExtractors = {
        chatgpt(pathname) {
            const m = pathname.match(/\/c\/([0-9a-f-]+)/i);
            return m ? m[1] : null;
        },
        claude(pathname) {
            const m = pathname.match(/\/chat\/([0-9a-f-]+)/i);
            return m ? m[1] : null;
        },
        gemini(pathname) {
            const m = pathname.match(/\/app\/([^/?#]+)/i);
            return m ? m[1] : null;
        },
    };

    // Whitespace-flexible substring match. The bookmark store normalizes
    // whitespace at save time (\s+ → ' '), but Gemini's DOM preserves \n\t
    // between block elements; an exact indexOf would miss in that case. This
    // returns the index + matched length in `haystack`, or { index: -1 } if
    // no match.
    function findFlexibleMatch(haystack, needle) {
        if (!needle) return { index: -1, length: 0 };
        const lowerHay = haystack.toLowerCase();
        const lowerNeedle = needle.toLowerCase();
        const exact = lowerHay.indexOf(lowerNeedle);
        if (exact !== -1) return { index: exact, length: needle.length };

        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const loose = escaped.replace(/\s+/g, '\\s+');
        const re = new RegExp(loose, 'i');
        const match = haystack.match(re);
        if (!match) return { index: -1, length: 0 };
        return { index: match.index, length: match[0].length };
    }

    // ----- History search ------------------------------------------------
    //
    // Score a conversation index entry against a query. Combines a strong
    // title-hit signal (the most likely thing users remember) with weaker
    // body-hit weighting and gentle recency decay so newer conversations
    // win ties. Returns 0 when nothing matches so callers can filter.
    //
    // Item shape: { id, title, allText?, updatedAt }
    //   - title is always present (scraped from the conversation list)
    //   - allText may be empty if the user hasn't opened that chat yet
    //     (we only index full text on visit) — title-only matches still
    //     score, just much lower
    //   - updatedAt is a Unix ms timestamp
    function scoreItem(item, normalizedQuery, now) {
        if (!normalizedQuery) return 0;
        const title = (item.title || '').toLowerCase();
        const body = (item.allText || '').toLowerCase();
        let score = 0;

        if (title.includes(normalizedQuery)) {
            score += 10;
            if (title.startsWith(normalizedQuery)) score += 5;
        }
        if (body) {
            // Count up to 5 body occurrences — diminishing returns past
            // that, and avoids letting a giant transcript dominate ranking.
            let bodyHits = 0;
            let from = 0;
            while (bodyHits < 5) {
                const idx = body.indexOf(normalizedQuery, from);
                if (idx === -1) break;
                bodyHits++;
                from = idx + normalizedQuery.length;
            }
            score += bodyHits;
        }

        if (score === 0) return 0;

        // Recency decay: half-life of 14 days. Caps at the score a body
        // match would add, so recency never overwhelms a clear text hit.
        const ageDays = Math.max(0, (now - (item.updatedAt || 0)) / 86400000);
        const recencyBoost = Math.min(2, 2 / Math.pow(2, ageDays / 14));
        return score + recencyBoost;
    }

    // Build a short context snippet around the first body match, e.g.
    // "...the standout feature was Postgres replication..." — used by the
    // search UI to show why a result ranked. Falls back to the title-only
    // case (return null so caller decides; usually shows the title alone).
    function buildSnippet(allText, normalizedQuery, contextChars = 60) {
        if (!allText || !normalizedQuery) return null;
        const lower = allText.toLowerCase();
        const idx = lower.indexOf(normalizedQuery);
        if (idx === -1) return null;
        const start = Math.max(0, idx - contextChars);
        const end = Math.min(allText.length, idx + normalizedQuery.length + contextChars);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < allText.length ? '…' : '';
        // Collapse whitespace so multi-line transcripts don't render with
        // weird gaps in the snippet.
        const slice = allText.slice(start, end).replace(/\s+/g, ' ').trim();
        return `${prefix}${slice}${suffix}`;
    }

    // Run a search across an array of indexed items. Returns the top N
    // matches sorted by score then recency, each annotated with the
    // computed score and a snippet.
    function searchIndex(items, query, options = {}) {
        const limit = options.limit ?? 10;
        const now = options.now ?? Date.now();
        const normalizedQuery = (query || '').toLowerCase().trim();
        if (!normalizedQuery) return [];

        const scored = [];
        for (const item of items) {
            const score = scoreItem(item, normalizedQuery, now);
            if (score === 0) continue;
            scored.push({
                ...item,
                score,
                snippet: buildSnippet(item.allText, normalizedQuery),
            });
        }
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return scored.slice(0, limit);
    }

    return {
        hashText,
        bgLuminance,
        conversationIdExtractors,
        findFlexibleMatch,
        scoreItem,
        buildSnippet,
        searchIndex,
    };
});
