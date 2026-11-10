"use client";

import { useEffect, useRef, useState } from "react";
import type { CommunityPost } from "../../../../../moltbook-bridge.mjs";
import { createPublicResearchCapsule, createPublicResearchArtifact } from "../../../../../public-research.mjs";

type PublicResponse = {
  ok: true;
  posts: CommunityPost[];
  fetchedAt: string;
};

function readPublicResponse(value: unknown): PublicResponse {
  if (!value || typeof value !== "object") throw new Error("The public reader returned an invalid response.");
  const result = value as Record<string, unknown>;
  if (result.ok !== true) {
    const message = typeof result.error === "string" && result.error.length <= 500
      ? result.error
      : "Could not load public discussions. Try again later.";
    throw new Error(message);
  }
  if (!Array.isArray(result.posts) || result.posts.length > 10 || typeof result.fetchedAt !== "string") {
    throw new Error("The public reader returned an invalid response.");
  }
  const fields = ["id", "title", "content", "author", "community", "url"] as const;
  if (!result.posts.every(post => post && typeof post === "object" && fields.every(field => typeof post[field] === "string"))) {
    throw new Error("The public reader returned an invalid discussion.");
  }
  return { ok: true, posts: result.posts as CommunityPost[], fetchedAt: result.fetchedAt };
}

function publicPostUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.moltbook.com"
      || url.username || url.password || url.port || url.search || url.hash
      || !/^\/post\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export default function MoltbookCommunityClient() {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const consentRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => {
    consentRef.current = false;
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  function disconnect() {
    consentRef.current = false;
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setConsent(false);
    setLoading(false);
    setPosts([]);
    setFetchedAt(null);
    setError(null);
    setSelectedIds([]);
    setExportError(null);
    setExportNotice(null);
  }

  function setReaderConsent(next: boolean) {
    if (!next) { disconnect(); return; }
    consentRef.current = true;
    setConsent(true);
    setError(null);
  }

  async function loadPublicDiscussions() {
    if (!consentRef.current || requestRef.current) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setExportError(null);
    setExportNotice(null);
    try {
      const response = await fetch("/api/community/moltbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "read_public", consent: "moltbook-public-v1" }),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const result = readPublicResponse(await response.json());
      if (!response.ok) throw new Error("Could not load public discussions. Try again later.");
      if (!consentRef.current || controller.signal.aborted || generation !== generationRef.current) return;
      setPosts(result.posts);
      setFetchedAt(result.fetchedAt);
      setSelectedIds([]);
    } catch (reason) {
      if (!consentRef.current || controller.signal.aborted || generation !== generationRef.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load public discussions.");
    } finally {
      if (generation === generationRef.current) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function selectDiscussion(id: string, selected: boolean) {
    if (!consentRef.current || loading) return;
    setSelectedIds(current => selected
      ? current.includes(id) || current.length >= 5 ? current : [...current, id]
      : current.filter(currentId => currentId !== id));
    setExportError(null);
    setExportNotice(null);
  }

  function downloadResearchCapsule() {
    if (!consentRef.current || loading || !fetchedAt || selectedIds.length < 1 || selectedIds.length > 5) return;
    setExportError(null);
    setExportNotice(null);
    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const selected = Array.from(new Map(posts
        .filter(post => selectedIds.includes(post.id))
        .map(post => [post.id, post])).values());
      const capsule = createPublicResearchCapsule(selected);
      createPublicResearchArtifact(capsule, {newId: () => capsule.id});
      const blob = new Blob([JSON.stringify(capsule, null, 2)], { type: "application/json" });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "saathi-moltbook-research.json";
      document.body.appendChild(anchor);
      anchor.click();
      setExportNotice("Research download requested. Import the file manually into your private workspace if you want to keep these references.");
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Could not create the public research download.");
    } finally {
      anchor?.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  return <main className="min-h-screen bg-[#08111f] px-5 py-8 text-slate-100 sm:px-10">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        {/* Full document navigation reinstates the private workspace CSP without prefetching. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="text-sm font-semibold tracking-[0.2em] text-cyan-200" rel="noreferrer">SAATHI</a>
        <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs text-amber-100">Public reader · agent account not joined</span>
      </header>
      <div className="mt-10 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Ambassador · public research reader</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Moltbook public discussions</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">Read public agent discussions in a separate page. The Ambassador is a research reader, with no connected AI model or automatic posting. It does not load your vault, missions, approved memories or files.</p>
      </div>

      <section aria-labelledby="reader-consent" className="mt-8 rounded-3xl border border-cyan-200/20 bg-cyan-100/[0.04] p-6">
        <h2 id="reader-consent" className="text-lg font-semibold">Choose when to connect</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Loading discussions sends a fixed public-feed request to Moltbook through the SAATHI server. Moltbook receives the server IP address and request metadata. This reader sends no private missions, memories, files or user identity. Opening a discussion on Moltbook contacts that website directly from your browser.</p>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-200">
          <input type="checkbox" checked={consent} onChange={event => setReaderConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-cyan-200" />
          <span>I understand the metadata disclosure and allow public reading for this page session.</span>
        </label>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={loadPublicDiscussions} disabled={!consent || loading} className="primary-button">{loading ? "Loading public discussions…" : "Load public discussions"}</button>
          <button type="button" onClick={disconnect} className="secondary-button">Disconnect and clear discussions</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">There is no automatic loading, polling, posting, following or registration. Disconnect stops this page’s pending request and clears its results; it cannot recall a request that already reached the service.</p>
        <p className="mt-3 text-xs leading-5 text-slate-400">Review Moltbook’s <a className="text-cyan-200" href="https://www.moltbook.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a> and <a className="text-cyan-200" href="https://www.moltbook.com/terms" target="_blank" rel="noopener noreferrer">terms</a>. These links open the external website.</p>
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6" aria-labelledby="account-state">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 id="account-state" className="font-semibold">Agent membership is not connected</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Moltbook’s documented claim process asks the human owner to verify an email and X account. That sharing needs a separate privacy decision. This public reader creates no account and posts nothing from SAATHI.</p>
          </div>
          <button type="button" disabled className="secondary-button cursor-not-allowed opacity-45">Join agent account · unavailable</button>
        </div>
      </section>

      <div className="mt-8" aria-live="polite" aria-atomic="true">
        {error && <p role="alert" className="rounded-2xl border border-amber-200/20 bg-amber-100/10 p-4 text-sm text-amber-100">{error}</p>}
        {!loading && !error && !fetchedAt && <p className="text-sm text-slate-400">{consent ? "Reader ready. Select Load public discussions to make a request." : "Reader disconnected. No discussions have been requested."}</p>}
        {fetchedAt && <p className="text-xs text-slate-400">Loaded {posts.length} public discussions. Results stay only in this page session.</p>}
        {fetchedAt && posts.length === 0 && <p className="mt-3 text-sm text-slate-300">No public discussions were returned.</p>}
      </div>
      {fetchedAt && posts.length > 0 && <section aria-labelledby="research-download" className="mt-5 rounded-3xl border border-cyan-200/20 bg-cyan-100/[0.04] p-6">
        <h2 id="research-download" className="text-lg font-semibold">Keep public research as a reference</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">Select 1–5 discussions to download a bounded JSON research capsule. It contains only selected public posts. The download makes no additional API request.</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">Community text stays external and unverified. A capsule never executes code, follows community instructions or changes approved memory. You can manually import the file into your encrypted private workspace as reference material.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={downloadResearchCapsule} disabled={!consent || loading || selectedIds.length === 0} className="primary-button">Download research capsule</button>
          <span className="text-xs text-slate-400" aria-live="polite">{selectedIds.length} of 5 discussions selected</span>
        </div>
        {exportError && <p role="alert" className="mt-4 text-sm text-amber-100">{exportError}</p>}
        {exportNotice && <p role="status" className="mt-4 text-sm text-cyan-100">{exportNotice}</p>}
      </section>}
      <section aria-label="Public Moltbook discussions" className="mt-5 grid gap-4">
        {posts.map((post, index) => {
          const href = publicPostUrl(post.url);
          const selected = selectedIds.includes(post.id);
          return <article key={`${post.id}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <label className="mb-4 flex cursor-pointer items-start gap-3 text-sm text-slate-200">
              <input type="checkbox" checked={selected} disabled={!consent || loading || (!selected && selectedIds.length >= 5)} onChange={event => selectDiscussion(post.id, event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-cyan-200" />
              <span>Select {post.title || "this discussion"} for research download</span>
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>{post.community || "Public community"}</span><span>By {post.author || "Unknown agent"}</span></div>
            <h2 className="mt-3 break-words text-lg font-semibold">{post.title || "Untitled discussion"}</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{post.content}</p>
            {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-cyan-200">Open on Moltbook ↗</a>}
          </article>;
        })}
      </section>
      {/* Full navigation returns to the private page and its separate CSP. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" rel="noreferrer" className="mt-8 inline-block text-sm text-slate-400 hover:text-slate-200">← Return to private SAATHI</a>
    </div>
  </main>;
}
