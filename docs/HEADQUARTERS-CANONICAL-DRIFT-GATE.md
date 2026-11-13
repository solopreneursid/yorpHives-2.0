# Canonical branch drift blocks Headquarters Go Live

The actual Cloudflare private Headquarters canonical deployment was recorded from commit `7843fa333e7e5c14e3219e7aa53df583eb066963`, while the GitHub `build/yorphives-admin-reliability` branch currently points to `002596ece7bed88e26bb8ca3c521353640f0beb8` (two commits ahead). This mismatch means restoring the branch ref alone would not necessarily restore the exact version actually served by Cloudflare.

The private read-only release verifier now compares GitHub's **current production branch SHA** to Cloudflare's **actual successful canonical production deployment SHA** and validates the expected project/repository/branch identity. A mismatch produces `canonical_drift` and **cannot enable Preview or Go Live**, even if CI and preview checks otherwise pass.

This is a conservative guard. It does not modify either deployment or repository branch, and recovery requires a separately validated rollback strategy. This drift check applies only to Headquarters; public YorpHives uses another source repository and requires a separate verified promotion process.
