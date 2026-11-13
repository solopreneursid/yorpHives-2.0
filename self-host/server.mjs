import './register.mjs';
import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, readdir, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './sqlite.mjs';
import { authorizeOwnerRequest, adminJson } from './auth.mjs';
import { createObservationScheduler } from './scheduler.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const API_ROOT = resolve(ROOT, 'functions/api/admin');
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' };
const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const redirect = location => new Response(null, { status: 303, headers: { location } });
function loginPage(message = '', signedIn = false) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in · YorpHives Headquarters</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#080e1b;color:#e9f0fb;font:16px/1.6 system-ui,sans-serif;padding:24px}main{width:min(100%,420px);padding:36px;border:1px solid #25364d;border-radius:24px;background:#111f34;box-shadow:0 24px 80px #0004}.mark{display:inline-block;color:#5eddec;letter-spacing:.15em;font-size:12px}h1{font-size:28px;line-height:1.2;margin:16px 0}p{color:#9badc8}label{display:block;font-size:14px;margin:24px 0 8px}input,button{width:100%;font:inherit;padding:12px;border-radius:10px}input{background:#080e1b;color:inherit;border:1px solid #52647d}button{margin-top:18px;border:0;background:#65e1e8;color:#05202a;font-weight:700;cursor:pointer}a{color:#65e1e8}.status{color:#ffd49a}</style></head><body><main><span class="mark">YORPHIVES · PRIVATE HEADQUARTERS</span><h1>${signedIn ? 'End your owner session?' : 'Your company. Your control.'}</h1><p>${signedIn ? 'You can sign in again with your owner password.' : 'Sign in to your self-hosted workspace.'}</p>${message ? `<p class="status" role="status">${escapeHTML(message)}</p>` : ''}<form action="${signedIn ? '/auth/logout' : '/auth/login'}" method="post">${signedIn ? '' : '<label for="password">Owner password</label><input id="password" type="password" name="password" autocomplete="current-password" required maxlength="512" autofocus>'}<button type="submit">${signedIn ? 'Sign out' : 'Open Headquarters →'}</button></form>${signedIn ? '<p><a href="/admin/">Return to Headquarters</a></p>' : '<p>Your password is stored privately on your server. It is never sent to an external identity provider.</p>'}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
async function boundedBody(request, limit) {
  if (Number(request.headers['content-length'] || 0) > limit) { request.resume(); throw Object.assign(new Error('Request is too large.'), { status: 413 }); }
  return new Promise((resolveBody, reject) => {
    let size = 0, chunks = [], finished = false;
    request.on('data', chunk => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) { finished = true; chunks = []; reject(Object.assign(new Error('Request is too large.'), { status: 413 })); }
      else chunks.push(chunk);
    });
    request.on('end', () => { if (!finished) { finished = true; resolveBody(Buffer.concat(chunks)); } });
    request.on('error', error => { if (!finished) { finished = true; reject(error); } });
  });
}
function cookieToken(header) {
  const match = String(header || '').match(/(?:^|;\s*)yorphives_owner=([a-f0-9]{64})(?:;|$)/);
  return match?.[1];
}
function noIntegration(message = 'This integration has not been connected to your self-hosted runtime.') {
  return adminJson({ error: { code: 'SELF_HOST_INTEGRATION_UNAVAILABLE', message }, production_allowed: false }, 503);
}

/** Start the real private application with a separate local SQLite database. */
export async function createHeadquartersServer({
  password, ownerEmail = 'owner@localhost', hostname = '127.0.0.1', port = 0,
  dataDirectory = resolve(ROOT, 'self-host/data'), publicOrigin,
  env: extraEnvironment = {}, createMissionEngine, enableObservationSchedule = false
} = {}) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 512) throw new Error('An owner password of 16–512 characters is required. Run node self-host/setup.mjs.');
  if (!/^[^\s@]+@[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 160) throw new Error('Provide a valid private owner identity.');
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(hostname);
  if (!loopback && !publicOrigin) throw new Error('Remote binding requires an explicit HTTPS publicOrigin behind your own reverse proxy.');
  let origin = publicOrigin ? new URL(publicOrigin) : null;
  if (origin && (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !['http:', 'https:'].includes(origin.protocol))) throw new Error('publicOrigin must be an HTTP(S) origin without path, credentials or parameters.');
  if (!loopback && origin?.protocol !== 'https:') throw new Error('Remote access requires HTTPS at your reverse proxy.');
  const db = await createDatabase({ filename: resolve(dataDirectory, 'headquarters.sqlite') });
  const env = { ...extraEnvironment, DB: db, ADMIN_ALLOWED_EMAILS: ownerEmail,
    // Match the local owner for readiness reads. No sender, OTP flag, assistant
    // identity or mail transport is configured by this reference identity.
    FOUNDER_OWNER_EMAIL: extraEnvironment.FOUNDER_OWNER_EMAIL || ownerEmail };
  if (createMissionEngine) env.HQ_ENGINE_SERVICE = await createMissionEngine({ db });
  const observations = enableObservationSchedule ? createObservationScheduler({ db }) : null;
  if (observations) await observations.runOnce();
  const salt = randomBytes(32), expectedPassword = scryptSync(password, salt, 32);
  const sessions = new Map(), failures = new Map(), modules = new Map();
  const routes = new Set((await readdir(API_ROOT)).filter(name => /^[a-z][a-z-]+\.ts$/.test(name)).map(name => name.slice(0, -3)));
  function session(request) {
    const token = cookieToken(request.headers.cookie);
    const expires = token && sessions.get(token);
    if (expires && expires > Date.now()) return { email: ownerEmail, authenticatedAt: Math.floor((expires - SESSION_TTL) / 1000), expiresAt: Math.floor(expires / 1000) };
    if (token) sessions.delete(token);
    return null;
  }
  async function asset(pathname) {
    if (pathname === '/runtime/session.js') return new Response(await readFile(new URL('./session.js', import.meta.url)), { headers: { 'content-type': MIME['.js'] } });
    const isAdmin = pathname.startsWith('/admin/'), isBrand = pathname.startsWith('/brand/');
    if (!isAdmin && !isBrand) return adminJson({ error: { message: 'Not found.' } }, 404);
    const extension = extname(pathname);
    if (!MIME[extension] || (extension === '.html' && pathname !== '/admin/index.html')) return adminJson({ error: { message: 'Not found.' } }, 404);
    const allowedRoot = resolve(ROOT, isAdmin ? 'admin' : 'brand');
    const candidate = resolve(ROOT, '.' + pathname);
    let handle;
    try {
      const actual = await realpath(candidate);
      if (!actual.startsWith(allowedRoot + sep) || !candidate.startsWith(allowedRoot + sep)) return adminJson({ error: { message: 'Not found.' } }, 404);
      // Check and read the same opened file. A path replacement cannot switch
      // the asset between the metadata check and the content read.
      handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.size > 2 * 1024 * 1024) return adminJson({ error: { message: 'Not found.' } }, 404);
      let content = await handle.readFile();
      if (pathname === '/admin/index.html') {
        content = content.toString('utf8').replace('<html lang="en">', '<html lang="en" data-runtime="self-hosted">')
          .replace('</body>', '<script src="/runtime/session.js" defer></script></body>');
      }
      return new Response(content, { headers: { 'content-type': MIME[extension] } });
    } catch { return adminJson({ error: { message: 'Not found.' } }, 404); }
    finally { if (handle) await handle.close(); }
  }
  async function handle(nodeRequest) {
    if (!origin || nodeRequest.headers.host !== origin.host) return adminJson({ error: { message: 'Unrecognized workspace host.' } }, 421);
    if (!nodeRequest.url?.startsWith('/') || nodeRequest.url.startsWith('//')) return adminJson({ error: { message: 'Invalid request path.' } }, 400);
    let url;
    try { url = new URL(nodeRequest.url, origin); decodeURIComponent(url.pathname); }
    catch { return adminJson({ error: { message: 'Invalid request path.' } }, 400); }
    const pathname = url.pathname;
    const method = nodeRequest.method || 'GET';
    const write = !['GET', 'HEAD'].includes(method);
    if (write && nodeRequest.headers.origin !== origin.origin) return adminJson({ error: { message: 'Use a same-origin owner request.' } }, 403);
    if (pathname === '/health' && !write) return adminJson({ service: 'YorpHives Headquarters', status: 'online' });
    if (pathname === '/auth/login') {
      if (method === 'GET') return session(nodeRequest) ? redirect('/admin/') : loginPage();
      if (method !== 'POST') return adminJson({ error: { message: 'Method not allowed.' } }, 405);
      const address = nodeRequest.socket.remoteAddress || 'unknown';
      const now = Date.now();
      for (const [key, item] of failures) if (item.until <= now) failures.delete(key);
      const attempts = failures.get(address) || { count: 0, until: now + 15 * 60 * 1000 };
      if (attempts.count >= 5) return new Response('Too many sign-in attempts. Try again after 15 minutes.', { status: 429, headers: { 'retry-after': String(Math.ceil((attempts.until - now) / 1000)) } });
      if (!String(nodeRequest.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return adminJson({ error: { message: 'Use the owner sign-in form.' } }, 415);
      const body = new URLSearchParams((await boundedBody(nodeRequest, 4096)).toString('utf8'));
      const provided = body.get('password') || '';
      const correct = provided.length <= 512 && timingSafeEqual(scryptSync(provided, salt, 32), expectedPassword);
      if (!correct) {
        if (failures.size >= 1000) failures.delete(failures.keys().next().value);
        failures.set(address, { ...attempts, count: attempts.count + 1 });
        const response = loginPage('That password was not accepted.');
        return new Response(response.body, { status: 401, headers: response.headers });
      }
      failures.delete(address);
      for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
      while (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, now + SESSION_TTL);
      const response = redirect('/admin/');
      response.headers.set('set-cookie', `yorphives_owner=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${origin.protocol === 'https:' ? '; Secure' : ''}`);
      return response;
    }
    const identity = session(nodeRequest);
    if (!identity) return pathname.startsWith('/api/') ? adminJson({ error: { code: 'ADMIN_AUTH_REQUIRED', message: 'Sign in to your private Headquarters.' } }, 401) : redirect('/auth/login');
    if (pathname === '/auth/logout') {
      if (method === 'GET') return loginPage('', true);
      if (method !== 'POST') return adminJson({ error: { message: 'Method not allowed.' } }, 405);
      sessions.delete(cookieToken(nodeRequest.headers.cookie));
      const response = redirect('/auth/login');
      response.headers.set('set-cookie', `yorphives_owner=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${origin.protocol === 'https:' ? '; Secure' : ''}`);
      return response;
    }
    if (pathname === '/api/admin/runtime-status' && !write) return adminJson({ runtime: 'self-hosted', storage: 'private_sqlite', owner: identity.email, inference_configured: Boolean(env.HQ_ENGINE_SERVICE), scheduled_workers: Boolean(observations), observation_schedule: observations?.status() || null, production_execution_enabled: false });
    const match = /^\/api\/admin\/([a-z][a-z-]+)$/.exec(pathname);
    if (match && routes.has(match[1])) {
      // Credentials and host-specific auth headers are never forwarded into the
      // application. Identity is attached to this exact Request in memory.
      const headers = new Headers();
      for (const name of ['accept', 'content-type', 'origin']) if (nodeRequest.headers[name]) headers.set(name, String(nodeRequest.headers[name]));
      const body = write ? await boundedBody(nodeRequest, 24000) : undefined;
      const request = new Request(url, { method, headers, ...(body?.length ? { body } : {}) });
      authorizeOwnerRequest(request, identity);
      if (!modules.has(match[1])) modules.set(match[1], import(new URL(`../functions/api/admin/${match[1]}.ts`, import.meta.url)));
      const route = await modules.get(match[1]);
      const handler = route['onRequest' + (method === 'HEAD' ? 'Get' : method[0] + method.slice(1).toLowerCase())];
      if (!handler) return adminJson({ error: { message: 'Method not allowed.' } }, 405);
      return handler({ request, env, params: {}, waitUntil: () => {} });
    }
    if (pathname.startsWith('/api/admin/step-up/') || pathname === '/api/admin/assistant-actions') return noIntegration('Assistant connections and independent release approvals are not configured in this self-hosted installation.');
    if (pathname === '/' || pathname === '/admin' || pathname === '/admin/') return asset('/admin/index.html');
    if (write) return adminJson({ error: { message: 'Not found.' } }, 404);
    return asset(pathname);
  }
  const server = createServer(async (request, outgoing) => {
    try {
      const response = await handle(request);
      const headers = { ...SECURITY_HEADERS, ...Object.fromEntries(response.headers) };
      outgoing.writeHead(response.status, headers);
      if (request.method === 'HEAD') outgoing.end();
      else outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (outgoing.headersSent) { outgoing.destroy(); return; }
      const status = error.status === 413 ? 413 : 503;
      outgoing.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
      outgoing.end(JSON.stringify({ error: { code: status === 413 ? 'REQUEST_TOO_LARGE' : 'SELF_HOST_OPERATION_UNAVAILABLE', message: status === 413 ? 'Request exceeds the permitted size.' : 'This operation is unavailable. Check the local runtime log and configured integrations.' } }));
      if (status !== 413) console.error('Headquarters operation failed:', error.code || error.name || 'Error', String(error.message).replace(/[\r\n]/g, ' ').slice(0, 180));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, hostname, resolveListen); });
    if (!origin) origin = new URL(`http://${hostname.includes(':') ? '[' + hostname + ']' : hostname}:${server.address().port}`);
  } catch (error) { if (observations) await observations.close(); if (env.HQ_ENGINE_SERVICE?.close) await env.HQ_ENGINE_SERVICE.close(); db.close(); throw error; }
  return {
    server, db, env, origin: origin.origin,
    async close() {
      sessions.clear();
      // Stop accepting requests before shutting down workers and their storage.
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
      if (observations) await observations.close();
      if (env.HQ_ENGINE_SERVICE?.close) await env.HQ_ENGINE_SERVICE.close();
      db.close();
    }
  };
}
