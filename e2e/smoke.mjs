/**
 * Real-browser acceptance tests (Milestone 1). Drives the built app in headless Chromium with
 * WebGL, using real mouse, keyboard, touch (CDP) and file events. No mocks.
 *
 *   npm run build && npm run test:e2e
 *
 * Needs Playwright. It is found locally, or in the global npm root. Set E2E_URL to test an
 * already-running server; otherwise `vite preview` is started on a free port.
 * Screenshots land in e2e/shots/.
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}
const { chromium } = loadPlaywright();

// ------------------------------------------------------------------ tiny test harness
const results = [];
let section = '';
const group = (name) => {
  section = name;
  console.log(`\n${name}`);
};
function check(name, ok, detail = '') {
  results.push({ section, name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? `\n      ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ server
let server = null;
async function startServer() {
  if (process.env.E2E_URL) return process.env.E2E_URL;
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Run `npm run build` first.');
  const port = 4300 + Math.floor(Math.random() * 400);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('preview server did not start');
}

// ------------------------------------------------------------------ main
const url = await startServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const snapshot = () =>
  page.evaluate(() => {
    const s = window.__mnemosyne.store.getState();
    const objs = Object.values(s.world.objects);
    return {
      id: s.world.id,
      name: s.world.name,
      size: s.world.size,
      terrain: s.world.generation.terrain,
      seed: s.world.generation.seed,
      customized: s.world.customized,
      buildings: objs.filter((o) => o.kind === 'building').map((b) => ({ id: b.id, type: b.type, x: b.x, z: b.z, rotation: b.rotation, variant: b.variant, colors: b.colors, name: b.name })),
      props: objs.filter((o) => o.kind === 'prop').length,
      creatures: objs.filter((o) => o.kind === 'character').length,
      tool: s.tool,
      selectedId: s.selectedId,
      saveStatus: s.saveStatus,
      past: s.history.past.length,
      future: s.history.future.length,
      generating: s.generating,
    };
  });
const cam = () => page.evaluate(() => ({ ...window.__mnemosyne.camera.cur, goal: { ...window.__mnemosyne.camera.goal } }));
const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout });
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const toastText = async () => (await page.locator('[data-testid=toast]').first().textContent({ timeout: 4000 }).catch(() => '')) ?? '';

async function boot() {
  await page.goto(url);
  await page.waitForSelector('canvas', { timeout: 30000 });
  await waitFor(() => !!window.__mnemosyne && window.__mnemosyne.store.getState().world.id !== 'world_bootstrap0000', null, 30000);
  await sleep(1200);
}

/** Candidate on-screen ground positions in a spiral around the view centre, clear of the UI chrome. */
async function candidates() {
  return page.evaluate(() => {
    const m = window.__mnemosyne;
    const c = m.camera.cur;
    const out = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (let r = 0; r <= 14; r += 2) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = c.x + Math.cos(ang) * r;
        const z = c.z + Math.sin(ang) * r;
        const p = m.project(x, z);
        if (p.x > 360 && p.x < W - 330 && p.y > 110 && p.y < H - 130) out.push({ x, z, px: p.x, py: p.y });
      }
    }
    return out;
  });
}

/** Hover candidates until the HUD says the active tool has room, then click. Returns true if placed. */
async function placeSomewhere(skipNear = []) {
  for (const c of await candidates()) {
    if (skipNear.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 4.5)) continue;
    await page.mouse.move(c.px, c.py);
    await sleep(160);
    const verdict = await page.locator('[data-testid=hover-chip] em.ok').count();
    if (verdict > 0) {
      const before = (await snapshot()).buildings.length;
      await page.mouse.click(c.px, c.py);
      await sleep(250);
      if ((await snapshot()).buildings.length === before + 1) return c;
    }
  }
  return null;
}

try {
  // ================================================================== R1 boot + rendering
  group('R1 boot and rendering');
  await boot();
  const s0 = await snapshot();
  check('app boots to a generated world with creatures and flora', s0.size === 72 && s0.props > 500 && s0.creatures >= 8, JSON.stringify({ size: s0.size, props: s0.props, creatures: s0.creatures }));
  const homeView = await page.evaluate(() => ({ ...window.__mnemosyne.camera.home }));
  const info0 = await page.evaluate(() => window.__mnemosyne.renderInfo());
  check('WebGL scene renders within the draw-call budget', info0.calls > 5 && info0.calls < 400, JSON.stringify(info0));
  check('terrain + flora + water all drawn (triangles > 10k)', info0.triangles > 10000, JSON.stringify(info0));
  await shot('01-boot');

  // ================================================================== C1 camera
  group('C1 camera: mouse, keyboard, buttons, touch');
  const canvasBox = await page.locator('canvas').boundingBox();
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2 + 40;
  let c0 = await cam();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -420);
  await sleep(300);
  let c1 = await cam();
  check('mouse wheel zooms in', c1.zoom > c0.zoom * 1.2, `${c0.zoom} -> ${c1.zoom}`);
  await page.mouse.wheel(0, 700);
  await sleep(300);
  const c2 = await cam();
  check('mouse wheel zooms out, clamped to bounds', c2.zoom < c1.zoom && c2.zoom >= 0.15, `${c1.zoom} -> ${c2.zoom}`);

  await page.evaluate(() => window.__mnemosyne.camera.setView({ x: 36, z: 36, zoom: 0.8, azimuth: Math.PI / 4 }, 72));
  await sleep(200);
  c0 = await cam();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx - i * 14, cy - i * 8);
  await page.mouse.up();
  await sleep(200);
  c1 = await cam();
  check('left-drag pans the map (and does not trigger a tool action)', Math.hypot(c1.x - c0.x, c1.z - c0.z) > 1, `${c0.x},${c0.z} -> ${c1.x},${c1.z}`);
  check('dragging did not edit the world', (await snapshot()).past === 0);

  c0 = await cam();
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 20, cy);
  await page.mouse.up({ button: 'right' });
  await sleep(200);
  c1 = await cam();
  check('right-drag rotates the view', Math.abs(c1.azimuth - c0.azimuth) > 0.2, `${c0.azimuth} -> ${c1.azimuth}`);
  await waitFor(() => Math.abs(window.__mnemosyne.camera.cur.azimuth - window.__mnemosyne.camera.goal.azimuth) < 0.01, null, 5000);
  const snapped = (await cam()).azimuth;
  const step = Math.PI / 2;
  check('rotation eases to a clean isometric angle', Math.abs(((snapped - Math.PI / 4) / step) - Math.round((snapped - Math.PI / 4) / step)) < 0.02, `azimuth ${snapped}`);

  c0 = await cam();
  await page.keyboard.press('e');
  await sleep(100);
  check('E key rotates a quarter turn', Math.abs((await cam()).goal.azimuth - c0.goal.azimuth - Math.PI / 2) < 0.01);
  await page.keyboard.press('q');
  await sleep(700);
  c0 = await cam();
  await page.keyboard.down('ArrowRight');
  await sleep(500);
  await page.keyboard.up('ArrowRight');
  c1 = await cam();
  check('arrow keys pan', Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.5, `${c0.x},${c0.z} -> ${c1.x},${c1.z}`);
  c0 = await cam();
  await page.keyboard.press('=');
  await sleep(100);
  check('+ key zooms', (await cam()).goal.zoom > c0.goal.zoom);

  c0 = await cam();
  await page.getByRole('button', { name: 'Rotate view right' }).click();
  check('rotate button works', (await cam()).goal.azimuth > c0.goal.azimuth + 1);
  c0 = await cam();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  check('zoom-out button works', (await cam()).goal.zoom < c0.goal.zoom);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await sleep(1500);
  const home = await page.evaluate(() => ({ cur: { ...window.__mnemosyne.camera.cur }, home: { ...window.__mnemosyne.camera.home } }));
  check('reset-view button returns to the home view', Math.abs(home.cur.x - home.home.x) < 0.1 && Math.abs(home.cur.zoom - home.home.zoom) < 0.02, JSON.stringify(home));

  // Touch via the DevTools protocol: real touch events -> pointer events.
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  c0 = await cam();
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx + i * 14, cy + i * 6]]);
  await touch('touchEnd', []);
  await sleep(250);
  c1 = await cam();
  check('one-finger touch drag pans', Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.8, `${c0.x},${c0.z} -> ${c1.x},${c1.z}`);
  c0 = await cam();
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 40 - i * 12, cy], [cx + 40 + i * 12, cy]]);
  await touch('touchEnd', []);
  await sleep(250);
  c1 = await cam();
  check('two-finger pinch zooms', c1.zoom > c0.zoom * 1.5, `${c0.zoom} -> ${c1.zoom}`);
  c0 = await cam();
  await touch('touchStart', [[cx - 60, cy], [cx + 60, cy]]);
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * 0.9;
    await touch('touchMove', [[cx - Math.cos(a) * 60, cy - Math.sin(a) * 60], [cx + Math.cos(a) * 60, cy + Math.sin(a) * 60]]);
  }
  await touch('touchEnd', []);
  await sleep(250);
  check('two-finger twist rotates', Math.abs((await cam()).goal.azimuth - c0.goal.azimuth) > 0.4, `${c0.goal.azimuth}`);
  await page.evaluate((v) => window.__mnemosyne.camera.setView(v, 72), homeView);
  await sleep(600);

  // ================================================================== B1 build
  group('B1 build: five building types');
  const placed = [];
  for (const type of ['cottage', 'tavern', 'blacksmith', 'windmill', 'watchtower']) {
    await page.getByTestId(`build-${type}`).click();
    const spot = await placeSomewhere(placed);
    check(`${type}: placed by hover + click on valid ground`, !!spot);
    if (spot) placed.push(spot);
  }
  let s1 = await snapshot();
  check('all five distinct types exist in the world', new Set(s1.buildings.map((b) => b.type)).size === 5, s1.buildings.map((b) => b.type).join(','));
  check('world is marked customised', s1.customized === true);
  check('every building has a stable id', s1.buildings.every((b) => /^building_[0-9a-z]{12}$/.test(b.id)));
  // Ghost preview for a sixth building, for a visual record.
  await page.getByTestId('build-windmill').click();
  for (const c of await candidates()) {
    await page.mouse.move(c.px, c.py);
    await sleep(200);
    if ((await page.locator('[data-testid=hover-chip] em.ok').count()) > 0) break;
  }
  await sleep(500);
  await shot('02a-ghost-preview');
  check('a ghost building follows the cursor while placing', (await page.evaluate(() => window.__mnemosyne.store.getState().hover)) !== null);
  await page.keyboard.press('Escape');
  await sleep(1200);
  await shot('02-five-buildings');
  const info1 = await page.evaluate(() => window.__mnemosyne.renderInfo());
  check('draw calls stay under budget with five buildings', info1.calls < 400, JSON.stringify(info1));

  // invalid placement is refused with a reason
  await page.getByTestId('build-cottage').click();
  const w = await page.evaluate(() => {
    const m = window.__mnemosyne;
    const w = m.store.getState().world;
    for (let z = 4; z < w.size - 4; z++) for (let x = 4; x < w.size - 4; x++) if (w.tiles.biome[z * w.size + x] === 0) return { x: x + 0.5, z: z + 0.5, p: m.project(x + 0.5, z + 0.5) };
    return null;
  });
  if (w) {
    await page.evaluate(({ x, z }) => window.__mnemosyne.camera.setView({ x, z, zoom: 0.8, azimuth: Math.PI / 4 }, 72), w);
    await sleep(400);
    const p = await page.evaluate(({ x, z }) => window.__mnemosyne.project(x, z), w);
    const before = (await snapshot()).buildings.length;
    await page.mouse.move(p.x, p.y);
    await sleep(250);
    const chipText = await page.locator('[data-testid=hover-chip]').textContent();
    await page.mouse.click(p.x, p.y);
    await sleep(250);
    check('building on deep water is refused', (await snapshot()).buildings.length === before);
    check('hover HUD explains why', /water/i.test(chipText ?? ''), chipText ?? '');
    check('refusal toast appears', /water/i.test(await toastText()));
  } else check('found deep water to test against', false);
  await page.keyboard.press('Escape');
  await page.evaluate((v) => window.__mnemosyne.camera.setView(v, 72), homeView);
  await sleep(600);

  // ================================================================== B2 customise
  group('B2 select, rotate, recolor, move, remove, undo');
  s1 = await snapshot();
  const target = s1.buildings.find((b) => b.type === 'tavern');
  const proj = await page.evaluate((b) => {
    const dims = { tavern: [3, 2] }[b.type];
    const [w, d] = b.rotation % 2 ? [dims[1], dims[0]] : dims;
    return window.__mnemosyne.project(b.x + w / 2, b.z + d / 2, 1.2);
  }, target);
  await page.mouse.click(proj.x, proj.y);
  await sleep(300);
  let s2 = await snapshot();
  check('clicking a building selects it', s2.selectedId === target.id, `selected ${s2.selectedId}`);
  check('inspector shows its name field and stable id', (await page.getByTestId('inspector').count()) === 1 && (await page.locator('.inspector .id').textContent()).startsWith('building_'));

  await page.getByRole('button', { name: /^Right/ }).click();
  await sleep(200);
  s2 = await snapshot();
  const rotated = s2.buildings.find((b) => b.id === target.id);
  check('rotate turns the building 90° and keeps its id', rotated.rotation === (target.rotation + 1) % 4);

  await page.getByRole('button', { name: 'Walls: Honey timber' }).click();
  await page.getByRole('button', { name: 'Roof: Slate blue' }).click();
  await sleep(200);
  s2 = await snapshot();
  const recolored = s2.buildings.find((b) => b.id === target.id);
  check('recolor changes wall and roof', recolored.colors.wall.toLowerCase() === '#c79a63' && recolored.colors.roof.toLowerCase() === '#46597f', JSON.stringify(recolored.colors));

  await page.getByRole('button', { name: '2', exact: true }).first().click();
  await sleep(150);
  check('style variant switches', (await snapshot()).buildings.find((b) => b.id === target.id).variant === 1);

  const nameInput = page.getByLabel('Building name');
  await nameInput.fill('The Gilded Stag');
  await nameInput.press('Enter');
  await sleep(200);
  check('renaming a building sticks', (await snapshot()).buildings.find((b) => b.id === target.id).name === 'The Gilded Stag');

  // Move: pick a free spot, tell the tool to move, hover until valid, click.
  await page.getByTestId('move').click();
  const beforeMove = (await snapshot()).buildings.find((b) => b.id === target.id);
  let moved = false;
  for (const c of await candidates()) {
    await page.mouse.move(c.px, c.py);
    await sleep(160);
    if ((await page.locator('[data-testid=hover-chip] em.ok').count()) > 0) {
      const at = (await snapshot()).buildings.find((b) => b.id === target.id);
      if (Math.hypot(at.x - c.x, at.z - c.z) < 4) continue;
      await page.mouse.click(c.px, c.py);
      await sleep(250);
      moved = true;
      break;
    }
  }
  const afterMove = (await snapshot()).buildings.find((b) => b.id === target.id);
  check('move relocates the building, id unchanged', moved && (afterMove.x !== beforeMove.x || afterMove.z !== beforeMove.z) && afterMove.id === target.id);
  check('move keeps rotation, colours, name', afterMove.rotation === beforeMove.rotation && afterMove.name === 'The Gilded Stag' && afterMove.colors.roof === beforeMove.colors.roof);
  await shot('03-customised');

  const countBefore = (await snapshot()).buildings.length;
  await page.getByTestId('remove-selected').click();
  await sleep(200);
  s2 = await snapshot();
  check('remove deletes the building', s2.buildings.length === countBefore - 1 && !s2.buildings.some((b) => b.id === target.id));
  await page.getByRole('button', { name: 'Undo' }).click();
  await sleep(200);
  s2 = await snapshot();
  const back = s2.buildings.find((b) => b.id === target.id);
  check('undo restores it exactly (same id, colours, name, spot)', !!back && back.name === 'The Gilded Stag' && back.x === afterMove.x && back.z === afterMove.z && back.colors.roof === afterMove.colors.roof);
  await page.getByRole('button', { name: 'Redo' }).click();
  await sleep(150);
  check('redo removes it again', !(await snapshot()).buildings.some((b) => b.id === target.id));
  await page.keyboard.press('Control+z');
  await sleep(150);
  check('Ctrl+Z shortcut undoes', (await snapshot()).buildings.some((b) => b.id === target.id));

  // Remove tool on a tree.
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  const propsBefore = (await snapshot()).props;
  const treeSpot = await page.evaluate(() => {
    const m = window.__mnemosyne;
    const s = m.store.getState();
    const c = m.camera.cur;
    const actors = m.actors();
    const buildings = Object.values(s.world.objects).filter((o) => o.kind === 'building');
    let best = null;
    for (const o of Object.values(s.world.objects)) {
      if (o.kind !== 'prop' || (o.type !== 'oak' && o.type !== 'pine')) continue;
      const p = m.project(o.x, o.z);
      if (p.x < 380 || p.x > window.innerWidth - 340 || p.y < 120 || p.y > window.innerHeight - 140) continue;
      // Keep clear of anything pickable that could sit in front of the tree.
      if (actors.some((a) => Math.hypot(a.x - o.x, a.z - o.z) < 4)) continue;
      if (buildings.some((b) => Math.hypot(b.x - o.x, b.z - o.z) < 5)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (!best || d < best.d) best = { d, x: o.x, z: o.z };
    }
    return best && m.project(best.x, best.z);
  });
  if (treeSpot) {
    await page.mouse.click(treeSpot.x, treeSpot.y);
    await sleep(250);
    check('Remove tool clears a tree', (await snapshot()).props === propsBefore - 1);
  } else check('found a tree on screen', false);
  await page.keyboard.press('Escape');

  // ================================================================== A1 creatures
  group('A1 animated creatures');
  const a0 = await page.evaluate(() => window.__mnemosyne.actors());
  await sleep(5000);
  const a1 = await page.evaluate(() => window.__mnemosyne.actors());
  const movedCount = a1.filter((a) => {
    const p = a0.find((q) => q.id === a.id);
    return p && Math.hypot(a.x - p.x, a.z - p.z) > 0.15;
  }).length;
  check('creatures are alive and moving', a1.length >= 8 && movedCount >= 2, `${movedCount}/${a1.length} moved`);
  check('both villagers and sheep are present', a1.some((a) => a.species === 'villager') && a1.some((a) => a.species === 'sheep'));
  const onBuilding = await page.evaluate(() => {
    const s = window.__mnemosyne.store.getState().world;
    const rects = Object.values(s.objects).filter((o) => o.kind === 'building');
    const dims = { cottage: [2, 2], tavern: [3, 2], blacksmith: [3, 2], windmill: [2, 2], watchtower: [2, 2] };
    return window.__mnemosyne.actors().filter((a) => rects.some((b) => {
      const [w, d] = b.rotation % 2 ? [dims[b.type][1], dims[b.type][0]] : dims[b.type];
      return a.x > b.x && a.x < b.x + w && a.z > b.z && a.z < b.z + d;
    })).length;
  });
  check('no creature is standing inside a building', onBuilding === 0);

  // Add a villager with the palette, then confirm it joined the simulation.
  const popBefore = (await snapshot()).creatures;
  await page.getByTestId('build-villager').click();
  let added = false;
  for (const c of await candidates()) {
    await page.mouse.move(c.px, c.py);
    await sleep(140);
    if ((await page.locator('.chip, .toast').first().count()) > 0) {
      await page.mouse.click(c.px, c.py);
      await sleep(250);
      if ((await snapshot()).creatures === popBefore + 1) {
        added = true;
        break;
      }
    }
  }
  check('villager can be added from the palette', added);
  await sleep(600);
  check('the new villager joins the live simulation', (await page.evaluate(() => window.__mnemosyne.actors().length)) === popBefore + 1);
  await page.keyboard.press('Escape');

  // ================================================================== S persistence
  group('S1/S2 save, autosave, reload, export, import');
  await waitFor(() => window.__mnemosyne.store.getState().saveStatus === 'saved', null, 10000);
  check('autosave completes on its own after edits', (await snapshot()).saveStatus === 'saved');
  const preReload = await snapshot();
  await page.reload();
  await page.waitForSelector('canvas', { timeout: 30000 });
  await waitFor(() => !!window.__mnemosyne && window.__mnemosyne.store.getState().world.id !== 'world_bootstrap0000', null, 30000);
  await sleep(800);
  const postReload = await snapshot();
  check('reload restores the same world', postReload.id === preReload.id && postReload.name === preReload.name);
  check('reload restores every building exactly', JSON.stringify(postReload.buildings.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(preReload.buildings.sort((a, b) => a.id.localeCompare(b.id))));
  check('reload restores the terrain and objects', postReload.props === preReload.props && postReload.creatures === preReload.creatures);
  await sleep(1500);
  await shot('04-after-reload');

  await page.getByRole('button', { name: 'Save now' }).click();
  await waitFor(() => window.__mnemosyne.store.getState().saveStatus === 'saved', null, 8000);
  check('manual Save button works', /saved/i.test(await toastText()));

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export world file' }).click()]);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  const parsed = JSON.parse(exported);
  check('export downloads a versioned world file', parsed.format === 'mnemosyne.world' && parsed.schemaVersion === 1 && download.suggestedFilename().endsWith('.mnemosyne.json'));
  check('exported file contains all buildings with their ids', parsed.world.objects.filter((o) => o.kind === 'building').map((o) => o.id).sort().join() === postReload.buildings.map((b) => b.id).sort().join());

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-'));
  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ format: 'nope' }));
  await page.getByTestId('import-input').setInputFiles(bad);
  await sleep(500);
  check('importing a corrupt file is rejected with a clear message', /isn't a Mnemosyne/i.test(await toastText()));
  check('...and leaves the current world untouched', (await snapshot()).id === postReload.id);

  const garbage = path.join(tmp, 'garbage.json');
  fs.writeFileSync(garbage, '{{{ not json');
  await page.getByTestId('import-input').setInputFiles(garbage);
  await sleep(500);
  check('non-JSON files are rejected too', /valid JSON/i.test(await toastText()));

  const good = path.join(tmp, 'good.json');
  fs.writeFileSync(good, exported);
  await page.getByTestId('import-input').setInputFiles(good);
  await waitFor((id) => window.__mnemosyne.store.getState().world.id !== id, postReload.id, 8000);
  const imported = await snapshot();
  check('a valid import opens as a safe copy (never overwrites)', /imported/.test(imported.name) && imported.id !== postReload.id);
  check('...with identical buildings and ids', JSON.stringify(imported.buildings.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(postReload.buildings.sort((a, b) => a.id.localeCompare(b.id))));

  // ================================================================== G generate + library
  group('G1 Generate World and the library');
  await page.getByLabel('World seed').fill('alpha-quest-9');
  await page.getByRole('radio', { name: /Small/ }).click();
  await page.getByRole('radio', { name: /Islands/ }).click();
  await page.getByTestId('generate').click();
  await page.getByTestId('confirm-generate').waitFor({ timeout: 4000 });
  check('generating over edited work asks for confirmation first', true);
  const keepId = (await snapshot()).id;
  await page.getByRole('button', { name: 'Keep working' }).click();
  check('cancelling keeps the world as it was', (await snapshot()).id === keepId);
  await page.getByTestId('generate').click();
  await page.getByTestId('confirm-generate').click();
  await waitFor((id) => window.__mnemosyne.store.getState().world.id !== id && !window.__mnemosyne.store.getState().generating, keepId, 15000);
  const gen = await snapshot();
  check('new world honours seed, size and terrain controls', gen.seed === 'alpha-quest-9' && gen.size === 48 && gen.terrain === 'islands', JSON.stringify(gen));
  check('new world is a clean slate with its own creatures and flora', gen.buildings.length === 0 && gen.props > 100 && gen.creatures >= 4 && !gen.customized);
  await sleep(1800);
  await shot('05-generated-islands');

  await page.getByLabel('World seed').fill('alpha-quest-9');
  await page.getByTestId('generate').click();
  await waitFor(() => !window.__mnemosyne.store.getState().generating, null, 15000);
  const again = await snapshot();
  check('regenerating with the same seed reproduces the same terrain', again.size === gen.size && again.seed === gen.seed);
  const sameTerrain = await page.evaluate(() => Array.from(window.__mnemosyne.store.getState().world.tiles.height.slice(0, 400)).join(','));
  await page.getByLabel('World seed').fill('alpha-quest-9');
  await page.getByTestId('generate').click();
  await waitFor(() => !window.__mnemosyne.store.getState().generating, null, 15000);
  check('(seeded terrain is byte-stable across runs)', (await page.evaluate(() => Array.from(window.__mnemosyne.store.getState().world.tiles.height.slice(0, 400)).join(','))) === sameTerrain);

  await page.getByRole('button', { name: 'Worlds' }).click();
  await page.getByTestId('world-row').first().waitFor();
  const rows = await page.getByTestId('world-row').count();
  check('library keeps your edited worlds and the import, but not the throwaway pristine regenerations', rows === 3, `rows=${rows}`);
  await shot('06-worlds-dialog');
  const original = page.getByTestId('world-row').filter({ hasText: preReload.name }).filter({ hasNotText: /imported/ }).first();
  await original.getByRole('button', { name: 'Open' }).click();
  await waitFor((id) => window.__mnemosyne.store.getState().world.id === id, preReload.id, 8000);
  const reopened = await snapshot();
  check('reopening the original world restores your village intact', reopened.buildings.length === preReload.buildings.length && reopened.buildings.some((b) => b.name === 'The Gilded Stag'));

  await page.getByRole('button', { name: 'Worlds' }).click();
  await page.getByTestId('world-row').first().waitFor();
  const before = await page.getByTestId('world-row').count();
  const victim = page.getByTestId('world-row').filter({ hasText: /imported/ }).first();
  await victim.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('confirm-delete').click();
  await sleep(600);
  await page.getByRole('button', { name: 'Worlds' }).click();
  await page.getByTestId('world-row').first().waitFor();
  check('deleting a world removes it from the library', (await page.getByTestId('world-row').count()) === before - 1);
  await page.keyboard.press('Escape');

  // ================================================================== final
  group('Console health');
  const real = errors.filter((e) => !/Clock|deprecated/i.test(e));
  check('no console errors or uncaught exceptions during the whole run', real.length === 0, real.slice(0, 5).join('\n      '));
} catch (error) {
  console.error('\nTest run crashed:', error);
  await shot('crash').catch(() => {});
  results.push({ section: 'crash', name: String(error.message).split('\n')[0], ok: false });
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  ✗ [${f.section}] ${f.name}`);
  process.exit(1);
}
