import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, '.preview');
await mkdir(artifacts, { recursive: true });
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(requestUrl.pathname);
    // Simulate a returning visitor with the old, unversioned stylesheet cached.
    if (pathname === '/__old-draft') {
      res.writeHead(200, {'Content-Type':'text/html'});
      res.end('<!doctype html><html><head><link rel="stylesheet" href="/assets/css/styles.css"></head><body><div class="hero-copy">Earlier cached draft</div></body></html>');
      return;
    }
    if (pathname === '/assets/css/styles.css' && !requestUrl.search) {
      res.writeHead(200, {'Content-Type':'text/css','Cache-Control':'public, max-age=31536000'});
      res.end('body { font-family: Arial; }');
      return;
    }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
let browser;
try {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  browser = await chromium.launch({ headless: true, executablePath: process.env.HERO_BROWSER || '/usr/bin/google-chrome' });
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({colorScheme:'dark'});
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => requests.push({url:req.url(), method:req.method()}));
  await page.goto(`${base}/__old-draft`);
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily),'Arial');
  await page.goto(base);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => [...document.fonts].every(font=>font.status==='loaded')), 'Local font files must load');
  assert(await page.evaluate(() => getComputedStyle(document.body).fontFamily.startsWith('"IBM Plex Sans"')), 'The editorial typeface must be active');
  assert.equal(await page.locator('.hazard-animation, .animation-control').count(),0);
  assert.equal(await page.locator('.theme-toggle, [data-theme]').count(),0,'The site has a single light style, with no theme switch');
  assert.equal(await page.locator('.mapping-field').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('img[alt="Portrait of Ken Hasselmann"]').getAttribute('src'),'assets/people/ken-hasselmann.png');
  const sharePath = new URL(await page.locator('meta[property="og:image"]').getAttribute('content')).pathname;
  const shareResponse = await context.request.get(`${base}${sharePath}`);
  assert.equal(shareResponse.status(),200);
  assert.equal(shareResponse.headers()['content-type'],'image/png');
  {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({width, height:1000});
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.evaluate(async () => { await Promise.all([...document.images].map(img => { img.loading='eager'; return img.decode().catch(()=>{}); })); });
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        failed: [...document.images].filter(img=>!img.naturalWidth).map(img=>img.src),
        circles: [...document.querySelectorAll('.organizer-portrait')].map(img=>({w:img.getBoundingClientRect().width,h:img.getBoundingClientRect().height,r:getComputedStyle(img).borderRadius})),
        background: getComputedStyle(document.body).backgroundColor,
        panel: (() => { const text=document.querySelector('.hero-copy').getBoundingClientRect(); const art=document.querySelector('.hazard-panel').getBoundingClientRect(); return { sideBySide: art.left >= text.right, stacked: art.top >= text.bottom }; })(),
        headerBackground: getComputedStyle(document.querySelector('.site-header')).backgroundColor,
        logos: ['.brand','.header-conference'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width}}),
        headerOverlaps: (() => {
          const blocks=[...document.querySelectorAll('.brand,.header-conference,.site-nav a,.menu-toggle')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect());
          return blocks.some((a,i)=>blocks.slice(i+1).some(b=>a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1));
        })()
      }));
      assert.equal(result.overflow,false,`Horizontal overflow at ${width}`);
      const aligned = await page.locator('.speaker-card').evaluateAll(cards => {
        const rows = new Map();
        for (const card of cards) {
          const top = Math.round(card.getBoundingClientRect().top);
          const positions = ['h3', '.speaker-affiliation', '.speaker-contribution', '.speaker-talk'].map(selector => Math.round(card.querySelector(selector).getBoundingClientRect().top));
          if (rows.has(top) && positions.some((y, i) => Math.abs(y - rows.get(top)[i]) > 1)) return false;
          rows.set(top, positions);
        }
        return true;
      });
      assert(aligned, `Speaker names, affiliations, expertise and talk titles must align at ${width}`);

      assert(width > 800 ? result.panel.sideBySide : result.panel.stacked, `Illustration must sit beside the text on desktop and below it on mobile at ${width}`);
      assert.equal(result.headerOverlaps,false,`Overlapping header content at ${width}`);
      assert.deepEqual(result.failed,[],`Broken images at ${width}`);
      assert.equal(result.background,'rgb(255, 255, 255)','The page stays white even when the operating system prefers dark');
      assert.equal(result.headerBackground,'rgb(255, 255, 255)','The masthead must stay white');
      assert(Math.max(...result.logos.map(r=>r.top)) < Math.min(...result.logos.map(r=>r.bottom)), 'Logos must share the header row');
      const logoGap = result.logos[1].left - result.logos[0].right;
      assert(logoGap >= 0 && logoGap < 40, `ICRA must sit directly beside HERo at ${width}`);
      assert.equal(result.circles.length,7);
      assert(result.circles.every(c=>c.w===c.h && c.r==='50%'));
      await page.screenshot({animations:'disabled',path:resolve(artifacts,`viewport-${width}.png`),fullPage:true});
      if (width===390 || width===1440) {
        const accessibility = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`Accessibility at ${width}`);
        await page.screenshot({animations:'disabled',path:resolve(artifacts,`${width===390?'mobile':'desktop'}.png`),fullPage:true});
        if (width === 390) await page.screenshot({animations:'disabled',path:resolve(artifacts,`mobile-landing.png`)});
      }
    }
    await page.goto(base);
    await page.waitForTimeout(200);
    await page.screenshot({animations:'disabled',path:resolve(artifacts,`landing.png`)});
    await page.locator('#organizers').screenshot({animations:'disabled',path:resolve(artifacts,`organisers.png`)});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#speakers').screenshot({style:'.site-header, .skip-link { visibility: hidden; }',path:resolve(artifacts,'speakers-aligned.png')});
    await page.emulateMedia({reducedMotion:'no-preference'});
  }
  await page.setViewportSize({width:390,height:900});
  const menu = page.locator('.menu-toggle');
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.click();
  await page.locator('#primary-nav a[href="#organizers"]').click();
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert(page.url().endsWith('#organizers'));
  assert.equal(await page.locator('form').count(),0);
  assert.equal(await page.locator('a[href^="mailto:"]').count(),0);
  assert.equal(requests.filter(r=>r.method!=='GET').length,0);
  assert.equal(requests.filter(r=>!r.url.startsWith(base)).length,0);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).scrollBehavior),'auto');
  await page.locator('.brand').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.motion-toggle').count(),0,'The illustration has no pause button');
  const quiet = await page.locator('.mapping-field').evaluate(canvas=>canvas.toDataURL());
  await page.mouse.move(280,300);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.mapping-field').evaluate(canvas=>canvas.toDataURL()),quiet,'Reduced motion must leave the field still');
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.locator('.footer-inner a[href="#top"]').click();
    await page.waitForFunction(()=>window.scrollY===0,null,{timeout:5000,polling:100});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base);
  await page.waitForTimeout(200);
  await page.screenshot({animations:'disabled',path:resolve(artifacts,'landing.png')});
  await page.locator('#organizers').screenshot({animations:'disabled',path:resolve(artifacts,'organisers.png')});
  // The field runs continuously and resumes after a reduced-motion preference change.
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base);
  await page.waitForTimeout(200);
  await page.waitForTimeout(5400);
  const snapshot = () => page.locator('.mapping-field').evaluate(canvas=>canvas.toDataURL());
  const looping = await snapshot();
  await page.waitForTimeout(150);
  assert.notEqual(await snapshot(),looping,'The field must keep moving beyond its opening');
  assert.equal(await page.locator('.motion-toggle').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(100);
  const still = await snapshot();
  await page.waitForTimeout(150);
  assert.equal(await snapshot(),still,'Reduced motion must stop the field');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForTimeout(150);
  assert.notEqual(await snapshot(),still,'The continuous loop must resume');
  const contributions = await page.locator('#contributions').innerText();
  assert(contributions.includes('4 to 6 pages') && contributions.includes('extended abstracts') && contributions.includes('posters, with selected spotlights'));
  assert(contributions.includes('single-blind review') && !contributions.includes('double-blind'));
  assert(contributions.includes('completed research, work in progress, and conceptual approaches'));
  const nojs = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
  const fallback = await nojs.newPage();
  await fallback.goto(base);
  assert.equal(await fallback.locator('#primary-nav').isVisible(),true);
  assert.equal(await fallback.locator('.motion-toggle').count(),0);
  await fallback.emulateMedia({reducedMotion:'reduce'});
  await fallback.locator('.footer-inner a[href="#top"]').click();
  assert.equal(await fallback.evaluate(()=>window.scrollY),0,'No-JS back-to-top must reach the document start');
  assert.deepEqual(errors,[]);
  console.log('PASS: single light style at five viewport sizes, white even when the system prefers dark; no theme switch; updated Ken portrait; no overflow or header overlap; local fonts and images; share-preview PNG; circular portraits; desktop/mobile accessibility; menu and Escape; no placeholder email; zero external requests; continuous hazard field without a pause control; white masthead; six-page papers and poster/selected spotlight format; reduced motion; cached-stylesheet regression; desktop/mobile back-to-top; no-JS navigation and back-to-top.');
} catch (err) {
  console.error(err.message.split('\n').slice(0,8).join('\n'));
  process.exitCode=1;
} finally {
  if (browser) await browser.close();
  await new Promise(ok=>server.close(ok));
}
