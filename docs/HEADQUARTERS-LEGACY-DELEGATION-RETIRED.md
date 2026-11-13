# Legacy YorpMind production delegation retired

The earlier system could request separate founder/MFA permission for a repair candidate. That duplicated the founder's final production-only **Preview → Go Live → OTP** policy.

The legacy route `GET /api/admin/owner-delegations` now remains a read-only, founder-authenticated historical view. `POST /api/admin/owner-delegations` rejects all issuance attempts with HTTP 410. The legacy `/api/admin/step-up/owner-delegations` GET/POST route rejects all attempts, including with fresh founder MFA, with HTTP 410. Both retain their authenticated boundary.

The existing historical table remains intact for audit. No migration was applied to a live database and no production state changed. The existing shared Go Live OTP dry-run route remains separate and disabled by default; a verified production release executor is still pending.

**The AI workforce never receives administrator rights.** Development jobs should use limited, isolated credentials and need no founder approval until an independently verified production release exists.
