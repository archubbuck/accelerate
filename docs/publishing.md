# npm publishing

The npm scope `@devkit` must be owned by the publishing npm account or organization. GitHub repository ownership alone does not grant npm publishing rights.

## First release

1. Confirm ownership of the `@devkit` scope at npmjs.com.
2. Configure an npm automation/granular access token with publish access to the scope, then save it as the GitHub Actions repository secret `NPM_TOKEN`. Do not commit tokens.
3. Ensure package versions do not already exist on npm.
4. Run GitHub Actions > **Publish npm packages** > **Run workflow**.
5. Verify all three packages on npm and test installation in a clean Angular and React project.

The workflow uses `--provenance` with GitHub OIDC. For a later release, prefer npm trusted publishing with a supported Node/npm version and remove long-lived tokens. Never run the workflow until CI build and tests pass.

Current packages are pre-1.0 and the memory adapter is not a durable production authorization store. Server-side authorization must be enforced independently of frontend checks.
