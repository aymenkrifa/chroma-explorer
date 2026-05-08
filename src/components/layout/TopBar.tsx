import { useChromaDB } from '../../providers/ChromaDBProvider'
import { usePanel } from '../../context/PanelContext'
import { ChevronRight, Power } from 'lucide-react'
import logoUrl from '../../assets/logo.svg'

export function TopBar() {
  const { currentProfile } = useChromaDB()
  const {
    leftPanelOpen,
    setLeftPanelOpen,
  } = usePanel()

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect? This will close this window.')) {
      // Close the window - cleanup happens automatically
      await window.electronAPI.window.closeCurrent()
    }
  }

  const iconButtonClass = "h-7 w-7 p-0 flex items-center justify-center rounded-md hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"

  return (
    <header
      className="h-11 flex items-center"
      style={{
        WebkitAppRegion: 'drag',
        background: 'var(--sidebar)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      } as React.CSSProperties}
    >
      {/* Left side — traffic-lights spacer + sidebar reopen.
          The reopen arrow is anchored to the left edge so it appears next to
          where the sidebar will slide back in from. The right-inspector
          reopens on row click, so it has no toggle here. */}
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="w-[76px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <img
          src={logoUrl}
          alt="Chroma Explorer"
          className="h-5 w-5 mr-2 rounded-[4px] shrink-0"
          draggable={false}
        />
        {!leftPanelOpen && (
          <button
            onClick={() => setLeftPanelOpen(true)}
            className={iconButtonClass}
            title="Open sidebar"
          >
            <ChevronRight className="h-4 w-4 text-foreground/60" />
          </button>
        )}
      </div>

      {/* Center - Connection info */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Connected" />
        <span className="text-[12px] font-medium text-foreground/80">
          {currentProfile?.name || 'Connected'}
        </span>
        <span className="text-[11px] text-foreground/40">{currentProfile?.url}</span>
      </div>

      {/* Right side - Disconnect */}
      <div
        className="flex items-center gap-0.5 pr-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleDisconnect}
          className={`${iconButtonClass} hover:bg-destructive/10 hover:text-destructive`}
          title="Disconnect"
        >
          <Power className="h-3.5 w-3.5 text-foreground/50" />
        </button>
      </div>
    </header>
  )
}
