import { initialize, index } from '../server/store.mjs';
await initialize();
await index();
console.log('Knowledge index updated.');
