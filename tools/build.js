// Builds the game for a target. Run with: node tools/build.js <poki|web>
//
// Copies only the files the page needs into dist/<target>/.
//   poki  adds the Poki SDK and sets window.PLUS9_PLATFORM, drops the noindex, and zips the
//         folder into dist/plus9-poki.zip for upload (no dependencies: the zip is hand-written)
//   web   the plain game for the GitHub Pages review copy (no SDK, keeps the noindex);
//         .github/workflows/pages.yml runs it on every push to master

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const PORTALS = {
    // Poki asks for its SDK in <head>; it updates that file in place, so no integrity hash
    poki: '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
    web: null,
}
// everything the page loads (index.html adds the SDK on top)
const FILES = ['index.html', 'styles.css', 'icon.svg', 'apple-touch-icon.png', 'platform.js', 'i18n.js', 'rules.js', 'bot.js', 'meta.js', 'sound.js', 'mascot.js', 'loader.js', 'app.js']
const DIRS = ['fonts']

const portal = process.argv[2]
if (!(portal in PORTALS)) {
    console.error(`usage: node tools/build.js <${Object.keys(PORTALS).join('|')}>`)
    process.exit(1)
}

const out = path.join(ROOT, 'dist', portal)
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

for (const file of FILES) fs.copyFileSync(path.join(ROOT, file), path.join(out, file))
for (const dir of DIRS) fs.cpSync(path.join(ROOT, dir), path.join(out, dir), { recursive: true })

// Cache busting: every script and stylesheet gets ?v=<hash of its content>.
// Hosts cache files for a while, and a browser that mixes a new index.html with an old
// app.js or styles.css breaks (new markup, old code). A changed file now has a new URL.
// loader.js loads the game's scripts itself (its SCRIPTS list), so they are versioned there
// first; loader.js's own hash then covers those names, and index.html names loader.js.
function bustCache(indexPath) {
    const hash = file => crypto.createHash('sha1').update(fs.readFileSync(path.join(out, file))).digest('hex').slice(0, 8)
    const version = (target, files) => {
        let text = fs.readFileSync(target, 'utf8')
        for (const file of files) {
            const before = text
            text = text.replace(new RegExp(`(["'])${file.replace('.', '\\.')}\\1`, 'g'), `$1${file}?v=${hash(file)}$1`)
            if (text === before) throw new Error(`${path.basename(target)}: no reference to ${file}, update tools/build.js`)
        }
        fs.writeFileSync(target, text)
    }
    const loaderPath = path.join(out, 'loader.js')
    const list = fs.readFileSync(loaderPath, 'utf8').match(/const SCRIPTS = \[([^\]]*)\]/)
    if (!list) throw new Error('loader.js: SCRIPTS list not found, update tools/build.js')
    const loaded = [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    const missing = loaded.filter(f => !FILES.includes(f))
    if (missing.length) throw new Error(`loader.js loads ${missing.join(', ')}: add to FILES in tools/build.js`)
    version(loaderPath, loaded)
    version(indexPath, FILES.filter(f => /\.(js|css)$/.test(f) && !loaded.includes(f)))
}

if (portal === 'web') {
    fs.copyFileSync(path.join(ROOT, 'og-image.jpeg'), path.join(out, 'og-image.jpeg')) // the link-preview image
    bustCache(path.join(out, 'index.html'))
    console.log(`dist/web/: ${FILES.length} files + ${DIRS.join(', ')}, assets versioned`)
    process.exit(0)
}

// inject the SDK and the platform flag before any game script
const indexPath = path.join(out, 'index.html')
// the portal page should be indexable; the noindex only protects the self-hosted review copy
// portals have their own game page and share cards: drop ours (they point at the review copy)
const html = fs.readFileSync(indexPath, 'utf8')
    .replace(/\s*<!-- the self-hosted copy[^\n]*\n\s*<meta name="robots" content="noindex">/, '')
    .replace(/\s*<!-- link previews[\s\S]*?<!-- \/share-meta -->/, '')
const marker = '<link rel="stylesheet" href="styles.css">'
if (!html.includes(marker)) throw new Error('index.html: stylesheet link not found, update tools/build.js')
fs.writeFileSync(indexPath, html.replace(marker,
    `${marker}\n    <script>window.PLUS9_PLATFORM = '${portal}'</script>\n    ${PORTALS[portal]}`))
bustCache(indexPath)

// ---------- zip (stored paths relative to the package root, index.html at the top) ----------

function crc32(buf) {
    let c, crc = 0xffffffff
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        crc = (crc >>> 8) ^ c
    }
    return (crc ^ 0xffffffff) >>> 0
}

function listFiles(dir, base = '') {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const rel = base ? `${base}/${entry.name}` : entry.name
        return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel]
    })
}

function zip(dir, zipPath) {
    const locals = [], centrals = []
    let offset = 0
    for (const name of listFiles(dir).sort()) {
        const data = fs.readFileSync(path.join(dir, name))
        const packed = zlib.deflateRawSync(data, { level: 9 })
        const nameBuf = Buffer.from(name)
        const crc = crc32(data)

        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0) // local file header
        local.writeUInt16LE(20, 4)          // version needed
        local.writeUInt16LE(0x0800, 6)      // UTF-8 names
        local.writeUInt16LE(8, 8)           // deflate
        local.writeUInt32LE(0, 10)          // time/date (not needed)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(packed.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(nameBuf.length, 26)
        local.writeUInt16LE(0, 28)
        locals.push(local, nameBuf, packed)

        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0) // central directory header
        central.writeUInt16LE(20, 4)
        central.writeUInt16LE(20, 6)
        central.writeUInt16LE(0x0800, 8)
        central.writeUInt16LE(8, 10)
        central.writeUInt32LE(0, 12)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(packed.length, 20)
        central.writeUInt32LE(data.length, 24)
        central.writeUInt16LE(nameBuf.length, 28)
        central.writeUInt32LE(offset, 42)
        centrals.push(central, nameBuf)

        offset += local.length + nameBuf.length + packed.length
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0) // end of central directory
    end.writeUInt16LE(centrals.length / 2, 8)
    end.writeUInt16LE(centrals.length / 2, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(offset, 16)
    fs.writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]))
}

const zipPath = path.join(ROOT, 'dist', `plus9-${portal}.zip`)
zip(out, zipPath)
const files = listFiles(out)
console.log(`dist/${portal}/: ${files.length} files`)
console.log(`dist/plus9-${portal}.zip: ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`)
