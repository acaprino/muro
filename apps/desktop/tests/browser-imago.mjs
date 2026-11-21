import { open } from './browser-helper.mjs';
const app=await open('changes');
try {
  console.log(await app.page.evaluate(async()=>{
    const {verify}=await import('/tests/imago-contract.js');
    return verify();
  }));
} finally { await app.close(); }
