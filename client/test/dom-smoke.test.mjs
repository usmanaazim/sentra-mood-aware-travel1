/**
 * UI smoke test runner.
 *
 *   npm run test:ui           (from client/)
 *
 * Bundles test/dom-entry.jsx with Vite (so JSX, CSS and the app's real module
 * graph are exercised), installs a lightweight DOM, points the app at a running
 * SENTRA API, then executes the DOM suite against the REAL backend.
 *
 * Requirements: the API must be running (npm run dev:server  or  npm run dev).
 * VITE_API_BASE_URL may override the default http://127.0.0.1:4000
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '..');
const API_BASE = (process.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

/**
 * Loads happy-dom. It is intentionally NOT a project dependency (it would add
 * ~5,000 files and ~28 MB to this repository's budget), so when it is missing
 * from node_modules it is installed once into the operating system's temp
 * directory - outside the workspace - and reused on later runs.
 */
async function loadHappyDom() {
  try {
    return await import('happy-dom');
  } catch { /* not installed in the project - fall through */ }

  const dir = path.join(tmpdir(), 'sentra-ui-deps');
  const entry = path.join(dir, 'node_modules', 'happy-dom', 'lib', 'index.js');
  if (!existsSync(entry)) {
    console.log(`[sentra] installing happy-dom into ${dir} (outside the project, one-time, ~30 MB)`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = spawnSync(npm, ['install', 'happy-dom@^15', '--no-audit', '--no-fund', '--prefix', dir, '--silent'], { encoding: 'utf8' });
    if (install.status !== 0) {
      throw new Error(`could not install happy-dom for the UI suite:\n${install.stdout}\n${install.stderr}`);
    }
  }
  return import(pathToFileURL(entry).href);
}

test('SENTRA UI smoke suite (real components + real API)', { timeout: 240000 }, async (t) => {
  // ------------------------------------------------------------------ API up?
  let reachable = false;
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    reachable = res.ok;
    await res.text();
  } catch { reachable = false; }
  if (!reachable) {
    const hint = `The SENTRA API is not reachable at ${API_BASE}.\n` +
      'Start it first:  npm run dev:server        (or  npm run dev  for API + web app)\n' +
      'Then re-run:     npm --prefix client run test:ui';
    console.error(`\n[sentra] SKIPPING UI suite.\n${hint}\n`);
    t.skip(hint);
    return;
  }

  // ------------------------------------------------------- bundle the entry
  // Emitted inside client/dist/.ui-test-out so bare imports (react, leaflet,
  // react-leaflet) resolve normally and nothing extra lands in the project tree.
  const outDir = path.join(clientRoot, 'dist', '.ui-test-out');
  try {
    const build = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vite', 'build', '--ssr', 'test/dom-entry.jsx', '--outDir', outDir, '--logLevel', 'error', '--emptyOutDir'],
      { cwd: clientRoot, encoding: 'utf8', env: { ...process.env } }
    );
    assert.equal(build.status, 0, `vite bundling of the UI entry failed:\n${build.stdout}\n${build.stderr}`);
    const entryPath = path.join(outDir, 'dom-entry.js');

    // ------------------------------------------------------- DOM environment
    const { Window } = await loadHappyDom();
    const window = new Window({ url: 'http://localhost:5173/' });

    /**
     * Node's fetch has no cookie jar, so the shim below persists Set-Cookie
     * cookies between requests (session auth) AND mirrors them into
     * document.cookie (so the app can read the CSRF token exactly as a browser
     * would). Without this the session would never survive two requests.
     */
    // Capture the native fetch BEFORE replacing the global, otherwise the shim
    // would recurse into itself.
    const nodeFetch = globalThis.fetch.bind(globalThis);
    const jar = new Map();
    const syncDocumentCookie = (name, value) => {
      window.document.cookie = value ? `${name}=${value}; Path=/` : `${name}=; Path=/; Max-Age=0`;
    };
    // Request log read by the DOM suite (e.g. to prove which coordinates a
    // search actually sent). Bodies are never recorded for auth/profile routes.
    globalThis.__sentraFetchLog = [];

    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : String(input?.url ?? input);
      const absolute = url.startsWith('http') ? url : `${API_BASE}${url}`;
      const headers = { ...(init.headers || {}) };
      if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      // Never echo request bodies for auth routes: they contain credentials.
      const sensitive = /\/api\/(auth|profile)/.test(absolute);
      const entry = {
        method: init.method || 'GET',
        url: absolute.replace(API_BASE, ''),
        body: !sensitive && typeof init.body === 'string' ? init.body.slice(0, 400) : '',
        status: null
      };
      if (globalThis.__sentraFetchLog.length < 300) globalThis.__sentraFetchLog.push(entry);

      const res = await nodeFetch(absolute, { ...init, headers });
      entry.status = res.status;
      if (process.env.SENTRA_UI_DEBUG) {
        const body = !sensitive && typeof init.body === 'string' ? ` ${init.body.slice(0, 90)}` : '';
        console.log(`[fetch] ${init.method || 'GET'} ${absolute.replace(API_BASE, '')} -> ${res.status}${body}`);
      }

      for (const raw of (res.headers.getSetCookie?.() ?? [])) {
        const [pair, ...attrs] = raw.split(';');
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const cleared = !value || /max-age=0|expires=thu, 01 jan 1970/i.test(attrs.join(';'));
        if (cleared) { jar.delete(name); syncDocumentCookie(name, ''); }
        else { jar.set(name, value); syncDocumentCookie(name, value); }
      }
      return res;
    };
    // The bundled app calls the global `fetch`, not window.fetch — shim both.
    globalThis.fetch = window.fetch;
    // navigator.geolocation is a getter-only accessor in happy-dom -> define it.
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok, err) => err?.({ code: 1, PERMISSION_DENIED: 1, message: 'denied in test' }) }
    });
    window.open = () => null;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.navigator = window.navigator;
    globalThis.self = window;
    // Leaflet and React touch a range of browser globals that Node does not
    // define; expose the DOM implementations provided by happy-dom.
    for (const key of [
      'Element', 'Node', 'DocumentFragment', 'ShadowRoot', 'CSSStyleDeclaration',
      'HTMLElement', 'HTMLDivElement', 'HTMLInputElement', 'HTMLTextAreaElement',
      'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLButtonElement', 'SVGElement',
      'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent',
      'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'DOMParser', 'XMLSerializer'
    ]) {
      if (window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = window[key];
    }
    globalThis.getComputedStyle = window.getComputedStyle.bind(window);
    globalThis.requestIdleCallback = (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 5 }), 1);
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.process = { ...(globalThis.process || {}), env: { ...process.env, NODE_ENV: 'development' } };
    window.IS_REACT_ACT_ENVIRONMENT = true;
    window.devicePixelRatio = 1;   // Leaflet reads this during map setup

    // ------------------------------------------------- execute the DOM suite
    const module = await import(pathToFileURL(entryPath).href);
    const credentials = {
      name: 'UI Smoke Tester',
      email: `ui-smoke-${Date.now()}@example.com`,
      password: 'Testing42',
      confirmPassword: 'Testing42'
    };
    const results = await module.run({ apiBase: API_BASE, credentials });

    // ------------------------------------------------------------- reporting
    const passed = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    console.log(`\n[sentra] UI smoke suite against ${API_BASE}`);
    for (const r of results) {
      console.log(`  ${r.ok ? '✔' : '✖'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
    }
    console.log(`  ${passed.length}/${results.length} UI assertions passed\n`);

    const rateLimited = failed.some((f) => /too many requests/i.test(f.detail));
    if (rateLimited) {
      console.error(
        '\n[sentra] The API returned HTTP 429 (auth rate limit: 10 attempts / 15 min / IP).\n' +
        '        Restart the API to reset the in-memory window, or start it with rate limits off:\n' +
        '          RATE_LIMIT_DISABLED=1 npm run dev:server      (Windows PowerShell: $env:RATE_LIMIT_DISABLED=1; npm run dev:server)\n'
      );
    }
    assert.equal(failed.length, 0, `${failed.length} UI assertion(s) failed:\n${failed.map((f) => ` - ${f.name} (${f.detail})`).join('\n')}`);
    assert.ok(passed.length >= 25, `expected at least 25 UI assertions, ran ${passed.length}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
