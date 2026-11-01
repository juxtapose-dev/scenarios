# Releasing Scenarios

Releases use the manually dispatched `.github/workflows/release.yml`. Merging a
PR does not publish anything. Stable releases only; prerelease channels are not
implemented. GitHub source visibility and npm package visibility are separate.

## One-time npm setup

For `@juxtapose/scenarios`, configure a GitHub Actions trusted publisher in npm:

- Organization: `juxtapose-dev`
- Repository: `scenarios`
- Workflow filename: `release.yml` (not the directory path)
- Environment: leave blank; this workflow does not use a GitHub environment
- Allow direct `npm publish`

Use GitHub-hosted runners. Publishing uses OIDC, not `NODE_AUTH_TOKEN` or a stored
npm write token. Do not add a token as a workaround for a publisher mismatch.
The workflow pins npm 12.2.1 on Node 24, disables package-manager caching, and
requests `id-token: write` only in the publishing job. A public repository enables
npm provenance; the workflow sets provenance according to repository visibility.
Keep `package.json`'s repository URL aligned with the actual repository.

npm currently requires the first successful publish within two days of adding
the publisher. If an unused configuration expires, recreate it when ready to
release. Saving the settings does not prove that OIDC works: the first real
publish is the end-to-end authentication check.

Reference: https://docs.npmjs.com/trusted-publishers/

## Prepare a release PR

1. Choose a new stable version. The first release containing the inspection and
   reproduction additions should be 0.3.0, following published 0.2.1.
2. Update `package.json` and add an entry to `CHANGELOG.md` using the existing
   `## VERSION — YYYY-MM-DD` heading format. Add useful migration notes.
3. Update README installation/version instructions and replace next-release
   wording in consumer guides. Do not widen support claims without evidence.
4. Run verification, review, and merge. No npm authentication is needed for this.

## Run the release

In GitHub Actions, select **Release → Run workflow**, choose **main**, and supply
the exact reviewed package version. The workflow is also callable with:

```sh
gh workflow run release.yml --repo juxtapose-dev/scenarios --ref main -f version=0.3.0
```

The workflow binds both jobs to the commit selected at dispatch time. It rejects
other branches/repositories, mismatched versions, dirty checkouts, missing notes,
and artifact/source mismatches. New publication must advance the current `latest`
version. Releases are serialized; an in-progress release is not canceled by another.

The preparation job runs the full quality gate plus repeated browser conformance.
The final package check exports the exact tarball it tested; it never rebuilds that
artifact for publication. The uploaded `scenarios-release` artifact contains only
`scenarios.tgz`, an integrity/source manifest, and the selected changelog entry.
It is retained for 30 days. Published-file allowlisting and isolated TypeScript
consumers run before the tarball is exported.

The publish job downloads that artifact, validates its SHA-512 integrity, source
commit, package identity/version, and notes. It installs no application dependencies
and runs no tarball lifecycle scripts. It publishes with OIDC, verifies registry
integrity and the `latest` version, then creates an immutable version tag and a
GitHub release. No service deployment or dependency update runs as part of this.

## Reruns and partial failures

- Failure before publication: fix the problem; rerun if the reviewed inputs are
  unchanged, otherwise prepare a new release commit. Do not bypass checks.
- npm authentication failure: verify the exact organization, repository, filename,
  direct-publish permission, and initial configuration expiry. Check that the
  workflow has OIDC permission; never paste a token into a log or issue.
- Publish succeeded but registry verification or GitHub release failed: rerun the
  same workflow run/commit. The identical registry artifact is accepted and not
  published again. Registry verification requests fresh metadata and waits roughly
  three minutes for propagation; network request timeouts may add to that bound.
- Same version with different integrity: stop. npm versions are immutable; retain
  the original verified artifact or use a new version. Never unpublish to repair
  an automation mismatch. If rebuilding is not byte-identical, download the
  original run's artifact rather than treating the rebuild as the published file.
- Existing tag at another commit, or an existing draft release: stop and inspect
  manually. The workflow never force-moves tags or overwrites release records.
- A later version is already published: an identical older release can finish its
  missing GitHub record, but a new older publication is refused. Reruns never move
  `latest` backward.

Confirm the final registry version/integrity and GitHub tag target. Restore a
consumer's exact dependency pin only through its normal reviewed dependency update.
This automation has no rollback operation; a corrective package is a new version.
