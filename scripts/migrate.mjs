// Administrative database credentials are used only by this offline command.
if(process.env.SUPABASE_URL){
 if(!process.env.SUPABASE_PROJECT_REF||process.env.GRECCO_CONFIRM_PROJECT_REF!==process.env.SUPABASE_PROJECT_REF){console.error('Confirme explicitamente o projeto NOVO da Grecco em GRECCO_CONFIRM_PROJECT_REF. Nada foi alterado.');process.exit(1);}
 if(!process.env.DATABASE_MIGRATION_URL||!/^[a-f0-9]{64}$/i.test(process.env.DATABASE_APP_PASSWORD||'')){console.error('Configure DATABASE_MIGRATION_URL e DATABASE_APP_PASSWORD (32 bytes hex) somente no ambiente seguro deste comando.');process.exit(1);}
 process.env.DATABASE_URL=process.env.DATABASE_MIGRATION_URL;
 process.env.DATABASE_MIGRATING='1';
 if(process.env.DATABASE_SCHEMA&&process.env.DATABASE_SCHEMA!=='grecco'){console.error('Supabase usa exclusivamente o schema grecco.');process.exit(1);}
}
const {ready,db,databaseKind}=await import('../server/db.mjs');
try{
 await ready();
 if(process.env.SUPABASE_URL)await db.prepare("ALTER ROLE grecco_backend PASSWORD '"+process.env.DATABASE_APP_PASSWORD+"'").run();
 console.log('Migrations '+databaseKind+' concluídas. Nenhuma credencial foi exibida.');
}catch(error){console.error('Migration não concluída:',error.code||error.name,error instanceof (await import('../server/errors.mjs')).ConfigurationError?error.message:'Confira o projeto, as permissões e a conectividade do banco.');process.exitCode=1;}
finally{await db.close();}
