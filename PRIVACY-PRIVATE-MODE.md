# SAATHI private team and persistent memory

This implements the user's requirement to reduce repeated explanations while keeping workspace information on the device by default. It replaces earlier cloud-by-default and automatic federation proposals.

## Implemented

- `/` and `/private-workspace` use a separate private runtime. No Supabase client starts on these routes, even if cloud environment variables are configured.
- A thirteen-role catalog shows each role's real status. Planner, Tutor, Builder and Reviewer generate deterministic checklist proposals. Coordinator, Tester, Memory steward and Privacy guard correspond to local context, schema/revision, memory-scope and egress checks. Analyst, Researcher, Organizer and Workflow builder have no provider/connector connected. The Moltbook Ambassador opens a separate opt-in public reader and accepts manually reviewed public reference files; it receives no private context and has no AI model connected.
- The team shares the selected mission's goal, next step and revision; explicitly saved language/style preferences; and up to five approved memories. Global preferences can apply across missions. Other global memories require a lexical match, while mission-scoped memories remain within their mission. Sensitive, pending, rejected, forgotten, expired and foreign-mission memories are excluded. Raw notes and files are not added to this packet.
- Builder checklists can include an approved lesson, with its evidence reference. Roles do not execute memory text or generated code. Approving a proposal atomically saves its mission changes and accepted status in one encrypted snapshot. The changed revision makes other proposals stale; regenerate them before applying.
- Missions, profiles, source reviews, memory decisions and proposal history persist in an AES-GCM-256 encrypted browser vault. PBKDF2-SHA256 uses 310,000 iterations, a random 16-byte salt and a nonextractable key. Every save uses a fresh 12-byte IV and authenticated version metadata. The passphrase is not saved or logged.
- Lock removes the active workspace from the page and drops the key reference. The UI also locks when hidden, after five minutes without interaction or when another tab changes storage. Wrong-password/tamper errors do not reveal decrypted content. Schema validation runs after unlock. Quota/validation failures leave the durable prior snapshot unchanged.
- Cooperating tabs use Web Locks when available, plus an exact ciphertext comparison before writing. Browsers without Web Locks have conflict detection but cannot guarantee atomic coordination between simultaneous tabs; use one unlocked tab there.
- A strict CSP on private routes blocks fetch, WebSockets, form submission, frames, objects, media and workers. The private runtime has no analytics, external AI call, reporting sink or community connection. Moltbook's separate public reader is described below. Full-document navigation changes privacy modes so the new route's headers take effect.
- `/cloud` is a separate explicit opt-in. Supabase login/data sync starts only after acknowledging off-device transmission. It never uploads the private vault automatically. Cloud auth/data are not end-to-end encrypted by this feature.

## Limits

This is application-level privacy, not a guarantee against browser extensions, a compromised device, screenshots, memory inspection, malicious same-origin scripts or a compromised hosting server. Inline Next.js hydration scripts remain allowed. Assets and document navigation still make requests to the app origin; private vault contents are never placed in those requests. No memory wiping guarantee is made for immutable JavaScript strings or browser-managed buffers.

Use localhost or HTTPS for WebCrypto. The same browser and exact origin own the vault; `localhost`, `127.0.0.1`, another port and another device are different storage locations. A forgotten passphrase cannot be reset, and clearing storage removes the vault. The encrypted payload is bounded to 2 MB and has no backup/import/export UI yet.

Forget removes a candidate from active context, while source reviews and decisions remain in the encrypted audit history. This is not a full deletion of every source containing that text. No hidden model training, downloaded local LLM, autonomous code-writing provider, PC automation, external federation or encrypted device pairing has been added. Phone/laptop automatic sync requires a later encrypted-transfer feature or a separate cloud sharing choice.

## External agent community

Moltbook now has a separate opt-in public reader at `/community/moltbook`; see `MOLTBOOK-INTEGRATION.md`. It imports no private workspace state and creates no account. The fixed public request still discloses server network metadata, so private pages remain disconnected and the reader requires a separate session choice before making requests. Selected public posts can be downloaded and manually imported into an encrypted private mission as unverified reference documents. Import validates source URL shape and size, rejects stale revisions/duplicate files, and saves only after successful encryption. It creates no learning event, approved memory, task or executable code. Imported references are excluded from the private team context. Source labels are not cryptographic authentication. Account registration/claim remains pending the user's decision about email/X disclosure.

No community account has been joined. Moltbook is the requested destination; the membership identity and identity-sharing choice remain unspecified. Connecting to a third-party site can disclose network/account information even if private mission text is withheld; redacting names is not a zero-disclosure guarantee. Any adapter must state its destination and exact disclosure, and must remain disconnected in private mode.

## Verification

Node tests cover encryption roundtrip, fresh IV/salt, envelope rejection, tampering, incorrect passwords, limits, lock races, quota failure, conflict detection, reload durability, atomic proposal acceptance, stale plans, account/source mismatches, shared context boundaries, and fail-closed egress policy. ESLint, TypeScript and the production build pass. Browser clicks, actual CSP enforcement, visibility lock and browser storage behavior still require a browser acceptance run; the previously declined browser access has not been bypassed.

Manual acceptance: create a vault, save a mission, ask the team, approve one plan, refresh/unlock, complete a review, publish with learning consent, accept a candidate, and regenerate the team. Confirm approved context is reused, the forgotten candidate disappears, stale proposals cannot apply, and private-mode network requests contain only local assets/navigation. Use a separate test account when opting into cloud.
