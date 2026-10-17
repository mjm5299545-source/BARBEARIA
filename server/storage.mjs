import {mkdirSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {db,dataDir,uid,isVercel,ConfigurationError} from './db.mjs';
export const uploadsDir=path.join(dataDir,'uploads');
export const cloudUploads=()=>!!process.env.BLOB_READ_WRITE_TOKEN;
export const uploadsConfigured=()=>cloudUploads()||!isVercel;
export function isBlobUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname);}catch{return false;}}
export async function storeImage(buffer){
 const filename=uid()+'.webp';
 if(cloudUploads()){
  const {put,del}=await import('@vercel/blob');
  const blob=await put('grecco/'+filename,buffer,{access:'public',contentType:'image/webp',addRandomSuffix:false,cacheControlMaxAge:31536000});
  if(!isBlobUrl(blob.url))throw new Error('Destino de armazenamento inesperado.');
  try{await db.prepare('INSERT INTO media_assets(id,url,created_at) VALUES(?,?,?)').run(filename,blob.url,new Date().toISOString());}catch(error){await del(blob.url).catch(()=>{});throw error;}
 }else{
  if(isVercel)throw new ConfigurationError('Conecte Vercel Blob ao projeto para enviar fotos.');
  mkdirSync(uploadsDir,{recursive:true,mode:0o700});await writeFile(path.join(uploadsDir,filename),buffer,{mode:0o600,flag:'wx'});
 }
 return '/uploads/'+filename;
}
