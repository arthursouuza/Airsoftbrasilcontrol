const {test,expect}=require('@playwright/test');
const host='https://nzgpceglyxwtukrbdkam.supabase.co';
const fixtures=[
 {id:'a',title:'Operação Horizonte',location:'Campo Sul, Curitiba',starts_at:'2030-12-02T02:59:59Z'},
 {id:'b',title:'Operação Aurora',location:'Campo Norte, Curitiba',starts_at:'2030-12-02T03:00:00Z'},
 {id:'c',title:'Treino 100%_tático',location:'Campo Sul, São Paulo',starts_at:'2030-12-03T02:59:59Z'},
 {id:'d',title:'Operação Limite',location:'Campo Sul, Curitiba',starts_at:'2030-12-03T03:00:00Z'},
].map(e=>({...e,description:'Evento de teste',price_cents:0,status:'published'}));
async function setup(page,events=fixtures){
 const queries=[];
 await page.route(host+'/**',async route=>{
  const u=new URL(route.request().url());let data=[];
  if(u.pathname.endsWith('/events')){
   queries.push(u);
   data=events.filter(e=>{
    const combined=u.searchParams.get('or');
    if(combined){
     const clauses=[...combined.matchAll(/(title|location)\.ilike\."((?:\\.|[^"\\])*)"/g)];
     if(!clauses.some(([,field,pattern])=>e[field].toLocaleLowerCase('pt-BR').includes(pattern.replace(/\\(.)/g,'$1').slice(1,-1).replace(/\\([\\%_])/g,'$1').toLocaleLowerCase('pt-BR'))))return false;
    }
    for(const field of ['title','location']){
     const pattern=u.searchParams.get(field);
     if(pattern){const text=pattern.slice('ilike.%'.length,-1).replace(/\\([\\%_])/g,'$1');if(!e[field].toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR')))return false;}
    }
    return u.searchParams.getAll('starts_at').every(filter=>{
     const index=filter.indexOf('.'),op=filter.slice(0,index),date=filter.slice(index+1);
     return op==='gt'?new Date(e.starts_at)>new Date(date):op==='gte'?new Date(e.starts_at)>=new Date(date):op==='lt'?new Date(e.starts_at)<new Date(date):true;
    });
   });
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });return queries;
}
test.use({timezoneId:'America/Sao_Paulo'});
test('combina nome/local/data, preserva consulta pública e limpa filtros (API simulada)',async({page})=>{
 const queries=await setup(page);await page.goto('/index.html');await page.locator('#filters-panel summary').click();await expect(page.locator('#events h3')).toHaveCount(4);
 await page.getByLabel('Nome do evento',{exact:true}).fill('operação');await page.getByLabel('Local do evento',{exact:true}).fill('NORTE');await page.getByLabel('Data do evento',{exact:true}).fill('02/12/2030');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();
 await expect(page.locator('#events h3')).toHaveText(['Operação Aurora']);
 const query=queries.at(-1);expect(query.searchParams.get('title')).toBe('ilike.%operação%');expect(query.searchParams.get('location')).toBe('ilike.%NORTE%');expect(query.searchParams.get('status')).toBe('eq.published');
 expect(query.searchParams.getAll('starts_at')).toContain('gte.2030-12-02T03:00:00.000Z');expect(query.searchParams.getAll('starts_at')).toContain('lt.2030-12-03T03:00:00.000Z');expect(query.searchParams.getAll('starts_at').some(v=>v.startsWith('gt.'))).toBe(true);
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect.poll(()=>queries.length).toBeGreaterThan(2);expect(queries.at(-1).searchParams.get('title')).toBe('ilike.%operação%');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(page.locator('#events h3')).toHaveCount(4);await expect(page.getByLabel('Nome do evento',{exact:true})).toHaveValue('');await expect(page.getByLabel('Local do evento',{exact:true})).toHaveValue('');await expect(page.getByLabel('Data do evento',{exact:true})).toHaveValue('');expect(queries.at(-1).searchParams.has('title')).toBe(false);
});
test('data inclui início do dia e exclui início do dia seguinte (API simulada)',async({page})=>{
 await setup(page);await page.goto('/index.html');await page.locator('#filters-panel summary').click();await page.getByLabel('Data do evento',{exact:true}).fill('02/12/2030');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();await expect(page.locator('#events h3')).toHaveText(['Operação Aurora','Treino 100%_tático']);
});
test('busca literal, resultado vazio e limpeza (API simulada)',async({page})=>{
 const queries=await setup(page);await page.goto('/index.html');await page.locator('#filters-panel summary').click();await page.getByLabel('Nome do evento',{exact:true}).fill('100%_');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();await expect(page.locator('#events h3')).toHaveText(['Treino 100%_tático']);expect(queries.at(-1).searchParams.get('title')).toBe('ilike.%100\\%\\_%');
 await page.getByLabel('Nome do evento',{exact:true}).fill('não existe');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();await expect(page.locator('#events')).toContainText('Nenhum evento encontrado com esses filtros');await expect(page.locator('#events h3')).toHaveCount(0);
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(page.locator('#events h3')).toHaveCount(4);
});
test('celular permite preencher e limpar sem rolagem horizontal (API simulada)',async({page})=>{
 await setup(page);await page.setViewportSize({width:320,height:740});await page.goto('/index.html');await page.locator('#filters-panel summary').click();await page.getByRole('navigation',{name:'Navegação flutuante'}).getByRole('link',{name:'Buscar',exact:true}).click();await page.getByLabel('Local do evento',{exact:true}).fill('Curitiba');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();await expect(page.locator('#events h3')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(page.locator('#events h3')).toHaveCount(4);
});


test('data brasileira inválida não altera a consulta (API simulada)',async({page})=>{
 const queries=await setup(page);await page.goto('/jogos.html');await page.locator('#filters-panel summary').click();await expect(page.locator('#events h3')).toHaveCount(4);const before=queries.length;
 await page.getByLabel('Data do evento',{exact:true}).fill('31/02/2030');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();
 await expect(page.locator('#notice')).toContainText('data válida');expect(queries.length).toBe(before);
 await page.getByLabel('Data do evento',{exact:true}).fill('2030-12-02');await page.getByRole('button',{name:'Filtrar eventos',exact:true}).click();await expect(page.locator('#notice')).toContainText('dd/mm/aaaa');expect(queries.length).toBe(before);
});


test('busca principal combina nome ou local e mantém filtros públicos (API simulada)',async({page})=>{
 const queries=await setup(page);await page.goto('/jogos.html');await page.locator('#filters-panel summary').click();const input=page.getByRole('searchbox',{name:'Buscar por jogo, cidade ou campo'});
 await input.fill('Curitiba');await input.press('Enter');await expect(page.locator('#events h3')).toHaveText(['Operação Horizonte','Operação Aurora','Operação Limite']);
 await input.fill('Treino');await input.press('Enter');await expect(page.locator('#events h3')).toHaveText(['Treino 100%_tático']);
 const latest=queries.at(-1);expect(latest.searchParams.get('status')).toBe('eq.published');expect(latest.searchParams.get('or')).toBe('(title.ilike."%Treino%",location.ilike."%Treino%")');
 await page.getByRole('button',{name:'Limpar filtros'}).click();await expect(input).toHaveValue('');await expect(page.locator('#events h3')).toHaveCount(4);
 await input.fill('x",status.eq.draft');await input.press('Enter');await expect(page.locator('#events')).toContainText('Nenhum evento encontrado');expect(queries.at(-1).searchParams.get('status')).toBe('eq.published');expect(queries.at(-1).searchParams.get('or')).toContain('x\\",status.eq.draft');
});
