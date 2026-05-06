import React from 'react';
import { IconArrowRight, IconPlay } from '../../lib/icons';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export function Hero() {
  return (
    <section className="pt-[120px] pb-0 overflow-hidden relative max-sm:pt-[96px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle,theme(colors.neutral.200)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50 pointer-events-none after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent_40%,theme(colors.neutral.0)_100%)]" aria-hidden />

      <div className="container flex flex-col items-center text-center gap-6 pb-16 relative z-10">
        <div className="animate-[fadeInUp_0.5s_ease_both]">
          <Badge variant="neutral" dot>
            Now in early access
          </Badge>
        </div>

        <h1 className="max-w-[720px] animate-[fadeInUp_0.5s_0.1s_ease_both] text-h1">
          Find and understand your
          <br />
          <span className="bg-[linear-gradient(135deg,theme(colors.neutral.950)_0%,theme(colors.neutral.500)_100%)] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">documents in seconds.</span>
        </h1>

        <p className="max-w-[520px] text-neutral-600 animate-[fadeInUp_0.5s_0.2s_ease_both] text-para-lg">
          Stop searching through folders, emails, and spreadsheets.
          Upload your documents and get instant answers, summaries,
          and key details&mdash;when you need them.
        </p>

        <div className="flex items-center gap-3 animate-[fadeInUp_0.5s_0.3s_ease_both] max-sm:flex-col max-sm:w-full [&>button]:max-sm:w-full [&>button]:max-sm:justify-center">
          <Button
            size="md"
            rightIcon={<IconArrowRight size={16} />}
            onClick={() => (window.location.href = '/app/login')}
          >
            Get Started
          </Button>
        </div>
      </div>

      {/* Video showcase */}
      <div className="container relative z-10 pt-10" id="showcase">
        <div className="relative mx-auto max-w-[960px] animate-[fadeInUp_0.6s_0.5s_ease_both]">
          <div className="rounded-16 overflow-hidden shadow-[0_0_0_1px_theme(colors.neutral.200),theme(boxShadow.2xl)] bg-neutral-50">
            <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-neutral-200">
              <div className="flex gap-[6px] [&>span]:w-2.5 [&>span]:h-2.5 [&>span]:rounded-full [&>span]:bg-neutral-200 [&>span:nth-child(1)]:bg-[#ff5f57] [&>span:nth-child(2)]:bg-[#febc2e] [&>span:nth-child(3)]:bg-[#28c840]">
                <span /><span /><span />
              </div>
              <div className="flex-1 bg-neutral-50 rounded-6 px-2.5 py-1 text-center">
                <span className="text-para-xs text-neutral-400">app.script.ai/documents</span>
              </div>
            </div>

            <div className="relative aspect-video overflow-hidden group">
              <img
                src="https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                alt="Script document workspace"
                className="w-full h-full object-cover block"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center transition-colors duration-300 group-hover:bg-black/20">
                <button className="w-16 h-16 rounded-full bg-white/95 border-none cursor-pointer flex items-center justify-center text-neutral-950 transition-all duration-200 shadow-lg hover:scale-105 hover:bg-white" aria-label="Watch demo">
                  <IconPlay size={24} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
