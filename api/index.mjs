// Vercel invokes this handler; server/index.mjs does not open a listening socket on Vercel.
import {app} from '../server/index.mjs';
export default app;
