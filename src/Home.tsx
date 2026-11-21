import { useEffect, useRef, useState } from "react";
import { demoExamples } from "../shared/demo.ts";

const steps = [
  [
    "Write the decision",
    "Describe the change, the current system, and the result you expect.",
  ],
  [
    "Choose what to test",
    "Edit extracted assumptions. Mark any that would change your decision if they failed.",
  ],
  [
    "Read the review trail",
    "Inspect the reasoning, evidence, and unresolved questions. Export a Markdown memo for your team.",
  ],
];
const answers = [
  [
    "Do I need an account or API key?",
    "Run any bundled case without an account or provider key. To review a new proposal, sign in and add a Meta Model API key in Settings.",
  ],
  [
    "What does Unresolved mean?",
    "The report distinguishes missing evidence, conflicting sources, and a failed check. Each evidence gap includes what you would need to measure or find next.",
  ],
  [
    "What happens when I refresh?",
    "Tactile restores drafts and completed reports from this browser tab. If you refresh during a review, your confirmed claims are ready to run again.",
  ],
  [
    "What can I review?",
    "Tactile is designed for engineering proposals such as migrations, CI changes, rollouts, and performance tradeoffs. Live reviews send your proposal to the configured provider.",
  ],
];

export function Home({ signedIn }: { signedIn: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const example = demoExamples[selected];
  const first = example.findings[0];

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    async function animate() {
      if (media.matches) return;
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] =
        await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("lenis"),
        ]);
      if (cancelled || media.matches || !root.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const wheel = matchMedia("(pointer: fine)").matches;
      const lenis = wheel
        ? new Lenis({ autoRaf: false, smoothWheel: true, anchors: false })
        : undefined;
      const tick = (time: number) => lenis?.raf(time * 1000);
      if (lenis) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(tick);
      }
      const context = gsap.context(() => {
        gsap.from("[data-hero-copy]", {
          y: 22,
          duration: 0.72,
          ease: "power3.out",
          stagger: 0.08,
          clearProps: "transform",
        });
        gsap.from(".hero-image", {
          clipPath: "inset(0 0 0 16% round 36px)",
          scale: 1.045,
          duration: 1.1,
          ease: "power3.out",
          clearProps: "clipPath,transform",
        });
        for (const section of gsap.utils.toArray<HTMLElement>(
          "[data-entrance]",
        )) {
          gsap.from(section, {
            y: 20,
            duration: 0.62,
            ease: "power2.out",
            scrollTrigger: { trigger: section, start: "top 88%", once: true },
            clearProps: "transform",
          });
        }
      }, root);
      document.fonts.ready.then(() => {
        if (!cancelled && !media.matches) ScrollTrigger.refresh();
      });
      cleanup = () => {
        context.revert();
        gsap.ticker.remove(tick);
        lenis?.destroy();
      };
    }
    const preferenceChanged = () => {
      cleanup?.();
      cleanup = undefined;
      if (!media.matches) void animate().catch(() => undefined);
    };
    void animate().catch(() => undefined);
    media.addEventListener("change", preferenceChanged);
    return () => {
      cancelled = true;
      media.removeEventListener("change", preferenceChanged);
      cleanup?.();
    };
  }, []);

  return (
    <main id="content" ref={root} className="home-page">
      <section className="home-width home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <h1 id="home-title" aria-label="Decisions, under load.">
            <span data-hero-copy>Decisions,</span>
            <span data-hero-copy>under load.</span>
          </h1>
          <p data-hero-copy>
            Test the assumptions behind an engineering proposal. See where it
            holds, where it breaks, and what would change the verdict.
          </p>
          <div className="home-actions" data-hero-copy>
            <a className="home-button filled" href="/review">
              {signedIn ? "Open workspace" : "Sign in to workspace"}{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="home-button plain" href="/demo">
              Try the public demo <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="hero-stage">
          <img
            className="hero-image"
            src="/decision-assembly.webp"
            alt=""
            srcSet="/decision-assembly-small.webp 720w, /decision-assembly.webp 1200w"
            sizes="(max-width: 800px) 90vw, 45vw"
            width="1200"
            height="900"
            fetchPriority="high"
          />
          <a className="hero-finding" href="#examples" data-ui>
            <span className="hero-tag verdict contradicted">Contradicted</span>
            <span className="hero-finding-text">
              {demoExamples[0].findings[0].claim.text}
            </span>
            <span className="hero-link">
              Explore the evidence <span aria-hidden="true">↗</span>
            </span>
          </a>
        </div>
      </section>

      <section
        id="examples"
        className="examples-field"
        data-entrance
        aria-labelledby="examples-title"
      >
        <div className="home-width">
          <div className="home-section-head">
            <h2 id="examples-title">Inspect a review.</h2>
            <p>
              Pick a bundled case to see the proposal and what the evidence
              changes.
            </p>
          </div>
          <div className="case-controls" aria-label="Bundled cases">
            {demoExamples.map((item, index) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="case-board" aria-live="polite">
            <div className="case-proposal" data-ui>
              <span className="case-label">The proposal</span>
              <h3>{example.title}</h3>
              <p>{example.proposal}</p>
              <a
                className="home-button filled"
                href={`/demo?example=${example.id}`}
              >
                Try this example <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="case-finding" data-ui>
              <span className="case-label">Finding</span>
              <span className={`verdict ${first.verdict.toLowerCase()}`}>
                {first.verdict}
              </span>
              <p className="case-claim">{first.claim.text}</p>
              <p>{first.rationale}</p>
              {first.repair && (
                <div className="case-repair">
                  <strong>Smallest viable change</strong>
                  <p>{first.repair.minimalFix}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section
        id="method"
        className="home-width method-layout"
        data-entrance
        aria-labelledby="method-title"
      >
        <div className="method-intro">
          <h2 id="method-title">How it works.</h2>
          <p>Use Tactile while there’s still time to change the rollout.</p>
          <a href="/review" className="home-text-link">
            Open the workspace <span aria-hidden="true">↗</span>
          </a>
        </div>
        <ol className="method-steps">
          {steps.map(([title, description]) => (
            <li key={title}>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="home-width principle-section"
        data-entrance
        aria-labelledby="principles-title"
      >
        <div>
          <h2 id="principles-title">Show your work.</h2>
          <p>
            Keep the reasoning behind the verdict with the proposal, so someone
            else can inspect it.
          </p>
          <a className="home-text-link" href="#examples">
            Change the example <span aria-hidden="true">↑</span>
          </a>
        </div>
        <div className="trace-preview" data-ui aria-live="polite">
          <h3>Review trail</h3>
          <p>
            {example.label} · {first.audit?.length ?? 0} recorded checks
          </p>
          <ol>
            {first.audit?.map(({ stage, observation }) => (
              <li key={stage}>
                <strong>{stage}</strong>
                <p>{observation}</p>
              </li>
            ))}
          </ol>
          {example.sources[0] && (
            <a href={example.sources[0].url}>
              Read bundled evidence <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </section>

      <section
        id="faq"
        className="home-width home-faq"
        data-entrance
        aria-labelledby="faq-title"
      >
        <h2 id="faq-title">Questions.</h2>
        <div className="faq-list">
          {answers.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        className="home-width home-close"
        data-entrance
        aria-labelledby="close-title"
      >
        <h2 id="close-title">What are you about to change?</h2>
        <a className="home-button dark" href={signedIn ? "/review" : "/login"}>
          {signedIn ? "Start a review" : "Sign in"}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className="home-width home-footer">
        <strong>Tactile</strong>
        <span>
          Built for Compute 50 by{" "}
          <a href="https://github.com/ryanfer123">ryanfer123</a> and{" "}
          <a href="https://github.com/SammyRyuga">SammyRyuga</a>.
        </span>
        <a href="https://github.com/SammyRyuga/tactile">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
