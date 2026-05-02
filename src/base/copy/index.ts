// ── @base/copy barrel export ─────────────────────────────────────────────
// What:  a single import surface for plugin-aware copy. Lets call sites
//        write `import { getPluginCopy } from "@base/copy"` instead of
//        reaching into the file structure.
// Who:   any module that needs the resolver, override lookup, or types.
//        Pack files DO NOT import from this barrel (it would re-import
//        them, creating a cycle); they import from `./types.js` directly.
// Where: lives at `@base/copy/index`. The TypeScript module resolution
//        (`moduleResolution: "bundler"`) maps a directory import to its
//        index file, so `from "@base/copy"` resolves here.
export { getPluginCopy, getCopyOverride } from "./getCopy.js";
export type { ICopyConfig } from "./getCopy.js";
export { COPY_PACKS, DEFAULT_PLUGIN_ID } from "./packs.js";
export type { IPluginCopy, IEmbedField, PluginId } from "./types.js";
