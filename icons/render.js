// Renders the PNG icons from the SVG sources. Needs Playwright:
//   npx -y playwright@1 install chromium   (once, if not installed)
//   NODE_PATH="$(npm root -g)" node icons/render.js
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const OUT = [
  ['icon-small.svg', 16, 'icon_16.png'],
  ['icon-small.svg', 32, 'icon_32.png'],
  ['icon-full.svg', 48, 'icon_48.png'],
  ['icon.svg', 128, 'icon_128.png'],
  ['icon-full.svg', 256, 'icon.png'],
];

(async() => {
  const browser = await chromium.launch();
  for(const [src, size, out] of OUT) {
    const page = await browser.newPage({viewport: {width: size, height: size}});
    const svg = fs.readFileSync(path.join(__dirname, src)).toString('base64');
    await page.setContent(`<style>*{margin:0}img{display:block}</style>
      <img width="${size}" height="${size}" src="data:image/svg+xml;base64,${svg}">`);
    await page.screenshot({path: path.join(__dirname, '..', out), omitBackground: true});
    await page.close();
    console.log(out, size);
  }
  await browser.close();
})();
