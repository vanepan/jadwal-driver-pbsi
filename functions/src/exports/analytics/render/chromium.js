'use strict';

/* ============================================================
   CHROMIUM.JS — headless Chrome lifecycle for PDF rendering

   Owns a single shared browser instance per function instance,
   reused across invocations (warm), and self-heals on crash.

   Runtime split (Cloud Functions Gen2 does NOT ship a launchable
   Chrome — full `puppeteer`'s downloaded Chromium is not packaged
   into the deploy artifact, so it must be provided explicitly):

     • Cloud (process.env.K_SERVICE set — Functions/Cloud Run):
         puppeteer-core + @sparticuz/chromium — a serverless,
         self-contained Chromium that lives in node_modules and is
         therefore packaged. Launch with chromium.args +
         await chromium.executablePath() + chromium.headless.
         Graphics mode is disabled (reports are 2D HTML/CSS) to
         lower memory.

     • Local (no K_SERVICE): puppeteer-core launched against a local
         Chrome via CHROME_PATH, or the dev-only full `puppeteer`'s
         bundled browser. Keeps the local render workflow intact.

   All requires are LAZY so loading this module at cold start (which
   firebase-functions does for every function) never pulls Chromium
   unless an analytics export actually renders.
   ============================================================ */

const logger = require('firebase-functions/logger');

/** Minimal args for the LOCAL dev path (cloud uses chromium.args). */
const LOCAL_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
];

/** True when running inside Cloud Functions / Cloud Run. */
function _isCloud() {
  return Boolean(process.env.K_SERVICE);
}

/** Resolve launch options for the current environment. */
async function _launchOptions() {
  if (_isCloud()) {
    const chromium = require('@sparticuz/chromium');
    // Disable WebGL/graphics — the reports are pure 2D HTML/CSS; saves memory.
    if (typeof chromium.setGraphicsMode !== 'undefined') {
      try { chromium.setGraphicsMode = false; } catch { /* older builds: no-op */ }
    }
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  }
  // Local development.
  let executablePath = process.env.CHROME_PATH;
  if (!executablePath) {
    // dev-only full puppeteer provides a matching local Chrome
    executablePath = require('puppeteer').executablePath();
  }
  return { args: LOCAL_ARGS, executablePath, headless: true };
}

let _browserPromise = null;

/** Launch (or reuse) the shared headless Chromium. @returns {Promise<Browser>} */
function getBrowser() {
  if (_browserPromise) return _browserPromise;

  const puppeteer = require('puppeteer-core');

  _browserPromise = _launchOptions()
    .then((opts) => puppeteer.launch(opts))
    .then((browser) => {
      logger.info('[chromium] launched', { cloud: _isCloud() });
      browser.on('disconnected', () => {
        logger.warn('[chromium] disconnected — will relaunch on next call');
        _browserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      _browserPromise = null;
      logger.error('[chromium] launch failed', { error: err.message, cloud: _isCloud() });
      throw err;
    });

  return _browserPromise;
}

/** Best-effort shutdown (tests / graceful teardown). */
async function closeBrowser() {
  if (!_browserPromise) return;
  try {
    const b = await _browserPromise;
    await b.close();
  } catch {
    /* ignore */
  } finally {
    _browserPromise = null;
  }
}

module.exports = { getBrowser, closeBrowser };
