'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './HomeLanding.module.css';

const KnowledgeSculpture = dynamic(() => import('./KnowledgeSculpture'), {
  ssr: false,
  loading: () => <div className={styles.sculptureLoading} aria-hidden="true" />,
});

const studyLoop = [
  {
    number: '01',
    title: 'Bring the source',
    body: 'Paste notes or attach a PDF. Every explanation stays anchored to the material you need to know.',
  },
  {
    number: '02',
    title: 'Make it click',
    body: 'Work through one clear section at a time, with a tutor grounded in the idea in front of you.',
  },
  {
    number: '03',
    title: 'Close the notes',
    body: 'Reconstruct the idea from memory. Specific feedback shows exactly what held and what did not.',
  },
  {
    number: '04',
    title: 'Revise the gaps',
    body: 'Return to the ideas that need another pass, instead of rereading everything from the beginning.',
  },
];

const productTruths = [
  {
    index: 'A',
    title: 'Grounded explanations',
    body: 'The tutor answers from the lesson section in front of you—not a generic topic summary.',
  },
  {
    index: 'B',
    title: 'Closed-book recall',
    body: 'The source disappears before you answer, so recognition cannot masquerade as understanding.',
  },
  {
    index: 'C',
    title: 'Focused revision',
    body: 'Your next pass is shaped by the gaps in your answer, not by an arbitrary study timer.',
  },
];

function PrefetchRoutes() {
  const router = useRouter();

  useEffect(() => {
    ['/dashboard', '/learn', '/example'].forEach((route) => {
      try {
        router.prefetch(route);
      } catch {}
    });
  }, [router]);

  return null;
}

function ContourField() {
  return (
    <svg
      className={styles.contours}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path d="M-86 154C82 47 223 45 361 113s211 197 363 180 212-168 372-169 229 91 420 11" />
      <path d="M-121 236C54 118 220 113 373 187s215 193 359 176 221-163 381-153 235 101 398 29" />
      <path d="M-149 340C37 211 214 204 385 282s220 184 360 169 227-152 388-132 234 114 387 56" />
      <path d="M-168 463C28 326 211 313 397 397s226 169 363 155 231-137 393-103 225 130 368 92" />
      <path d="M-173 606C32 464 211 443 410 530s233 149 368 138 230-116 393-64 211 145 346 128" />
      <path d="M-150 758C60 619 226 588 425 675s235 128 374 123 224-92 384-23 194 151 322 152" />
    </svg>
  );
}

function ProductProof() {
  return (
    <div className={styles.productProof} data-home-reveal>
      <div className={styles.productTopbar}>
        <div className={styles.windowControls} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>Distributed practice</p>
        <span>Section 02 / 04</span>
      </div>

      <div className={styles.productBody}>
        <section className={styles.sourcePanel} aria-label="Source excerpt">
          <div className={styles.panelLabel}>
            <span>Source</span>
            <span>p. 12</span>
          </div>
          <h3>Why spacing strengthens memory</h3>
          <p>
            A little forgetting makes retrieval more effortful. That effort
            strengthens the route back to the idea.
          </p>
          <p className={styles.sourceHighlight}>
            The difficulty is not the flaw. It is the mechanism.
          </p>
          <div className={styles.sourceFooter}>
            <span>Grounded in your reading</span>
            <span>12 pages</span>
          </div>
        </section>

        <section className={styles.recallPanel} aria-label="Recall prompt">
          <div className={styles.panelLabel}>
            <span>Active recall</span>
            <span>Source hidden</span>
          </div>
          <p className={styles.recallKicker}>Answer without looking back</p>
          <h3>
            Why can delayed retrieval build stronger memory than immediate
            rereading?
          </h3>
          <div className={styles.answerField}>
            <span>Reconstruct the idea in your own words…</span>
            <span className={styles.answerArrow} aria-hidden="true">
              ↗
            </span>
          </div>
          <p className={styles.recallFooter}>
            Graded against the section—not a model answer.
          </p>
        </section>

        <aside className={styles.scoreNote} aria-label="Example answer score">
          <span>Recall quality</span>
          <strong>9 / 10</strong>
          <p>Specific, complete, and grounded.</p>
        </aside>
      </div>
    </div>
  );
}

export default function HomeLanding() {
  useEffect(() => {
    const previousPage = document.body.getAttribute('data-page');
    document.body.setAttribute('data-page', 'home');

    const header = document.querySelector<HTMLElement>('.app-header');
    let previousScrollY = Math.max(window.scrollY, 0);
    let scrollDirection: 'up' | 'down' | null = null;
    let directionalTravel = 0;
    let headerFrame = 0;
    const root = document.documentElement;

    const syncHeaderHeight = () => {
      if (!header) return;
      root.style.setProperty(
        '--landing-header-height',
        `${header.getBoundingClientRect().height}px`
      );
    };

    const headerResizeObserver = header
      ? new ResizeObserver(syncHeaderHeight)
      : undefined;
    if (header) headerResizeObserver?.observe(header);
    syncHeaderHeight();

    const revealHeader = () => {
      header?.classList.remove('landing-header-hidden');
    };

    const updateHeader = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const delta = currentScrollY - previousScrollY;
      const nextDirection = delta > 0 ? 'down' : delta < 0 ? 'up' : null;

      if (nextDirection) {
        if (nextDirection === scrollDirection) {
          directionalTravel += Math.abs(delta);
        } else {
          scrollDirection = nextDirection;
          directionalTravel = Math.abs(delta);
        }
      }

      header?.classList.toggle('landing-header-scrolled', currentScrollY > 16);

      if (
        currentScrollY <= 24 ||
        (scrollDirection === 'up' && directionalTravel >= 8)
      ) {
        revealHeader();
      } else if (
        currentScrollY > 96 &&
        scrollDirection === 'down' &&
        directionalTravel >= 12
      ) {
        header?.classList.add('landing-header-hidden');
      }

      previousScrollY = currentScrollY;
      headerFrame = 0;
    };

    const handleScroll = () => {
      if (headerFrame) return;
      headerFrame = window.requestAnimationFrame(updateHeader);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.clientY <= 24) revealHeader();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    header?.addEventListener('focusin', revealHeader);
    updateHeader();

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const revealTargets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-home-reveal]')
    );
    let revealObserver: IntersectionObserver | undefined;

    if (reduceMotion) {
      revealTargets.forEach((target) => target.classList.add(styles.visible));
    } else {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add(styles.visible);
            revealObserver?.unobserve(entry.target);
          });
        },
        { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
      );
      revealTargets.forEach((target) => revealObserver?.observe(target));
    }

    return () => {
      revealObserver?.disconnect();
      headerResizeObserver?.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      header?.removeEventListener('focusin', revealHeader);
      header?.classList.remove(
        'landing-header-hidden',
        'landing-header-scrolled'
      );
      if (headerFrame) window.cancelAnimationFrame(headerFrame);
      root.style.removeProperty('--landing-header-height');
      if (previousPage) document.body.setAttribute('data-page', previousPage);
      else document.body.removeAttribute('data-page');
    };
  }, []);

  return (
    <div className={styles.page} data-landing-page>
      <PrefetchRoutes />

      <section className={styles.hero} aria-labelledby="welcome-heading">
        <ContourField />
        <div className={styles.heroGlow} aria-hidden="true" />

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span aria-hidden="true">01</span>
              Built for recall
            </p>

            <h1 id="welcome-heading" className={styles.headline}>
              <span>Your notes know it.</span>
              <em>Do you?</em>
            </h1>

            <p className={styles.heroBody}>
              Drop in notes, slides, or a PDF. LearnMax turns them into a guided
              lesson, tests what you can recall without looking, and brings back
              only what has not stuck.
            </p>

            <div className={styles.heroActions}>
              <Link href="/learn" className={styles.primaryAction}>
                Build your first lesson
                <ArrowRight aria-hidden="true" />
              </Link>
              <a href="#study-loop" className={styles.secondaryAction}>
                See the method
              </a>
            </div>
          </div>

          <div className={styles.heroObject}>
            <KnowledgeSculpture />
          </div>

          <div className={styles.heroFoot}>
            <p>
              <span>Grounded</span>
              in the material you trust
            </p>
            <p>
              <span>Active</span>
              answers hidden until you commit
            </p>
            <p>
              <span>Measured</span>
              mastery you can actually prove
            </p>
          </div>
        </div>
      </section>

      <section
        id="study-loop"
        className={styles.method}
        aria-labelledby="method-heading"
      >
        <div className={styles.sectionShell}>
          <div className={styles.methodIntro} data-home-reveal>
            <p className={styles.sectionEyebrow}>The study loop</p>
            <h2 id="method-heading">
              Reading feels productive.
              <em>Recall proves it.</em>
            </h2>
            <p>
              LearnMax keeps going after the explanation makes sense. It takes
              the support away and asks you to rebuild the idea yourself.
            </p>
          </div>

          <ProductProof />

          <ol className={styles.loop}>
            {studyLoop.map((step, index) => (
              <li
                key={step.title}
                className={styles.loopStep}
                data-home-reveal
                style={
                  { '--step-delay': `${index * 70}ms` } as React.CSSProperties
                }
              >
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.thesis} aria-labelledby="thesis-heading">
        <div className={styles.sectionShell}>
          <div className={styles.thesisIntro} data-home-reveal>
            <p className={styles.sectionEyebrow}>Designed around one truth</p>
            <h2 id="thesis-heading">
              Familiar is not the same as <em>known.</em>
            </h2>
            <p>
              A clean summary can create the feeling of progress. LearnMax is
              built to find out whether the knowledge is still there when the
              page is not.
            </p>
          </div>

          <div className={styles.truthList}>
            {productTruths.map((truth, index) => (
              <article
                key={truth.title}
                className={styles.truth}
                data-home-reveal
                style={
                  { '--step-delay': `${index * 75}ms` } as React.CSSProperties
                }
              >
                <span>{truth.index}</span>
                <h3>{truth.title}</h3>
                <p>{truth.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-heading">
        <div className={styles.closingInner} data-home-reveal>
          <p>Start with material you already have.</p>
          <h2 id="closing-heading">Find out what actually stuck.</h2>
          <Link href="/learn" className={styles.closingAction}>
            Start with your material
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
