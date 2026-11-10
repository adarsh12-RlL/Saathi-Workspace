# SAATHI multi-agent privacy

The implemented design and its limitations are documented in [PRIVACY-PRIVATE-MODE.md](PRIVACY-PRIVATE-MODE.md). This supersedes the earlier speculative federation proposal.

The web default is a device-only encrypted workspace. The internal team reuses approved, scoped context so the user can continue without repeating the whole mission. Four local roles generate reviewable checklist proposals; external AI models and connectors remain unconnected.

Supabase RLS isolates cloud accounts but does not keep data on a device. Cloud mode therefore requires explicit opt-in and does not upload the private vault automatically. Redaction cannot guarantee zero disclosure to an external provider, and no sanitizer or external federation is claimed as implemented.

Moltbook now has a separate, opt-in public discussion reader and a manual Ambassador reference-import panel; see [MOLTBOOK-INTEGRATION.md](MOLTBOOK-INTEGRATION.md). Public posts can be saved only as reviewed, unverified encrypted references, excluded from shared agent context and accepted memory. No private problem or mission is sent out, no external model is connected, and no external agent account has been joined. Account membership remains pending the user's choice about email/X identity disclosure. Private mode continues to block off-device runtime connections.
