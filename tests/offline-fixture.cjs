// Serve a versão local por interceptação: nenhum servidor nem deploy é necessário.
const {test:base,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const test=base.extend({page:async({page},use)=>{
 await page.route('http://127.0.0.1:8000/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const name=pathname==='/'?'/index.html':pathname;
  const file=path.resolve('.'+name);
  if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
 });await use(page);
}});
module.exports={test,expect};
