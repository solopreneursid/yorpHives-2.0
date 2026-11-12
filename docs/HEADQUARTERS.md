# YorpHives Headquarters

Headquarters extends the private Admin application. It does not replace or deploy the public YorpHives product.

The default workspace presents a persistent mission desk, nine department records, specialist availability and the latest mission events. Existing monitoring, inventory, analytics, engineering investigations and audit screens remain available. Navigation retains the selected screen in the URL fragment.

## Mission lifecycle

Owners create missions with a title, brief, specialist and priority. Missions enter `planned`; creation does not invoke a model or dispatch execution. Planned missions can be cancelled by their creator with an optimistic concurrency check. Execution and approval states cannot be supplied by the browser. The separate engineering operations workflow retains its own verified readiness checks and limits.

`POST /api/admin/headquarters` uses a caller-generated UUID for replay safety. Reusing a UUID for different content returns 409. `PATCH` accepts only cancellation of the creator's planned owner mission, with its current `updated_at`. SQLite triggers record creation and cancellation in the same transaction as the write. The API limits streamed bodies to 24 KB, validates fields, requires a same-origin owner session and denies CI service-identity writes.

`GET /api/admin/headquarters` returns the latest 100 missions, 50 events and the registry. The same snapshot is available from `/admin/` using `Accept: application/json` or `Accept: text/markdown`; `?format=markdown` is also supported. Authentication is required for every representation. Responses use no-store and Vary: Accept.

## Installation and checks

Apply `0010_agentic_os_foundation.sql` followed by `0011_headquarters_audit.sql` to the private Admin D1 database before deploying this branch. Both migrations are additive and rerunnable. Do not apply them to the public product database. Registry specialists are seeded planned and disabled; this interface does not imply that nine autonomous workers are running.

Run `npm ci`, `npm run build:admin-css` and `npm run check`. Tailwind output is committed because the existing Pages project has no build command. Rebuild it after changing headquarters markup or classes. Runtime tests use Node's SQLite and TypeScript stripping APIs with signed test Access JWTs; no live credentials are needed.

Existing ChatGPT connectors provide this development session's access. They are not exported into the application. Runtime repair credentials remain in the private Worker's encrypted secret binding. Presence of a secret does not prove its validity or permissions. ChatGPT membership does not establish a Cloudflare or other provider usage allowance.
