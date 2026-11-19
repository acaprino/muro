// Regenerates the screenshots in docs/assets/screenshots from tests/demo.html (demo data, both looks).
//   node apps/desktop/tests/screenshots.mjs
// MURO_UI_PORT moves the dev server when 1422 is taken; MURO_GUIDE=<path of a release's GUIDE.html> also
// captures Marionette's offline guide.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const port=process.env.MURO_UI_PORT||'1422',out='docs/assets/screenshots',demo=`http://127.0.0.1:${port}/tests/demo.html`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','apps/desktop/vite.config.ts','--port',port],{stdio:'pipe',windowsHide:true});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
let browser;
try {
 for(let i=0;;i++){try{if((await fetch(demo)).ok)break;}catch{}if(i===60)throw Error(output);await delay(200);}
 await mkdir(out,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[];
 const open=async(scheme,query='',look='smooth')=>{
  const page=await browser.newPage({viewport:{width:1440,height:940},colorScheme:scheme,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(l=>localStorage.setItem('muro.look',l),look);
  await page.goto(demo+query);
  await page.getByText(query?'1 found':'6 found',{exact:true}).waitFor();
  return page;
 };
 const shot=async(page,name,height)=>{await delay(250);await page.screenshot({path:`${out}/${name}.png`,clip:height?{x:0,y:0,width:1440,height}:undefined});console.log(`${out}/${name}.png`);};

 let page=await open('dark');
 await page.locator('.next-step').getByText('A newer version is ready to install.').waitFor();
 await shot(page,'plugins-dark');
 await page.getByRole('button',{name:'Harnesses',exact:true}).click();
 await shot(page,'harnesses');
 await page.getByRole('button',{name:'Sync',exact:true}).click();
 await page.getByRole('button',{name:'Check for changes'}).click();
 await page.getByRole('button',{name:'Apply changes'}).waitFor();
 await shot(page,'sync');
 await page.getByRole('button',{name:'Plugins',exact:true}).click();
 await page.locator('[data-plugin="docs-writer"]').click();
 await page.getByRole('button',{name:'Adapt with AI',exact:true}).click();
 await page.locator('dialog[open]').getByText('For harness').waitFor();
 await shot(page,'adapt');
 await page.close();

 page=await open('light');
 await shot(page,'plugins-light');
 await page.close();
 page=await open('dark','?state=empty');
 await page.getByRole('list',{name:'Getting started'}).waitFor();
 await shot(page,'first-use',460);
 await page.close();
 page=await open('dark','','classic');
 if(await page.evaluate(()=>document.documentElement.dataset.look)!=='classic')throw Error('Classic look not applied');
 await shot(page,'classic');
 await page.close();

 if(process.env.MURO_GUIDE){
  page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(process.env.MURO_GUIDE).href);
  await delay(1500);
  // The guide's first example path: one request routed through capabilities absorbed from different sources.
  await page.getByRole('button',{name:'Percorsi'}).click();
  await page.getByText('Landing con animazioni allo scroll',{exact:true}).first().click();
  await delay(2000);
  await shot(page,'marionette-guide',560);
  await page.close();
 }
 if(errors.length)throw Error('Page errors: '+errors.join('; '));
} finally {await browser?.close();server.kill();}
