// Which folder of this repo each address serves (HOSTING.md). Pure functions, no Cloudflare APIs, so
// worker/test/routes.test.mjs can check them in Node. worker/sites.js is the Worker that uses them.
//
// An app that saves data or signs people in gets its own subdomain, so one app can never read another's offline
// data or sign-in (browsers keep those per address). A host in SITES serves only the folders listed for it.
// Any other host (the PR previews on workers.dev) serves the whole repo as it is.

// host -> { root: 'pantry/' }                       one app at the root (its own folder name works too)
//      or { root: 'pantry/', also: { '/__/auth/': '__/auth/' } }   plus extra paths mapped to other folders
//      or { prefixes: { '/a/': 'a/', '/b/': 'b/' } } several static pages sharing a host
export const SITES = {
  // the family home design system's own guide pages (static, no data)
  // /v1/ is the same kit for apps in other repos (repo split, 21 Oct 2026); a breaking kit change goes in /v2/
  'design.flamingbeing.com': { root: 'homedesign/', also: { '/v1/': 'homedesign/' } },
  // pantry.flamingbeing.com moved to its own repo and Worker (flamingbeing/pantry, 22 Oct 2026)
  // kakihome.flamingbeing.com moved to its own repo and Worker (flamingbeing/kakihome, 22 Oct 2026)
};

// Shared by every host as it is: the design system (styles, icons and the app kit script; no data), so an app links
// /homedesign/tokens.css. The only folders shared between subdomains.
export const SHARED = ['/homedesign/'];

// The kit's files may be read by pages on any host (Access-Control-Allow-Origin: *), for those files only.
export const kitCors = file => String(file || '').startsWith('homedesign/');

// On any host not in SITES, /_sites/<host>/<path> serves <path> as that host would, so the mapping can be tried on a
// PR preview before the real address exists: <preview>/_sites/pantry.flamingbeing.com/
const TRY = '/_sites/';

// -> { file } (a path inside the repo, or a folder ending in "/"), { redirect } (a public path), or { notFound: true }
export function resolve(host, pathname) {
  const out = route(host, pathname);
  // an encoded slash, dot or backslash, or a leftover ".." could point the lookup out of the folder: refuse
  return out.file != null && /%2e|%2f|%5c|\\|(^|\/)\.\.?(\/|$)/i.test(out.file) ? { notFound: true } : out;
}

function route(host, pathname) {
  host = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  let site = SITES[host], p = pathname;
  if (!site && p.startsWith(TRY)) {
    const rest = p.slice(TRY.length), slash = rest.indexOf('/');
    const h = (slash < 0 ? rest : rest.slice(0, slash)).toLowerCase();
    if (SITES[h]) {
      if (slash < 0) return { redirect: `${TRY}${h}/` };
      const out = route(h, rest.slice(slash));
      return out.redirect ? { redirect: `${TRY}${h}${out.redirect}` } : out;
    }
  }
  if (!site) return { file: p.replace(/^\//, '') };
  for (const dir of SHARED) {
    if (p === dir.slice(0, -1)) return { redirect: dir };
    if (p.startsWith(dir)) return { file: p.slice(1) };
  }
  const map = { ...(site.prefixes || {}), ...(site.also || {}) };
  for (const [prefix, folder] of Object.entries(map)) {
    if (p === prefix.slice(0, -1)) return { redirect: prefix };
    if (p.startsWith(prefix)) return { file: folder + p.slice(prefix.length) };
  }
  if (site.root) {
    const own = '/' + site.root;
    if (p === own.slice(0, -1)) return { redirect: own };
    if (p.startsWith(own)) return { file: site.root + p.slice(own.length) };
    return { file: site.root + p.replace(/^\//, '') };
  }
  return { notFound: true };
}
