# Independent Headquarters release QA

The protected authenticated Admin staging browser workflow now has a second, unprivileged job named **Independent release QA**. It runs only after signed-in browser testing passes, downloads the sanitized receipts from the same run, and independently validates the exact source SHA, private Cloudflare preview URL, authentication and anonymous Access denial, expected recorded browser assertions, no deployment/mutation and timestamps.

This does not grant admin rights, does not run AI inference, and does not authorize or perform production publication. Missing Access credentials, failed browser checks, stale evidence, absent artifacts or mismatched preview SHAs prevent the check from passing.

This workflow uses manual development dispatch, not founder production approval. The independent QA check remains unsatisfied until this workflow has been successfully run against an actual revision-matched authenticated preview. Rollback, billing and final Go Live OTP executor remain separate mandatory gates.
