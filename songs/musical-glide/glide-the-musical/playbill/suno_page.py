"""Build the Suno prompt sheet for GLIDE: The Musical -> suno/index.html"""
import glob, html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SHOW = os.path.dirname(HERE)
C = json.load(open(os.path.join(HERE, 'content.json')))
by_n = {s['n']: s for s in C['songs']}
tracks = []
for n in range(1, 11):
    lf = glob.glob(os.path.join(SHOW, f'{n:02d}-*-lyrics.txt'))[0]
    sf = lf.replace('-lyrics.txt', '-style.txt')
    s = by_n[n]
    tracks.append({'n': n, 'title': s['title'], 'act': s['act'], 'by': s['sung_by'],
                   'f': s.get('female_voice_is', ''), 'm': s.get('male_voice_is', ''),
                   'scene': s['scene'],
                   'style': open(sf).read().strip(), 'lyrics': open(lf).read().strip()})
data = json.dumps(tracks).replace('</', '<\\/')
e = html.escape

items = ''.join(
    f'<li><a href="#t{t["n"]}"><span class="n">{t["n"]}</span><span>{e(t["title"])}</span></a></li>'
    + ('<li class="sep">Act Two</li>' if t['n'] == 6 else '') for t in tracks)

page = '''<title>GLIDE Suno Prompts</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a session sheet. Track list on the left (top bar on phones), one card per track with the two Suno fields side by side as copyable slates. */
:root {
  --bg: #f7f3ee; --surface: #ffffff; --ink: #24161c; --muted: #6f5f65; --line: #e4d9cf;
  --accent: #7a1f35; --gold: #a87a2a; --ok: #2e7d5b; --warn: #b5541c; --slate: #fbf8f4;
  --display: 'Playfair Display', Georgia, serif;
  --ui: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #1b1418; --surface: #251b21; --ink: #f1e7e2; --muted: #b3a2a8; --line: #3b2d34;
  --accent: #e07b93; --gold: #d9ad5b; --ok: #6fcf9f; --warn: #f0a070; --slate: #1f171c; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #1b1418; --surface: #251b21; --ink: #f1e7e2; --muted: #b3a2a8; --line: #3b2d34;
  --accent: #e07b93; --gold: #d9ad5b; --ok: #6fcf9f; --warn: #f0a070; --slate: #1f171c; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: var(--ui); font-size: 15px; line-height: 1.5; padding-inline: 16px; padding-block: 0 48px; }
h1, h2 { font-family: var(--display); text-wrap: balance; margin: 0; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.page { max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 32px; }
header.top { grid-column: 1 / -1; padding-block: 28px 4px; display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: baseline; justify-content: space-between; }
header.top h1 { font-size: clamp(28px, 4vw, 40px); color: var(--accent); font-weight: 900; }
header.top p { margin: 0; color: var(--muted); max-width: 60ch; }
.eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
aside { position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; padding-top: 14px; }
aside ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
aside a { display: flex; gap: 10px; padding: 6px 8px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 14px; }
aside a:hover { background: var(--surface); }
aside .n { color: var(--gold); font-weight: 600; width: 1.4em; text-align: right; font-variant-numeric: tabular-nums; }
aside .sep, aside .head { font-size: 11px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); padding: 12px 8px 4px; }
.how { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-top: 14px; }
.how h2 { font-size: 20px; margin-bottom: 8px; }
.how ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: var(--ink); }
.how b { color: var(--accent); font-weight: 600; }
main { min-width: 0; display: grid; gap: 22px; }
.track { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px; scroll-margin-top: 16px; }
.th { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: baseline; }
.th .num { font-family: var(--display); font-weight: 900; font-size: 28px; color: var(--gold); font-variant-numeric: tabular-nums; }
.th h2 { font-size: 24px; flex: 1 1 260px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
.chip { font-size: 12px; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; color: var(--muted); }
.chip.f::before { content: '\\2640\\00a0'; color: var(--accent); }
.chip.m::before { content: '\\2642\\00a0'; color: var(--gold); }
.chip.vg { color: var(--ink); }
.scene { color: var(--muted); margin: 6px 0 14px; max-width: 75ch; }
.fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 16px; }
@media (max-width: 900px) { .fields { grid-template-columns: minmax(0, 1fr); } }
.field { min-width: 0; display: flex; flex-direction: column; }
.fh { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.fh .lbl { font-size: 11px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); flex: 1; }
.count { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--ok); }
.count.over { color: var(--warn); }
button.copy { font: 600 12px var(--ui); color: var(--surface); background: var(--accent); border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button.copy:hover { filter: brightness(1.1); }
button.copy.done { background: var(--ok); }
pre { margin: 0; font-family: var(--mono); font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; background: var(--slate); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow: auto; color: var(--ink); }
.field.style pre { max-height: none; }
.field.lyrics pre { max-height: 520px; }
pre .tag { color: var(--accent); }
pre .vt { color: var(--gold); font-weight: 500; }
@media (max-width: 760px) {
  .page { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  aside { position: static; }
  aside ol { display: flex; flex-wrap: wrap; gap: 4px; }
  aside .sep, aside .head { display: none; }
  aside a { background: var(--surface); border: 1px solid var(--line); padding: 4px 10px; font-size: 13px; }
}
</style>

<div class="page">
<header class="top">
  <div><div class="eyebrow">GLIDE: The Musical &middot; Suno v6</div><h1>Suno Prompts</h1></div>
  <p>Ten tracks in running order. Paste each Style into &ldquo;Style of Music&rdquo; and each Lyrics into &ldquo;Lyrics&rdquo; in Custom mode.</p>
</header>
<aside aria-label="Tracks"><ol><li class="head">Act One</li>''' + items + '''</ol></aside>
<main id="tracks">
  <section class="how">
    <h2>Before you generate</h2>
    <ul>
      <li>Leave <b>Vocal Gender unset</b> for every track. Each one has a female and a male lead, and setting it forces one voice.</li>
      <li>Every solo section is at least 4 lines and each track switches between male and female at most 4 times, so Suno can keep the voices apart.</li>
      <li>If one section comes out in the wrong voice, regenerate just that section with <b>Replace Section</b>.</li>
      <li>Once a take nails Prox, Tip or the King, save that voice as a <b>Persona</b> and reuse it on later tracks if your plan has Personas.</li>
      <li>Pulleys are spelled <b>Ay-one, Ay-two, Ay-four</b> on purpose so Suno doesn&rsquo;t sing &ldquo;ah one&rdquo;.</li>
    </ul>
  </section>
</main>
</div>

<script>
const TRACKS = ''' + data + ''';
const LIMITS = { style: 1000, lyrics: 5000 };
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const VOICE = /^\\[(Female Vocal|Male Vocal|Duet|Choir)\\]$/;
function markLyrics(t) {
  return t.split('\\n').map(l => {
    const x = esc(l);
    if (VOICE.test(l.trim())) return '<span class="vt">' + x + '</span>';
    if (/^\\[.*\\]$/.test(l.trim())) return '<span class="tag">' + x + '</span>';
    return x;
  }).join('\\n');
}
function field(kind, label, text, render) {
  const n = text.length, max = LIMITS[kind];
  return `<div class="field ${kind}"><div class="fh"><span class="lbl">${label}</span>
    <span class="count${n >= max ? ' over' : ''}">${n.toLocaleString()} / ${max.toLocaleString()}</span>
    <button class="copy" type="button" data-kind="${kind}">Copy</button></div>
    <pre tabindex="0">${render ? render(text) : esc(text)}</pre></div>`;
}
const main = document.getElementById('tracks');
TRACKS.forEach(t => {
  const el = document.createElement('article');
  el.className = 'track'; el.id = 't' + t.n;
  el.innerHTML = `<div class="th"><span class="num">${t.n}</span><h2>${esc(t.title)}</h2><span class="eyebrow">Act ${t.act === 1 ? 'One' : 'Two'}</span></div>
    <div class="meta">${t.f ? `<span class="chip f">${esc(t.f)}</span>` : ''}${t.m ? `<span class="chip m">${esc(t.m)}</span>` : ''}<span class="chip">Choir: the Company</span><span class="chip vg">Vocal Gender: unset</span></div>
    <p class="scene">${esc(t.scene)}</p>
    <div class="fields">${field('style', 'Style of Music', t.style)}${field('lyrics', 'Lyrics', t.lyrics, markLyrics)}</div>`;
  el.querySelectorAll('button.copy').forEach(b => b.addEventListener('click', async () => {
    const text = t[b.dataset.kind];
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; b.classList.add('done'); }
    catch (err) {
      const pre = b.closest('.field').querySelector('pre');
      const r = document.createRange(); r.selectNodeContents(pre);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      b.textContent = 'Selected, press Ctrl+C';
    }
    setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1800);
  }));
  main.appendChild(el);
});
</script>
'''
open(os.path.join(HERE, 'suno', 'index.html'), 'w').write(page)
print('ok', len(page), [len(t['lyrics']) for t in tracks])
