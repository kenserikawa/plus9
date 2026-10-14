# Nine's colors and star themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six colors for Nine and four themes with their own background and music (Lo-fi, Jazz, Arcade, Fiesta), unlocked by total stars as thresholds, with the next reward shown on the home card.

**Architecture:** All unlock rules live in `meta.js` (`NINE_COLORS`, star entries in `THEMES`, `colorUnlocked`, `themeUnlocked`, `nineColor`, `nextReward`, `unlockedRewards`, seen-tracking), made loadable in Node for tests. The page applies the color with one body attribute (`data-nine`) that every `.mascot` reads through `--m-fill`; Customize, the home card and the unlock toasts read `meta`. The four themes are CSS backgrounds plus `sound.js` styles, like the world themes.

**Tech Stack:** Vanilla JS (plain globals, `module.exports` for Node), Node's built-in test runner (`node --test`), Chrome DevTools (or the headless Chrome driver used before) for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-14-nine-colors-and-star-themes-design.md`

## Global Constraints

- No dependencies, no external requests; tests use `node:test` / `node:assert`.
- Style: 4-space indent, no semicolons, `const`/`let`; `localStorage` always in try/catch; text via `textContent`.
- Every player-facing word in `i18n.js` in all six languages (en, es, pt, fr, de, tr), keys identical across dictionaries; French no-break space (U+00A0) before ! ? : ;.
- Stars are thresholds, never spent: `meta.totalStars()` = journey + mission + bonus stars.
- Colors: gold 0 (default), mint 10, sky 25, coral 45, violet 70, chrome 110, rainbow 150. Star themes: lofi 20, jazz 50, arcade 90, fiesta 130. Existing star items stay: cap 15, scarf 30, crown 60.
- A saved color or theme that is locked falls back to gold / grape.
- New saved keys: `plus9.nineColor`, `plus9.seenUnlocks`.
- Music in C major / A minor; backgrounds static (no motion); `prefers-reduced-motion` respected.
- Layouts with no page scroll at 375×667, ~1000×780, 640×360, 836×470, 1031×580 (sheets scroll inside).
- Levels 1–80, Daily and Classic must not change: `node --test tests/*.test.js` stays green.

## Review Focus

1. **Old saves**: no `plus9.nineColor` / `plus9.seenUnlocks` → Nine stays gold and the home card shows no New! for things already unlocked before this update (Task 1 meta test; Task 3 browser check).
2. **A saved choice that is locked** (synced from another device, edited storage) → Nine gold, theme grape, no error (Task 1 meta tests).
3. **Language change** with home or Customize on screen → the next-reward line, swatch captions, theme chips and toasts follow the new language (Task 3 browser check).
4. **An unlock that happens mid-game** (a mission completes, journey stars, 🎬 bonus stars) → one toast per new reward, never repeated later; the home card shows New! until Customize is opened (Task 3 browser check).
5. **Small and landscape screens**: Customize with seven swatches and fourteen themes scrolls inside the sheet, no page scroll; long captions (de, fr) don't spill (Task 2 and Task 5 browser checks).

---

### Task 1: Unlock rules in meta.js, testable in Node

**Files:**
- Modify: `meta.js` (THEMES, new color and reward functions, return object, Node export)
- Modify: `app.js` (`renderStyle` theme lock uses `meta.themeUnlocked`)
- Create: `tests/meta.test.js`

**Interfaces:**
- Produces (on `meta`):
  - `NINE_COLORS` → `[{ id, stars }]` (gold first, 0 stars)
  - `colorUnlocked(c)` → boolean; `nineColor()` → id (fallback `'gold'`); `setNineColor(id)`
  - `THEMES` → world entries `{ id, world }` then star entries `{ id, stars }` (`lofi`, `jazz`, `arcade`, `fiesta`)
  - `themeUnlocked(t)` → boolean; `theme()` validates with it
  - `nextReward()` → `{ kind: 'item' | 'color' | 'theme', id, stars }` or `null`
  - `unlockedRewards()` → array of `'item:<id>' | 'color:<id>' | 'theme:<id>'` (colors with 0 stars excluded)
  - `seenUnlocks()` → array or `null` (never stored); `markUnlocksSeen()`; `hasUnseenUnlocks()` → boolean
- Node: `module.exports = { meta }` (needs `rules.js` globals and a `localStorage` global).

- [ ] **Step 1: Write the failing tests**

Create `tests/meta.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(globalThis, require('../rules.js'))

// a localStorage that lives in a Map; each test starts empty
const store = new Map()
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
}
const { meta } = require('../meta.js')
const stars = n => store.set('plus9.wallet', JSON.stringify({ missionStars: n }))
test.beforeEach(() => store.clear())

test('colors unlock at their star totals; gold is always there', () => {
    const c = id => meta.NINE_COLORS.find(x => x.id === id)
    assert.deepEqual(meta.NINE_COLORS.map(x => [x.id, x.stars]), [['gold', 0], ['mint', 10], ['sky', 25], ['coral', 45], ['violet', 70], ['chrome', 110], ['rainbow', 150]])
    assert.equal(meta.colorUnlocked(c('gold')), true)
    stars(9)
    assert.equal(meta.colorUnlocked(c('mint')), false)
    stars(10)
    assert.equal(meta.colorUnlocked(c('mint')), true)
})

test('a saved color that is locked falls back to gold', () => {
    meta.setNineColor('chrome')
    stars(50)
    assert.equal(meta.nineColor(), 'gold')
    stars(110)
    assert.equal(meta.nineColor(), 'chrome')
    store.set('plus9.nineColor', JSON.stringify('purple-ish'))
    assert.equal(meta.nineColor(), 'gold')
})

test('star themes unlock by stars, world themes by reaching the world', () => {
    const t = id => meta.THEMES.find(x => x.id === id)
    assert.deepEqual(meta.THEMES.filter(x => x.stars).map(x => [x.id, x.stars]), [['lofi', 20], ['jazz', 50], ['arcade', 90], ['fiesta', 130]])
    meta.setTheme('jazz')
    stars(49)
    assert.equal(meta.theme(), 'grape')
    stars(50)
    assert.equal(meta.theme(), 'jazz')
    assert.equal(meta.themeUnlocked(t('sunset')), false)
    for (let n = 1; n <= 10; n++) meta.journeyRecord(n, 1)
    assert.equal(meta.themeUnlocked(t('sunset')), true)
})

test('the next reward walks the ladder across items, colors and themes', () => {
    const at = n => { stars(n); const r = meta.nextReward(); return r && `${r.kind}:${r.id}:${r.stars}` }
    assert.equal(at(0), 'color:mint:10')
    assert.equal(at(10), 'item:cap:15')
    assert.equal(at(15), 'theme:lofi:20')
    assert.equal(at(59), 'item:crown:60')
    assert.equal(at(149), 'color:rainbow:150')
    assert.equal(at(150), null)
})

test('old saves see nothing new until something unlocks after the update', () => {
    stars(12)
    assert.equal(meta.seenUnlocks(), null, 'no record yet')
    meta.markUnlocksSeen()
    assert.equal(meta.hasUnseenUnlocks(), false)
    assert.ok(meta.unlockedRewards().includes('color:mint'))
    assert.ok(!meta.unlockedRewards().includes('color:gold'), 'gold is not a reward')
    stars(15)
    assert.equal(meta.hasUnseenUnlocks(), true, 'the cap is new')
    meta.markUnlocksSeen()
    assert.equal(meta.hasUnseenUnlocks(), false)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/meta.test.js`
Expected: FAIL — `Cannot destructure property 'meta'` (meta.js has no Node export yet).

- [ ] **Step 3: Implement in meta.js**

Replace the `const THEMES = …` line and its comment with:

```js
    // Themes: one per journey world (WORLDS in rules.js), unlocked when the player reaches it,
    // then four bought with total stars, each with its own background and music.
    // Names are in i18n.js as theme.<id>.
    const THEMES = [
        ...WORLDS.map((w, i) => ({ id: w.id, world: i })),
        { id: 'lofi', stars: 20 },
        { id: 'jazz', stars: 50 },
        { id: 'arcade', stars: 90 },
        { id: 'fiesta', stars: 130 },
    ]
```

Replace `theme()` with:

```js
    const themeUnlocked = t => (t.world !== undefined ? worldReached(t.world) : totalStars() >= t.stars)

    function theme() {
        const id = load('plus9.theme', 'grape')
        const t = THEMES.find(x => x.id === id)
        return t && themeUnlocked(t) ? t.id : 'grape'
    }
```

After `function wear(id) { … }`, add:

```js
    // ---------- Nine's colors and the star ladder ----------
    // Rewards for total stars are thresholds: stars are never spent. Nine's colors: gold is
    // the default, the rest unlock with stars (names in i18n.js as nine.<id>); chrome and
    // rainbow are gradients (styles.css [data-nine]).
    const NINE_COLORS = [
        { id: 'gold', stars: 0 },
        { id: 'mint', stars: 10 },
        { id: 'sky', stars: 25 },
        { id: 'coral', stars: 45 },
        { id: 'violet', stars: 70 },
        { id: 'chrome', stars: 110 },
        { id: 'rainbow', stars: 150 },
    ]
    const colorUnlocked = c => totalStars() >= c.stars

    function nineColor() {
        const id = load('plus9.nineColor', 'gold')
        const c = NINE_COLORS.find(x => x.id === id)
        return c && colorUnlocked(c) ? c.id : 'gold'
    }

    const setNineColor = id => save('plus9.nineColor', id)

    // every star-priced reward: wardrobe star items, colors and star themes
    const starRewards = () => [
        ...WARDROBE.filter(i => i.stars !== undefined).map(i => ({ kind: 'item', id: i.id, stars: i.stars })),
        ...NINE_COLORS.filter(c => c.stars > 0).map(c => ({ kind: 'color', id: c.id, stars: c.stars })),
        ...THEMES.filter(t => t.stars !== undefined).map(t => ({ kind: 'theme', id: t.id, stars: t.stars })),
    ]

    // the cheapest one still locked, for the home card; null when all are unlocked
    function nextReward() {
        const have = totalStars()
        return starRewards().filter(r => r.stars > have).sort((a, b) => a.stars - b.stars)[0] || null
    }

    // everything unlocked now, as 'kind:id' (wardrobe items, colors past gold, themes)
    const unlockedRewards = () => [
        ...WARDROBE.filter(itemUnlocked).map(i => `item:${i.id}`),
        ...NINE_COLORS.filter(c => c.stars > 0 && colorUnlocked(c)).map(c => `color:${c.id}`),
        ...THEMES.filter(themeUnlocked).map(t => `theme:${t.id}`),
    ]

    // what the player has seen in Customize (null before the first record: app.js records the
    // current unlocks at boot, so an old save doesn't show New! for things it already had)
    const seenUnlocks = () => load('plus9.seenUnlocks', null)
    const markUnlocksSeen = () => save('plus9.seenUnlocks', unlockedRewards())
    const hasUnseenUnlocks = () => {
        const seen = seenUnlocks() || []
        return unlockedRewards().some(id => !seen.includes(id))
    }
```

Extend the returned object with: `themeUnlocked, NINE_COLORS, colorUnlocked, nineColor, setNineColor, nextReward, unlockedRewards, seenUnlocks, markUnlocksSeen, hasUnseenUnlocks,`.

At the end of the file add:

```js
if (typeof module !== 'undefined') module.exports = { meta }
```

Update the file's header comment: "…the star wallet, and what it unlocks: themes, Nine's wardrobe and colors."

In `app.js` `renderStyle`, in the themes loop, replace `const locked = !meta.worldReached(t.world)` with `const locked = !meta.themeUnlocked(t)` (star themes get their proper labels in Task 3).

- [ ] **Step 4: Run the tests**

Run: `node --test tests/*.test.js`
Expected: all PASS (the 18 existing plus 5 new).

- [ ] **Step 5: Commit**

```bash
git add meta.js app.js tests/meta.test.js
git commit -m "Unlock rules for Nine's colors and star themes in meta.js, with tests"
```

---

### Task 2: Nine's color everywhere, chosen in Customize

**Files:**
- Modify: `index.html` (sprite gradients; inline body script; Customize color section)
- Modify: `styles.css` (`.mascot --m-fill`; color rules; swatch row)
- Modify: `app.js` (`applyNineColor`, boot, `renderStyle` color row)
- Modify: `i18n.js` (six languages)

**Interfaces:**
- Consumes: Task 1 `meta.NINE_COLORS`, `colorUnlocked`, `nineColor`, `setNineColor`.
- Produces: `applyNineColor()`; `body[data-nine]`; `#nine-colors` with `.color-chip` buttons; keys `nine.<id>` (7), `style.colors`, `reward.locked`.

- [ ] **Step 1: Write the failing browser check**

Save as a script for the console (or the headless driver) and run it; expected to FAIL now (`applyNineColor is not defined`):

```js
async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms))
    localStorage.clear(); localStorage.setItem('plus9.onboarded', '1'); localStorage.setItem('plus9.tour', '1')
    localStorage.setItem('plus9.wallet', JSON.stringify({ missionStars: 120 }))
    const fill = el => getComputedStyle(el).getPropertyValue('--m-fill').trim()
    const out = {}
    applyNineColor(); out.start = document.body.dataset.nine // nothing saved: gold
    meta.setNineColor('mint'); applyNineColor(); await wait(50)
    out.mint = fill(document.querySelector('.mascot-title'))
    meta.setNineColor('chrome'); applyNineColor(); await wait(50)
    out.chrome = fill(document.querySelector('.mascot-title'))
    openStyle(); await wait(300)
    const chips = [...document.querySelectorAll('#nine-colors .color-chip')]
    out.chips = chips.length
    out.locked = chips.filter(b => b.disabled).map(b => b.textContent.trim())
    out.chosen = chips.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('aria-label'))
    chips[1].click(); await wait(50)
    out.afterClick = [document.body.dataset.nine, JSON.parse(localStorage.getItem('plus9.nineColor'))]
    document.querySelector('#style').close()
    return out
}
```

Expected after implementation: `start` is `'gold'`; `mint` is `#5fe08a`; `chrome` is `url("#nine-chrome")` (or `url(#nine-chrome)`); 7 chips; `locked` is `['150 ★']`; `chosen` is `['Chrome']`; `afterClick` is `['mint', 'mint']`.

- [ ] **Step 2: Gradients, early apply and the Customize section (index.html)**

In the icon sprite `<svg …>` (the first one in `<body>`), add before `</svg>`:

```html
        <defs>
            <!-- Nine's metallic and rainbow colors (styles.css [data-nine]) -->
            <linearGradient id="nine-chrome" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#f6f8fb" /><stop offset="0.42" stop-color="#c8cfda" /><stop offset="0.52" stop-color="#eef2f6" /><stop offset="1" stop-color="#a9b2c1" />
            </linearGradient>
            <linearGradient id="nine-rainbow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#ff623a" /><stop offset="0.2" stop-color="#ffd23f" /><stop offset="0.4" stop-color="#5fe08a" /><stop offset="0.6" stop-color="#37afff" /><stop offset="0.8" stop-color="#8746ff" /><stop offset="1" stop-color="#ff31cc" />
            </linearGradient>
        </defs>
```

Replace the inline theme script at the start of `<body>` with one that also applies the color:

```html
    <script>try { document.body.dataset.theme = JSON.parse(localStorage.getItem('plus9.theme')) || 'grape'; document.body.dataset.nine = JSON.parse(localStorage.getItem('plus9.nineColor')) || 'gold' } catch { /* storage unavailable */ }</script>
```

(Inside an inline `<script>` the `;` separating two statements on one line is needed; the rest of the project keeps no semicolons.)

In `#style`, between the wardrobe `<div class="wardrobe" id="wardrobe"></div>` and the Themes heading, add:

```html
        <h3 class="sheet-subtitle" data-i18n="style.colors">Nine's color</h3>
        <div class="nine-colors" id="nine-colors"></div>
```

- [ ] **Step 3: Styles**

Change the `.mascot { --m-fill: var(--gold); … }` rule's custom property to `--m-fill: var(--nine, var(--gold));`. After the `.wear-chip` rules, add:

```css
/* Nine's colors (meta.NINE_COLORS): body[data-nine] sets --nine, which every Nine fills with;
   chrome and rainbow are SVG gradients (#nine-chrome, #nine-rainbow in index.html). A swatch
   (.nine-<id>) shows the same color. */
[data-nine="mint"] { --nine: #5fe08a; }
[data-nine="sky"] { --nine: #6ec6ff; }
[data-nine="coral"] { --nine: #ff8a73; }
[data-nine="violet"] { --nine: #b48cff; }
[data-nine="chrome"] { --nine: url(#nine-chrome); }
[data-nine="rainbow"] { --nine: url(#nine-rainbow); }
.nine-colors { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 12px; margin-bottom: 14px; }
.color-chip {
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 52px;
    padding: 2px;
    font-family: var(--label-font);
    font-size: 0.85rem;
    color: var(--ink);
    background: none;
    border: 0;
    cursor: pointer;
}
.color-chip:disabled { cursor: default; }
.color-chip:focus-visible { outline: 3px solid var(--violet); outline-offset: 2px; border-radius: 12px; }
.nine-swatch { width: 38px; height: 38px; border: 3px solid var(--ink); border-radius: 50%; box-shadow: -2px 3px 0 var(--ink); }
.color-chip[aria-pressed="true"] .nine-swatch { outline: 4px solid var(--gold); outline-offset: 2px; }
.color-chip:disabled .nine-swatch { filter: grayscale(1); opacity: 0.5; }
.nine-gold { background: var(--gold); }
.nine-mint { background: #5fe08a; }
.nine-sky { background: #6ec6ff; }
.nine-coral { background: #ff8a73; }
.nine-violet { background: #b48cff; }
.nine-chrome { background: linear-gradient(135deg, #f6f8fb 0%, #c8cfda 42%, #eef2f6 52%, #a9b2c1 100%); }
.nine-rainbow { background: linear-gradient(135deg, #ff623a, #ffd23f, #5fe08a, #37afff, #8746ff, #ff31cc); }
```

(The fills are light enough that Nine's ink face and outline stay readable; check it in Step 6.)

- [ ] **Step 4: Apply and choose (app.js)**

After `function applyTheme() { … }`, add:

```js
// Nine's color (meta.nineColor): every Nine reads it from the body through --m-fill
function applyNineColor() {
    document.body.dataset.nine = meta.nineColor()
}
```

At boot, right after the existing `applyTheme()` call, add `applyNineColor()`.

In `renderStyle()`, between the wardrobe block and the themes block, add:

```js
    const chosen = meta.nineColor()
    $('nine-colors').replaceChildren(...meta.NINE_COLORS.map(c => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'color-chip'
        const unlocked = meta.colorUnlocked(c)
        const name = tr(`nine.${c.id}`)
        b.disabled = !unlocked
        b.setAttribute('aria-pressed', c.id === chosen)
        b.setAttribute('aria-label', unlocked ? name : tr('reward.locked', { name, n: c.stars }))
        b.innerHTML = `<span class="nine-swatch nine-${c.id}" aria-hidden="true"></span><span class="color-name"></span>`
        b.querySelector('.color-name').textContent = unlocked ? name : tr('item.lockStars', { n: c.stars })
        b.addEventListener('click', () => {
            meta.setNineColor(c.id)
            applyNineColor()
            mascot.mood('happy')
            sfx.ui()
            renderStyle()
        })
        return b
    }))
```

- [ ] **Step 5: Texts (six languages)**

```bash
python3 - <<'EOF'
NB = ' '
T = [  # gold, mint, sky, coral, violet, chrome, rainbow, section title, locked label
    ('Gold', 'Mint', 'Sky', 'Coral', 'Lilac', 'Chrome', 'Rainbow', "Nine's color", '{name}, unlocks at {n} stars'),
    ('Oro', 'Menta', 'Cielo', 'Coral', 'Lila', 'Cromo', 'Arcoíris', 'Color de Nine', '{name}, se desbloquea con {n} estrellas'),
    ('Ouro', 'Menta', 'Céu', 'Coral', 'Lilás', 'Cromo', 'Arco-íris', 'Cor do Nine', '{name}, desbloqueia com {n} estrelas'),
    ('Or', 'Menthe', 'Ciel', 'Corail', 'Lilas', 'Chrome', 'Arc-en-ciel', 'Couleur de Nine', '{name}, se débloque à {n} étoiles'),
    ('Gold', 'Minze', 'Himmel', 'Koralle', 'Flieder', 'Chrom', 'Regenbogen', 'Nines Farbe', '{name}, freigeschaltet ab {n} Sternen'),
    ('Altın', 'Nane', 'Gök', 'Mercan', 'Leylak', 'Krom', 'Gökkuşağı', 'Nine’ın rengi', '{name}, {n} yıldızla açılır'),
]
p = 'i18n.js'; lines = open(p, encoding='utf-8').read().split('\n'); out = []; k = 0
for line in lines:
    out.append(line)
    if "'style.wardrobe': " in line:
        ind = line[:len(line) - len(line.lstrip())]
        g, m, s, c, v, ch, r, title, locked = T[k]; k += 1
        out.append(f'{ind}\'nine.gold\': "{g}", \'nine.mint\': "{m}", \'nine.sky\': "{s}", \'nine.coral\': "{c}", \'nine.violet\': "{v}", \'nine.chrome\': "{ch}", \'nine.rainbow\': "{r}",')
        out.append(f'{ind}\'style.colors\': "{title}", \'reward.locked\': "{locked}",')
assert k == 6, k
open(p, 'w', encoding='utf-8').write('\n'.join(out))
EOF
```

Then compare the dictionaries (six lines with the same count and `- -`):

```bash
node -e "
const src = require('fs').readFileSync('i18n.js', 'utf8')
const S = eval('(' + src.match(/const STRINGS = (\{[\s\S]*?\n    \})\n/)[1] + ')')
const en = Object.keys(S.en)
for (const l of Object.keys(S)) { const k = Object.keys(S[l]); console.log(l, k.length, en.filter(x => !k.includes(x)).join(',') || '-', k.filter(x => !en.includes(x)).join(',') || '-') }"
```

- [ ] **Step 6: Run the check again, and look**

Run the Step 1 script: expected values as listed there. Then, at 375×667, set each color in turn (`meta.setNineColor(id); applyNineColor()`) with enough stars and screenshot the home screen: Nine's face and outline readable on every color; chrome and rainbow show their gradients on the body and the tail; the loading screen (reload with a saved color) shows Nine in that color from the first frame. Open Customize in de and fr at 375 px and 640×360: the seven chips fit, captions don't spill, no page scroll. No console errors.

- [ ] **Step 7: Run the tests and commit**

Run: `node --test tests/*.test.js` → all PASS.

```bash
git add index.html styles.css app.js i18n.js
git commit -m "Nine's colors: chosen in Customize, applied to every Nine from the first paint"
```

---

### Task 3: Star themes in Customize, the next reward on home, unlock toasts and the New! badge

**Files:**
- Modify: `app.js` (`renderStyle` themes, `renderHome`, `openStyle`, unlock announcements, boot)
- Modify: `index.html` (`id` on the Customize card subtitle)
- Modify: `styles.css` (Customize card badge)
- Modify: `i18n.js` (six languages; `tour.missions`)

**Interfaces:**
- Consumes: Task 1 `meta.themeUnlocked`, `nextReward`, `unlockedRewards`, `seenUnlocks`, `markUnlocksSeen`, `hasUnseenUnlocks`; Task 2 keys `nine.<id>`, `reward.locked`.
- Produces: `rewardName(r)`; `announceUnlocks(except)` (replaces `announceNewItems`); `knownRewards`; keys `theme.lofi|jazz|arcade|fiesta`, `style.next`, `toast.color`, `toast.theme`.

- [ ] **Step 1: Write the failing browser check**

Run A sets up an old save (12 stars, no `plus9.seenUnlocks`):

```js
async () => {
    localStorage.clear(); localStorage.setItem('plus9.onboarded', '1'); localStorage.setItem('plus9.tour', '1')
    localStorage.setItem('plus9.wallet', JSON.stringify({ missionStars: 12 }))
    return 'saved'
}
```

then reload the page (so the boot sees that save) and run B:

```js
async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms))
    const card = document.querySelector('#go-style'), toastEl = document.querySelector('#toast')
    const out = { sub: document.querySelector('#customize-sub')?.textContent, newBadge: card.classList.contains('is-new') }
    meta.addBonusStars(10); announceUnlocks(); await wait(100) // 22 stars: cap 15 and Lo-fi 20 unlock
    out.toast = toastEl.textContent
    goHome(); await wait(200)
    out.afterSub = document.querySelector('#customize-sub').textContent
    out.afterBadge = card.classList.contains('is-new')
    openStyle(); await wait(300)
    out.lofiChip = [...document.querySelectorAll('.theme-chip')].find(b => b.classList.contains('theme-lofi'))?.disabled === false
    out.jazzLabel = document.querySelector('.theme-chip.theme-jazz')?.textContent.trim()
    document.querySelector('#style').close(); goHome(); await wait(200)
    out.badgeCleared = !card.classList.contains('is-new')
    announceUnlocks(); await wait(100)
    out.noRepeat = toastEl.hidden || !/Lo-fi/.test(toastEl.textContent)
    i18n.set('es'); relocalize(); await wait(100)
    out.es = document.querySelector('#customize-sub').textContent
    openStyle(); await wait(300)
    out.esChip = document.querySelector('#nine-colors .color-chip .color-name').textContent
    document.querySelector('#style').close()
    return out
}
```

Expected after implementation: `sub` "Next: Cap · 15 ★" (12 stars: mint is had, the cap is next); `newBadge` false (an old save: what it had was recorded at boot); `toast` mentions Lo-fi (the last of the two toasts, cap then Lo-fi); `afterSub` "Next: Sky · 25 ★"; `afterBadge` true; `lofiChip` true; `jazzLabel` "50 ★"; `badgeCleared` true; `noRepeat` true; `es` "Siguiente: Cielo · 25 ★"; `esChip` "Oro". Run B FAILS now (`#customize-sub` missing, `announceUnlocks` undefined).

- [ ] **Step 2: Markup and badge style**

In `index.html`, give the Customize card subtitle an id: `<span class="customize-sub" id="customize-sub" data-i18n="style.sub">`.

In `styles.css`, add `position: relative;` to the `.customize-card` rule (after `display: grid;`), and after the `.mode-card.is-new::after` rule add:

```css
/* gold dot: something unlocked since Customize was last opened */
.customize-card.is-new::after {
    content: '';
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    background: var(--gold);
    border: 3px solid var(--ink);
    border-radius: 50%;
}
```

- [ ] **Step 3: Themes in Customize, the next reward, the badge (app.js)**

In `renderStyle()`'s themes loop, replace the lines that set the chip's text and label with:

```js
        const name = tr(`theme.${t.id}`)
        const lockText = t.world !== undefined ? tr('world.short', { n: t.world + 1 }) : tr('item.lockStars', { n: t.stars })
        const lockAria = t.world !== undefined ? tr('theme.lockedWorld', { name, n: t.world + 1 }) : tr('reward.locked', { name, n: t.stars })
        b.querySelector('.theme-name').textContent = locked ? lockText : name
        b.setAttribute('aria-label', locked ? lockAria : tr('theme.aria', { name }))
```

Add above `renderHome`:

```js
// a reward's name: a wardrobe item, a color for Nine or a theme
const rewardName = r => tr(`${r.kind === 'color' ? 'nine' : r.kind}.${r.id}`)
```

At the end of `renderHome()`, add:

```js
    // the Customize card: the next star reward, and a dot while something new is unseen
    const next = meta.nextReward()
    $('customize-sub').textContent = next ? tr('style.next', { name: rewardName(next), n: next.stars }) : tr('style.sub')
    $('go-style').classList.toggle('is-new', meta.hasUnseenUnlocks())
```

In `openStyle()`, add as its first line `meta.markUnlocksSeen()`.

- [ ] **Step 4: Unlock toasts for items, colors and star themes (app.js)**

Replace `unlockedItems`, `knownItems` and `announceNewItems` with:

```js
let knownRewards = null // rewards already unlocked when last checked ('kind:id'); set at boot

// toast what unlocked since the last check: wardrobe items, colors, star themes (a world's
// theme comes with its prize card); `except` is the item the result sheet announces itself
function announceUnlocks(except = null) {
    const now = meta.unlockedRewards()
    for (const key of now) {
        if (knownRewards.includes(key) || key === `item:${except}`) continue
        const [kind, id] = key.split(':')
        if (kind === 'item') toast(tr('toast.item', { item: tr(`item.${id}`) }))
        if (kind === 'color') toast(tr('toast.color', { name: tr(`nine.${id}`) }))
        if (kind === 'theme' && meta.THEMES.find(t => t.id === id).stars) toast(tr('toast.theme', { name: tr(`theme.${id}`) }))
    }
    knownRewards = now
}
```

Rename every call of `announceNewItems(` to `announceUnlocks(` (three calls). At boot, replace `knownItems = unlockedItems()` with:

```js
knownRewards = meta.unlockedRewards()
if (!meta.seenUnlocks()) meta.markUnlocksSeen() // an old save: what it already has isn't news
```

- [ ] **Step 5: Texts (six languages) and the tour step**

```bash
python3 - <<'EOF'
NB = ' '
T = [  # next, toast color, toast theme, tour.missions (new)
    ('Next: {name} · {n} ★', 'New color for Nine: {name}!', 'New theme: {name}!', 'Three missions a day give stars. Stars unlock outfits, colors and themes for Nine in Customize.'),
    ('Siguiente: {name} · {n} ★', '¡Nuevo color para Nine: {name}!', '¡Nuevo tema: {name}!', 'Tres misiones al día dan estrellas. Las estrellas desbloquean ropa, colores y temas para Nine en Personalizar.'),
    ('Próximo: {name} · {n} ★', 'Nova cor para o Nine: {name}!', 'Novo tema: {name}!', 'Três missões por dia dão estrelas. As estrelas desbloqueiam roupas, cores e temas para o Nine em Personalizar.'),
    (f'Prochain{NB}: {{name}} · {{n}} ★', f'Nouvelle couleur pour Nine{NB}: {{name}}{NB}!', f'Nouveau thème{NB}: {{name}}{NB}!', 'Trois missions par jour rapportent des étoiles. Les étoiles débloquent tenues, couleurs et thèmes pour Nine dans Personnaliser.'),
    ('Nächstes: {name} · {n} ★', 'Neue Farbe für Nine: {name}!', 'Neues Design: {name}!', 'Drei Missionen am Tag bringen Sterne. Sterne schalten unter Anpassen Outfits, Farben und Designs für Nine frei.'),
    ('Sıradaki: {name} · {n} ★', 'Nine için yeni renk: {name}!', 'Yeni tema: {name}!', 'Günde üç görev yıldız kazandırır. Yıldızlar Özelleştir’de Nine için kıyafet, renk ve tema açar.'),
]
p = 'i18n.js'; s = open(p, encoding='utf-8').read()
import re
lines = s.split('\n'); out = []; k = 0
for line in lines:
    out.append(line)
    if "'style.colors': " in line:
        ind = line[:len(line) - len(line.lstrip())]
        nx, tc, tt, _ = T[k]; k += 1
        out.append(f'{ind}\'style.next\': "{nx}", \'toast.color\': "{tc}", \'toast.theme\': "{tt}",')
        out.append(f'{ind}\'theme.lofi\': "Lo-fi", \'theme.jazz\': "Jazz", \'theme.arcade\': "Arcade", \'theme.fiesta\': "Fiesta",')
assert k == 6, k
s = '\n'.join(out)
# replace each language's tour.missions, in dictionary order
parts = re.split(r"('tour\.missions': )\"[^\"]*\"", s)
assert len(parts) == 13, len(parts)  # 6 matches
s = ''.join(parts[0:1] + [x for i in range(6) for x in (parts[1 + 2 * i], f'"{T[i][3]}"', parts[2 + 2 * i])])
open(p, 'w', encoding='utf-8').write(s)
EOF
```

Then rerun the dictionary comparison from Task 2 Step 5 and check that `tour.missions` reads the new text in all six (`grep -o "'tour.missions': [^,]*" i18n.js`).

- [ ] **Step 6: Run the check again**

Run the Step 1 scripts: expected values as listed. Then a mid-game unlock through a mission, the way the game does it:

```js
async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms))
    localStorage.setItem('plus9.wallet', JSON.stringify({ missionStars: 9 }))
    knownRewards = meta.unlockedRewards()
    await startGame('classic'); await wait(400)
    const id = meta.missionList().find(m => !m.done).id
    celebrate(meta.missionEvent(id, 999)); await wait(1900) // the mission's star makes 10: mint unlocks
    const first = document.querySelector('#toast').textContent
    announceUnlocks(); await wait(100)
    return { first, again: document.querySelector('#toast').textContent === first }
}
```

Expected: `first` is "New color for Nine: Mint!" and no new toast appears on the second call. No console errors.

- [ ] **Step 7: Run the tests and commit**

Run: `node --test tests/*.test.js` → all PASS.

```bash
git add app.js index.html styles.css i18n.js
git commit -m "Star themes in Customize, the next reward on the home card, unlock toasts and a New! dot"
```

---

### Task 4: The four themes' backgrounds and music

**Files:**
- Modify: `styles.css` (four `[data-theme]` backgrounds)
- Modify: `sound.js` (`CHORDS` adds `G7`, `Am7`; four `STYLES`)

**Interfaces:**
- Consumes: Task 1 theme ids `lofi`, `jazz`, `arcade`, `fiesta`; `applyTheme()` (sets `data-theme`, calls `sfx.setStyle(id)`).
- Produces: `STYLES.lofi|jazz|arcade|fiesta`; CSS `[data-theme="<id>"], .theme-<id>` backgrounds.

- [ ] **Step 1: Write the failing browser check**

```js
async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms))
    localStorage.setItem('plus9.wallet', JSON.stringify({ missionStars: 200 }))
    const bgNow = () => getComputedStyle(document.body).getPropertyValue('--bg').trim()
    meta.setTheme('grape'); applyTheme(); await wait(100)
    const grape = bgNow()
    const out = {}
    for (const id of ['lofi', 'jazz', 'arcade', 'fiesta']) {
        meta.setTheme(id); applyTheme(); await wait(100)
        out[id] = { theme: document.body.dataset.theme, ownBg: bgNow() !== grape }
    }
    return out
}
```

Expected now: each `theme` is its id but `ownBg` is false (no rule yet, so the default background shows). Expected after: all four `ownBg` true.

- [ ] **Step 2: Backgrounds**

In `styles.css`, after the gears theme rule, add:

```css
/* lo-fi: a city dusk, mauve and muted orange over a darker skyline band */
[data-theme="lofi"], .theme-lofi { --bg: linear-gradient(180deg, #2b2240 0%, #5e3f63 40%, #b06a6a 72%, #d99a6c 86%, #3a2a3f 86.5%, #2a1f33 100%); }
/* jazz: a deep blue club with a warm spotlight at the top */
[data-theme="jazz"], .theme-jazz { --bg: radial-gradient(ellipse 60% 35% at 50% 0%, rgba(255, 196, 120, 0.45), transparent 70%), linear-gradient(180deg, #0f1a3a 0%, #142554 55%, #0b1230 100%); }
/* arcade: a neon perspective grid on blue-black */
[data-theme="arcade"], .theme-arcade { --bg: repeating-linear-gradient(90deg, transparent 0 46px, rgba(255, 49, 204, 0.35) 46px 48px), repeating-linear-gradient(180deg, transparent 0 46px, rgba(55, 175, 255, 0.35) 46px 48px), linear-gradient(180deg, #05051a 0%, #120a3a 60%, #2a0d4f 100%); }
/* fiesta: bright colors with fixed confetti */
[data-theme="fiesta"], .theme-fiesta { --bg: radial-gradient(circle at 12% 18%, #ffd23f 0 6px, transparent 7px), radial-gradient(circle at 78% 12%, #37afff 0 5px, transparent 6px), radial-gradient(circle at 62% 70%, #5fe08a 0 6px, transparent 7px), radial-gradient(circle at 25% 82%, #ff31cc 0 5px, transparent 6px), radial-gradient(circle at 90% 55%, #ff623a 0 6px, transparent 7px), linear-gradient(160deg, #ff623a 0%, #ff31cc 45%, #8746ff 100%); }
```

(If the page's `--bg` is drawn with `background-attachment: fixed` or sized per screen, check the grid and confetti read well at every layout size in Step 5; tweak only spacing, never add motion.)

- [ ] **Step 3: Music**

In `sound.js` `CHORDS`, add `G7: [55, 59, 62, 65], Am7: [57, 60, 64, 67],`. In `STYLES`, after `gears`, add:

```js
        // Lo-fi: a dusty evening. Electric-piano seventh chords, a soft swung beat and a quiet
        // vinyl crackle.
        lofi: {
            bpm: 78, cutoff: 1900, level: 1,
            parts: [['Fmaj7', 'Em7', 'Dm7', 'Cmaj7']],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.22 : 0
                if (pos === 0 || pos === 5) for (const n of chord) tone(midi(n), { type: 'sine', dur: e * (pos ? 2.5 : 4.5), vol: 0.03, attack: 0.02, at: at + swing, dest: out })
                if (pos === 0 || pos === 3) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 2, vol: 0.12, attack: 0.02, at: at + swing, dest: out })
                if (pos === 0 || pos === 5) kick(at + swing, 0.16, out)
                if (pos === 2 || pos === 6) hiss({ dur: 0.09, vol: 0.045, at, from: 1800, to: 2600, dest: out })
                if (pos % 2 === 1) hiss({ dur: 0.03, vol: 0.015, at: at + swing, from: 7000, to: 8000, dest: out })
                if (Math.random() < 0.35) hiss({ dur: 0.01, vol: 0.012, at: at + Math.random() * e, from: 3000, to: 6000, dest: out }) // vinyl crackle
            },
        },

        // Jazz: a late club. A walking bass on every beat, a swinging ride cymbal, and piano
        // comping a ii-V-I.
        jazz: {
            bpm: 120, cutoff: 2600, level: 1,
            parts: [['Dm7', 'G7', 'Cmaj7', 'Am7']],
            walk: [0, 1, 2, 1], // chord tones, one per beat
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.33 : 0 // triplet feel
                if (pos % 2 === 0) tone(midi(chord[this.walk[pos / 2]] - 12), { type: 'triangle', dur: e * 1.8, vol: 0.11, attack: 0.01, at, dest: out })
                if (pos % 2 === 0 || pos === 3 || pos === 7) hiss({ dur: 0.12, vol: 0.03, at: at + swing, from: 6000, to: 9000, dest: out })
                if (pos === 1 || pos === 4) for (const n of chord) tone(midi(n + 12), { type: 'triangle', dur: e * 0.9, vol: 0.022, attack: 0.005, at: at + swing, dest: out })
            },
        },

        // Arcade: fast chiptune. A square-wave lead, a triangle bass jumping octaves and noise drums.
        arcade: {
            bpm: 144, cutoff: 4200, level: 0.85,
            parts: [['Am', 'F', 'C', 'G'], ['Am', 'G', 'F', 'G']],
            lead: [4, 2, 0, 2, 4, 4, 4, null],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                tone(midi(chord[0] - (pos % 2 ? 12 : 24)), { type: 'triangle', dur: e * 0.8, vol: 0.09, attack: 0.002, at, dest: out })
                const i = this.lead[(pos + bar) % 8]
                if (i !== null) tone(midi(chord[i % 3] + 12 * Math.floor(i / 3) + 12), { type: 'square', dur: e * 0.6, vol: 0.02, attack: 0.002, at, dest: out })
                if (pos === 0 || pos === 4) hiss({ dur: 0.05, vol: 0.08, at, from: 200, to: 900, dest: out })
                if (pos === 2 || pos === 6) hiss({ dur: 0.08, vol: 0.07, at, from: 2500, to: 5000, dest: out })
                hiss({ dur: 0.015, vol: 0.02, at, from: 9000, to: 11000, dest: out })
            },
        },

        // Fiesta: a Latin party. A 3-2 clave, congas, a montuno piano and bright brass stabs.
        fiesta: {
            bpm: 108, cutoff: 3600, level: 0.95,
            parts: [['C', 'F', 'G', 'C'], ['Am', 'Dm', 'G', 'C']],
            clave: [[0, 3, 6], [2, 4]], // the 3 side, then the 2 side
            montuno: [0, 2, 1, 2, 0, 2, 1, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (this.clave[bar % 2].includes(pos)) tone(2500, { type: 'sine', dur: 0.04, vol: 0.06, attack: 0.001, at, dest: out })
                if (pos === 3 || pos === 7) tone(190, { type: 'sine', dur: 0.12, vol: 0.09, attack: 0.002, at, dest: out })
                if (pos === 2 || pos === 6) tone(330, { type: 'sine', dur: 0.06, vol: 0.06, attack: 0.002, at, dest: out })
                tone(midi(chord[this.montuno[pos]] + 12), { type: 'triangle', dur: e * 0.6, vol: 0.025, attack: 0.003, at, dest: out })
                if (pos === 0 || pos === 4) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 2.5, vol: 0.12, attack: 0.01, at, dest: out })
                if (pos === 6 || pos === 7) for (const m of chord) tone(midi(m + 12), { type: 'sawtooth', dur: e * 0.45, vol: 0.008, attack: 0.01, at, dest: out })
            },
        },
```

- [ ] **Step 4: Check that each style plays**

Run `node --check sound.js`. In the browser, after a click on the page (audio unlock), for each id run `meta.setTheme(id); applyTheme()` and let it play ~5 s with DevTools open: no console errors, the music changes (listen, or check `sfx` keeps scheduling: no exceptions in the console). Then run the Step 1 check: all four `ownBg` true.

- [ ] **Step 5: Look at every size**

Screenshot the home screen and a game with each of the four themes at 375×667 and 640×360: text and pills stay readable (labels are ink on white, numbers outlined), Nine and the board stand out, nothing moves. Reload with each theme saved: the loading screen uses it from the first frame.

- [ ] **Step 6: Commit**

```bash
git add styles.css sound.js
git commit -m "Four star themes: Lo-fi, Jazz, Arcade and Fiesta, each with its own background and music"
```

---

### Task 5: Docs and the final pass

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `promo/store-listing.md`

- [ ] **Step 1: CLAUDE.md**

Update in the file's style:
- **Files table**: `meta.js` row adds Nine's colors (`NINE_COLORS`, `nineColor`), star themes in `THEMES`, `nextReward`, `unlockedRewards`, seen tracking, and its Node export; `sound.js` styles add **lofi** (electric piano, swung beat, vinyl crackle), **jazz** (walking bass, ride, ii-V-I comping), **arcade** (fast chiptune), **fiesta** (clave, congas, montuno, brass); `tests/` row adds `meta.test.js`.
- **Screens → Home**: the Customize card shows the next star reward ("Next: … · n ★") and a gold dot while something unlocked is unseen in Customize.
- **Rules → Themes**: themes are the worlds' plus four bought with total stars (lofi 20, jazz 50, arcade 90, fiesta 130), each with its own background and music; `themeUnlocked`.
- **Nine's wardrobe** bullet: add **Nine's colors** (gold default; mint 10, sky 25, coral 45, violet 70, chrome 110, rainbow 150; `body[data-nine]` → `--nine` → `.mascot --m-fill`; chrome and rainbow are SVG gradients in `index.html`; applied before the first paint by the inline body script, so the loader's Nine has it). Stars are thresholds, never spent; prices are a first pass.
- **Saving**: add `nineColor`, `seenUnlocks`.
- **Onboarding** "taught so far": unlock toasts for items, colors and star themes (`announceUnlocks`), the Customize dot, the next-reward line, and the home tour's third step.

- [ ] **Step 2: README and store listing**

README: in the Customize paragraph, add that stars also unlock six colors for Nine and four themes with their own music (Lo-fi, Jazz, Arcade, Fiesta). Store listing (en and es): add a short sentence about Nine's colors and the four extra themes.

- [ ] **Step 3: Full pass**

Run: `node --test tests/*.test.js` → all PASS; `node tools/build.js web` and `node tools/build.js poki` → both succeed. In the browser at the five layout sizes: home (next reward line, dot), Customize (seven swatches, fourteen themes; scrolls inside, no page scroll), each new theme on home and in a game, Nine in each color on the home title, in a game and in the loader; de and fr at 375 px; reduced motion; no console errors.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md promo/store-listing.md
git commit -m "Document Nine's colors and the star themes"
```
