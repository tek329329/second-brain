import { initialize, audit, save } from '../server/store.mjs';
await initialize();
const result = await audit();
await save({
  title: 'Knowledge audit · ' + new Date().toISOString(),
  body: JSON.stringify(result, null, 2),
  area: 'knowledge',
  kind: 'audit',
  status: 'confirmed',
  source: 'Local maintenance audit',
  links: [],
});
console.log(JSON.stringify(result, null, 2));
