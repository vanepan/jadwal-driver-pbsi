import puppeteer from 'puppeteer';

const html = `<!doctype html><html><body>
<div id="overlay" style="display:none;">
  <div id="box" style="animation: fadeInScale 400ms ease both;"></div>
</div>
<style>
@keyframes fadeInScale { from { opacity:0; transform:scale(.97);} to { opacity:1; transform:scale(1);} }
</style>
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setContent(html);

const result = await page.evaluate(async () => {
  const overlay = document.getElementById('overlay');
  const box = document.getElementById('box');

  // First open
  overlay.style.display = 'flex';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const anim1 = box.getAnimations()[0];
  const firstOpenCurrentTime = anim1 ? anim1.currentTime : null;
  const firstOpenPlayState = anim1 ? anim1.playState : null;

  // Let it run partway, then close
  await new Promise(r => setTimeout(r, 200));
  overlay.style.display = 'none';

  // Reopen
  overlay.style.display = 'flex';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const anim2 = box.getAnimations()[0];
  const secondOpenCurrentTime = anim2 ? anim2.currentTime : null;
  const secondOpenPlayState = anim2 ? anim2.playState : null;
  const sameAnimObject = anim1 === anim2;

  return { firstOpenCurrentTime, firstOpenPlayState, secondOpenCurrentTime, secondOpenPlayState, sameAnimObject, anim2Exists: !!anim2 };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
