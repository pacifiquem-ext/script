import React from 'react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { IconUser, IconMail, IconClose } from '../../lib/icons';
import './SettingsModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  return (
    <>
      <div className={`settings-modal-overlay ${open ? 'settings-modal-overlay--open' : ''}`} onClick={onClose} />
      <div className={`settings-modal ${open ? 'settings-modal--open' : ''}`}>
        <div className="settings-modal__header">
          <div>
            <h2 className="text-h6 settings-modal__title">Settings</h2>
            <p className="text-para-xs settings-modal__sub">Manage your workspace and account</p>
          </div>
          <button className="settings-modal__close" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>

        <div className="settings-modal__body">
          <div className="settings-section">
            <h3 className="text-label-lg settings-section__title">Workspace</h3>
            <div className="settings-section__body">
              <Input label="Organization name" defaultValue="Acme Corp" leftIcon={<IconUser size={18} />} />
              <Button size="sm" mode="stroke">Save changes</Button>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="text-label-lg settings-section__title">Profile</h3>
            <div className="settings-section__body">
              <Input label="Full name" defaultValue="Jane Smith" leftIcon={<IconUser size={18} />} />
              <Input label="Email" defaultValue="jane@acme.com" leftIcon={<IconMail size={18} />} />
              <Button size="sm" mode="stroke">Update profile</Button>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="text-label-lg settings-section__title">Preferences</h3>
            <div className="settings-section__body">
              <div className="settings-toggle-row">
                <div>
                  <p className="text-label-sm" style={{ color: 'var(--text-strong-950)' }}>Email notifications</p>
                  <p className="text-para-xs" style={{ color: 'var(--text-soft-400)' }}>Get notified when documents are processed</p>
                </div>
                <label className="settings-toggle">
                  <input type="checkbox" defaultChecked />
                  <span className="settings-toggle__track" />
                </label>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="text-label-lg settings-section__title">Data &amp; Privacy</h3>
            <div className="settings-section__body">
              <p className="text-para-sm" style={{ color: 'var(--text-sub-600)', lineHeight: '1.7' }}>
                Your documents are private to your organization. We do not use your data to train any models.
                All files are encrypted at rest and in transit.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Button size="sm" mode="stroke">Export data</Button>
                <Button size="sm" variant="error" mode="stroke">Delete account</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
