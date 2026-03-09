// netlify/functions/rss.js
// Server-side RSS proxy with in-memory cache
// Deployed automatically by Netlify — no config needed

const https = require('https');
const http = require('http');

// In-memory cache: { [url]: { data, timestamp } }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function fetchUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const getter = targetUrl.startsWith('https') ? https : http;
        const req = getter.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            }
        }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.on('error', reject);
    });
}

function parseRSS(xmlText) {
    // Simple regex-based parser (no external deps needed)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const block = match[1];

        const get = (tag) => {
            const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`));
            return m ? (m[1] || m[2] || '').trim() : '';
        };

        const getLinkAfterTag = () => {
            // Google News uses <link> as a text node after the tag (not standard)
            const m = block.match(/<link\s*\/?>(.*?)(?:<|$)/);
            if (m) return m[1].trim();
            const m2 = block.match(/<link>(.*?)<\/link>/);
            if (m2) return m2[1].trim();
            return '';
        };

        const title = get('title');
        const link = getLinkAfterTag() || get('guid');
        const pubDate = get('pubDate');
        const source = get('source');

        if (title && link) {
            items.push({ title, link, pubDate, source });
        }
    }

    return items;
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Tell browser to cache 5min too
    };

    const feedUrl = event.queryStringParameters?.url;
    if (!feedUrl) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url param' }) };
    }

    // Validate it's a Google News URL (security)
    if (!feedUrl.startsWith('https://news.google.com/rss')) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only Google News RSS feeds are allowed' }) };
    }

    // Serve from cache if fresh
    const cached = cache[feedUrl];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return {
            statusCode: 200,
            headers: { ...headers, 'X-Cache': 'HIT' },
            body: JSON.stringify({ items: cached.data, cached: true })
        };
    }

    try {
        const xmlText = await fetchUrl(feedUrl);
        const items = parseRSS(xmlText);

        // Save to cache
        cache[feedUrl] = { data: items, timestamp: Date.now() };

        return {
            statusCode: 200,
            headers: { ...headers, 'X-Cache': 'MISS' },
            body: JSON.stringify({ items, cached: false })
        };
    } catch (err) {
        console.error('RSS fetch error:', err.message);
        // Return stale cache if available
        if (cached) {
            return {
                statusCode: 200,
                headers: { ...headers, 'X-Cache': 'STALE' },
                body: JSON.stringify({ items: cached.data, cached: true, stale: true })
            };
        }
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch RSS feed', detail: err.message })
        };
    }
};
