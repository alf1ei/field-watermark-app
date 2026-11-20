import { registerPlugin } from '@capacitor/core';

const GszdCamera2 = registerPlugin('GszdCamera2', {
  web: () => import('./web.js').then((m) => new m.GszdCamera2Web()),
});

export * from './definitions.js';
export { GszdCamera2 };
