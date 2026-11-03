import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';
import { MAP_POOL, mapPreviewPath } from '../src/MapCatalog.js';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function observe(ws) {
  const messages = [];
  const pending = new Set();
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    messages.push(msg);
    for (const check of [...pending]) check();
  });
  return function waitFor(predicate, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const result = messages.find(predicate);
        if (result) { clearTimeout(timer); pending.delete(check); resolve(result); }
      };
      const timer = setTimeout(() => { pending.delete(check); reject(new Error('Timed out waiting for server message')); }, timeout);
      pending.add(check); check();
    });
  };
}

test('map catalog has a JPEG preview for every unique map', async () => {
  assert.equal(new Set(MAP_POOL).size, MAP_POOL.length);
  assert.equal(mapPreviewPath('../../index'), null);
  for (const name of MAP_POOL) {
    const path = `.${mapPreviewPath(name)}`;
    const data = await readFile(path);
    assert.deepEqual([...data.subarray(0, 3)], [0xff, 0xd8, 0xff], name);
    assert.ok((await stat(path)).size < 300_000, name);
  }
});

test('server accepts one known map vote per joined player and starts that map', { timeout: 25000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    server.stdout.on('data', data => {
      if (data.toString().includes('HTTP + WebSocket listening')) { clearTimeout(timer); resolve(); }
    });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
  });
  const response = await fetch(`http://127.0.0.1:${port}${mapPreviewPath('Onyx')}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/jpeg/);

  const sockets = Array.from({ length: 3 }, () => new WebSocket(`ws://127.0.0.1:${port}`));
  t.after(() => sockets.forEach(ws => ws.terminate()));
  const [first, second, unjoined] = sockets;
  const wait = sockets.map(observe);
  await Promise.all(sockets.map(ws => once(ws, 'open')));
  first.send(JSON.stringify({ type: 'join' }));
  second.send(JSON.stringify({ type: 'join' }));
  const joined = await wait[0](m => m.type === 'joined');
  assert.equal(joined.health, 150);
  await wait[0](m => m.type === 'snapshot' && m.roundState === 'INTERMISSION');
  unjoined.send(JSON.stringify({ type: 'vote_map', map: 'Arena' }));
  first.send(JSON.stringify({ type: 'vote_map', map: 'not-a-map' }));
  first.send(JSON.stringify({ type: 'vote_map', map: 'Onyx' }));
  first.send(JSON.stringify({ type: 'vote_map', map: 'Arena' }));
  const voted = await wait[0](m => m.type === 'snapshot' && m.mapVotes.Onyx === 1);
  assert.equal(voted.mapVotes.Arena, 0);
  assert.equal(voted.mapVotes['not-a-map'], undefined);
  const active = await wait[0](m => m.type === 'snapshot' && m.roundState === 'ROUND_ACTIVE', 20000);
  assert.equal(active.currentMap, 'Onyx');
  assert.equal(active.mapVotes.Arena, 0);
  assert.equal(active.mapVotes.Onyx, 1);
});
