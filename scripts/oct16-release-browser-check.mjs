// Runs against a local Vite server. All external HTTP and WebSocket traffic is
// intercepted: these scenarios never create real users, orders, payments or SMS.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.RELEASE_TEST_ORIGIN || 'http://127.0.0.1:4179';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const browser = await chromium.launch({ headless: true, channel: process.env.RELEASE_TEST_BROWSER_CHANNEL || undefined });
let server;
if (process.env.RELEASE_TEST_SERVE_DIST === '1') {
  const root = resolve('dist');
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  server = createServer(async (request, response) => {
    const target = resolve(root, '.' + decodeURIComponent(new URL(request.url, origin).pathname));
    if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', mime[extname(target)] || 'text/html'); response.end(await readFile(target)); }
    catch { response.setHeader('Content-Type', 'text/html'); response.end(await readFile(resolve(root, 'index.html'))); }
  });
  await new Promise(resolveListening => server.listen(Number(new URL(origin).port), '127.0.0.1', resolveListening));
}
const product = {
  id: '20000000-0000-4000-8000-000000000001', name: 'QA Burger',
  price: 11.5, category: 'Burgers', description: 'Fictional browser fixture',
  is_available: true, is_visible: true, stock_count: null, is_featured: false,
};
const localCart = [{ product, quantity: 1, selectedModifiers: [], removedIngredients: [], totalPrice: 11.5 }];
const userId = '10000000-0000-4000-8000-000000000001';
const orderId = '30000000-0000-4000-8000-000000000001';
const session = (anonymous = false) => {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: anonymous,
    email: anonymous ? '' : 'browser-fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', is_anonymous: anonymous, exp: now + 3600 })).toString('base64url'), 'fixture-only'].join('.');
  return { access_token: token, refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
};

async function scenario(options, run) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  assert.equal(typeof context.routeWebSocket, 'function', 'WebSocket interception required to isolate this test');
  await context.routeWebSocket(/.*/, socket => socket.close());
  const events = [];
  const errors = [];
  let storeOpen = false;
  let settingWrites = 0;
  let authSession = options.identity ? session(options.identity === 'guest') : null;
  await context.addInitScript(({ authSession, localCart }) => {
    if (authSession) localStorage.setItem('sb-svbilfaanpiyieyxbsss-auth-token', JSON.stringify(authSession));
    localStorage.setItem('street-eats-guest-session', 'browser-fixture');
    localStorage.setItem('street-eats-cart-browser-fixture', JSON.stringify(localCart));
  }, { authSession, localCart: options.invalidCart ? [null, {}] : options.identity && options.identity !== 'guest' ? [] : localCart });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.origin === origin) {
      if (url.pathname === '/qa-payment-provider') return route.fulfill({ contentType: 'text/html', body: '<h1>Mock payment provider</h1>' });
      return route.continue();
    }
    // Only the local application contacts the simulated backend. Everything
    // else is blocked, including analytics, images and third-party services.
    if (url.hostname !== 'svbilfaanpiyieyxbsss.supabase.co') return route.abort();
    events.push({ path: url.pathname, method, body: request.postDataJSON(), authorization: request.headers().authorization });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/signup') {
      if (options.anonymousDisabled) return json({ msg: 'Anonymous sign-ins are disabled', code: 'anonymous_provider_disabled' }, 422);
      if (options.authDelay) await new Promise(resolve => setTimeout(resolve, options.authDelay));
      authSession = session(true);
      return json(authSession);
    }
    if (url.pathname === '/auth/v1/user') return json(authSession?.user);
    if (url.pathname === '/rest/v1/rpc/has_role') return json(options.identity === 'admin');
    if (url.pathname === '/rest/v1/rpc/get_store_status') {
      if (options.confirmationFails && settingWrites) return json({ message: 'simulated read failure' }, 503);
      return json({ is_open: options.staff ? storeOpen : true, accepting_orders: options.staff ? storeOpen : true,
        wait_time: '20 mins', message: storeOpen ? 'Open now' : 'Closed', checked_at: new Date().toISOString() });
    }
    if (url.pathname === '/rest/v1/app_settings') {
      if (method === 'PATCH' && options.staffWriteFails) return json({ message: 'JWT expired', code: 'PGRST301' }, 401);
      if (method === 'PATCH') { settingWrites++; storeOpen = request.postDataJSON().is_store_open; }
      return json({ id: 1, is_store_open: storeOpen, current_wait_time: '20 mins', updated_at: new Date().toISOString(),
        online_payments_enabled: true, pay_on_collection_enabled: false, preorders_enabled: false, loyalty_enabled: false });
    }
    if (url.pathname === '/rest/v1/products') return json([product]);
    if (url.pathname === '/rest/v1/profiles') return json(options.identity === 'admin' ? { full_name: 'Fixture operator', phone: null } : null);
    if (url.pathname === '/rest/v1/cart_items') {
      assert.equal(method, 'GET', 'guest authentication must not start a cart migration');
      return json(options.identity === 'customer' ? [{ id: 'cart-fixture', product_id: product.id, quantity: 1,
        selected_modifiers: [], removed_ingredients: [], products: product }] : []);
    }
    if (url.pathname === '/rest/v1/orders') {
      if (method === 'POST') {
        assert.equal(request.postDataJSON().total, 11.5);
        assert.equal(request.postDataJSON().user_id, userId);
        return json({ id: orderId, display_id: 99999, created_at: new Date().toISOString() }, 201);
      }
      return json(url.searchParams.get('select') === 'id' ? { id: orderId } : []);
    }
    if (url.pathname === '/rest/v1/order_items' && method === 'POST') return json(null, 201);
    if (url.pathname === '/functions/v1/payment-session') {
      assert.equal(request.postDataJSON().order_id, orderId);
      assert.equal(request.postDataJSON().payment_type, 'online');
      assert.equal(request.postDataJSON().customer_email, 'browser-fixture@example.invalid');
      if (options.paymentDelay) await new Promise(resolve => setTimeout(resolve, options.paymentDelay));
      return options.paymentFails ? json({ error: 'Simulated payment failure' }, 503)
        : json({ success: true, paymentUrl: origin + '/qa-payment-provider' });
    }
    assert.equal(method, 'GET', 'Unexpected write in browser check: ' + url.pathname);
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try { await run(page, events); assert.deepEqual(errors, [], 'Uncaught browser errors'); }
  finally { await context.close(); }
}

async function checkout(page) {
  await page.goto(origin + '/cart');
  await page.getByRole('button', { name: /proceed to checkout|checkout/i }).click();
  await page.locator('#name').fill('Browser Fixture');
  await page.locator('#phone').fill('+353850000000');
  await page.locator('#email').fill('browser-fixture@example.invalid');
  await page.getByRole('button', { name: /continue to payment/i }).click();
}

const results = [];
try {
  await scenario({ identity: 'guest' }, async page => {
    await page.goto(origin + '/auth');
    await page.getByRole('button', { name: 'Sign In', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/auth');
    await page.getByRole('button', { name: /don't have an account/i }).click();
    await page.getByRole('button', { name: 'Create Account', exact: true }).waitFor();
  }); results.push('guest can reach login and signup');

  await scenario({ identity: 'customer' }, async page => {
    await page.goto(origin + '/auth');
    await page.waitForURL('**/menu');
  }); results.push('registered account keeps existing redirect');

  await scenario({}, async page => {
    await page.goto(origin + '/cart');
    await page.getByText('QA Burger', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('QA Burger', { exact: true }).waitFor();
  }); results.push('signed-out basket survives reload');

  await scenario({ invalidCart: true }, async page => {
    await page.goto(origin + '/cart');
    await page.getByText('YOUR CART IS EMPTY', { exact: true }).waitFor();
  }); results.push('damaged saved basket does not crash the app');

  await scenario({ anonymousDisabled: true }, async (page, events) => {
    await checkout(page);
    await page.getByRole('button', { name: /pay card/i }).click();
    await page.getByText("We couldn't start your order. Please refresh the page and try again.", { exact: true }).first().waitFor();
    assert.equal(events.filter(e => e.path === '/rest/v1/orders' && e.method === 'POST').length, 0);
  }); results.push('disabled guest auth fails visibly without order');

  await scenario({ authDelay: 700, paymentDelay: 6000 }, async (page, events) => {
    await checkout(page);
    await page.getByRole('button', { name: /pay card/i }).dblclick();
    await page.waitForURL('**/qa-payment-provider');
    assert.equal(events.filter(e => e.path === '/auth/v1/signup').length, 1);
    assert.equal(events.filter(e => e.path === '/rest/v1/orders' && e.method === 'POST').length, 1);
    assert.equal(events.filter(e => e.path === '/rest/v1/order_items' && e.method === 'POST').length, 1);
    assert.equal(events.filter(e => e.path === '/functions/v1/payment-session').length, 1);
    assert.equal(events.filter(e => e.path === '/rest/v1/cart_items' && e.method !== 'GET').length, 0);
  }); results.push('guest double tap and slow payment create one order with preserved total');

  await scenario({ identity: 'customer' }, async (page, events) => {
    await checkout(page);
    assert.equal(await page.getByRole('button', { name: /pay on collection/i }).count(), 0);
    await page.getByRole('button', { name: /pay card/i }).click();
    await page.waitForURL('**/qa-payment-provider');
    assert.equal(events.filter(e => e.path === '/auth/v1/signup').length, 0);
    assert.equal(events.filter(e => e.path === '/rest/v1/orders' && e.method === 'POST').length, 1);
  }); results.push('registered customer checkout reuses identity and respects card-only setting');

  await scenario({ identity: 'guest' }, async (page, events) => {
    await page.goto(origin + '/admin/dashboard');
    await page.waitForURL(url => ['/menu', '/auth'].includes(url.pathname));
    assert.equal(await page.getByRole('button', { name: 'CLOSED', exact: true }).count(), 0);
    assert.equal(events.filter(e => e.method === 'PATCH').length, 0);
  }); results.push('anonymous guest cannot enter staff controls');

  await scenario({ staff: true, identity: 'admin' }, async page => {
    await page.goto(origin + '/admin/dashboard');
    await page.getByRole('button', { name: 'CLOSED', exact: true }).click();
    await page.getByText('Store is OPEN — customers can order', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'OPEN', exact: true }).click();
    await page.getByText('Store is CLOSED — online ordering stopped', { exact: true }).waitFor();
  }); results.push('staff open and close require server confirmation');

  await scenario({ staff: true, identity: 'admin', confirmationFails: true }, async page => {
    await page.goto(origin + '/admin/dashboard');
    await page.getByRole('button', { name: 'CLOSED', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Store opening NOT confirmed' }).waitFor();
    assert.equal(await page.getByText('Store is OPEN — customers can order', { exact: true }).count(), 0);
  }); results.push('failed staff confirmation shows persistent error without success');

  await scenario({ staff: true, identity: 'admin', staffWriteFails: true }, async page => {
    await page.goto(origin + '/admin/dashboard');
    await page.getByRole('button', { name: 'CLOSED', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Store NOT opened' }).waitFor();
    assert.equal(await page.getByText('Store is OPEN — customers can order', { exact: true }).count(), 0);
  }); results.push('expired staff write fails visibly without success');
  console.log(JSON.stringify({ passed: results.length, results, backend: 'all requests intercepted; no live writes' }, null, 2));
} finally { await browser.close(); if (server) await new Promise(resolveClosed => server.close(resolveClosed)); }
