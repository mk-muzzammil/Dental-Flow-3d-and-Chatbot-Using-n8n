'use client';
/**
 * Loads the 3D scenes only in the browser, only when the device can draw
 * them (WebGL). A light drawing of a tooth stands in on devices that can't. The 3D code (three.js) is split into its own file so the
 * text of the page appears first.
 */
import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect, useState } from 'react';

export function ToothArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ta-enamel" cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f4efe6" />
          <stop offset="1" stopColor="#d9e7ee" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="206" rx="58" ry="8" fill="#0b5266" opacity="0.12" />
      <path
        d="M100 24c-18-12-58-12-70 14-12 26 2 58 10 78 8 22 6 60 22 76 12 12 20-6 22-24 2-16 6-34 16-34s14 18 16 34c2 18 10 36 22 24 16-16 14-54 22-76 8-20 22-52 10-78-12-26-52-26-70-14z"
        fill="url(#ta-enamel)" stroke="#cfe3ec" strokeWidth="1.5"
      />
      <path d="M58 46c10-8 26-8 34 0" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9" />
    </svg>
  );
}

/** true once we know the browser can draw WebGL; false if it can't; null while checking. */
export function useWebGL() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      setOk(!!(c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

// Keep a labelled fallback visible if a scene bundle is still downloading.
const Placeholder = () => <div className="absolute inset-0 flex items-center justify-center"><LoadingIndicator label="Loading view…" /></div>;

export const HeroScene = dynamic(() => import('./Scenes').then(m => m.HeroScene), { ssr: false, loading: Placeholder });
export const StoryScene = dynamic(() => import('./Scenes').then(m => m.StoryScene), { ssr: false, loading: Placeholder });
export const MouthScene = dynamic(() => import('./MouthScene').then(m => m.MouthScene), { ssr: false, loading: Placeholder });
