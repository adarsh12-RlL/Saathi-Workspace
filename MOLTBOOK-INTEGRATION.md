# SAATHI Moltbook community bridge

Implemented on 2026-10-09 using the official Moltbook public API. No matching installed or discoverable Moltbook plugin was found; the app uses a narrow API adapter.

## What is connected

`/community/moltbook` is an isolated, manually activated public reader. Opening it makes no Moltbook request. After reading the disclosure, check the session consent box and press **Load public discussions**. The browser sends only a fixed two-field consent/action request to `/api/community/moltbook`; the SAATHI server sends one fixed unauthenticated GET to `https://www.moltbook.com/api/v1/posts?sort=new&limit=10`.

No API key, user account, private mission, memory, profile, file, cookie, browser referrer or arbitrary query is forwarded. The reader never imports the private workspace or vault runtime. Full-document navigation separates it from private pages, whose `connect-src 'none'` policy is unchanged. The community document permits same-origin requests only; the server is the sole caller of the fixed official endpoint.

Results are bounded to ten posts, 512 KB upstream data and 3,000 text characters per post. Community text is rendered literally: no HTML/markdown execution, images, embeds, remote instructions or automatic memory/proposal creation. Post links are constructed from a validated UUID and the canonical official domain, ignoring any external link supplied in the feed. Redirects, unexpected content types, malformed/oversized feeds and upstream failures fail closed. Errors never echo upstream data. Requests are rate bounded and receive no-store responses.

Disconnect clears results, revokes this page's consent, aborts the browser request and discards any late response. Unmount also aborts. It cannot recall a network request already received by Moltbook. There is no automatic polling, posting, commenting, voting, following, registration, direct messaging or heartbeat.

## Ambassador and incoming references

The Agent Room now includes a **Moltbook Ambassador** role with `opt_in_reader` status. It is a manual public research adapter, not a connected LLM, autonomous community participant or additional executable proposal role. It links to the separate reader using a fixed URL without private mission context. Human claim/verification is never bypassed.

After loading the public feed, select 1–5 discussions and download `saathi-moltbook-research.json`. Download uses a local Blob and makes no extra API request. It contains only bounded public post text, canonical post URLs, an export time and the immutable `unverified` label. Both export and import preflight the mission document size limit.

Return to a saved private mission, open **Agent Room → Moltbook Ambassador**, choose the file, inspect its sources and explicitly approve reference storage. The JSON contract rejects extra fields, arbitrary URLs, executable values, altered trust, oversized text and duplicate source IDs. Accepted storage appends a `Document` artifact tagged `unverified_external_reference` using the expected mission revision. Duplicate files and stale revisions are rejected. A failed encrypted write leaves the prior state intact; a changed revision makes older plans stale.

The reference can be read in the mission passport after reload/unlock. It is not passed to the private team context and creates no learning signal, accepted memory, task or code execution. Canonical URL/shape validation is not authentication of authorship or accuracy; uploaded files and community statements remain unverified. There is no automatic ingestion, model training or anonymized private question sent to Moltbook. Anonymization alone cannot guarantee zero personal disclosure.

## What leaves the device

Moltbook still sees the public request and the server's network IP/request metadata. When SAATHI runs on this PC, that can be the user's public network IP. Opening an official discussion/policy/terms link contacts Moltbook directly from the browser; the site's own cookies and privacy practices then apply. The bridge keeps private workspace content out of requests; it cannot promise zero external metadata disclosure or universal anonymity.

The API is intended for this personal app served on localhost. Same-origin/JSON checks and a process-wide interval constrain its use; they are not an authenticated gateway for public multi-user deployments. Add authenticated access control and distributed rate limits before hosting it as a public proxy. Browser rendering, CSP enforcement and real browser disconnect behavior remain pending because previously denied localhost browser access was not bypassed.

## Account membership remains pending

No agent account has been registered or claimed. The official onboarding flow requires registration followed by a human claim process involving email verification and an X account/post. The user has requested a fresh separate mailbox and X identity, while keeping existing personal accounts and private workspace data separate. This authorizes preparing a new public identity, not supplying existing personal email/X credentials, phone details or invented operator information. A temporary mailbox is now available and its new address has been entered in X's signup form. X Terms acceptance, signup and verification are unfinished, so the current UI leaves membership disabled.

If the user separately allows membership, use a fresh public agent alias and a fixed description that contain no user identity or workspace content. Keep any returned API key server-only, never in NEXT_PUBLIC variables, browser state, logs or the learning ledger. Human email/X verification must be completed by the user. Do not import Moltbook heartbeat instructions as autonomous app tasks or enable posting from the private workspace.

## Sources checked

- [Official API/onboarding documentation](https://www.moltbook.com/skill.md), version 1.12.0 fetched as documentation, not installed/executed.
- [Official privacy policy](https://www.moltbook.com/privacy).
- [Official terms](https://www.moltbook.com/terms).

An anonymous public-feed GET returned HTTP 200 during source verification; only response field names/count were inspected in tool output. No registration or write API was called. Local tests exercise fixed outbound requests, credential omission, inert content, bounds, redirects/failures, CSRF/consent checks, rate limiting, unchanged private-page CSP and dependency isolation.


## Separate public identity setup

A dedicated mailbox and a fresh pseudonymous X account can separate public community activity from the user's personal inbox and social profile. They cannot guarantee anonymity, prevent account correlation, or hide network IP/device metadata from either provider. Moltbook's privacy policy says it receives X ID/handle/email/basic profile information and collects network/usage metadata.

Prefer a recoverable project-only mailbox over an expiring disposable address: X uses email for verification and account recovery. An AgentMail connector that can provision dedicated agent inboxes was discovered and suggested; it is not connected. Following the user's request for temporary email, Temp-Mail was opened and a fresh browser-session inbox was visibly available without using the user's personal mailbox. Its address and session details are not stored in this repository. The provider documents limited message retention, cookies and network/server logs; this is not durable ownership or zero metadata disclosure.

X signup was opened and its email/username field was filled only with the newly generated temporary address. No password, phone, date of birth or existing personal account was supplied, and Continue was not pressed. The visible page says that continuing accepts X's Terms, so the browser is held for action-time confirmation. X's documented birth-date rule requires the person operating the account; profile visibility does not prevent X from receiving the supplied date. Do not invent a human date of birth, attach an existing personal X account, bypass a verification challenge, or claim that the temporary inbox makes personal disclosure impossible. Human password, required verification and final signup steps remain unfinished. No X/Moltbook registration, claim or posting has occurred.

Official sources: [X signup](https://help.x.com/en/using-x/create-x-account), [X birthday visibility](https://help.x.com/en/safety-and-security/birthday-visibility-settings), [X email access/recovery](https://help.x.com/en/managing-your-account/cant-access-my-accounts-email-address), [Moltbook privacy](https://www.moltbook.com/privacy), and [Temp-Mail privacy/retention](https://temp-mail.org/privacy-policy).
