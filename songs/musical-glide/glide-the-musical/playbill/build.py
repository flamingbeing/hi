"""Build the GLIDE: The Musical showbill (HTML) from content.json, the SVG assets and the song lyrics.

Usage: python3 build.py && node render.js
"""
import glob
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SHOW = os.path.dirname(HERE)
C = json.load(open(os.path.join(HERE, 'content.json')))

VOICE_TAGS = {'[Female Vocal]': 'F', '[Male Vocal]': 'M', '[Duet]': 'D', '[Choir]': 'C'}
SKIP_TAGS = {'[End]', '[Stop]', '[Instrumental]'}


def e(s):
    return html.escape(s or '')


def svg(name):
    p = os.path.join(HERE, 'assets', name)
    if not os.path.exists(p):
        return ''
    return f'<img src="assets/{name}" alt="">'


def paras(text):
    return ''.join(f'<p>{e(p.strip())}</p>' for p in re.split(r'\n\s*\n|\n', text) if p.strip())


def lyrics_html(song):
    f = glob.glob(os.path.join(SHOW, f"{song['n']:02d}-*-lyrics.txt"))[0]
    names = {
        'F': song.get('female_voice_is') or 'Female voice',
        'M': song.get('male_voice_is') or 'Male voice',
        'C': 'Company',
    }
    names['D'] = f"{names['F']} & {names['M']}"
    out, section, buf = [], None, []

    def flush():
        if buf or section:
            sec, who = section if section else ('', '')
            head = f'<div class="sec"><span class="secname">{e(sec)}</span>'
            if who:
                head += f' <span class="who">{e(who)}</span>'
            head += '</div>'
            body = '<br>'.join(e(l) for l in buf)
            out.append(f'<div class="stanza">{head}<div class="lines">{body}</div></div>')

    for raw in open(f).read().splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            if line in VOICE_TAGS:
                if section:
                    section = (section[0], names[VOICE_TAGS[line]])
                continue
            if line in SKIP_TAGS:
                continue
            name = line[1:-1]
            # delivery tags like [Soft], [Belted] are not section names
            if re.match(r'^(Intro|Verse|Pre-Chorus|Chorus|Post-Chorus|Bridge|Hook|Outro|Interlude|Break|Build|Final|Refrain|Coda|Tag|Patter|Response|Reprise|Spoken|Breakdown|Drop|Call|Answer|Chant|Key Change|Cameo|Release|Round)', name, re.I):
                flush()
                buf = []
                section = (re.sub(r'\s+\d+$', '', name), '')
            continue
        buf.append(line)
    flush()
    return '\n'.join(out)


cast_cards = []
for i, c in enumerate(C['cast']):
    art = svg(c.get('art', '')) if c.get('art') else ''
    cast_cards.append(f'''
<div class="castcard">
  <div class="portrait">{art}</div>
  <div class="castbody"><h3>{e(c["name"])}</h3><div class="role">{e(c["role"])}</div><p>{e(c["bio"])}</p></div>
</div>''')


cast_pages = ''.join(
    f'<section class="page cast"><div class="kicker">Who&rsquo;s Who in the Kingdom</div>{"".join(cast_cards[i:i + 2])}<div class="folio"></div></section>'
    for i in range(0, len(cast_cards), 2))

numbers = {1: [], 2: []}
for s in C['songs']:
    numbers[s['act']].append(f'<li><span class="num">{s["n"]}</span><span class="t">{e(s["title"])}</span><span class="dots"></span><span class="by">{e(s["sung_by"])}</span></li>')

song_pages = ''
for s in C['songs']:
    song_pages += f'''
<section class="song">
  <div class="songhead">
    <div class="songnum">No. {s["n"]}</div>
    <h2>{e(s["title"])}</h2>
    <div class="sungby">{e(s["sung_by"])}</div>
  </div>
  <div class="notes"><p><b>The scene.</b> {e(s["scene"])}</p><p><b>Listen for.</b> {e(s["listen_for"])}</p></div>
  <div class="lyrics">{lyrics_html(s)}</div>
</section>'''

glossary = ''.join(f'<dt>{e(g["term"])}</dt><dd>{e(g["def"])}</dd>' for g in C['glossary'])
motifs = ''.join(f'<li><span class="mline">&ldquo;{e(m["line"])}&rdquo;</span><span class="mnote">{e(m["note"])}</span></li>' for m in C['motifs'])
tips = ''.join(f'<li>{e(t)}</li>' for t in C['therapist_tips'])
credits = ''.join(f'<div>{e(c)}</div>' for c in C['credits'])

page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>GLIDE: The Musical</title>
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="playbill.css">
</head><body>

<section class="page cover">
  <div class="masthead"><span>SHOWBILL</span><span class="mh-right">The Kingdom of the Hand &middot; Left Hand Theatre</span></div>
  <div class="coverart">{svg("cover.svg")}</div>
  <div class="covertitle">
    <div class="glide">GLIDE</div>
    <div class="themusical">The Musical</div>
    <div class="tagline">{e(C["tagline"])}</div>
  </div>
</section>

<section class="page titlepage">
  <div class="kicker">Left Hand Theatre presents</div>
  <h1>GLIDE</h1>
  <div class="sub">The Musical</div>
  <div class="subsub">A Fairytale in Twelve Weeks</div>
  <div class="rule"></div>
  <div class="credits">{credits}</div>
  <div class="rule"></div>
  <h3 class="notehead">A Note from the Surgeon</h3>
  <div class="note">{paras(C["note_from_the_surgeon"])}</div>
</section>

<section class="page synopsis">
  <div class="kicker">The Story So Far</div>
  <h2>Synopsis</h2>
  <h4>Act One</h4>{paras(C["synopsis_act1"])}
  <h4>Act Two</h4>{paras(C["synopsis_act2"])}
</section>

<section class="page timelinepage">
  <div class="kicker">Time &amp; Place</div>
  <h2>Twelve Weeks in the Left Hand of Doctor Mae</h2>
  <div class="timeline">{svg("timeline.svg")}</div>
  <h2 class="mt">Musical Numbers</h2>
  <div class="numbers">
    <h4>Act One</h4><ol>{"".join(numbers[1])}</ol>
    <h4>Act Two</h4><ol>{"".join(numbers[2])}</ol>
  </div>
</section>

{cast_pages}

<section class="page mappage">
  <div class="kicker">Map of the Kingdom</div>
  <h2>Where It All Happens</h2>
  <div class="map">{svg("anatomy.svg")}</div>
  <p class="caption">The ring finger of Doctor Mae&rsquo;s left hand, side view. Zone II, between the start of the tunnel and Big Sister&rsquo;s anchor, is the No Man&rsquo;s Land of old Doctor Bunnell&rsquo;s map, and Scarlett&rsquo;s favourite haunt.</p>
  <div class="twocol">
    <div class="box"><h4>Recurring Themes</h4><ul class="motifs">{motifs}</ul></div>
    <div class="box teal"><h4>From Thea&rsquo;s Clinic</h4><ul class="tips">{tips}</ul></div>
  </div>
</section>

<section class="page lyricsdivider">
  <div class="kicker">The Complete Lyrics</div>
  <h2>The Songs</h2>
  <p class="caption">In order of performance, with notes on what to listen for.</p>
</section>

{song_pages}

<section class="page glossarypage">
  <div class="kicker">For Family Members Seated Near Surgeons</div>
  <h2>Glossary</h2>
  <dl class="glossary">{glossary}</dl>
</section>

<section class="page backcover">
  <div class="backart">{svg("humans.svg")}</div>
  <div class="backline">Make a fist for me.<br>Now open.</div>
  <div class="small">Please elevate your hand above your heart during the interval.</div>
</section>

</body></html>'''

open(os.path.join(HERE, 'playbill.html'), 'w').write(page)
print('wrote playbill.html', len(page))
