# Release Gate

> Maps to: `.github/workflows/publish.yml`, `package.json`

Publishing runs through `.github/workflows/publish.yml` whenever commits land on
`main`. The workflow requires the full JavaScript quality gate and native release
gate to pass before Changesets can publish to npm.

## JavaScript Quality Gate

The release job installs dependencies with `bun install --frozen-lockfile`, then
runs:

```bash
bun run build
bun run typecheck
bun run lint
bun run fmt:check
bun run test
```

The `ci:publish` package script repeats the same quality gate before
`changeset publish`. This keeps npm provenance intact through the Changesets
publish step while preventing a direct publish command from bypassing the
release checks.

## Native Release Gate

Native release checks run as required `needs` jobs for the release job:

```bash
bun run test:native:ios
bun run test:generated:native:ios
bun run test:generated:native:macos
bun run test:native:android
bun run test:generated:native:android
```

The publish workflow does not use the pull request path filters from
`.github/workflows/native-tests.yml`. Native runtime and generated-app smoke
checks therefore run for release commits even when the release commit only
contains version or changelog updates.

## Publish Step

After every gate passes, `changesets/action` runs `bun run ci:publish`. The
package keeps `"publishConfig": { "provenance": true }`, so npm publishing still
uses trusted publishing provenance from the GitHub Actions release workflow.

Release PRs that alter public exports, config, CLI behavior, generated native
project contracts, NCLP, native bridge payloads, or first-party plugin APIs must
update [Public API Contract](./public-api-contract.md) and include a changeset
that states whether the change is patch, minor, or major under that policy.
