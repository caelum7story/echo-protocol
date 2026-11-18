import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function openLocalD1(file=':memory:'){
 const db=new DatabaseSync(file===':memory:'?file:path.toNamespacedPath(file));
 const migrations=path.resolve(import.meta.dirname,'../drizzle');
 for(const f of (await fs.readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())db.exec(await fs.readFile(path.join(migrations,f),'utf8'));
 const statement=(sql,args=[])=>({sql,args,bind(...values){return statement(sql,values);},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
 return {prepare:sql=>statement(sql),async batch(statements){db.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close();}};
}
