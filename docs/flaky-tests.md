# Trunk Flaky Tests

CI uploads JUnit XML from its test lanes to [Trunk Flaky Tests], which tracks
each test's pass/fail history across runs and surfaces the ones that fail
non-deterministically. Nothing about how tests run changed: the upload is an
extra step at the end of a lane, and reporting never gates CI.

## Setup

One repository Actions secret, `TRUNK_ORG_TOKEN` — a Trunk organization API
token for the `boundaryml` org (Settings → Manage → Organization API token in
the [Trunk app]). Everything else is checked in.

Without it (including on every fork PR, where GitHub withholds repository
secrets) the upload step skips and CI behaves exactly as before.

## How a lane reports

Two pieces per lane:

1. The test run writes JUnit XML.
   - Rust: nothing to do. `baml_language/.config/nextest.toml` puts
     `[profile.default.junit]` on the default profile, so every `cargo nextest
     run` — including `cargo insta test --test-runner nextest` — writes
     `baml_language/target/nextest/default/junit.xml`.
   - Vitest: the package's `vitest.config.ts` adds the `junit` reporter when
     `CI` is set, writing `junit.xml` in the package root.
   - pytest: `--junitxml=junit.xml` on the invocation.
2. A step calls `.github/actions/upload-test-results` with the report path,
   a `variant`, the token, and the test step's `outcome`.

```yaml
- name: "Run tests with nextest"
  id: nextest
  run: cargo nextest run --workspace
  working-directory: baml_language

- name: "Report test results to Trunk"
  if: ${{ !cancelled() && steps.nextest.outcome != 'skipped' }}
  uses: ./.github/actions/upload-test-results
  with:
    junit-paths: baml_language/target/nextest/default/junit.xml
    variant: linux-gnu
    token: ${{ secrets.TRUNK_ORG_TOKEN }}
    previous-step-outcome: ${{ steps.nextest.outcome }}
```

The condition, not `if: always()`: a failing run is the interesting one, but a
cancelled run has no result worth recording, and a run skipped because the
build broke earlier in the job has no report to upload at all.

`variant` is the axis Trunk tracks flakiness along, so it must distinguish the
same test run in more than one place — platform, SDK, runner. A test that only
flakes on Windows stays separable from its green Linux twin.

A reusable workflow needs `TRUNK_ORG_TOKEN` in its `secrets:` contract (as
`cargo-tests.reusable.yaml` declares it) or to be called with `secrets:
inherit`.

### Two nextest runs in one job

The report path is fixed per profile, so a second `cargo nextest run` in the
same job overwrites the first one's report. Move it aside between runs and
upload a glob — see "Set aside sdk test results" in
`cargo-tests.reusable.yaml`.

## What reports today

| Lane | Workflow | Variant |
| --- | --- | --- |
| cargo test (linux-gnu) | `cargo-tests.reusable.yaml` | `linux-gnu` |
| cargo test (linux-musl) | `cargo-tests.reusable.yaml` | `linux-musl` |
| cargo test (windows) | `cargo-tests.reusable.yaml` | `windows` |
| sdk tests (per SDK × OS) | `cargo-tests.reusable.yaml` | `sdk-<sdk>-<os>` |
| snapshot tests | `cargo-tests.reusable.yaml` | `snapshot` |
| webview unit tests | `webview-tests.reusable.yaml` | `webview-unit` |
| webview browser tests | `webview-tests.reusable.yaml` | `webview-browser` |
| grammar tests | `ci.yaml` | `grammar`, `grammar-hljs` |
| python integration tests | `primary.yml` | `python-integration` |

Not reporting, and why:

- **engine `cargo test`** (`primary.yml`, rust-unit) — runs under plain `cargo
  test`, which emits no JUnit. Switching it to nextest is a test-runner change
  (process-per-test, different `--nocapture` handling) for a suite that loads a
  cdylib at runtime, so it wants its own PR rather than riding along here.
- **`wasm-pack test --node`** and the tree-sitter corpus tests — their runners
  have no JUnit output.
- **`integ-tests.yml`** — the whole job is `continue-on-error: true`, so its
  results carry no signal about the commit.

## Quarantining

Off. Every upload runs with `quarantine: false`, so Trunk observes and reports
but never absolves a failing test, and the upload step cannot turn a red CI
green. Turning it on for a lane is a one-input change in the calling workflow,
and makes that upload step part of the lane's verdict.

[Trunk Flaky Tests]: https://docs.trunk.io/flaky-tests
[Trunk app]: https://app.trunk.io/boundaryml/flaky-tests
