import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SourceImage = {
  figure_id: string;
  data: string;
  mime_type: string;
  title: string;
};

type Citation = {
  id: number;
  sourcepage: string;
  sourcefile: string;
  breadcrumb: string;
  content: string;
  page_num: number;
  extension: string;
  images: SourceImage[];
};

type ChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
  context?: {
    data_points?: {
      text?: string[];
      citations?: Citation[];
    };
  };
  error?: string;
};

// ---------------------------------------------------------------------------
// Plain markdown components (no citation badge handling) – used in the modal
// ---------------------------------------------------------------------------

const plainMarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 text-2xl font-bold text-(--ink) last:mb-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2.5 text-xl font-bold text-(--ink) last:mb-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 text-lg font-semibold text-(--ink) last:mb-0">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-2 text-base font-semibold text-(--ink) last:mb-0">
      {children}
    </h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="mb-2 text-sm font-semibold text-(--ink) last:mb-0">
      {children}
    </h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6 className="mb-2 text-xs font-semibold text-(--ink) last:mb-0">
      {children}
    </h6>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-black/5 p-3 last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 text-[0.92em]">
      {children}
    </code>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-2 border-l-4 border-(--line) pl-4 italic last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      className="text-(--accent) underline underline-offset-2"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead>{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-(--line) bg-(--panel) px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-(--line) px-2 py-1 align-top">{children}</td>
  ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert LLM-inserted [N] markers into markdown links so that the custom `a`
 * component can render them as clickable citation badges.
 * Only matches [N] that are NOT already part of a markdown link like [N](url).
 */
function preprocessCitations(text: string): string {
  return text.replace(/\[(\d+)\](?!\()/g, "[$1](#citation-$1)");
}

// ---------------------------------------------------------------------------
// Citation Modal (shown for non-PDF sources)
// ---------------------------------------------------------------------------

function CitationModal({
  citation,
  onClose,
}: {
  citation: Citation;
  onClose: () => void;
}) {
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(citation.content);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-(--line) px-6 py-4">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-(--accent) text-[11px] font-bold text-white">
                {citation.id}
              </span>
              <span className="truncate text-sm font-semibold text-(--ink)">
                {citation.sourcefile}
              </span>
            </div>
            {citation.breadcrumb ? (
              <p className="mt-1.5 text-xs text-(--muted)">
                {citation.breadcrumb}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-(--muted) transition hover:bg-(--panel) hover:text-(--ink)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Chunk content */}
        <div className="overflow-auto px-6 py-4 text-sm leading-relaxed text-(--ink)">
          {hasHtmlTags ? (
            <div
              className="citation-html-content"
              dangerouslySetInnerHTML={{ __html: citation.content }}
            />
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={plainMarkdownComponents}
            >
              {citation.content}
            </ReactMarkdown>
          )}

          {/* Figures attached to this chunk */}
          {citation.images.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-(--line) pt-4">
              {citation.images.map((img) => (
                <figure key={img.figure_id}>
                  <img
                    src={`data:${img.mime_type};base64,${img.data}`}
                    alt={img.title || img.figure_id}
                    className="w-full rounded border border-(--line) object-contain"
                  />
                  {img.title ? (
                    <figcaption className="mt-1 text-center text-xs text-(--muted)">
                      {img.title}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [prompt, setPrompt] = useState(
    "show me an example of Compensate measure calculation",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(
    null,
  );

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:50506",
    [],
  );

  // Open a citation: PDF → new tab at the correct page; anything else → modal
  const handleCitationClick = useCallback(
    (citation: Citation) => {
      if (citation.extension === "pdf") {
        // page_num is 0-indexed in the search index; browsers use 1-indexed
        const page = citation.page_num + 1;
        window.open(
          `${apiBase}/files/${encodeURIComponent(citation.sourcefile)}#page=${page}`,
          "_blank",
          "noreferrer",
        );
      } else {
        setSelectedCitation(citation);
      }
    },
    [apiBase],
  );

  // Build markdown components that render [N] markers as clickable citation
  // badges. Rebuilt only when citations list or the click handler changes.
  const citationMarkdownComponents = useMemo(
    () => ({
      ...plainMarkdownComponents,
      a: ({
        children,
        href,
      }: {
        children?: React.ReactNode;
        href?: string;
      }) => {
        const m = href?.match(/^#citation-(\d+)$/);
        if (m) {
          const id = parseInt(m[1], 10);
          const cit = citations.find((c) => c.id === id);
          return (
            <button
              type="button"
              className="relative -top-0.5 mx-0.5 inline-flex h-4.5 min-w-4.5 cursor-pointer items-center justify-center rounded bg-(--accent)/15 px-1 text-[11px] font-bold text-(--accent) transition hover:bg-(--accent)/30"
              title={cit?.breadcrumb || cit?.sourcepage || `Source ${id}`}
              onClick={() => cit && handleCitationClick(cit)}
            >
              {id}
            </button>
          );
        }
        return (
          <a
            className="text-(--accent) underline underline-offset-2"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        );
      },
    }),
    [citations, handleCitationClick],
  );

  const sendMessage = async () => {
    const text = prompt.trim();
    if (!text || loading) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setPrompt("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          top: 5,
        }),
      });

      const data = (await response.json()) as ChatResponse;
      if (!response.ok || data.error) {
        throw new Error(
          data.error || `Request failed with status ${response.status}`,
        );
      }

      const answer = data.message?.content?.trim() || "No answer was returned.";
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
      setCitations(data.context?.data_points?.citations || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error while calling the API.",
      );
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-(--paper) text-(--ink)">
      <div className="mx-auto flex min-h-screen w-full flex-col px-4 py-8 sm:px-8">
        <header className="relative overflow-hidden rounded-2xl border border-(--line) bg-(--card) p-6 shadow-[0_15px_40px_rgba(0,0,0,0.08)] sm:p-8">
          <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(255,102,46,0.35),rgba(255,102,46,0))]" />
          <div className="absolute -bottom-20 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(28,151,129,0.28),rgba(28,151,129,0))]" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.18em] text-(--muted)">
            FEMSA Knowledge Assistant
          </p>
        </header>

        <section className="mt-6">
          {/* ── Conversation ── */}
          <div className="rounded-2xl border border-(--line) bg-(--card) p-4 sm:p-6">
            <div className="h-90 space-y-3 overflow-auto rounded-xl border border-(--line) bg-(--panel) p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-(--muted)">
                  No messages yet. Ask a question to test the backend.
                </p>
              ) : (
                messages.map((msg, index) => (
                  <article
                    key={`${msg.role}-${index}`}
                    className={`rounded-xl px-4 py-3 text-sm leading-relaxed sm:text-[15px] ${
                      msg.role === "user"
                        ? "ml-8 bg-(--user-bg) text-(--user-ink)"
                        : "mr-8 border border-(--line) bg-white text-(--ink)"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
                      {msg.role}
                    </p>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={citationMarkdownComponents}
                      >
                        {preprocessCitations(msg.content)}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </article>
                ))
              )}
            </div>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="prompt"
              >
                Prompt
              </label>
              <input
                id="prompt"
                type="text"
                className="w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm outline-none transition focus:border-(--accent) focus:ring-2 focus:ring-[rgba(255,102,46,0.2)]"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Type your question"
              />

              {error ? (
                <p className="mt-3 text-sm text-(--danger)">{error}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-(--accent) px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "Calling API..." : "Send to /chat"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setCitations([]);
                    setError("");
                  }}
                  className="rounded-full border border-(--line) bg-white px-5 py-2.5 text-sm font-semibold text-(--ink) transition hover:bg-(--panel)"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          {/* ── References panel ── */}
        </section>

        <aside className="rounded-2xl border border-(--line) bg-(--card) p-4 sm:p-6">
          <h2 className="font-['Space_Grotesk',sans-serif] text-xl font-semibold">
            References
          </h2>
          <p className="mt-2 text-sm text-(--muted)">
            Click a number in the answer or a card below to view the source. PDF
            sources open in a new tab; others show a content preview.
          </p>

          <div className="mt-4 h-109 space-y-2 overflow-auto pr-1">
            {citations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-(--line) bg-(--panel) p-4 text-sm text-(--muted)">
                No citations yet.
              </p>
            ) : (
              citations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCitationClick(c)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-(--line) bg-white p-3 text-left text-sm transition hover:border-(--accent)/40 hover:bg-(--panel)"
                >
                  {/* Badge */}
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-(--accent)/15 text-[11px] font-bold text-(--accent) transition group-hover:bg-(--accent) group-hover:text-white">
                    {c.id}
                  </span>
                  {/* Meta */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-snug text-(--ink)">
                      {c.sourcefile}
                    </p>
                    {c.breadcrumb ? (
                      <p className="mt-0.5 truncate text-xs text-(--muted)">
                        {c.breadcrumb}
                      </p>
                    ) : null}
                    {c.extension === "pdf" ? (
                      <span className="mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                        PDF · p.{c.page_num + 1}
                      </span>
                    ) : (
                      <span className="mt-1 inline-block rounded bg-(--panel) px-1.5 py-0.5 text-[10px] font-semibold text-(--muted)">
                        {c.extension.toUpperCase() || "DOC"}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* Citation modal (non-PDF sources) */}
      {selectedCitation !== null ? (
        <CitationModal
          citation={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />
      ) : null}
    </main>
  );
}

export default App;
