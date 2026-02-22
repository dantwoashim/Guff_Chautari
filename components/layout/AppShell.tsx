import React from 'react';
import { useIsTablet } from '../../hooks/useMediaQuery';

interface AppShellProps {
  primaryNav: React.ReactNode;
  commandBar: React.ReactNode;
  contextRail: React.ReactNode;
  content: React.ReactNode;
  showContextRail: boolean;
  onCloseContextRail?: () => void;
}

const AppShell: React.FC<AppShellProps> = ({
  primaryNav,
  commandBar,
  contextRail,
  content,
  showContextRail,
  onCloseContextRail,
}) => {
  const isTablet = useIsTablet();
  const shouldRenderContext = !isTablet || showContextRail;

  return (
    <div className="app-shell">
      <div className="app-frame">
        <aside className="shell-nav">{primaryNav}</aside>
        <header className="shell-command">{commandBar}</header>
        {shouldRenderContext ? <aside className="shell-context">{contextRail}</aside> : null}
        <main className="shell-content">{content}</main>
      </div>

      {isTablet && showContextRail ? (
        <button
          aria-label="Close context rail"
          className="fixed inset-0 z-[70] bg-black/35"
          onClick={onCloseContextRail}
        />
      ) : null}
    </div>
  );
};

export default AppShell;
