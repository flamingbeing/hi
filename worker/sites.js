// The Cloudflare Worker behind *.flamingbeing.com home apps and the PR previews (HOSTING.md). It serves the repo's
// files (static assets, bound as ASSETS) and decides which folder an address may see (routes.js). No data, no secrets.
import { resolve } from './routes.js';

const NOINDEX = 'noindex, nofollow';

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const url = new URL(request.url);
    const r = resolve(url.hostname, url.pathname);
    if (r.redirect) return redirect(url, r.redirect);
    if (r.notFound) return notFound();
    let file = r.file;
    if (file === '' || file.endsWith('/')) file += 'index.html';
    let res = await asset(env, url, file);
    if (res.status === 404 && !/\.[^/]+$/.test(file)) {
      // a folder of that name: add the "/" (as GitHub Pages does)
      const dir = await asset(env, url, file + '/index.html');
      if (dir.status === 200) return redirect(url, url.pathname + '/');
      // Firebase's sign-in helper pages: /__/auth/handler is handler.html
      if (file.includes('__/auth/')) {
        const page = await asset(env, url, file + '.html');
        if (page.status === 200) res = page;
      }
    }
    if (res.status === 404) return notFound();
    res = new Response(res.body, res);
    res.headers.set('X-Robots-Tag', NOINDEX);
    // service workers must always be checked fresh, or phones keep an old app for a day
    if (/(^|\/)sw\.js$/.test(file)) res.headers.set('Cache-Control', 'no-cache');
    return res;
  },
};

const asset = (env, url, file) => env.ASSETS.fetch(new Request(new URL('/' + file, url), { method: 'GET' }));
const redirect = (url, path) => Response.redirect(new URL(path + url.search, url).toString(), 301);
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX } });
