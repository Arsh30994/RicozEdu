'use client';

import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { dataConnector } from '../lib/data-connector';
import { searchConsole, type SearchHit } from '../lib/search';

export function ConsoleSearch() {
  const listId = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    const refresh = () => setHits(searchConsole(dataConnector.getState(), query));
    refresh();
    return dataConnector.subscribe(refresh);
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  function openHit(hit: SearchHit) {
    setOpen(false);
    window.location.assign(hit.href);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const target = hits[active] ?? hits[0];
    if (target) {
      openHit(target);
      return;
    }
    window.location.assign(`/admin/people?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  }

  return (
    <form className="topbar-search" onSubmit={onSubmit} ref={rootRef} role="search">
      <input
        type="search"
        aria-label="Search"
        aria-controls={listId}
        aria-expanded={open && query.trim().length > 0}
        placeholder="Search people, students, institutions..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!open || hits.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % hits.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index - 1 + hits.length) % hits.length);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() ? (
        <ul className="search-results" id={listId} role="listbox">
          {hits.length === 0 ? (
            <li className="search-empty">No matches for “{query.trim()}”</li>
          ) : (
            hits.map((hit, index) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? 'active' : ''}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openHit(hit)}
                >
                  <span>{hit.title}</span>
                  <small>
                    {hit.kind} · {hit.detail}
                  </small>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </form>
  );
}
