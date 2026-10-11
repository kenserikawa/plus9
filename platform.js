// Web-portal adapter. The game talks only to `platform`; each portal's SDK sits behind it.
// The build (tools/build.js) sets window.PLUS9_PLATFORM and adds the portal's SDK script.
// Without a build (local play) every call is a harmless no-op.
//
// Portal rules handled here, so app.js doesn't have to track them:
// - gameplayStart / gameplayStop never fire twice in a row
// - no gameplay events while an ad is showing
// - ads always resolve (also with an ad blocker or a failing SDK) so the game never hangs

const platform = (() => {
    const name = window.PLUS9_PLATFORM || 'none'
    // ?testads simulates ads locally (a 1.2 s overlay) to check that audio, clock and input pause
    const testAds = name === 'none' && new URLSearchParams(location.search).has('testads')
    let inGameplay = false
    let adShowing = false
    let hooks = { adStarted() {}, adFinished() {} }

    const sdks = {
        none: {
            init: () => Promise.resolve(),
            loadingFinished() {},
            gameplayStart() {},
            gameplayStop() {},
            commercialBreak: onStart => (testAds ? fakeAd(onStart) : Promise.resolve()),
            // without a portal there are no rewarded ads, except the simulated ones in test mode
            rewardedBreak: onStart => (testAds ? fakeAd(onStart).then(() => true) : Promise.resolve(false)),
            shareURL: () => Promise.resolve(/^https?:/.test(location.protocol) ? location.origin + location.pathname : null),
        },
        poki: {
            init: () => window.PokiSDK.init(),
            loadingFinished: () => window.PokiSDK.gameLoadingFinished(),
            gameplayStart: () => window.PokiSDK.gameplayStart(),
            gameplayStop: () => window.PokiSDK.gameplayStop(),
            commercialBreak: onStart => window.PokiSDK.commercialBreak(onStart),
            rewardedBreak: onStart => window.PokiSDK.rewardedBreak(onStart),
            shareURL: () => window.PokiSDK.shareableURL({}),
        },
    }

    let sdk = sdks[name] && (name === 'none' || window.PokiSDK) ? sdks[name] : sdks.none

    function fakeAd(onStart) {
        onStart()
        const el = document.createElement('div')
        el.className = 'test-ad'
        el.textContent = 'Test ad'
        document.body.appendChild(el)
        return new Promise(resolve => setTimeout(() => { el.remove(); resolve() }, 1200))
    }

    // run an SDK call without letting an SDK error break the game
    function safe(fn, ...args) {
        try { return fn(...args) } catch (err) { console.warn('[platform]', err) }
    }

    async function runAd(kind) {
        if (adShowing) return false
        adShowing = true
        let started = false
        const onStart = () => {
            started = true
            hooks.adStarted()
        }
        try {
            const result = await sdk[kind](onStart)
            return kind === 'rewardedBreak' ? result === true : true
        } catch (err) {
            console.warn('[platform]', err)
            return false
        } finally {
            adShowing = false
            if (started) hooks.adFinished()
        }
    }

    return {
        name,
        // rewarded ads need a portal SDK that loaded (or local test mode)
        get hasRewarded() { return sdk !== sdks.none || testAds },
        get adShowing() { return adShowing },

        async init({ onAdStarted, onAdFinished }) {
            hooks = { adStarted: onAdStarted, adFinished: onAdFinished }
            try {
                await sdk.init()
            } catch (err) {
                // the portals ask to start the game anyway (ad blockers make init fail)
                console.warn('[platform] init failed, playing without ads', err)
            }
        },
        loadingFinished: () => safe(sdk.loadingFinished),
        gameplayStart() {
            if (inGameplay || adShowing) return
            inGameplay = true
            safe(sdk.gameplayStart)
        },
        gameplayStop() {
            if (!inGameplay || adShowing) return
            inGameplay = false
            safe(sdk.gameplayStop)
        },
        // a natural break before play resumes; the portal decides whether an ad actually shows
        commercialBreak() {
            this.gameplayStop()
            return runAd('commercialBreak')
        },
        // resolves true only when the player watched the whole ad
        rewardedBreak() {
            this.gameplayStop()
            return runAd('rewardedBreak')
        },
        async shareURL() {
            try { return await sdk.shareURL() } catch { return null }
        },
    }
})()
