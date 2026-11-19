# npm publishing: GitHub Actions OIDC trusted publisher

Source: https://docs.npmjs.com/trusted-publishers

## Packages

Configure a **separate** trusted publisher on npmjs.com for each package:

- `@accelerate/authorization-core`
- `@accelerate/authorization-angular`
- `@accelerate/authorization-react`
- `@accelerate/authorization-postgres`

Use the same exact configuration for each:

| npm trusted publisher field | Value |
| --- | --- |
| CI provider | GitHub Actions |
| Organization or user | `archubbuck` |
| Repository | `devkit` |
| Workflow filename | `publish.yml` (filename only) |
| Environment | Leave blank (the workflow does not use an environment) |
| Allowed actions | Enable direct `npm publish` |

The workflow at `.github/workflows/publish.yml` runs on GitHub-hosted runners, grants `id-token: write`, uses Node 24 and npm 11.5.1+, and does not pass `NPM_TOKEN` to publishing steps. npm handles OIDC exchange and provenance automatically for public packages from a public repository.

## First-time bootstrap

npm requires a package page before configuring its trusted publisher. If the packages have **not** yet been published:

1. Verify ownership and publish access for the `@accelerate` npm scope.
2. Configure the existing GitHub repository secret `NPM_TOKEN` with a valid npm publishing token. Never paste it into code, documentation, logs, or chat.
3. Run **Bootstrap npm packages (one-time token)** (`.github/workflows/bootstrap-npm.yml`) using workflow dispatch and type `BOOTSTRAP` to confirm. The job builds, typechecks, and tests before publishing only missing package versions. If any check fails, fix the build before retrying.
4. Check each package's npm page, then configure its trusted publisher using the table above.
5. **For the first OIDC release, increment package versions** (npm will not republish an existing version), and run **Publish npm packages** (`.github/workflows/publish.yml`). Every package included in the workflow must have an unpublished version and a matching trusted-publisher configuration.
6. After successful OIDC publication, set each package's publishing access to **Require two-factor authentication and disallow tokens**, revoke the old npm publishing token, delete the `NPM_TOKEN` GitHub secret, and remove the one-time bootstrap workflow.

If packages already exist on npm, skip the bootstrap job and configure trusted publishers directly.

## Operational notes

- npm requires Node >=22.14.0 and npm CLI >=11.5.1 for trusted publishing.
- A new trusted-publisher configuration must complete its first successful publish within **two days** or it expires.
- The workflow is manually triggered; only authorized repository collaborators should have Actions permissions.
- All four packages currently publish in a fixed order. A package version already on npm will cause the regular release job to fail; increment versions before releasing.
- The publishing workflow does not use an npm token. Keep token-based bootstrap strictly one-time.
- Do not run the publish workflow until CI builds and tests have been verified. Production deployment also requires stronger security review, tenant isolation where relevant, and integration testing.
