// Real PostgreSQL tests. No Supabase Auth server is started: auth.uid() is emulated locally.
// Creates a fresh isolated DB; refuses remote hosts. Never point at a production database.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const adminUrl = new URL(process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/postgres');
if (!['127.0.0.1','localhost'].includes(adminUrl.hostname)) throw Error('Local test database required');
const admin = new pg.Client({connectionString:adminUrl.href});
await admin.connect();
const name = 'abc_test_'+randomUUID().replaceAll('-','');
await admin.query(`create database ${name}`);
const testUrl = new URL(adminUrl); testUrl.pathname = '/'+name;
const db = new pg.Client({connectionString:testUrl.href}); await db.connect();
const pool = new pg.Pool({connectionString:testUrl.href,max:30});
const ids = Array.from({length:25},()=>randomUUID());
async function as(id,sql,args=[]) {
  const c=await pool.connect();
  try { await c.query('begin'); await c.query(`set local role ${id?'authenticated':'anon'}`); if(id) await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); const result=await c.query(sql,args);await c.query('commit');return result; }
  catch(error){await c.query('rollback');throw error;}finally{c.release();}
}
async function denied(task,code){await assert.rejects(task,error=>error.code===code);}
const eventValues=['Operação real de teste','Campo teste', 'Milsim', 'Descrição para teste'];
async function event(owner,capacity=1) {
  return (await as(owner,`insert into public.events(title,location,mode,description,starts_at,capacity) values($1,$2,$3,$4,now()+interval '1 day',$5) returning id`,[...eventValues,capacity])).rows[0].id;
}
async function invariant(eventId) {
  const {rows:[r]}=await db.query(`select e.occupied,e.capacity,count(r.id)::int as actual from public.events e left join public.registrations r on r.event_id=e.id where e.id=$1 group by e.id`,[eventId]);
  assert.equal(r.occupied,r.actual);assert.ok(r.occupied<=r.capacity);return r;
}
try {
  await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end $$;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.query(await readFile(new URL('../supabase/migrations/20261113020000_auth_events_registrations.sql',import.meta.url),'utf8'));
  for(const [i,id] of ids.entries()) {
    await db.query('insert into auth.users(id) values($1)',[id]);
    await as(id,'insert into public.profiles(display_name,team) values($1,$2)',[`Jogador ${i}`,'Equipe teste']);
  }
  const a=ids[0],b=ids[1];
  assert.equal((await as(a,'select * from public.profiles')).rows.length,1);
  assert.equal((await as(b,'update public.profiles set display_name=$1 where id=$2',['Intruso',a])).rowCount,0);
  await denied(as(b,'insert into public.profiles(id,display_name) values($1,$2)',[a,'Intruso']),'42501');
  const e=await event(a,1);
  assert.equal((await as(null,'select id from public.events')).rows.length,1);
  await denied(as(null,'select * from public.profiles'),'42501');
  await denied(as(null,'select * from public.registrations'),'42501');
  await denied(as(null,'insert into public.events(title) values($1)',['Intruso']),'42501');
  assert.equal((await as(b,'update public.events set title=$1 where id=$2',['Intruso',e])).rowCount,0);
  await denied(as(b,'insert into public.events(organizer_id,title,location,mode,description,starts_at,capacity) values($1,$2,$3,$4,$5,now()+interval \'1 day\',1)',[a,...eventValues]),'42501');
  await denied(as(a,'update public.events set occupied=0 where id=$1',[e]),'42501');
  await denied(as(a,'update public.events set organizer_id=$1 where id=$2',[b,e]),'42501');
  await denied(as(a,'delete from public.events where id=$1',[e]),'42501');
  await denied(as(b,'insert into public.registrations(event_id,player_id) values($1,$2)',[e,a]),'42501');
  assert.equal((await invariant(e)).occupied,0);
  // Twenty independent connections contend for the same last seat.
  const results=await Promise.allSettled(ids.slice(1,21).map(id=>as(id,'insert into public.registrations(event_id) values($1) returning id',[e])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await invariant(e)).occupied,1);
  for(const result of results.filter(r=>r.status==='rejected')) assert.match(result.reason.message,/EVENT_UNAVAILABLE/);
  const winnerIndex=results.findIndex(r=>r.status==='fulfilled')+1, winner=ids[winnerIndex];
  const intruder=ids.find(id=>id!==a&&id!==winner);
  assert.equal((await as(intruder,'select * from public.registrations')).rowCount,0);
  assert.equal((await as(a,'select * from public.registrations')).rowCount,1);
  assert.equal((await as(a,'delete from public.registrations where event_id=$1',[e])).rowCount,0);
  await denied(as(intruder,'select * from public.event_roster($1)',[e]),'42501');
  const roster=(await as(a,'select * from public.event_roster($1)',[e])).rows;
  assert.equal(roster.length,1);assert.ok(!('email' in roster[0]));
  await denied(as(a,'update public.events set capacity=0 where id=$1',[e]),'23514');
  // Double cancellation decrements exactly once.
  const cancelled=await Promise.all([as(winner,'delete from public.registrations where event_id=$1',[e]),as(winner,'delete from public.registrations where event_id=$1',[e])]);
  assert.equal(cancelled.reduce((n,r)=>n+r.rowCount,0),1);assert.equal((await invariant(e)).occupied,0);
  await as(a,'update public.events set closed=true where id=$1',[e]);
  await denied(as(b,'insert into public.registrations(event_id) values($1)',[e]),'P0001');
  await as(a,'update public.events set closed=false,starts_at=now()-interval \'1 day\' where id=$1',[e]);
  await denied(as(b,'insert into public.registrations(event_id) values($1)',[e]),'P0001');
  const dupe=await event(a,10);
  const duplicateResults=await Promise.allSettled(Array.from({length:10},()=>as(b,'insert into public.registrations(event_id) values($1)',[dupe])));
  assert.equal(duplicateResults.filter(r=>r.status==='fulfilled').length,1);
  for(const r of duplicateResults.filter(r=>r.status==='rejected')) assert.equal(r.reason.code,'23505');
  // ON CONFLICT must not increment the counter for skipped rows.
  await as(b,'insert into public.registrations(event_id) values($1) on conflict do nothing',[dupe]);
  assert.equal((await invariant(dupe)).occupied,1);
  await denied(as(b,'update public.registrations set event_id=$1',[e]),'42501');
  // Rollback releases both the registration and the counter.
  const c=await pool.connect(); await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[22]]);await c.query('insert into public.registrations(event_id) values($1)',[dupe]);await c.query('rollback');c.release();
  assert.equal((await invariant(dupe)).occupied,1);
  // Capacity edit holds the same row lock as registration; the waiting insert sees new capacity.
  const race=await event(a,2);
  await as(b,'insert into public.registrations(event_id) values($1)',[race]);
  const editor=await pool.connect(); await editor.query('begin');await editor.query('set local role authenticated');await editor.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);await editor.query('update public.events set capacity=1 where id=$1',[race]);
  const waiting=as(ids[23],'insert into public.registrations(event_id) values($1)',[race]);
  const rejected=denied(waiting,'P0001');await new Promise(r=>setTimeout(r,100));await editor.query('commit');editor.release();await rejected;
  assert.equal((await invariant(race)).occupied,1);
  // Reverse race: insertion owns the event lock first; a waiting shrink must then fail.
  const reverseRace=await event(a,2);
  await as(b,'insert into public.registrations(event_id) values($1)',[reverseRace]);
  const inserter=await pool.connect();await inserter.query('begin');await inserter.query('set local role authenticated');await inserter.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[24]]);await inserter.query('insert into public.registrations(event_id) values($1)',[reverseRace]);
  const shrinking=denied(as(a,'update public.events set capacity=1 where id=$1',[reverseRace]),'23514');
  await new Promise(r=>setTimeout(r,100));await inserter.query('commit');inserter.release();await shrinking;
  assert.equal((await invariant(reverseRace)).occupied,2);
  // Profile deletion by administrator cascades registration removal and releases seats.
  await db.query('delete from public.profiles where id=$1',[b]);
  assert.equal((await invariant(dupe)).occupied,0);assert.equal((await invariant(race)).occupied,0);
  console.log('PASS PostgreSQL: RLS/column grants, private profiles/rosters, ownership, 20 simultaneous last-seat requests, 10 duplicate requests, ON CONFLICT, cancellation, rollback, capacity race, closed/past events, cascade. Auth itself is NOT covered.');
} finally {
  await pool.end();await db.end();
  await admin.query(`drop database ${name} with (force)`);await admin.end();
}
