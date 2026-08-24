# Security Policy

## Reporting a vulnerability

Report privately through [GitHub security advisories](https://github.com/ExaDev/markmv/security/advisories/new) ("Report a vulnerability"). Please do not open a public issue for anything security-sensitive. Include the affected version, a reproduction, and the impact as you understand it; a proof of concept helps but is not required.

## Supported versions

The latest release on npm is the only supported version. Releases are cut automatically from `main` by semantic-release; there are no backport branches.

## What is in scope

markmv moves, splits, joins, and rewrites markdown files based on link targets parsed out of their content, and exposes that behaviour over three interfaces (the CLI, an MCP server, and a REST API server). The following are all in scope:

- Path traversal: a crafted link target (`../../../etc/passwd`, an absolute path, a symlink) causing a write, move, or delete outside the directory a command was actually pointed at.
- Anything that lets parsed markdown content (a link target, a frontmatter value, an embedded reference) reach the filesystem or a subprocess beyond what the operation's own destination legitimately requires.
- Server-side request forgery: `validate --check-external` and the `clip` command both fetch URLs found in or given to them (`src/core/link-validator.ts`, `src/core/web-clipper.ts`); a report showing either can be made to reach an internal address, a cloud metadata endpoint, or a non-http(s) scheme is in scope.
- Content escaping into a context where it executes: an HTML page clipped by `web-clipper.ts` (via Readability/Turndown) that survives conversion to markdown in a form that later renders as active content in a downstream viewer.
- The MCP server (`src/mcp-server.ts`) and REST API server (`src/api-server.ts`) accepting an operation their input schema should have rejected, or performing one beyond what the caller requested.

## What is out of scope

- The REST API server (`markmv-api`) has no built-in authentication and, by default, binds to every network interface, not just localhost -- this is documented, expected behaviour for a local development tool, not a vulnerability on its own. Running it reachable from an untrusted network without a reverse proxy or firewall in front of it is a deployment choice, not a markmv bug; a report is in scope only if it shows a way to bypass such a proxy/firewall, not that the server itself lacks one.
- Denial of service from a large or deeply nested markdown file you supplied to your own process. A report is useful when it shows a way to trigger disproportionate resource use relative to input size, not that a large input takes proportionate time to process.
- Vulnerabilities in a transitive dependency with no reachable path from this code. Dependabot already tracks advisories against every dependency here, and CI auto-fixes what it can (see below); a report is useful when you can show the vulnerable path is actually reachable through markmv's own API surface.

## Supply-chain posture

- Dependency versions must be at least 7 days old before pnpm will install them (`minimumReleaseAge` in `pnpm-workspace.yaml`), giving a compromised release time to be caught and pulled before it reaches this project.
- CI audits at the `high` level on every push to `main` and auto-fixes what it can via a pinned override, landed through its own pull request gated on that PR's own CI run (`.github/scripts/audit-autofix.ts`) -- anything it can't fix (no patch yet, the fix itself too new) is deferred and surfaced as a warning rather than silently ignored.
- Dependabot's own bumps are gated the same way: a version published within the last 7 days is never auto-merged, however benign it looks (`.github/scripts/check-dependency-age.ts`).
- Every release publishes to npm through OIDC trusted publishing -- no long-lived npm token exists in this repository's secrets -- with npm's own build provenance attached. CI also generates an SPDX SBOM for each release and signs a build-provenance attestation over it, attached to the GitHub Release as `sbom.spdx.json`.
