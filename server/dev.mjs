import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['--watch','server/index.mjs'],{stdio:'inherit',env:{...process.env,PORT:'3001'}}),spawn('npm',['exec','vite','--','--host','0.0.0.0'],{stdio:'inherit'})];
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{children.forEach(c=>c.kill(signal));process.exit(0);});
for(const child of children)child.on('exit',code=>{children.forEach(c=>c.kill());process.exit(code||0);});
