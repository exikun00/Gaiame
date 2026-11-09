import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-off-black border-t border-surface-25 mt-20 py-16 px-4 md:px-8">
      <div className="max-w-page mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xl font-semibold tracking-tighter text-surface-cream">
            GAIAME<span className="text-shockingly-green">.</span>
          </div>
          <p className="text-sm text-surface-50 mt-1">
            Plataforma full-stack de anime: catálogo, streaming híbrido y descargas locales en servidor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-surface-50">
          <span>By Exikun00</span>
          <span className="text-surface-25">•</span>
          <span>G v{__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
