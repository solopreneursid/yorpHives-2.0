# Real canonical deployment invariant — read-only authenticated staging QA

Before verifying a Pages preview, the authenticated staging verifier reads the private project's actual canonical production deployment directly from Cloudflare. It reads it again after anonymous Cloudflare Access checks. Both reads validate the exact GitHub source repository, production branch, production environment, successful deployment, ID and commit SHA. The receipt contains both sanitized canonical snapshots; any change or missing data fails closed.

The independent QA attestator now requires matching canonical IDs, SHAs and branches. It will not accept a hardcoded claim that production is unchanged.

This is **not** a simulated or actual rollback test; disaster recovery and owner-only Go Live remain blocked. No token is saved to artifacts, and all API requests are read-only.