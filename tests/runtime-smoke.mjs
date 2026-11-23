// Staged runtime smoke test for hosts without Docker. Run npm run build first.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {pictureFixtures,picturePaths} from './newsletter-fixture.ts';
import {preconsentMail} from './preconsent-fixture.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const lines = readFileSync(join(root, 'Dockerfile'), 'utf8').split(/\r?\n/);
const stage = lines.slice(lines.findLastIndex(line => /^FROM\s/.test(line)) + 1);
const runtime = mkdtempSync(join(tmpdir(), 'shott-mail-runtime-'));
let server;
try {
  // Mirror the current final-stage COPY forms, not a separate list of TS files.
  for (const line of stage.filter(line => /^COPY\s/.test(line))) {
    const parts = line.trim().split(/\s+/).slice(1);
    const dest = parts.pop();
    const fromBuild = parts[0] === '--from=build';
    if (fromBuild) parts.shift();
    assert.ok(dest?.startsWith('./') && parts.length > 0, `Unsupported COPY: ${line}`);
    assert.ok(parts.length === 1 || dest.endsWith('/'), `Unsupported COPY: ${line}`);
    for (const src of parts) {
      assert.match(src, fromBuild ? /^\/app\/[\w./-]+$/ : /^[\w./-]+$/, `Unsupported COPY: ${line}`);
      const target = join(runtime, dest, ...(dest.endsWith('/') ? [src.split('/').at(-1)] : []));
      mkdirSync(dirname(target), {recursive: true});
      cpSync(join(root, fromBuild ? src.slice('/app/'.length) : src), target, {recursive: true});
    }
  }
  const install = stage.find(line => /^RUN npm ci /.test(line))?.match(/^RUN npm ci (.+) && npm cache clean --force$/);
  assert.ok(install, 'Update staging to match the Dockerfile runtime npm install');
  const installFlags = install[1].split(/\s+/);
  assert.deepEqual(installFlags, ['--omit=dev', '--ignore-scripts']);
  execFileSync('npm', ['ci', ...installFlags, '--offline', '--no-audit', '--no-fund'], {cwd: runtime, stdio: 'inherit'});

  const {parseMessage} = await import(pathToFileURL(join(runtime, 'src/server/inbox.ts')).href);
  const imageOrigin = 'https://images.example.test';
  const [picture, empty] = await Promise.all(pictureFixtures(imageOrigin).map(raw => parseMessage(Buffer.from(raw))));
  assert.deepEqual(picture.formatted?.images, picturePaths.map(path => imageOrigin + path));
  assert.equal(picture.formatted?.imageRejections, undefined);
  assert.deepEqual(empty.formatted?.images, []);
  assert.deepEqual(empty.formatted?.imageRejections, {missing:23});
  console.log('Staged runtime MIME: 23 selected picture URLs, 23 genuine missing sources.');
  const {formatted} = await parseMessage(Buffer.from(preconsentMail(imageOrigin)));
  assert.deepEqual(formatted.images, [imageOrigin+'/fixture-mark.png']);
  assert.match(formatted.markup, /data-p-background-color="#18263a"/);
  assert.match(formatted.markup, /<col data-p-width="48%"/);
  assert.match(formatted.markup, /<th scope="row">North array/);
  assert.doesNotMatch(formatted.markup, /https?:|url\(|<style|<link|\b(?:href|src|style)=/);
  console.log('Staged runtime MIME: preconsent colors, columns and row scope retained; only the consent image candidate retained.');

  const dbPath = join(runtime, 'data', 'app.sqlite');
  const key = randomBytes(32);
  const password = randomBytes(24).toString('base64url');
  for (const dir of ['data', 'secrets']) mkdirSync(join(runtime, dir), {mode: 0o700});
  writeFileSync(join(runtime, 'secrets/key'), key, {mode: 0o600});
  writeFileSync(join(runtime, 'secrets/login'), `${password}\n`, {mode: 0o600});
  const {Store} = await import(pathToFileURL(join(runtime, 'src/server/store.ts')).href);
  const fixture = new Store(dbPath, key, password);
  try {
    const owner = fixture.db.prepare('SELECT id FROM users WHERE login = ?').get('admin').id;
    fixture.putAccount(owner, 'smoke', {label: 'Synthetic runtime smoke', address: 'smoke@example.test'}, {imap: 'unused', smtp: 'unused'});
  } finally {
    fixture.close();
  }
  const before = readFileSync(dbPath);

  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const {port} = listener.address();
  await new Promise((done, fail) => listener.close(error => error ? fail(error) : done()));
  const origin = `http://127.0.0.1:${port}`;
  const env = {NODE_ENV: 'production', MAIL_MODE: 'disabled', REQUIRE_EXISTING_DB: 'yes',
    BIND_HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin};
  const command = prefix => {
    const line = stage.find(line => line.startsWith(prefix));
    assert.ok(line, `Missing ${prefix.trim()} in final stage`);
    const [node, ...args] = JSON.parse(line.slice(line.indexOf('[')));
    assert.equal(node, 'node');
    return args;
  };
  server = spawn(process.execPath, command('CMD '), {cwd: runtime, env});
  let log = '';
  let exited = false;
  const closed = new Promise(done => server.once('close', () => { exited = true; done(); }));
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log += chunk; });
  server.on('error', error => { log += String(error); });
  try {
    const deadline = Date.now() + 10_000;
    while (!exited && !log.includes('Shott Mail gestart.') && Date.now() < deadline) await delay(50);
    assert.ok(!exited && log.includes('Shott Mail gestart.'), `Packaged server failed to start:\n${log}`);
    execFileSync(process.execPath, command('HEALTHCHECK '), {cwd: runtime, env, timeout: 5000, stdio: 'inherit'});
    const page = await fetch(origin, {signal: AbortSignal.timeout(4000)});
    assert.equal(page.status, 200);
    assert.equal(await page.text(), readFileSync(join(runtime, 'dist/client/index.html'), 'utf8'));
    const health = await fetch(origin+'/health');
    assert.equal(page.headers.get('content-security-policy'),health.headers.get('content-security-policy').replace("frame-src 'none'",`frame-src ${origin}/api/reader/document`));
    const document = await fetch(origin+'/api/reader/document');
    assert.equal(document.status,401);
    assert.equal(document.headers.get('content-security-policy'),"sandbox; default-src 'none'; style-src https: 'unsafe-inline'; img-src https:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    assert.equal(document.headers.get('cache-control'),'no-store');
    assert.equal(document.headers.get('referrer-policy'),'no-referrer');
    console.log('Staged runtime reader: exact route policy and unauthenticated rejection passed.');
  } finally {
    if (!exited) {
      server.kill('SIGTERM');
      const watchdog = setTimeout(() => server.kill('SIGKILL'), 3000);
      try { await closed; } finally { clearTimeout(watchdog); }
    }
  }
  const after = new DatabaseSync(dbPath, {readOnly: true});
  try {
    assert.equal(after.prepare('SELECT id FROM mailboxes').get()?.id, 'smoke');
  } finally {
    after.close();
  }
  assert.deepEqual(readFileSync(dbPath), before, 'Startup changed the existing synthetic database');
  console.log('Staged runtime: CMD started, HEALTHCHECK and built index passed, existing synthetic DB unchanged.');
} finally {
  rmSync(runtime, {force: true, recursive: true});
}
