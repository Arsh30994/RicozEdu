'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import type { ConsoleTheme } from './console-ui';

const DESTINATIONS = [
  { label: 'Dashboard', href: '/admin/dashboard', keywords: 'overview home' },
  { label: 'Institutions', href: '/admin/institutions', keywords: 'organization campuses' },
  { label: 'People', href: '/admin/people', keywords: 'directory staff faculty' },
  { label: 'Students', href: '/admin/students', keywords: 'learners progress' },
  { label: 'Ricoz AI', href: '/assistant', keywords: 'assistant chat' },
  { label: 'Study companion', href: '/study', keywords: 'revision plans learning' },
  { label: 'Users & roles', href: '/admin/users', keywords: 'access permissions' },
  { label: 'Audit log', href: '/admin/audit', keywords: 'compliance activity' },
];

export function CommandPalette({
  theme,
  onThemeChange,
}: {
  theme: ConsoleTheme;
  onThemeChange: (theme: ConsoleTheme) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [modifier, setModifier] = useState('Ctrl');
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const commands = useMemo(() => {
    const destinations = DESTINATIONS.map((destination) => ({
      ...destination,
      run: () => router.push(destination.href),
      category: 'Go to',
    }));
    return [
      ...destinations,
      {
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        href: '',
        keywords: 'appearance color',
        category: 'Action',
        run: () => onThemeChange(theme === 'dark' ? 'light' : 'dark'),
      },
    ];
  }, [onThemeChange, router, theme]);

  const filtered = commands.filter((command) =>
    `${command.label} ${command.keywords}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    setModifier(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runActive() {
    const command = filtered[activeIndex];
    if (!command) return;
    setOpen(false);
    command.run();
  }

  function finishSwipe(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    event.currentTarget.style.removeProperty('--palette-drag-y');
    if (start && event.clientY - start.y > 90 && Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x)) {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="command-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Open command menu, ${modifier} K`}
      >
        <span aria-hidden="true">⌕</span>
        <span>Jump to…</span>
        <kbd>{modifier} K</kbd>
      </button>

      {open && mounted ? createPortal(
        <div
          className="console command-backdrop"
          data-theme={theme}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command menu"
          >
            <div
              className="command-sheet-handle"
              aria-hidden="true"
              onPointerDown={(event) => {
                if (event.pointerType === 'touch') {
                  pointerStart.current = { x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onPointerMove={(event) => {
                if (!pointerStart.current || event.pointerType !== 'touch') return;
                const distance = Math.max(0, event.clientY - pointerStart.current.y);
                event.currentTarget.parentElement?.style.setProperty('--palette-drag-y', `${distance}px`);
              }}
              onPointerUp={(event) => {
                const palette = event.currentTarget.parentElement;
                finishSwipe(event);
                palette?.style.removeProperty('--palette-drag-y');
              }}
              onPointerCancel={(event) => {
                const palette = event.currentTarget.parentElement;
                finishSwipe(event);
                palette?.style.removeProperty('--palette-drag-y');
              }}
            />
            <label className="command-search-label" htmlFor="command-query">
              <span aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                id="command-query"
                aria-label="Search commands"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % Math.max(filtered.length, 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => (index - 1 + filtered.length) % Math.max(filtered.length, 1));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    runActive();
                  }
                }}
                placeholder="Search pages and actions…"
                autoComplete="off"
              />
              <kbd>ESC</kbd>
            </label>

            <div className="command-list" role="listbox" aria-label="Pages and actions">
              {filtered.length ? (
                filtered.map((command, index) => (
                  <button
                    className={`command-item${index === activeIndex ? ' active' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    key={command.label}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      setOpen(false);
                      command.run();
                    }}
                  >
                    <span className="command-item-icon" aria-hidden="true">
                      {command.category === 'Action' ? '◐' : '↗'}
                    </span>
                    <span className="command-item-label">{command.label}</span>
                    <span className="command-item-category">{command.category}</span>
                    {index === activeIndex ? <kbd>↵</kbd> : null}
                  </button>
                ))
              ) : (
                <p className="command-empty">No pages or actions match “{query}”.</p>
              )}
            </div>

            <footer className="command-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
              <span><kbd>↵</kbd> Open</span>
              <span><kbd>ESC</kbd> Close</span>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
