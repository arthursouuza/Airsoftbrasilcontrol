const {test,expect}=require('./offline-fixture.cjs');
const fs=require('fs'),path=require('path');
test.beforeEach(async({page})=>{
 await page.route('http://127.0.0.1:8000/**',async route=>{
  const name=new URL(route.request().url()).pathname;
  const file=path.resolve('.'+name);
  if (!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
  await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
 });
 await page.route('https://nzgpceglyxwtukrbdkam.supabase.co/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
});
test('envio pela galeria valida formato, preserva capa em falha e salva somente após upload',async({page})=>{
 await page.goto('/connected.html');
 await page.evaluate(async()=>{
  const {coverUploader}=await import('/src/event-media.js');
  window.mediaCalls=[];window.mediaFail=false;
  const db={storage:{from:()=>({upload:async(path,file)=>{window.mediaCalls.push(['upload',path,file.type]);return window.mediaFail?{error:{message:'Falha simulada'}}:{};},getPublicUrl:path=>({data:{publicUrl:'https://example.test/'+path}})})},rpc:async(name,args)=>{window.mediaCalls.push([name,args]);return{};}};
  document.body.replaceChildren(coverUploader(db,{id:'event',cover_url:'https://example.test/old.jpg'},async()=>{window.mediaSaved=true;},()=>{}));
 });
 const input=page.getByLabel('Enviar capa do celular ou computador');
 await input.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await expect(page.getByRole('button',{name:'Salvar nova capa'})).toBeDisabled();
 expect(await page.evaluate(()=>window.mediaCalls.length)).toBe(0);
 await input.setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=','base64')});
 await expect(page.getByAltText('Prévia da nova capa')).toBeVisible();
 await page.evaluate(()=>window.mediaFail=true);await page.getByRole('button',{name:'Salvar nova capa'}).click();
 await expect(page.getByRole('status')).toContainText('A capa não foi alterada');
 expect(await page.evaluate(()=>window.mediaCalls.some(c=>c[0]==='set_event_cover'))).toBe(false);
 await page.evaluate(()=>window.mediaFail=false);await page.getByRole('button',{name:'Salvar nova capa'}).click();
 await expect.poll(()=>page.evaluate(()=>window.mediaSaved)).toBe(true);
 const calls=await page.evaluate(()=>window.mediaCalls);expect(calls.at(-1)[0]).toBe('set_event_cover');expect(calls.at(-1)[1].p_expected).toBe('https://example.test/old.jpg');
});
test('PMC lotado fica indisponível; inscrição antiga escolhe CAMUFLADO sem cancelar',async({page})=>{
 await page.goto('/connected.html');
 await page.evaluate(async()=>{
  const {renderGame}=await import('/src/catalogue.js');
  document.body.innerHTML='<main id="game-view"></main>';
  window.chosenTeam=null;
  renderGame({id:'event',title:'Teste',capacity:2,split_teams:true,status:'published',starts_at:'2030-12-01',ends_at:'2030-12-02',location:'Campo'},
   {session:{},joined:true,groups:[{id:'pmc',name:'PMC',capacity:1,active_registration_count:1},{id:'camo',name:'CAMUFLADO',capacity:1,active_registration_count:0}],onChooseTeam:async id=>{window.chosenTeam=id;},onError:e=>{window.testError=e.message;}});
 });
 await expect(page.getByRole('radio',{name:/PMC/})).toBeDisabled();await page.getByRole('radio',{name:/CAMUFLADO/}).check();
 await page.getByRole('button',{name:'Confirmar meu time'}).click();await expect.poll(()=>page.evaluate(()=>window.chosenTeam)).toBe('camo');
 await expect(page.getByText('Sua inscrição já está confirmada.',{exact:false})).toBeVisible();
});
