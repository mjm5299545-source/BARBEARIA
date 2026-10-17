import {ready,db,databaseKind} from '../server/db.mjs';
try{await ready();console.log('Banco '+databaseKind+' inicializado.');}finally{await db.close();}
