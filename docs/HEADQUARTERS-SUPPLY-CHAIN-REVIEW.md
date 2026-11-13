# Headquarters security review and dependency check

GitHub's previous dependency-review-action could not run: the repository does not have GitHub Dependency Graph enabled. Rather than claiming that failure is a vulnerable package or forcing a founder approval, the security workflow now resolves an ephemeral npm lockfile in CI (with installation lifecycle scripts disabled), audits the resolved dependency tree against the npm advisory feed, and fails on high/critical vulnerabilities or inability to audit. The lockfile is not automatically committed or used to deploy code.

A separate offline policy test validates that package versions are exact, package publishing is private, and package lifecycle hooks cannot be introduced unnoticed. Retire.js and gitleaks remain separate checks; pinned Actions reduce mutable GitHub workflow dependencies.

The security workflow also runs for PRs targeting the existing private HQ canonical branch. Passive OWASP ZAP against the public website is skipped for HQ-only pull requests.

**This does not certify the complete 700+ commit Headquarters stack.** The heuristic code review's sensitive-configuration flags remain release-review items, not requests for founder permission to develop. Independent security/QA must resolve actual findings before Go Live.
