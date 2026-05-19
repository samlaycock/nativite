# Runtime Requirements

> Maps to: `package.json`, `README.md`, `src/cli/config.ts`

## CLI Runtime

Bun is the required CLI runtime for Nativite 1.0. Use `bunx nativite ...`,
`bun run nativite ...`, or scripts executed by Bun for `nativite init`,
`nativite build`, `nativite dev`, and `nativite test`.

Node.js is not advertised as a supported CLI runtime. The CLI loads
`nativite.config.ts` directly from the project root, and the supported execution
path relies on Bun's TypeScript module loading instead of a Node loader or
transpilation step.

## Package Metadata

`package.json#engines` declares `bun >=1.0.0` and intentionally omits a Node.js
engine range. This keeps package-manager warnings and CI expectations aligned
with the documented CLI behavior.

## Public Entrypoints

Public package subpaths remain ESM imports documented in
[Package Exports](./package-exports.md). That import surface is separate from
the CLI runtime contract: importing public JavaScript modules is supported via
the published `import` conditions, while invoking the `nativite` binary is
supported through Bun.

## Troubleshooting

If `node ./node_modules/.bin/nativite`, `npx nativite`, or another Node-based
launcher fails while loading `nativite.config.ts`, rerun the command with Bun:

```bash
bunx nativite build
```
