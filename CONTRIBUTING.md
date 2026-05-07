# Contributing

Thanks for helping improve Nativite.

## Development Setup

Use Bun for all package management and scripts. Do not use `npm` or `yarn`.

```bash
bun install
bun run build
bun run typecheck
bun run lint
bun run fmt:check
bun run test
```

Native runtime tests are available when the relevant platform toolchains are installed:

```bash
bun run test:native:ios
bun run test:native:android
```

## Pull Requests

- Follow the repository conventions in [`conventions/`](./conventions/).
- Add or update tests for behavior changes.
- Keep [`docs/`](./docs/README.md) aligned with implementation changes.
- Include a changeset for user-facing changes.
- Use Conventional Commit style for commit messages.

## Bug Reports

Please include:

- Nativite version or commit SHA.
- Bun, Node, Vite, Xcode, Android Studio, and OS versions where relevant.
- The target platform: iOS, macOS, Android, or custom platform.
- A minimal reproduction or the smallest config/code sample that shows the issue.
- Full command output for failures.
