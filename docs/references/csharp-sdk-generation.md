# C# SDK generation

The C# release job owns a private OpenAPI normalization step. The shared TSOA
spec and TypeScript response types are unchanged, as are other SDK inputs.

`scripts/generate-csharp.mjs` renames `PlayoffCompetition.Cfp` to `Cfp`, updating
all matching `$ref` values and discriminator mappings. It rejects an existing
target name/namespace (case-insensitively), a missing source schema, or changes
to the single-value string enum. The wire value remains `cfp`.

Generation uses Kiota **1.35.0**, pinned to the version in the failing SDK's
lock file. It generates into a fresh temporary directory before synchronizing
Kiota-owned source. Obsolete generated files, including
`Models/PlayoffCompetition/Cfp.cs`, are removed. Project files, handwritten code,
and build artifacts are preserved. The unused, historically published
`Models/LiveGamePlay_rushPash.cs` enum is explicitly retained for compatibility;
its removal is outside this fix's scope.

Before committing or pushing, the release job verifies deterministic repeat
generation, builds in Release configuration, packs locally, and runs a compiled
JSON serialization/deserialization smoke test against the actual SDK project.
Any failure stops the job; the C# job no longer uses `continue-on-error`.
The validation package and smoke project are temporary and never committed or
published. This gate runs after deployment under the existing release graph;
it prevents a broken SDK push, not an already completed API deployment.

## Local validation

Use Node.js, .NET 8 and Kiota 1.35.0 on PATH, plus a disposable checkout of
`CFBD/cfbd-net`. No API key or database connection is needed.

```bash
pnpm exec tsoa spec-and-routes
node --test scripts/generate-csharp.test.mjs
node scripts/generate-csharp.mjs build/swagger.json /tmp/cfbd-net
node scripts/verify-csharp.mjs build/swagger.json /tmp/cfbd-net
git -C /tmp/cfbd-net diff --stat
```

The script tests cover alias collisions, references, unchanged wire values,
stale-source cleanup, compatibility preservation, and generation/build/pack
failure propagation. The .NET smoke test compiles the flat `Cfp` property and
the separate `PlayoffCompetition` enum, deserializes `{"competition":"cfp"}`,
and serializes the model back through Kiota's JSON writer.

## Reproduction and output review (2026-10-03)

The baseline SDK checkout was `455da41` (5.32.0). Building it produced CS0101
for `CollegeFootballData.Models.PlayoffCompetition`. Generating from this API's
current `build/swagger.json` with Kiota 1.35.0 independently reproduced both
`Models/PlayoffCompetition.cs` and `Models/PlayoffCompetition/Cfp.cs`; building
that freshly generated output also failed with CS0101.

The raw schema contains `PlayoffCompetition.Cfp` plus dotted generic schema
names for preview `Pick` types and a stat-ranking `Record` type. In a controlled
experiment, replacing only the other dotted schema names and references with
underscore names restored flat `Cfp` generation without altering the member
schema. This supports the common-prefix hypothesis; the fix does not depend
on undocumented prefix-stripping behavior.

After normalization, the generated diff against that checkout is limited to:

- `Models/CfpPlayoff.cs`: remove the nested namespace import; use flat `Cfp`
  in the nullable property, `GetEnumValue<Cfp>`, and `WriteEnumValue<Cfp>`.
- `Models/PlayoffCompetition/Cfp.cs`: delete the obsolete nested enum.
- `kiota-lock.json`: update the schema hash.

The existing flat `Models/Cfp.cs` is byte-identical to the last successful
generation (`4243ca2`, 5.30.1), and `Models/PlayoffCompetition.cs` is unchanged.
There is no intended public type change from the published package.

Release build, pack, JSON round trip, and repeated generation pass. Restore
reports the existing NU1903 warning for Microsoft.Kiota.Abstractions 1.19.0;
dependency upgrades are outside this generator fix.

Merge this API change and run the normal release workflow to regenerate and
push the validated SDK, then confirm the downstream NuGet workflow succeeds.
Local verification does not publish, push, rotate credentials, or deploy.
