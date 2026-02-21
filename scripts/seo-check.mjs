import process from 'node:process';

const baseUrl = (process.env.SEO_CHECK_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchOrThrow(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not connect to ${url}. Start the Next.js server first. (${String(error)})`);
  }

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  return response.text();
}

const robots = await fetchOrThrow(`${baseUrl}/robots.txt`);
const sitemap = await fetchOrThrow(`${baseUrl}/sitemap.xml`);

assert(/Disallow:\s*\/dashboard/.test(robots), 'robots.txt must disallow /dashboard');
assert(/Disallow:\s*\/pay/.test(robots), 'robots.txt must disallow /pay');
assert(/Sitemap:\s*https?:\/\//.test(robots), 'robots.txt must include sitemap URL');

assert(sitemap.includes('/pricing'), 'sitemap.xml must include /pricing');
assert(sitemap.includes('/faq'), 'sitemap.xml must include /faq');
assert(sitemap.includes('/help'), 'sitemap.xml must include /help');
assert(sitemap.includes('/privacy'), 'sitemap.xml must include /privacy');
assert(!sitemap.includes('/dashboard'), 'sitemap.xml must not include /dashboard routes');
assert(!sitemap.includes('/pay/'), 'sitemap.xml must not include token pay routes');

console.log(`seo:check passed against ${baseUrl}`);
