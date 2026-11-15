import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const executable=resolve(process.env.MURO_DESKTOP_EXE||'target/debug/muro-desktop.exe');
await access(executable);
const root=await mkdtemp(join(tmpdir(),'muro-native-ui-'));
const data=join(root,'data'),profile=join(root,'opencode'),artifact=join(root,'native-package');
await Promise.all([mkdir(data),mkdir(profile),mkdir(artifact)]);
await writeFile(join(profile,'opencode.json'),JSON.stringify({plugins:[],theme:'retained-test-setting'}));
await writeFile(join(artifact,'package.json'),JSON.stringify({name:'muro-native-ui-smoke',version:'1.0.0',type:'module',main:'index.js'}));
await writeFile(join(artifact,'index.js'),'export default async () => ({});\n');
const port=Number(process.env.MURO_CDP_PORT||9227),endpoint=`http://127.0.0.1:${port}`;
try{await fetch(endpoint+'/json/version');throw Error(`CDP port ${port} is already in use`);}catch(e){if(e.message.includes('already in use'))throw e;}
const app=spawn(executable,[],{env:{...process.env,MURO_DATA_DIR:data,WEBVIEW2_USER_DATA_FOLDER:join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`},stdio:'pipe',windowsHide:true});
let output='';app.stdout.on('data',b=>output+=b);app.stderr.on('data',b=>output+=b);
let browser;
try {
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error(`App exited ${app.exitCode}: ${output}`);try{if((await fetch(endpoint+'/json/version')).ok)break;}catch{}if(i===119)throw Error(`CDP unavailable: ${output}`);await delay(500);}
 browser=await chromium.connectOverCDP(endpoint);
 let page;
 for(let i=0;i<60;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().startsWith('devtools:'));if(page)break;await delay(500);}
 if(!page)throw Error('Native WebView page not found');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'Il tuo registry parte da qui'}).waitFor({timeout:60000});
 // Discovery probes can finish asynchronously; wait for the same UI busy state users see.
 await page.getByRole('button',{name:'Harness',exact:true}).click();
 await page.getByRole('button',{name:'Aggiungi destinazione',exact:true}).click({timeout:180000});
 await page.getByLabel('Nome profilo',{exact:true}).fill('OpenCode · isolated smoke');
 await page.locator('dialog select').first().selectOption('opencode');
 await page.getByLabel('Directory configurazione della harness').fill(profile);
 await page.getByLabel('Eseguibile',{exact:true}).fill(process.execPath);
 await page.getByRole('button',{name:'Salva destinazione',exact:true}).click();
 await page.getByRole('heading',{name:'OpenCode · isolated smoke',exact:true}).waitFor();
 await page.getByRole('button',{name:'Registry',exact:true}).click();
 await page.getByRole('button',{name:'Aggiungi plugin',exact:true}).click();
 await page.getByLabel('Nome',{exact:true}).fill('Native IPC smoke');
 await page.getByLabel('Sorgente',{exact:false}).fill(artifact);
 await page.getByRole('checkbox',{name:'OpenCode · isolated smoke'}).check();
 await page.getByRole('button',{name:'Aggiungi distribuzione'}).click();
 await page.locator('dialog select[name=distribution_harness]').selectOption('opencode');
 await page.getByLabel('Directory artifact').fill(artifact);
 await page.getByLabel('Versione',{exact:true}).fill('1.0.0');
 await page.getByRole('button',{name:'Salva plugin',exact:true}).click();
 await page.getByRole('heading',{name:'Native IPC smoke',exact:true}).waitFor();
 await page.reload();
 await page.getByRole('heading',{name:'Native IPC smoke',exact:true}).waitFor({timeout:60000});
 const stored=JSON.parse(await readFile(join(data,'registry.json'),'utf8'));
 assert.equal(stored.plugins.length,1);assert.equal(stored.targets[0].root,profile);
 await page.getByRole('button',{name:'Sincronizzazione',exact:true}).click();
 await page.getByRole('button',{name:'Calcola piano'}).click({timeout:180000});
 await page.getByRole('button',{name:'Applica piano'}).waitFor({timeout:60000});
 assert.equal(await page.getByRole('button',{name:'Applica piano'}).isEnabled(),true);
 await page.getByRole('button',{name:'Applica piano'}).click();
 await page.getByRole('button',{name:'Applica',exact:true}).click();
 await page.getByRole('button',{name:'Calcola piano'}).click({timeout:60000});
 await page.getByRole('heading',{name:'Nessuna modifica necessaria'}).waitFor({timeout:60000});
 const config=JSON.parse(await readFile(join(profile,'opencode.json'),'utf8'));
 assert.equal(config.theme,'retained-test-setting');assert.equal(config.plugins.length,1);
 assert.ok(config.plugins[0].startsWith('file:'));
 await page.getByRole('button',{name:'Registry',exact:true}).click();
 await mkdir('apps/desktop/tests/artifacts',{recursive:true});
 await page.screenshot({path:'apps/desktop/tests/artifacts/native-registry.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'pass',test:'native WebView2 + real Tauri IPC',checks:['empty state','target and plugin save','reload persistence','plan and apply to isolated OpenCode config','second plan zero mutations','unrelated config preserved'],data_dir:root,screenshot:'apps/desktop/tests/artifacts/native-registry.png'}));
} catch(e){console.error(output);throw e;} finally {await browser?.close();app.kill();}
