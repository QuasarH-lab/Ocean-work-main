import React from 'react';
import { Activity, Box, Cpu } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-on-surface">
      <header className="flex items-center justify-between px-8 py-4 bg-[#1a2333] shadow-[0_20px_40px_rgba(0,0,0,0.4)] z-50 border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Cpu className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-tertiary leading-none mb-1">Lego Studio</div>
            <h1 className="text-2xl font-black tracking-tight text-secondary font-headline leading-none">Workbench</h1>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-8 px-8 py-2.5 bg-surface-container-low/20 rounded-2xl border border-outline-variant/10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Activity className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant leading-none mb-1">System Status</div>
              <div className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Engine Active
              </div>
            </div>
          </div>
          
          <div className="w-px h-8 bg-outline-variant/20" />
          
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/10">
              <Box className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant leading-none mb-1">Build Mode</div>
              <div className="text-xs font-bold text-on-surface">Voxel Precision</div>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant leading-none mb-1">3D Build System</div>
          <div className="text-sm font-bold text-on-surface">Voxel Lego Creator</div>
        </div>
      </header>

      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
