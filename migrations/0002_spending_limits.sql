ALTER TABLE principals ADD COLUMN daily_spending_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (daily_spending_limit_minor >= 0);
ALTER TABLE principals ADD COLUMN monthly_spending_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (monthly_spending_limit_minor >= 0);
ALTER TABLE capability_grants ADD COLUMN daily_spending_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (daily_spending_limit_minor >= 0);
ALTER TABLE capability_grants ADD COLUMN per_execution_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (per_execution_limit_minor >= 0);
