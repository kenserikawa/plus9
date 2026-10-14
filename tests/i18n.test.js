const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// the six dictionaries, read as data (i18n.js needs a page to run)
const src = fs.readFileSync(path.join(__dirname, '../i18n.js'), 'utf8')
const STRINGS = eval('(' + src.match(/const STRINGS = (\{[\s\S]*?\n    \})\n/)[1] + ')')

test('every language has exactly the English keys', () => {
    const en = Object.keys(STRINGS.en).sort()
    for (const [lang, dict] of Object.entries(STRINGS)) assert.deepEqual(Object.keys(dict).sort(), en, lang)
})

test('How to play says what stars unlock: outfits, colors and themes', () => {
    const words = { en: ['outfits', 'colors', 'themes'], es: ['ropa', 'colores', 'temas'], pt: ['roupas', 'cores', 'temas'], fr: ['tenues', 'couleurs', 'thèmes'], de: ['Outfits', 'Farben', 'Designs'], tr: ['kıyafet', 'renk', 'tema'] }
    for (const [lang, list] of Object.entries(words)) for (const w of list) assert.ok(STRINGS[lang]['help.r6.b'].includes(w), `${lang}: ${w}`)
})
