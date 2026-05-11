import React, { useState } from 'react';
import { 
  IconClose, IconUser, IconSettings, IconLock, IconGrid, 
  IconSparkles, IconChevronDown, IconCheck, IconSearch, IconPlus, IconArrowRight
} from '../../lib/icons';
import { IconGoogleDrive, IconDropbox, IconOneDrive, IconBox } from '../../components/ui/BrandIcons';
import { Button } from '../../components/ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SIDEBAR_NAV = [
  {
    category: 'Workspace',
    items: [
      { id: 'people', label: 'People', icon: <IconUser size={16} /> },
      { id: 'billing', label: 'Plans & Billing', icon: <IconGrid size={16} /> },
    ]
  },
  {
    category: 'Account',
    items: [
      { id: 'profile', label: 'Profile', icon: <IconUser size={16} /> },
      { id: 'preferences', label: 'Preferences', icon: <IconSettings size={16} /> },
      { id: 'appearance', label: 'Appearance', icon: <IconGrid size={16} /> },
    ]
  },
  {
    category: 'Security',
    items: [
      { id: 'security', label: 'Security', icon: <IconLock size={16} /> },
      { id: 'privacy', label: 'Privacy & Data', icon: <IconLock size={16} /> },
    ]
  },
  {
    category: 'Features',
    items: [
      { id: 'ai', label: 'AI Settings', icon: <IconSparkles size={16} /> },
      { id: 'integrations', label: 'Integrations', icon: <IconGrid size={16} /> },
      { id: 'advanced', label: 'Advanced', icon: <IconSettings size={16} /> },
    ]
  }
];

function SegmentedBar({ percentage, color }: { percentage: number, color: string }) {
  const totalSegments = 40;
  const activeSegments = Math.round((percentage / 100) * totalSegments);

  return (
    <div className="flex gap-[2px] items-center h-2 w-full max-w-[240px]">
      {Array.from({ length: totalSegments }).map((_, i) => (
        <div 
          key={i} 
          className="flex-1 h-full rounded-full"
          style={{ backgroundColor: i < activeSegments ? color : '#f5f5f5' }}
        />
      ))}
    </div>
  );
}

function Toggle({ checked }: { checked: boolean }) {
  return (
    <div className={`w-[36px] h-[20px] rounded-full flex items-center p-[2px] transition-colors cursor-pointer shrink-0 ${checked ? 'bg-[#10b981]' : 'bg-neutral-200'}`}>
      <div className={`w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-[16px]' : 'translate-x-0'}`} />
    </div>
  );
}

export function SettingsModal({ open, onClose }: Props) {
  const [activeItem, setActiveItem] = useState('workspace'); // 'workspace', 'billing', 'profile', 'preferences', 'people'

  const renderContent = () => {
    switch (activeItem) {
      case 'workspace':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Workspace overview</h2>
                <p className="text-[14px] text-neutral-500">Manage your workspace ownership and settings.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose} aria-label="Close">
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Overview</h3>
                  <p className="text-[13px] text-neutral-500">Workspace summary and details.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-[12px] font-bold text-neutral-600 shrink-0">JB</div>
                      <div className="flex flex-col">
                        <p className="text-[14px] font-medium text-neutral-950">James Brown <span className="text-neutral-400 font-normal">(james@gmail.com)</span></p>
                        <p className="text-[12px] text-neutral-400 mt-0.5">Member since <span className="text-neutral-950 font-medium">May 16, 2025</span></p>
                      </div>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Manage</button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mt-2">
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Workspace</span><span className="text-[14px] font-medium text-neutral-950">Spectrum™</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Your role</span><span className="text-[14px] font-medium text-neutral-950">Admin</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Team members</span><span className="text-[14px] font-medium text-neutral-950">3/10 seats</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Plan renewal</span><span className="text-[14px] font-medium text-neutral-950">June 20, 2025</span></div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Activity</h3>
                  <p className="text-[13px] text-neutral-500">Usage analytics and metrics.</p>
                </div>
                <div className="flex-1 w-full max-w-[500px]">
                  <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Conversations</span><span className="text-[14px] font-medium text-neutral-950">2,847</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Active projects</span><span className="text-[14px] font-medium text-neutral-950">59</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Files uploaded</span><span className="text-[14px] font-medium text-neutral-950">156</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Storage used</span><span className="text-[14px] font-medium text-neutral-950">24%</span></div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Plan usage</h3>
                  <p className="text-[13px] text-neutral-500">Usage limits and current consumption.</p>
                </div>
                <div className="flex-1 flex flex-col gap-5 w-full max-w-[500px]">
                  <div className="flex items-center justify-between"><span className="text-[13px] text-neutral-600 w-[100px]">Team seats</span><div className="flex-1 mx-4"><SegmentedBar percentage={60} color="#7c3aed" /></div><span className="text-[12px] text-neutral-500 w-[30px] text-right">60%</span></div>
                  <div className="flex items-center justify-between"><span className="text-[13px] text-neutral-600 w-[100px]">Storage</span><div className="flex-1 mx-4"><SegmentedBar percentage={8} color="#0d9488" /></div><span className="text-[12px] text-neutral-500 w-[30px] text-right">8%</span></div>
                  <div className="flex items-center justify-between"><span className="text-[13px] text-neutral-600 w-[100px]">API</span><div className="flex-1 mx-4"><SegmentedBar percentage={25} color="#ea580c" /></div><span className="text-[12px] text-neutral-500 w-[30px] text-right">25%</span></div>
                </div>
              </div>
            </div>
          </>
        );
      
      case 'billing':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Plans &amp; Billing</h2>
                <p className="text-[14px] text-neutral-500">Manage subscription and billing settings.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Current plan</h3>
                  <p className="text-[13px] text-neutral-500">Plan details and usage overview.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="p-5 bg-neutral-50 rounded-20 border border-neutral-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-alpha-10 flex items-center justify-center text-primary-base shrink-0"><IconSparkles size={18} /></div>
                        <div className="flex flex-col">
                          <p className="text-[15px] font-bold text-neutral-950">Professional Organization</p>
                          <p className="text-[12px] text-neutral-500 mt-0.5">Shared workspace for up to 10 members</p>
                        </div>
                      </div>
                      <span className="text-[16px] font-bold text-neutral-950">$49<span className="text-neutral-400 font-normal text-[13px]">/mo</span></span>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-medium text-neutral-700">Workspace Credit Usage</span>
                          <span className="text-[13px] font-bold text-primary-base">1,450 / 2,000</span>
                        </div>
                        <SegmentedBar percentage={72.5} color="var(--primary-base)" />
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <Button variant="primary" size="sm">Upgrade Plan</Button>
                        <Button variant="neutral" mode="stroke" size="sm">Purchase Credits</Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mt-2 px-1">
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Seat usage</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">4 / 10 active seats</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Next renewal</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">June 20, 2025</span></div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Billing history</h3>
                  <p className="text-[13px] text-neutral-500">Invoice history and payments.</p>
                </div>
                <div className="flex-1 flex flex-col gap-5 w-full max-w-[500px]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input type="text" placeholder="Search invoices..." className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-8 text-[13px] outline-none focus:border-primary-base focus:ring-1 focus:ring-primary-base transition-all" />
                    </div>
                    <button className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-8 bg-white text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors">
                      All status <IconChevronDown size={14} className="text-neutral-400" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0 border-t border-neutral-100 mt-2 pt-2">
                    {['April 15, 2024', 'May 15, 2024', 'Jun 15, 2024', 'July 15, 2024', 'Aug 15, 2024'].map((date, i) => (
                      <div key={i} className="flex items-center justify-between py-4 border-b border-neutral-100 last:border-0">
                        <span className="text-[13px] text-neutral-500 w-[140px]">{date}</span>
                        <span className="text-[13px] text-neutral-700 flex-1">$49</span>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5 text-[13px] text-neutral-700"><IconCheck size={14} className="text-[#10b981]" /> Paid</span>
                          <button className="text-neutral-400 hover:text-neutral-700 bg-transparent border-none p-1 flex flex-col gap-[2px]">
                            <div className="w-[3px] h-[3px] rounded-full bg-current" />
                            <div className="w-[3px] h-[3px] rounded-full bg-current" />
                            <div className="w-[3px] h-[3px] rounded-full bg-current" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      
      case 'profile':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Profile</h2>
                <p className="text-[14px] text-neutral-500">Manage your personal account settings.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Profile picture</h3>
                  <p className="text-[13px] text-neutral-500">Update your avatar image.</p>
                </div>
                <div className="flex-1 flex flex-col gap-4 w-full max-w-[500px]">
                  <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center text-[14px] font-bold text-neutral-600">JB</div>
                  <div>
                    <h4 className="text-[14px] font-medium text-neutral-950">Upload image</h4>
                    <p className="text-[12px] text-neutral-400 mt-1">Min 400x400px, PNG or JPEG formats.</p>
                  </div>
                  <button className="w-fit px-4 py-2 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors mt-2">Upload</button>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Personal information</h3>
                  <p className="text-[13px] text-neutral-500">Edit your account details.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <p className="text-[14px] font-medium text-neutral-950">James Brown</p>
                      <p className="text-[12px] text-neutral-400 mt-0.5">Member since <span className="text-neutral-950 font-medium">May 16, 2025</span></p>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Edit profile</button>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-y-4 gap-x-8 mt-2 border-t border-neutral-100 pt-6">
                    <div className="flex items-center gap-2"><IconUser size={14} className="text-neutral-400" /><span className="text-[13px] text-neutral-500">Full name</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">James Brown</span></div>
                    <div className="flex items-center gap-2"><span className="text-[13px] text-neutral-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span><span className="text-[13px] text-neutral-500">Email address</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">james@alignui.com</span></div>
                    <div className="flex items-center gap-2"><span className="text-[13px] text-neutral-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span><span className="text-[13px] text-neutral-500">Time zone</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">UTC-05:00 <span className="text-neutral-400 font-normal">(Eastern Time)</span></span></div>
                    <div className="flex items-center gap-2"><span className="text-[13px] text-neutral-500"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span><span className="text-[13px] text-neutral-500">Language</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">English</span></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'preferences':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Preferences</h2>
                <p className="text-[14px] text-neutral-500">Customize your workspace experience.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Notifications</h3>
                  <p className="text-[13px] text-neutral-500">Email and push notification settings.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Email notifications</h4>
                      <p className="text-[12px] text-neutral-400">Receive updates via email</p>
                    </div>
                    <Toggle checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Desktop notifications</h4>
                      <p className="text-[12px] text-neutral-400">Show browser notifications</p>
                    </div>
                    <Toggle checked={false} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Sound alerts</h4>
                      <p className="text-[12px] text-neutral-400">Play notification sounds</p>
                    </div>
                    <Toggle checked={true} />
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Behavior</h3>
                  <p className="text-[13px] text-neutral-500">Default actions and shortcuts.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Auto-save conversations</h4>
                      <p className="text-[12px] text-neutral-400">Automatically save chat history</p>
                    </div>
                    <Toggle checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Enter to send</h4>
                      <p className="text-[12px] text-neutral-400">Send messages with Enter key</p>
                    </div>
                    <Toggle checked={false} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Show typing indicator</h4>
                      <p className="text-[12px] text-neutral-400">Display when AI is responding</p>
                    </div>
                    <Toggle checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Default export format</h4>
                      <p className="text-[12px] text-neutral-400">Preferred file format for exports</p>
                    </div>
                    <button className="flex items-center gap-2 px-3 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors">
                      PDF <IconChevronDown size={14} className="text-neutral-400" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Session timeout</h4>
                      <p className="text-[12px] text-neutral-400">Auto-logout after inactivity (minutes)</p>
                    </div>
                    <div className="flex items-center gap-4 px-3 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] text-neutral-700">
                      <span className="text-neutral-400 cursor-pointer hover:text-neutral-950">-</span>
                      <span>30</span>
                      <span className="text-neutral-400 cursor-pointer hover:text-neutral-950">+</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'people':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Team members</h2>
                <p className="text-[14px] text-neutral-500">Manage workspace members, roles and permissions.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Team overview</h3>
                  <p className="text-[13px] text-neutral-500">Workspace statistics &amp; details.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-alpha-10 flex items-center justify-center text-primary-base shrink-0"><IconSparkles size={18} /></div>
                      <div className="flex flex-col">
                        <p className="text-[14px] font-medium text-neutral-950">Spectrum™</p>
                        <p className="text-[12px] text-neutral-400 mt-0.5">Team created date <span className="text-neutral-950 font-medium">May 18, 2025</span></p>
                      </div>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Manage</button>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-y-4 gap-x-8 mt-2 border-t border-neutral-100 pt-6">
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Used seats</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">3/10 seats</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Admins</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">2 members</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Pending invites</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">1 invite</span></div>
                    <div className="flex flex-col gap-1"><span className="text-[13px] text-neutral-500">Active today</span></div><div className="flex flex-col gap-1"><span className="text-[14px] font-medium text-neutral-950">3 members</span></div>
                  </div>
                </div>
              </div>
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Members</h3>
                  <p className="text-[13px] text-neutral-500">User roles and permissions.</p>
                </div>
                <div className="flex-1 flex flex-col gap-5 w-full max-w-[500px]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input type="text" placeholder="Search team members..." className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-8 text-[13px] outline-none focus:border-primary-base focus:ring-1 focus:ring-primary-base transition-all" />
                    </div>
                    <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>Invite Member</Button>
                  </div>
                  <div className="flex flex-col gap-0 border-t border-neutral-100 mt-2 pt-2">
                    {[
                      { name: 'Sophia Williams', email: 'sophia@gmail.com', initial: 'S', color: 'bg-amber-100 text-amber-700', role: 'Admin', credits: 80 },
                      { name: 'James Brown', email: 'james@gmail.com', initial: 'J', color: 'bg-neutral-200 text-neutral-700', role: 'Admin', credits: 100 },
                      { name: 'Arthur Taylor', email: 'arthur@gmail.com', initial: 'A', color: 'bg-blue-100 text-blue-700', role: 'Member', credits: 45 },
                      { name: 'Emma Wright', email: 'emma@gmail.com', initial: 'E', color: 'bg-cyan-100 text-cyan-700', role: 'Member', credits: 12 },
                    ].map((user, i) => (
                      <div key={i} className="flex flex-col py-4 border-b border-neutral-100 last:border-0 gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${user.color}`}>{user.initial}</div>
                            <div className="flex flex-col">
                              <span className="text-[13px] font-medium text-neutral-950">{user.name}</span>
                              <span className="text-[12px] text-neutral-500">{user.email}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-neutral-100 rounded-6 bg-neutral-50 text-[12px] text-neutral-700 hover:bg-neutral-100 transition-colors">
                              {user.role} <IconChevronDown size={12} className="text-neutral-400" />
                            </button>
                            <button className="p-1.5 text-neutral-400 hover:text-error-base transition-colors"><IconClose size={14} /></button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 pl-11">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Credit Allocation</span>
                              <span className="text-[12px] font-bold text-neutral-950">{user.credits}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-primary-base" style={{ width: `${user.credits}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'integrations':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Integrations</h2>
                <p className="text-[14px] text-neutral-500">Connect your favorite tools to import documents.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex flex-col gap-6">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-[14px] font-semibold text-neutral-950">Cloud Storage</h3>
                  <p className="text-[13px] text-neutral-500">Bulk import files from your storage providers.</p>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: 'drive', name: 'Google Drive', icon: <IconGoogleDrive size={24} />, description: 'Import documents from your Google Drive account.', connected: true },
                    { id: 'dropbox', name: 'Dropbox', icon: <IconDropbox size={24} />, description: 'Sync folders and documents from Dropbox.', connected: false },
                    { id: 'onedrive', name: 'OneDrive', icon: <IconOneDrive size={24} />, description: 'Access your Microsoft 365 documents.', connected: false },
                    { id: 'box', name: 'Box', icon: <IconBox size={24} />, description: 'High-security document management integration.', connected: false },
                  ].map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-16 border border-neutral-200 hover:border-neutral-300 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-12 bg-white flex items-center justify-center shadow-sm border border-neutral-100">
                          {integration.icon}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-neutral-950">{integration.name}</span>
                            {integration.connected && (
                              <span className="flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">
                                <IconCheck size={10} /> CONNECTED
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-neutral-500 mt-0.5">{integration.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {integration.connected ? (
                          <Button 
                            variant="error" 
                            mode="lighter" 
                            size="sm"
                          >
                            Disconnect
                          </Button>
                        ) : (
                          <Button 
                            variant="primary" 
                            size="sm"
                            rightIcon={<IconArrowRight size={14} />}
                          >
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="py-8 border-t border-neutral-200 flex flex-col gap-6">
                <div className="flex flex-col gap-1 mb-2">
                  <h3 className="text-[14px] font-semibold text-neutral-950">Developer Tools</h3>
                  <p className="text-[13px] text-neutral-500">Automate your document workflows.</p>
                </div>
                
                <div className="p-5 bg-neutral-950 rounded-20 text-white relative overflow-hidden">
                  <div className="relative z-10">
                    <h4 className="text-[15px] font-bold">API Access</h4>
                    <p className="text-[13px] text-white/60 mt-1 max-w-[340px]">
                      Build custom integrations using our secure API. Generate keys to get started.
                    </p>
                    <Button 
                      variant="primary"
                      size="sm"
                      className="mt-4"
                    >
                      Generate API Key
                    </Button>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-primary-base/20 to-transparent pointer-events-none" />
                  <IconSparkles size={120} className="absolute -bottom-10 -right-10 text-white/5 pointer-events-none rotate-12" />
                </div>
              </div>
            </div>
          </>
        );

      case 'security':
        return (
          <>
            <div className="flex items-start justify-between p-[32px_40px_24px]">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-950 mb-1">Security</h2>
                <p className="text-[14px] text-neutral-500">Manage account security and access control.</p>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-transparent border-none cursor-pointer text-neutral-400 rounded-8 transition-colors duration-200 shrink-0 hover:text-neutral-950 hover:bg-neutral-100" onClick={onClose}>
                <IconClose size={18} />
              </button>
            </div>
            <div className="px-[40px] pb-[40px] flex flex-col">
              <div className="py-8 border-t border-neutral-200 flex items-start gap-12 max-lg:flex-col max-lg:gap-6">
                <div className="w-[240px] shrink-0">
                  <h3 className="text-[14px] font-semibold text-neutral-950 mb-1">Account security</h3>
                  <p className="text-[13px] text-neutral-500">Password &amp; login security settings.</p>
                </div>
                <div className="flex-1 flex flex-col gap-6 w-full max-w-[500px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Password</h4>
                      <p className="text-[12px] text-neutral-400">Last changed 3 months ago</p>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Change</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Two-factor authentication</h4>
                      <p className="text-[12px] text-neutral-400">Add an extra layer of security to your account</p>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Enable 2FA</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Login notifications</h4>
                      <p className="text-[12px] text-neutral-400">Get notified of new sign-ins</p>
                    </div>
                    <Toggle checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-medium text-neutral-950">Password recovery</h4>
                      <p className="text-[12px] text-neutral-400">Update your recovery email address</p>
                    </div>
                    <button className="px-4 py-1.5 border border-neutral-200 rounded-8 bg-white text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">Update</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-neutral-400">
            <p>Select an option from the sidebar.</p>
          </div>
        );
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-[200] transition-opacity duration-300 flex items-center justify-center ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose} 
      />
      <div className={`fixed top-1/2 left-1/2 w-[min(1024px,95vw)] h-[min(760px,90vh)] bg-white z-[201] rounded-[24px] shadow-2xl transition-all duration-300 flex overflow-hidden ${open ? '-translate-x-1/2 -translate-y-1/2 scale-100 opacity-100 pointer-events-auto' : '-translate-x-1/2 -translate-y-[45%] scale-95 opacity-0 pointer-events-none'}`}>
        
        {/* Sidebar */}
        <div className="w-[260px] bg-white border-r border-neutral-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 pt-6 flex flex-col gap-6">
            
            <div className="flex flex-col gap-2">
              <span className="px-3 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Workspace</span>
              <button 
                className={`flex items-center justify-between w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === 'workspace' ? 'bg-neutral-100' : 'bg-transparent hover:bg-neutral-50'}`}
                onClick={() => setActiveItem('workspace')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-600">J</div>
                  <span className="text-[13px] font-medium text-neutral-950">James Brown</span>
                  <span className="text-[9px] font-bold text-primary-base bg-primary-alpha-10 px-1.5 py-0.5 rounded-4 tracking-wide">PRO</span>
                </div>
                <IconChevronDown size={14} className="text-neutral-400 -rotate-90" />
              </button>

              {SIDEBAR_NAV[0].items.map(item => (
                <button 
                  key={item.id}
                  className={`flex items-center gap-3 w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === item.id ? 'bg-neutral-100 text-neutral-950 font-medium' : 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950 font-medium'}`}
                  onClick={() => setActiveItem(item.id)}
                >
                  <span className="text-neutral-400">{item.icon}</span>
                  <span className="text-[13px]">{item.label}</span>
                </button>
              ))}
            </div>

            {SIDEBAR_NAV.slice(1).map((section, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <span className="px-3 pb-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">{section.category}</span>
                {section.items.map(item => (
                  <button 
                    key={item.id}
                    className={`flex items-center gap-3 w-full p-[8px_12px] rounded-10 border-none cursor-pointer transition-colors ${activeItem === item.id ? 'bg-neutral-100 text-neutral-950 font-medium' : 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950 font-medium'}`}
                    onClick={() => setActiveItem(item.id)}
                  >
                    <span className="text-neutral-400">{item.icon}</span>
                    <span className="text-[13px]">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Content Pane */}
        <div className="flex-1 flex flex-col bg-white overflow-y-auto relative">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
