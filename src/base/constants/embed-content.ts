// ── back-compat re-export for the rok-commander pack ─────────────────────
// What:  the original location of the bot's copy constants. The content
//        moved to `@base/copy/packs/rok-commander.pack` as part of the
//        streamer-plugin spec Phase 1 (key-based plugin lookup). This
//        file stays in place so the ~96 existing import sites that read
//        `embedContent` keep compiling and behave identically.
// Who:   every legacy caller that does
//        `import { embedContent } from "@base/constants/embed-content.js"`.
//        New code SHOULD use `getPluginCopy(guildConfig)` from
//        `@base/copy/getCopy.js` so per-guild plugin selection and the
//        Phase 3 owner override layer are honored.
// When:  imported wherever a copy string or builder is read. The shim has
//        zero runtime cost — it is a pure re-binding under a different
//        identifier.
// Where: removing this file is a follow-up step gated on every legacy
//        call site migrating to `getPluginCopy`. Until that happens, the
//        shim is the bridge that lets the pack architecture ship without
//        a 96-touch refactor in the same change.
// How:   re-exports `rokCommanderCopy` under the legacy name `embedContent`.
//        TypeScript treats this re-export as fully type-equivalent, so
//        every existing destructure (`const c = embedContent.scheduleBoard`)
//        and function call (`embedContent.reminder.title(name, mins)`)
//        continues to typecheck unchanged.
export { rokCommanderCopy as embedContent } from "@base/copy/packs/rok-commander.pack.js";
export type { IEmbedField } from "@base/copy/types.js";
