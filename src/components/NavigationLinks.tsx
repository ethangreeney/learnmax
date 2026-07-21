'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavigationLink = {
  href: string;
  label: string;
};

function isCurrentRoute(pathname: string, href: string) {
  if (href === '/learn') {
    return (
      pathname === '/learn' ||
      pathname.startsWith('/learn/') ||
      pathname.startsWith('/revise/')
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavigationLinks({
  links,
}: {
  links: NavigationLink[];
}) {
  const pathname = usePathname() || '';

  if (pathname === '/welcome' || pathname === '/') {
    return (
      <nav aria-label="Landing page navigation" className="landing-primary-nav">
        <a href="#study-loop">Method</a>
        <Link href="/example">Sample lesson</Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary navigation" className="primary-nav">
      {links.map((link) => {
        const current = isCurrentRoute(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className="primary-nav-link"
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
