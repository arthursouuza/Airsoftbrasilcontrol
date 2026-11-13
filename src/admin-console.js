import { coverUploader } from './event-media.js';
const el = (tag, text, className) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
  if (className) node.className = className; return node;
};
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
export const specs = {
  events: { label: 'Eventos', create: true, fields: [
    field('title','Título','text',{required:true,max:200}), field('description','Descrição','textarea'),
    field('location','Local','text',{required:true}), field('starts_at','Início','datetime-local',{required:true}),
    field('ends_at','Fim','datetime-local',{required:true}), field('price_cents','Valor da inscrição (R$)','money',{required:true}),
    field('capacity','Capacidade de vagas','number',{min:1}),
    field('status','Visibilidade','select',{options:[['draft','Rascunho'],['published','Publicado'],['cancelled','Cancelado']]}),
    field('poster_url','URL HTTPS do cartaz','url'),field('cover_url','URL HTTPS da capa','url'),
    field('groups','Texto sobre grupos','textarea'),field('schedule','Programação','textarea'),field('rules','Regras','textarea')
  ]},
  profiles: {label:'Jogadores',fields:[field('display_name','Nome de jogador','text',{required:true,max:100})]},
  teams: {label:'Equipes',create:true,fields:[field('name','Nome da equipe','text',{required:true,max:100}),field('description','Descrição da equipe','textarea')]},
  event_combat_groups: {label:'Grupos de combate',create:true,fields:[field('event_id','Evento','reference',{ref:'events',required:true,immutable:true}),field('name','Nome do grupo','text',{required:true,max:80}),field('capacity','Capacidade do grupo','number',{required:true,min:1})]},
  registrations: {label:'Inscrições',create:true,fields:[field('event_id','Evento','reference',{ref:'events',required:true}),field('player_id','Jogador','reference',{ref:'profiles',required:true}),field('combat_group_id','Grupo de combate','reference',{ref:'event_combat_groups'})]},
  payments: {label:'Pagamentos',create:true,fields:[field('registration_id','Inscrição','reference',{ref:'registrations',required:true,immutable:true}),field('amount_cents','Valor (R$)','money',{required:true}),field('method','Forma de pagamento','select',{options:[['manual_pix','Pix manual'],['cash','Dinheiro']]}),field('status','Estado do pagamento','select',{options:[['pending','Pendente'],['paid','Pago'],['refunded','Estornado']]} )]},
  site_content: {label:'Conteúdo do site',fields:[field('value','Texto publicado','textarea',{required:true,max:1000})]}
};
const contentLabels = {search_heading:'Título da busca',catalogue_description:'Descrição do catálogo',teams_description:'Descrição dos times',organize_heading:'Título para organizadores',organize_description:'Texto para organizadores',footer_tagline:'Frase do rodapé'};
function localTime(value) {
  if (!value) return '';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export async function allRows(db, resource, isCurrent) {
  const rows=[];
  for(let start=0;;start+=100){
    let query=db.from(resource).select('*').order(resource==='team_members'?'team_id':'id');
    if(resource==='team_members')query=query.order('user_id');
    const result=await query.range(start,start+99);
    if(!isCurrent()) return null;
    if(result.error) throw result.error;
    rows.push(...result.data); if(result.data.length<100) return rows;
  }
}
export function editor(resource, row, references, save, db = null, mediaSaved = null, onError = () => {}) {
  const form=el('form'); form.className='admin-editor';
  const spec=specs[resource];
  for(const f of spec.fields) {
    if(row && f.immutable) continue;
    const label=el('label',f.label); let input;
    if(f.type==='select'||f.type==='reference') {
      input=el('select');
      let options=f.options;
      if(f.type==='reference') options=(references[f.ref]||[]).map(r=>[r.id,referenceLabel(f.ref,r,references)]);
      if(f.type==='reference') {const empty=el('option',f.required?'Escolha…':'Sem grupo');empty.value='';input.append(empty);}
      for(const [value,text] of options){const option=el('option',text);option.value=value;input.append(option);}
    } else { input=el(f.type==='textarea'?'textarea':'input');
      if(f.type!=='textarea')input.type=f.type==='money'?'number':f.type;
    }
    input.name=f.key;input.setAttribute('aria-label',f.label);input.required=!!f.required;
    if(f.max)input.maxLength=f.max;
    if(['number','money'].includes(f.type)){input.min=String(f.min??0);input.step=f.type==='money'?'0.01':'1';input.max=f.type==='money'?'21474836.47':'2147483647';}
    const value=row?.[f.key];
    input.value=f.type==='datetime-local'?localTime(value):f.type==='money'?String((value??0)/100):value??(f.key==='status'?(resource==='payments'?'pending':'draft'):f.type==='select'?f.options[0][0]:'');
    label.append(input);form.append(label);
  }
  if (resource === 'events') {
    if (!row || row.split_teams) { const capacity=form.elements.capacity; capacity.required=true; capacity.min='2'; capacity.step='2'; }
    const help=el('p','Novos jogos: capacidade par, dividida igualmente entre PMC e CAMUFLADO. Cada jogador escolhe seu time.');form.append(help);
    if (db && row) form.append(coverUploader(db,row,mediaSaved,onError));
  }
  if(resource==='registrations') {
    const eventInput=form.elements.event_id,groupInput=form.elements.combat_group_id;
    const update=()=>{for(const option of groupInput.options){const group=(references.event_combat_groups||[]).find(g=>g.id===option.value);option.hidden=!!group&&group.event_id!==eventInput.value;option.disabled=option.hidden;}if(groupInput.selectedOptions[0]?.disabled)groupInput.value='';};
    eventInput.addEventListener('change',update);update();
  }
  const submit=el('button',row?'Salvar alterações':'Criar registro');submit.type='submit';form.append(submit);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submit.disabled)return;
    const data={};
    for(const f of spec.fields){const input=form.elements[f.key];if(!input)continue;
      const raw=input.value;
      data[f.key]=f.type==='money'?Math.round(Number(raw)*100):f.type==='number'?(raw===''?null:Number(raw)):f.type==='datetime-local'?new Date(raw).toISOString():raw;
      if(raw===''&&['poster_url','cover_url','groups','schedule','rules','combat_group_id'].includes(f.key))data[f.key]=null;
    }
    submit.disabled=true;
    try {await save(data);} finally {submit.disabled=false;}
  });
  return form;
}
export function referenceLabel(resource,row,refs) {
  if(resource==='registrations') return `${refs.events?.find(e=>e.id===row.event_id)?.title||row.event_id} · ${refs.profiles?.find(p=>p.id===row.player_id)?.display_name||row.player_id} · ${row.status}`;
  if(resource==='event_combat_groups')return `${row.name} · ${refs.events?.find(e=>e.id===row.event_id)?.title||row.event_id}`;
  return row.title||row.display_name||row.name||contentLabels[row.key]||row.key||row.id||row.team_id||'';
}
export async function renderConsole(db,container,isCurrent,reload,notice,eventRows) {
  const details=el('details');details.className='card admin-console';details.append(el('summary','Gerenciar jogadores, equipes, inscrições, grupos, pagamentos e conteúdo'));
  const nav=el('nav');nav.setAttribute('aria-label','Seções administrativas');nav.className='admin-tabs';
  const content=el('div');details.append(nav,content);container.append(details);
  let version=0;const refs={events:eventRows};
  async function get(resource){if(!refs[resource])refs[resource]=await allRows(db,resource,isCurrent);return refs[resource]||[];}
  async function save(resource,row,data){
    if(!isCurrent())return;
    try{
      if((resource==='payments'||resource==='registrations'&&!row)&&!window.confirm(resource==='payments'?'Confirmar este registro financeiro manual? Esta ação não realiza Pix ou estorno bancário.':'Confirmar esta inscrição? Os limites de vagas serão conferidos.'))return;
      const result=await db.rpc('admin_save',{p_resource:resource,p_id:row?.id||null,p_data:data,p_expected:row||null});
      if(!isCurrent())return;if(result.error)throw result.error;
      notice('Registro administrativo salvo.');await reload();
    }catch(error){if(isCurrent())notice(error.message||'Não foi possível salvar.',true);}
  }
  async function setMember(team,user,active,expected){
    if(!isCurrent())return;
    const result=await db.rpc('admin_set_team_member',{p_team_id:team,p_user_id:user,p_active:active,p_expected:expected});
    if(!isCurrent())return;if(result.error)throw result.error;notice('Vínculo de equipe salvo.');await reload();
  }
  async function show(resource){
    const current=++version;content.replaceChildren(el('p','Carregando…'));
    try{
      const rows=await get(resource);
      if(['registrations','payments','event_combat_groups','team_members'].includes(resource))await Promise.all(['profiles','registrations','event_combat_groups','teams'].map(get));
      if(!isCurrent()||version!==current)return;
      content.replaceChildren();const spec=specs[resource];
      if(spec?.create){const create=el('details');create.append(el('summary',`Novo registro · ${spec.label}`),editor(resource,null,refs,data=>save(resource,null,data)));content.append(create);}
      if(resource==='team_members'){
        const form=el('form');
        for(const [key,label,source] of [['team_id','Equipe','teams'],['user_id','Jogador','profiles']]){
          const field=el('label',label),select=el('select');select.name=key;select.required=true;
          for(const row of refs[source]||[]){const option=el('option',referenceLabel(source,row,refs));option.value=row.id;select.append(option);}field.append(select);form.append(field);
        }
        const submit=el('button','Adicionar jogador à equipe');submit.type='submit';form.append(submit);
        form.addEventListener('submit',async event=>{event.preventDefault();if(submit.disabled||!isCurrent())return;submit.disabled=true;try{await setMember(form.elements.team_id.value,form.elements.user_id.value,true,null);}catch(error){notice(error.message,true);}finally{submit.disabled=false;}});content.append(form);
      }
      const search=el('input');search.type='search';search.placeholder='Buscar nesta seção';search.setAttribute('aria-label',`Buscar em ${spec?.label||'Auditoria'}`);content.append(search);
      const list=el('div');list.className='admin-records';content.append(list);
      let visible=50;
      function draw(){
        list.replaceChildren();const needle=search.value.toLocaleLowerCase('pt-BR');
        const filtered=rows.filter(row=>JSON.stringify(row).toLocaleLowerCase('pt-BR').includes(needle)||String(referenceLabel(resource,row,refs)||'').toLocaleLowerCase('pt-BR').includes(needle));
        for(const row of filtered.slice(0,visible)){
          const card=el('article',undefined,'card');card.append(el('h3',referenceLabel(resource,row,refs)));
          card.append(el('p',`ID: ${row.id||row.team_id} ${row.status?'· '+row.status:''}`));
          if(resource==='registrations'){
            card.append(el('p',`Grupo: ${refs.event_combat_groups?.find(g=>g.id===row.combat_group_id)?.name||'Sem grupo'} · ${row.status}`));
            if(row.status==='active'){
              const cancel=el('button','Cancelar inscrição');cancel.addEventListener('click',async()=>{if(cancel.disabled||!isCurrent())return;if(!window.confirm('Cancelar inscrição? O pagamento será preservado e não haverá estorno automático.'))return;cancel.disabled=true;await save('registrations',row,{status:'cancelled'});cancel.disabled=false;});card.append(cancel);
            }
          }else if(spec){const edit=el('details');edit.append(el('summary','Editar registro'),editor(resource,row,refs,data=>save(resource,row,data)));card.append(edit);}
          else if(resource==='team_members'){
            card.append(el('p',`${refs.teams?.find(t=>t.id===row.team_id)?.name||row.team_id} · ${refs.profiles?.find(p=>p.id===row.user_id)?.display_name||row.user_id} · ${row.active?'Ativo':'Inativo'}`));
            const toggle=el('button',row.active?'Desativar vínculo':'Reativar vínculo');
            toggle.addEventListener('click',async()=>{if(toggle.disabled||!isCurrent())return;toggle.disabled=true;try{await setMember(row.team_id,row.user_id,!row.active,row);}catch(error){notice(error.message,true);}finally{toggle.disabled=false;}});card.append(toggle);
          }
          else {const pre=el('pre',JSON.stringify(row,null,2));card.append(pre);}
          list.append(card);
        }
        if(!filtered.length)list.append(el('p','Nenhum registro encontrado.'));
        if(filtered.length>visible){const more=el('button','Mostrar mais registros');more.addEventListener('click',()=>{visible+=50;draw();});list.append(more);}
      }
      search.addEventListener('input',()=>{visible=50;draw();});draw();
    }catch(error){if(isCurrent()&&version===current){content.replaceChildren(el('p','Seção indisponível. Atualize e confira a migração.'));notice(error.message,true);}}
  }
  for(const [resource,label] of [...Object.entries(specs).filter(([key])=>key!=='events').map(([key,s])=>[key,s.label]),['team_members','Membros das equipes'],['admin_audit','Auditoria de alterações'],['admin_event_audit','Auditoria de eventos']]){
    const button=el('button',label);button.type='button';button.addEventListener('click',()=>show(resource));nav.append(button);
  }
  details.addEventListener('toggle',()=>{if(details.open&&!content.children.length)show('profiles');});
  // Edição de eventos de qualquer organizador, sempre via RPC auditada.
  for(const card of container.querySelectorAll('[data-admin-event]')){
    const row=eventRows.find(e=>e.id===card.dataset.adminEvent);if(!row||row.status==='archived')continue;
    const edit=el('details');edit.append(el('summary','Editar evento'),editor('events',row,refs,data=>save('events',row,data),db,reload,error=>notice(error.message,true)));card.append(edit);
  }
}
