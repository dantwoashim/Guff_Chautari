
import React from 'react';
import { useIsMobile, useIsTablet } from '../../hooks/useMediaQuery';

interface AppShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  list: React.ReactNode;
  mobileView?: 'list' | 'content';
  isListVisible?: boolean;
}

const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  sidebar, 
  list, 
  mobileView = 'list',
  isListVisible = true
}) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  if (isMobile) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-[#111b21] relative">
        <div 
          className={`absolute inset-0 w-full h-full transition-transform duration-300 ease-in-out ${
            mobileView === 'list' ? 'translate-x-0' : isRtl ? 'translate-x-[20%]' : '-translate-x-[20%]'
          }`}
        >
          {list}
        </div>
        <div 
          className={`absolute inset-0 w-full h-full transition-transform duration-300 ease-in-out bg-[#0b141a] z-20 ${
            mobileView === 'content'
              ? 'translate-x-0'
              : isRtl
                ? '-translate-x-full'
                : 'translate-x-full'
          }`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="ashim-app-shell flex h-screen w-full overflow-hidden bg-[#0c1317]">
      <div className={`ashim-shell-body flex w-full h-full xl:max-w-[1700px] xl:mx-auto xl:h-[calc(100vh-38px)] xl:top-[19px] xl:relative xl:shadow-2xl overflow-hidden ${isRtl ? 'flex-row-reverse' : ''}`}>
        
        {/* Left Rail (Icon Sidebar) - Hidden on Tablet/Mobile */}
        {!isTablet && (
          <div className="shrink-0 z-20 h-full">
            {sidebar}
          </div>
        )}

        {/* Chat List Panel */}
        <div 
          className={`
            shrink-0 z-10 h-full border-r border-[#313d45] transition-all duration-300 ease-in-out overflow-hidden
            ${isListVisible ? 'w-[300px] md:w-[350px] lg:w-[380px] opacity-100' : 'w-0 opacity-0 border-none'}
          `}
        >
          <div className="w-[300px] md:w-[350px] lg:w-[380px] h-full">
            {list}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 relative h-full bg-[#222e35] before:content-[''] before:absolute before:inset-0 before:bg-[url('https://static.whatsapp.net/rsrc.php/v3/yl/r/gi_Dck4u5p8.png')] before:opacity-[0.06] before:pointer-events-none">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppShell;
