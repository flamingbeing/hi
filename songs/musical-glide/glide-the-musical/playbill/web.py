"""Build the web (Artifact) edition of the GLIDE: The Musical showbill -> web/index.html"""
import glob, html, json, os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SHOW = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'web')
C = json.load(open(os.path.join(HERE, 'content.json')))
os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
for f in glob.glob(os.path.join(HERE, 'assets', '*.svg')):
    shutil.copy(f, os.path.join(OUT, 'assets'))

VOICE = {'[Female Vocal]': 'F', '[Male Vocal]': 'M', '[Duet]': 'D', '[Choir]': 'C'}
SKIP = {'[End]', '[Stop]', '[Instrumental]'}
SEC = re.compile(r'^(Intro|Verse|Pre-Chorus|Chorus|Post-Chorus|Bridge|Hook|Outro|Interlude|Break|Build|Final|Refrain|Coda|Tag|Patter|Response|Reprise|Spoken|Breakdown|Drop|Call|Answer|Chant|Key Change|Cameo|Release|Round)', re.I)
e = lambda s: html.escape(s or '')
paras = lambda t: ''.join(f'<p>{e(p.strip())}</p>' for p in re.split(r'\n+', t) if p.strip())

def lyrics(song):
    f = glob.glob(os.path.join(SHOW, f"{song['n']:02d}-*-lyrics.txt"))[0]
    names = {'F': song.get('female_voice_is') or 'Female voice', 'M': song.get('male_voice_is') or 'Male voice', 'C': 'Company'}
    names['D'] = f"{names['F']} & {names['M']}"
    out, sec, who, buf = [], None, '', []
    def flush():
        if buf:
            cls = {'Company': 'c'}.get(who, '')
            out.append(f'<div class="stanza {cls}"><div class="sec">{e(sec or "")}{" · <b>" + e(who) + "</b>" if who else ""}</div><p>{"<br>".join(e(l) for l in buf)}</p></div>')
    for raw in open(f).read().splitlines():
        l = raw.strip()
        if not l: continue
        if l.startswith('[') and l.endswith(']'):
            if l in VOICE: who = names[VOICE[l]]; continue
            if l in SKIP: continue
            if SEC.match(l[1:-1]):
                flush(); buf = []; sec = re.sub(r'\s+\d+$', '', l[1:-1]); who = ''
            continue
        buf.append(l)
    flush()
    return ''.join(out)

cast = ''.join(f'''<article class="member"><img src="assets/{e(c["art"])}" alt="Illustration of {e(c["name"])}" loading="lazy"><div class="mb"><h3>{e(c["name"])}</h3><div class="role">{e(c["role"])}</div><p>{e(c["bio"])}</p></div></article>''' for c in C['cast'])

songs = ''
for s in C['songs']:
    songs += f'''<details class="song" id="song-{s["n"]}"{" open" if s["n"]==1 else ""}>
<summary><span class="no">{s["n"]}</span><span class="st"><span class="title">{e(s["title"])}</span><span class="by">{e(s["sung_by"])}</span></span><span class="chev" aria-hidden="true"></span></summary>
<div class="songbody"><div class="notes"><p><b>The scene</b> {e(s["scene"])}</p><p><b>Listen for</b> {e(s["listen_for"])}</p></div><div class="lyrics">{lyrics(s)}</div></div></details>'''
    if s['n'] == 6:
        songs += '<div class="interval">Interval · <span>please elevate your hand above your heart</span></div>'

motifs = ''.join(f'<li><q>{e(m["line"])}</q><span>{e(m["note"])}</span></li>' for m in C['motifs'])
tips = ''.join(f'<li>{e(t)}</li>' for t in C['therapist_tips'])
gloss = ''.join(f'<div class="g"><dt>{e(g["term"])}</dt><dd>{e(g["def"])}</dd></div>' for g in C['glossary'])
credits = ''.join(f'<li>{e(c)}</li>' for c in C['credits'][1:])

page = f'''<title>GLIDE: The Musical</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@500;600&display=swap">
<style>
/* Layout: a theatre at night. Dark plum house, a gold-lit programme column, the stage (cover) up front. Single deliberate dark look. */
:root {{
  color-scheme: dark;
  --house: #1d1220; --stage: #2e1a33; --velvet: #5b1a2b; --gold: #d4a84b; --gold-dim: #a9864a;
  --paper: #f3e9d8; --ink: #efe4d2; --muted: #b9a7a4; --line: rgba(212,168,75,.28); --crimson: #e0525a; --teal: #4fc0b0;
  --display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --body: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
}}
* {{ box-sizing: border-box; }}
body {{ background: var(--house); color: var(--ink); font-family: var(--body); font-size: 19px; line-height: 1.5; padding-inline: 16px; padding-block: 0 48px; }}
h1, h2, h3 {{ font-family: var(--display); text-wrap: balance; margin: 0; }}
a {{ color: var(--gold); }}
:focus-visible {{ outline: 2px solid var(--gold); outline-offset: 3px; }}
.wrap {{ max-width: 860px; margin: 0 auto; }}
.kicker {{ font-family: var(--ui); font-size: 12px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); }}

/* cover */
.cover {{ position: relative; margin: 0 -16px; overflow: hidden; background: var(--stage); }}
.cover img {{ width: 100%; max-height: 92vh; object-fit: cover; object-position: center bottom; display: block; }}
.cover .t {{ position: absolute; inset: 7% 0 auto; text-align: center; padding-inline: 16px; }}
.cover h1 {{ font-size: clamp(64px, 16vw, 150px); font-weight: 900; letter-spacing: .12em; color: var(--gold); line-height: 1; text-shadow: 0 4px 24px rgba(0,0,0,.6); }}
.cover .sub {{ font-family: var(--display); font-style: italic; font-size: clamp(22px, 4vw, 34px); color: var(--paper); text-shadow: 0 2px 10px rgba(0,0,0,.7); }}
.cover .tag {{ font-family: var(--ui); font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: var(--paper); opacity: .9; margin-top: 12px; text-shadow: 0 1px 6px rgba(0,0,0,.9); }}

nav {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: rgba(29,18,32,.94); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); margin: 0 -16px; padding: 10px 16px; }}
nav ul {{ list-style: none; display: flex; gap: 6px 18px; flex-wrap: wrap; justify-content: center; margin: 0; padding: 0; }}
nav a {{ font-family: var(--ui); font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; text-decoration: none; color: var(--muted); }}
nav a:hover {{ color: var(--gold); }}

section {{ padding-block: 56px 8px; scroll-margin-top: 56px; }}
section > h2 {{ font-size: clamp(30px, 5vw, 44px); color: var(--paper); margin: 6px 0 20px; }}
.lede {{ font-size: 21px; }}
.two {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 28px; }}
.two > * {{ min-width: 0; }}
h4 {{ font-family: var(--ui); font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); margin: 0 0 8px; }}
.note {{ border-left: 2px solid var(--gold); padding-left: 18px; font-style: italic; }}
.credits {{ list-style: none; padding: 0; margin: 24px 0 0; font-family: var(--ui); font-size: 13px; color: var(--muted); display: grid; gap: 4px; }}

.members {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; }}
.member {{ background: var(--stage); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }}
.member img {{ width: 100%; aspect-ratio: 5/4; object-fit: cover; display: block; }}
.member .mb {{ padding: 14px 16px 18px; }}
.member h3 {{ font-size: 22px; color: var(--paper); }}
.role {{ font-family: var(--ui); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); margin: 4px 0 8px; }}
.member p {{ margin: 0; font-size: 17px; }}

.figure {{ background: var(--paper); border-radius: 10px; padding: 10px; overflow-x: auto; }}
.figure img {{ display: block; min-width: 640px; width: 100%; }}
.cap {{ color: var(--muted); font-style: italic; font-size: 16px; margin-top: 10px; }}
.motifs {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }}
.motifs q {{ display: block; font-family: var(--display); font-style: italic; color: var(--paper); font-size: 18px; quotes: '\\201C' '\\201D'; }}
.motifs span {{ color: var(--muted); font-size: 16px; }}
.tips {{ margin: 0; padding-left: 20px; display: grid; gap: 8px; }}
.box {{ background: var(--stage); border-radius: 10px; padding: 18px 20px; border-top: 3px solid var(--velvet); }}
.box.teal {{ border-top-color: var(--teal); }}

.act {{ font-family: var(--ui); font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin: 26px 0 10px; }}
.song {{ border-top: 1px solid var(--line); }}
.song:last-of-type {{ border-bottom: 1px solid var(--line); }}
.song summary {{ list-style: none; cursor: pointer; display: flex; gap: 16px; align-items: center; padding: 16px 4px; }}
.song summary::-webkit-details-marker {{ display: none; }}
.no {{ font-family: var(--display); font-weight: 900; font-size: 30px; color: var(--gold); width: 1.4em; text-align: right; font-variant-numeric: tabular-nums; }}
.st {{ flex: 1; min-width: 0; display: flex; flex-direction: column; }}
.title {{ font-family: var(--display); font-weight: 700; font-size: 23px; color: var(--paper); }}
.by {{ font-style: italic; color: var(--muted); font-size: 16px; }}
.chev {{ width: 10px; height: 10px; border-right: 2px solid var(--gold); border-bottom: 2px solid var(--gold); transform: rotate(45deg); transition: transform .2s; flex: none; margin-right: 6px; }}
.song[open] .chev {{ transform: rotate(-135deg); }}
.songbody {{ padding: 0 4px 28px; }}
.notes {{ background: var(--stage); border-radius: 8px; padding: 12px 16px; font-size: 17px; margin-bottom: 18px; }}
.notes p {{ margin: 0 0 6px; }}
.notes b {{ font-family: var(--ui); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); margin-right: 6px; }}
.lyrics {{ columns: 2 300px; column-gap: 36px; }}
.stanza {{ break-inside: avoid; margin-bottom: 16px; }}
.stanza p {{ margin: 0; font-size: 18px; line-height: 1.4; }}
.stanza.c p {{ font-style: italic; color: #dccfba; }}
.sec {{ font-family: var(--ui); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-dim); margin-bottom: 2px; }}
.sec b {{ color: var(--gold); }}
.interval {{ text-align: center; font-family: var(--display); font-style: italic; color: var(--gold); padding: 22px 0; font-size: 22px; }}
.interval span {{ font-family: var(--body); color: var(--muted); font-size: 17px; }}

.gloss {{ columns: 2 280px; column-gap: 36px; margin: 0; }}
.g {{ break-inside: avoid; margin-bottom: 14px; }}
.g dt {{ font-family: var(--display); font-weight: 700; color: var(--paper); }}
.g dd {{ margin: 0; font-size: 17px; }}
footer {{ text-align: center; padding-top: 60px; }}
footer .line {{ font-family: var(--display); font-style: italic; font-size: clamp(28px, 6vw, 44px); color: var(--paper); }}
footer img {{ max-width: 520px; width: 100%; margin: 28px auto 0; border-radius: 10px; display: block; }}
@media (prefers-reduced-motion: reduce) {{ .chev {{ transition: none; }} }}
@media (max-width: 480px) {{ body {{ font-size: 18px; }} .no {{ font-size: 24px; }} .title {{ font-size: 20px; }} }}
</style>

<header class="cover">
  <img src="assets/cover.svg" alt="A raised left hand on a theatre stage, a glowing tendon running up the ring finger, joined by golden stitches">
  <div class="t"><h1>GLIDE</h1><div class="sub">The Musical</div><div class="tag">{e(C["tagline"])}</div></div>
</header>
<nav aria-label="Programme"><ul><li><a href="#story">Story</a></li><li><a href="#cast">Cast</a></li><li><a href="#map">Map</a></li><li><a href="#songs">Songs</a></li><li><a href="#glossary">Glossary</a></li></ul></nav>

<main class="wrap">
<section id="story">
  <div class="kicker">Left Hand Theatre presents · A fairytale in twelve weeks</div>
  <h2>The Story</h2>
  <div class="two">
    <div><h4>Act One</h4>{paras(C["synopsis_act1"])}</div>
    <div><h4>Act Two</h4>{paras(C["synopsis_act2"])}</div>
  </div>
  <h4 style="margin-top:28px">Twelve weeks in the left hand of Doctor Mae</h4>
  <div class="figure"><img src="assets/timeline.svg" alt="Timeline from Day 0, the bagel, to Week 12, a full fist"></div>
  <h4 style="margin-top:36px">A note from the surgeon</h4>
  <div class="note">{paras(C["note_from_the_surgeon"])}</div>
  <ul class="credits">{credits}</ul>
</section>

<section id="cast">
  <div class="kicker">Who&rsquo;s who in the kingdom</div>
  <h2>The Cast</h2>
  <div class="members">{cast}</div>
</section>

<section id="map">
  <div class="kicker">Map of the kingdom</div>
  <h2>Where It All Happens</h2>
  <div class="figure"><img src="assets/anatomy.svg" alt="Labelled side view of the ring finger: pulleys A1 to A5, FDS and FDP tendons, lumbrical, and Zone II marked No Man's Land"></div>
  <p class="cap">The ring finger of Doctor Mae&rsquo;s left hand, side view. Zone II, from the start of the tunnel to Big Sister&rsquo;s anchor, is the No Man&rsquo;s Land of old Doctor Bunnell&rsquo;s map, and Scarlett&rsquo;s favourite haunt.</p>
  <div class="two" style="margin-top:26px">
    <div class="box"><h4>Recurring themes</h4><ul class="motifs">{motifs}</ul></div>
    <div class="box teal"><h4>From Thea&rsquo;s clinic</h4><ul class="tips">{tips}</ul></div>
  </div>
</section>

<section id="songs">
  <div class="kicker">The complete lyrics</div>
  <h2>Musical Numbers</h2>
  <div class="act">Act One</div>
  {songs.replace('<div class="interval">', '<div class="interval">', 1).replace('</div><details class="song" id="song-7"', '</div><div class="act">Act Two</div><details class="song" id="song-7"')}
</section>

<section id="glossary">
  <div class="kicker">For family members seated near surgeons</div>
  <h2>Glossary</h2>
  <dl class="gloss">{gloss}</dl>
</section>

<footer>
  <img src="assets/humans.svg" alt="Mae, Wren and Dr Teo at a frosty school gate">
  <p class="line">Make a fist for me.<br>Now open.</p>
</footer>
</main>
'''
open(os.path.join(OUT, 'index.html'), 'w').write(page)
print('ok', len(page))
