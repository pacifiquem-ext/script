import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  IconPlus, IconChat, IconLibrary, IconSearch, IconClose,
  IconSidebar, IconSettings, IconLogout, IconChevronDown,
} from '../../lib/icons';
import { SettingsModal } from '../../pages/app/SettingsModal';
import './AppLayout.css';

const ALL_CHATS = [
  { group: 'Today', items: ['User research analysis', 'Competitive analysis', 'Meeting notes'] },
  { group: 'Yesterday', items: ['Market trends analysis', 'Usability testing results', 'Competitive analysis', 'Feature prioritization', 'User feedback'] },
];

const ALL_CHAT_ITEMS = ALL_CHATS.flatMap(g => g.items.map(name => ({ name, group: g.group })));

export function AppLayout() {
  const [expanded, setExpanded] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (searchMode) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [searchMode]);

  const isActive = (href: string) => location.pathname.startsWith(href);

  const filteredChats = searchQuery
    ? ALL_CHAT_ITEMS.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  return (
    <div className="app-layout">
      <aside className={`app-sidebar ${expanded ? 'app-sidebar--expanded' : 'app-sidebar--compact'}`}>
        <div className="app-sidebar__head">
          {expanded && (
            <Link to="/" className="app-sidebar__logo">
              <span className="app-sidebar__logo-mark" />
              <span className="app-sidebar__logo-text">Script</span>
            </Link>
          )}
          <button
            className="app-sidebar__icon-btn"
            onClick={() => setExpanded(v => !v)}
            aria-label="Toggle sidebar"
            style={!expanded ? { margin: '0 auto' } : undefined}
          >
            <IconSidebar size={18} />
          </button>
        </div>

        <div className="app-sidebar__divider" />

        {/* Search bar (expanded mode) */}
        {expanded && (
          <div className="app-sidebar__search-wrap">
            {searchMode ? (
              <div className="app-sidebar__search-bar">
                <span className="app-sidebar__search-icon"><IconSearch size={14} /></span>
                <input
                  ref={searchRef}
                  className="app-sidebar__search-input text-para-sm"
                  type="text"
                  placeholder="Search chats…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setSearchMode(false)}
                />
                <button className="app-sidebar__search-close" onClick={() => setSearchMode(false)} aria-label="Close search">
                  <IconClose size={14} />
                </button>
              </div>
            ) : (
              <button className="app-sidebar__search-trigger text-para-sm" onClick={() => setSearchMode(true)}>
                <IconSearch size={14} />
                <span>Search…</span>
              </button>
            )}
          </div>
        )}

        <div className="app-sidebar__nav">
          <button
            className="app-sidebar__new-chat"
            onClick={() => navigate('/app/chat')}
            title="New chat"
          >
            <span className="app-sidebar__new-chat-icon"><IconPlus size={16} /></span>
            {expanded && <span className="text-label-sm">New chat</span>}
          </button>

          <Link
            to="/app/chat"
            className={`app-sidebar__nav-item ${isActive('/app/chat') ? 'app-sidebar__nav-item--active' : ''}`}
            title="Chat"
          >
            <IconChat size={18} />
            {expanded && <span className="text-para-sm">Chat</span>}
          </Link>

          <Link
            to="/app/library"
            className={`app-sidebar__nav-item ${isActive('/app/library') ? 'app-sidebar__nav-item--active' : ''}`}
            title="Library"
          >
            <IconLibrary size={18} />
            {expanded && <span className="text-para-sm">Library</span>}
          </Link>

          {!expanded && (
            <button
              className="app-sidebar__nav-item"
              title="Search"
              onClick={() => { setExpanded(true); setSearchMode(true); }}
            >
              <IconSearch size={18} />
            </button>
          )}
        </div>

        {/* History / search results */}
        {expanded && (
          <div className="app-sidebar__history">
            {filteredChats !== null ? (
              filteredChats.length === 0 ? (
                <p className="app-sidebar__no-results text-para-sm">No results found.</p>
              ) : (
                <div className="app-sidebar__group">
                  <p className="app-sidebar__group-label text-subheading-md">{filteredChats.length} result{filteredChats.length !== 1 ? 's' : ''}</p>
                  {filteredChats.map((item, i) => (
                    <button key={i} className="app-sidebar__history-item text-para-sm">
                      {item.name}
                    </button>
                  ))}
                </div>
              )
            ) : (
              ALL_CHATS.map(group => (
                <div key={group.group} className="app-sidebar__group">
                  <p className="app-sidebar__group-label text-subheading-md">{group.group}</p>
                  {group.items.map(item => (
                    <button key={item} className="app-sidebar__history-item text-para-sm">
                      {item}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        <div className="app-sidebar__foot">
          <div className="app-sidebar__divider" />
          <div className="app-sidebar__profile-wrap" ref={profileRef}>
            <button
              className={`app-sidebar__profile ${expanded ? 'app-sidebar__profile--expanded' : ''}`}
              onClick={() => setProfileOpen(v => !v)}
              aria-label="Profile"
            >
              <span className="app-sidebar__avatar">JB</span>
              {expanded && (
                <>
                  <div className="app-sidebar__profile-info">
                    <span className="text-label-sm" style={{ color: 'var(--text-strong-950)' }}>James Brown</span>
                    <span className="text-para-xs" style={{ color: 'var(--text-soft-400)' }}>james@alignui.com</span>
                  </div>
                  <IconChevronDown size={14} />
                </>
              )}
            </button>

            {profileOpen && (
              <div className={`app-sidebar__profile-menu ${expanded ? 'app-sidebar__profile-menu--expanded' : 'app-sidebar__profile-menu--compact'}`}>
                <div className="app-sidebar__profile-menu-header">
                  <span className="app-sidebar__avatar app-sidebar__avatar--lg">JB</span>
                  <div>
                    <p className="text-label-sm" style={{ color: 'var(--text-strong-950)' }}>James Brown</p>
                    <p className="text-para-xs" style={{ color: 'var(--text-soft-400)' }}>james@alignui.com</p>
                  </div>
                </div>
                <div className="app-sidebar__profile-menu-divider" />
                <button
                  className="app-sidebar__menu-item"
                  onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}
                >
                  <IconSettings size={16} />
                  <span className="text-para-sm">Settings</span>
                </button>
                <button
                  className="app-sidebar__menu-item app-sidebar__menu-item--danger"
                  onClick={() => navigate('/app/login')}
                >
                  <IconLogout size={16} />
                  <span className="text-para-sm">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
