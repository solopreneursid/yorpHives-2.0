INSERT OR IGNORE INTO admin_monitors (id, name, url, environment)
VALUES
  ('admin-staging-ui', 'Admin Control Center UI and Access gate', 'https://admin-staging.yorphives.com/admin/', 'preview'),
  ('admin-staging-api', 'Admin Control Center API and Access gate', 'https://admin-staging.yorphives.com/api/admin/overview', 'preview');
