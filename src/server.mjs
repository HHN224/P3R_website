import { createApp } from './app.mjs';
const { app, store } = createApp();
const port=Number(process.env.PORT || 3000);
const server=app.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`AFTER SCHOOL → ${process.env.SITE_URL || `http://localhost:${port}`}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{store.db.close();process.exit(0);}));
