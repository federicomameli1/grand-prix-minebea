// Regressione browser senza dipendenze aggiuntive: node tools/checks/features.mjs [percorso Chromium]
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { sanitizeName, finishName, escapeHtml, NAME_KEYS, MAX_NAME_LENGTH } from '../../src/names.js';

assert.equal(sanitizeName('Zoë <A>'), 'Zoë A');
assert.equal(finishName('   ', 'Giocatore 1'), 'Giocatore 1');
assert.equal(finishName('  Anna   Maria ', 'G1'), 'Anna Maria');
assert.equal([...sanitizeName('ABCDEFGHIJKLMNOPQRSTUVWXYZ')].length, MAX_NAME_LENGTH);
assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
assert.equal(NAME_KEYS.length, 40);

const browserPath = process.argv[2] || [

  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(p => existsSync(p));
assert.ok(browserPath, 'Passare il percorso di un browser Chromium come primo argomento');
const root = resolve(import.meta.dirname, '../..');
const profile = await mkdtemp(join(tmpdir(), 'gpf-check-'));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser, socket, closeBrowser;
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  await server.listen(); console.log('Server di test avviato');
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720',
    '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', url], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.resume();
  let endpoint;
  for (let i = 0; i < 100 && !endpoint; i++) {
    try {
      const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      endpoint = `ws://127.0.0.1:${port}${path}`;
    } catch { await sleep(200); }
  }
  assert.ok(endpoint, 'Browser avviato con remote debugging');
  console.log('Browser di test avviato');
  const pages = await fetch(`http://${new URL(endpoint).host}/json/list`).then(r => r.json());
  const page = pages.find(p => p.type === 'page' && p.url.startsWith(url)) || pages.find(p => p.type === 'page');
  console.log('Pagina test:', page?.url);
  assert.ok(page, 'Pagina Chromium disponibile');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  console.log('Debugger collegato');
  let seq = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout CDP: ${method}`)); }, 15000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  closeBrowser = () => send('Browser.close');
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 12000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression)) { console.log(`OK: ${label}`); return; } await sleep(80); }
    throw new Error(`Timeout: ${label}; stato=${await evaluate('window.__dbg?.mode')}; errori=${JSON.stringify(errors)}`);
  };
  const key = async (code, value = code) => {
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {code:${JSON.stringify(code)},key:${JSON.stringify(value)},bubbles:true}))`);
    await sleep(140);
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', {code:${JSON.stringify(code)},key:${JSON.stringify(value)},bubbles:true}))`);
    await sleep(140);
  };
  await send('Runtime.enable');
  if (!page.url.startsWith(url)) await send('Page.navigate', { url });
  await waitFor('window.__dbg?.mode === "attract"', 'avvio', 30000);
  assert.equal(await evaluate('__dbg.track.hw'), 6);
  assert.ok(await evaluate('__dbg.items.boxes.length > 0'));
  assert.equal(await evaluate('__dbg.nameplates.labels.length'), 0);
  const bonusChecks = await evaluate(`(async () => {
    const { ItemBoxes } = await import('/src/items.js');
    const { Kart, hitObstacles, collide } = await import('/src/kart.js');
    const d = __dbg, scene = new d.THREE.Scene(), items = new ItemBoxes(scene, d.track);
    const box = items.boxes[0], random = Math.random;
    const fake = () => ({prog:box.s,d:box.d,y:d.track.height(box.s),pos:new d.THREE.Vector3(),boostT:0,shieldT:0});
    const checks = [];
    try {
      Math.random = () => 0;
      const turbo = fake();
      checks.push(items.update(0,0,[turbo])[0]?.type === 'turbo' && turbo.boostT === 2.4);
      items.reset(); Math.random = () => 0.9;
      const shield = fake();
      checks.push(items.update(0,0,[shield])[0]?.type === 'shield' && shield.shieldT === 5);
      items.reset();
      checks.push(items.update(0,0,[{...fake(),finished:true}]).length === 0);
      checks.push(items.update(0,0,[{...fake(),y:box.y+10}]).length === 0);
      const sweep = {...fake(),prog:box.s-4}; items.update(0,0,[sweep]);
      sweep.prog = box.s+4;
      checks.push(items.update(0.1,0.1,[sweep]).length === 1);
      items.update(7,7,[]); checks.push(items.boxes[0].active);
      items.setVisible(false); checks.push(items.update(0,0,[fake()]).length === 0);
      const k = new Kart(scene,d.track,{vehicle:'muletto',color:'blu',human:true,name:'TEST'});
      k.shieldT = 0.05; k.step(0.1,{steer:0,brake:true}); checks.push(k.shieldT===0 && !k.shield.visible);
      const obstacle = d.track.obstacles.find(o=>o.type==='pallet');
      k.place(obstacle.s,obstacle.d); k.shieldT=5; k.v=10; hitObstacles([k],d.track);
      checks.push(k.v===10 && !k.bumped);
      const other = new Kart(scene,d.track,{vehicle:'muletto',color:'rosso',name:'CPU'});
      other.place(k.prog+0.1,k.d); const before=k.prog; collide([k,other],d.track); checks.push(k.prog===before);
      k.respawn(); checks.push(k.shieldT===0 && !k.shield.visible);
      k.dispose(); other.dispose();
    } finally { Math.random=random; items.dispose(); }
    return checks;
  })()`);
  assert.ok(bonusChecks.every(Boolean), `Bonus: ${JSON.stringify(bonusChecks)}`);
  console.log('OK: turbo/scudo, quota, raccolta swept, rigenerazione, immunità e reset');
  await key('Enter', 'Enter');
  await waitFor('__dbg.mode === "select"', 'selezione');
  await key('Enter', 'Enter');
  await waitFor('__dbg.mode === "names"', 'nome prima della gara');
  for (const char of 'Zoë <A>') await key('Key' + char.toUpperCase(), char);
  assert.equal(await evaluate('__dbg.players[0].name'), 'Zoë A');
  await key('Enter', 'Enter');
  await waitFor('__dbg.mode === "intro"', 'intro');
  assert.equal(await evaluate('__dbg.players[0].kart.name'), 'Zoë A');
  assert.equal(await evaluate('__dbg.nameplates.labels.length'), 1);
  assert.ok(await evaluate('__dbg.nameplates.labels.every(l => l.kart.human && l.sprite.material.opacity < 1 && l.sprite.material.transparent && !l.sprite.material.depthWrite)'));
  await sleep(700); await key('Enter', 'Enter');
  await waitFor('__dbg.mode === "race"', 'partenza');
  // Solo l'umano al box; CPU e bonus casuali non devono rendere il controllo instabile.
  await evaluate(`(() => { const d=__dbg, k=d.players[0].kart, b=d.items.boxes[0]; d.karts.filter(q=>!q.human).forEach(q=>q.static=true); k.place(b.s,b.d); })()`);
  await waitFor('__dbg.items.boxes[0].cooldown > 0', 'raccolta scatola');
  assert.ok(await evaluate('__dbg.players[0].kart.boostT > 0 || __dbg.players[0].kart.shieldT > 0'));
  assert.ok(await evaluate('__dbg.nameplates.labels[0].sprite.visible'));
  await evaluate(`document.querySelector('[name="toAttract"]').click()`);
  await waitFor('__dbg.mode === "attract"', 'ritorno al titolo');
  assert.ok(await evaluate('__dbg.items.boxes.every(b => b.active && b.cooldown === 0)'));
  assert.equal(await evaluate('__dbg.nameplates.labels.length'), 0);
  // Due tastiere: ogni giocatore sceglie un nome, niente iniziali richieste al traguardo.
  await key('Enter', 'Enter'); await key('Space', ' ');
  assert.equal(await evaluate('__dbg.players.length'), 2);
  await key('Enter', 'Enter'); await key('Space', ' ');
  await waitFor('__dbg.mode === "names"', 'nomi in due');
  for (const char of 'Anna') await key('Key' + char.toUpperCase(), char);
  await key('Enter', 'Enter');
  assert.equal(await evaluate('__dbg.mode'), 'names');
  assert.ok(await evaluate('document.querySelector(".name-entry header").textContent.includes("2/2")'));
  await key('Enter', 'Enter'); // Nome vuoto: fallback localizzato.
  await waitFor('__dbg.mode === "intro"', 'intro split-screen');
  assert.deepEqual(await evaluate('__dbg.players.map(p=>p.kart.name)'), ['Anna', 'Giocatore 2']);
  assert.equal(await evaluate('__dbg.nameplates.labels.length'), 2);
  await sleep(700); await key('Enter', 'Enter');
  await waitFor('__dbg.mode === "race"', 'gara in due');
  assert.equal(await evaluate('document.querySelectorAll(".view").length'), 2);
  if (process.env.GPF_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.GPF_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`__dbg.players.forEach(p=>{p.kart.prog=3*__dbg.track.L+1})`);
  await waitFor('__dbg.mode === "replay" || __dbg.mode === "podium"', 'arrivo');
  if (await evaluate('__dbg.mode === "replay"')) { await sleep(900); await key('Enter', 'Enter'); }
  await waitFor('__dbg.mode === "podium"', 'podio');
  assert.ok(await evaluate('document.querySelector(".podium").textContent.includes("Anna")'));
  await waitFor('__dbg.mode === "board"', 'classifica senza iniziali');
  assert.ok(await evaluate('JSON.parse(localStorage.getItem("gpf_leaderboard_v1")).some(e=>e.name==="Anna")'));
  // Pad simulato: tastiera a schermo, conferma e sostituzione del controller scollegato.
  await evaluate(`document.querySelector('[name="toAttract"]').click(); window.testPads=[{index:0,connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))}]; Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>testPads});`);
  const button = async (index, pad = 0) => {
    await evaluate(`testPads[${pad}].buttons[${index}].pressed=true`); await sleep(200);
    await evaluate(`testPads[${pad}].buttons[${index}].pressed=false`); await sleep(200);
  };
  await button(9); await button(0);
  await waitFor('__dbg.mode === "names"', 'nome con gamepad');
  await button(0); // A sulla lettera A.
  assert.equal(await evaluate('__dbg.players[0].name'), 'A');
  await button(1); assert.equal(await evaluate('__dbg.players[0].name'), '');
  await button(15); await button(0); assert.equal(await evaluate('__dbg.players[0].name'), 'B');
  await evaluate('testPads[0]=null; testPads[1]={index:1,connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))}');
  await button(9,1); assert.equal(await evaluate('__dbg.players[0].dev'), 'gp1');
  await button(9,1); await waitFor('__dbg.mode === "intro"', 'conferma nome col nuovo pad');
  assert.equal(await evaluate('__dbg.players[0].kart.name'), 'B');
  assert.deepEqual(errors, []);
  console.log('PASS: nomi, etichette umane trasparenti, pista 12 m, scatole, reset, split-screen, podio/classifica e gamepad');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (closeBrowser) await closeBrowser().catch(() => {});
  socket?.close();
  browser?.stderr.destroy();
  if (browser && browser.exitCode === null) {
    const closed = new Promise(resolve => browser.once('exit', resolve));
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { browser.kill(); }
    } else browser.kill();
    await Promise.race([closed, sleep(3000)]);
  }
  server.httpServer?.closeAllConnections();
  await server.close(); console.log('Server di test chiuso');
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
}
