// Runtime companion to definitions.d.ts.
//
// definitions.d.ts holds only TypeScript types (interfaces), which produce
// no runtime code. This file exists so that `export * from './definitions.js'`
// in index.js resolves at runtime (Node ESM requires the target file to
// exist). It intentionally exports nothing.
export {};
