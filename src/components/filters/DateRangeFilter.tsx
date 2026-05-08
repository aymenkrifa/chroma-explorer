import { useState, useMemo } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { DatePreset } from '../../types/filters'
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react'

interface DateRangeFilterProps {
  from?: string // YYYY-MM-DD
  to?: string   // YYYY-MM-DD
  preset?: DatePreset
  onChange: (next: { from?: string; to?: string; preset?: DatePreset }) => void
}

const buttonBase =
  'h-6 text-[11px] py-0 px-2 rounded-md bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-ring/50'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseISO(iso?: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatDDMMYYYY(iso?: string): string {
  const d = parseISO(iso)
  if (!d) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function presetRange(preset: DatePreset): { from?: string; to?: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toISO(today)

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      const ystr = toISO(y)
      return { from: ystr, to: ystr }
    }
    case 'last-7-days': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { from: toISO(start), to: todayStr }
    }
    case 'last-30-days': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { from: toISO(start), to: todayStr }
    }
    case 'this-month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: toISO(start), to: todayStr }
    }
    case 'custom':
    default:
      return {}
  }
}

function formatLabel(from?: string, to?: string, preset?: DatePreset): string {
  if (preset && preset !== 'custom') {
    const label: Record<Exclude<DatePreset, 'custom'>, string> = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'last-7-days': 'Last 7 days',
      'last-30-days': 'Last 30 days',
      'this-month': 'This month',
    }
    return label[preset]
  }
  if (from && to) {
    return from === to ? formatDDMMYYYY(from) : `${formatDDMMYYYY(from)} → ${formatDDMMYYYY(to)}`
  }
  if (from) return `≥ ${formatDDMMYYYY(from)}`
  if (to) return `≤ ${formatDDMMYYYY(to)}`
  return 'Pick a date range'
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last-7-days', label: 'Last 7 days' },
  { id: 'last-30-days', label: 'Last 30 days' },
  { id: 'this-month', label: 'This month' },
]

// Monday-first weekdays. Native locale would be inconsistent, so we
// hardcode the order and short labels for predictability.
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface MonthCalendarProps {
  from?: string
  to?: string
  onSelect: (next: { from?: string; to?: string }) => void
}

function MonthCalendar({ from, to, onSelect }: MonthCalendarProps) {
  const fromDate = parseISO(from)
  const toDate = parseISO(to)
  const initialView = fromDate || toDate || new Date()
  const [viewYear, setViewYear] = useState(initialView.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialView.getMonth())

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const navMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    else if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  const handleDayClick = (date: Date) => {
    const iso = toISO(date)
    if (!fromDate || (fromDate && toDate)) {
      // No selection or full range -> start fresh
      onSelect({ from: iso, to: undefined })
    } else {
      // We have a from but no to -> complete the range, swapping if needed
      if (date.getTime() < fromDate.getTime()) {
        onSelect({ from: iso, to: from })
      } else {
        onSelect({ from, to: iso })
      }
    }
  }

  // Build the day grid. Empty leading cells align day 1 onto the right weekday.
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startDayOfWeekSunFirst = firstOfMonth.getDay() // 0=Sun..6=Sat
  // Convert to Monday-first: Mon=0..Sun=6
  const leading = (startDayOfWeekSunFirst + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  return (
    <div className="select-none">
      {/* Month header */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <button
          onClick={() => navMonth(-1)}
          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-muted-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <div className="text-[11px] font-medium text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </div>
        <button
          onClick={() => navMonth(1)}
          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-muted-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="h-5 text-[10px] text-muted-foreground/70 text-center leading-5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`pad-${i}`} className="h-6" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = new Date(viewYear, viewMonth, day)
          const isFrom = fromDate && date.getTime() === fromDate.getTime()
          const isTo = toDate && date.getTime() === toDate.getTime()
          const inRange = fromDate && toDate && date > fromDate && date < toDate
          const isToday = date.getTime() === today.getTime()

          let cellClass = 'h-6 text-[11px] rounded inline-flex items-center justify-center cursor-pointer'
          if (isFrom || isTo) {
            cellClass += ' bg-primary text-primary-foreground font-medium'
          } else if (inRange) {
            cellClass += ' bg-primary/15 text-foreground'
          } else if (isToday) {
            cellClass += ' text-foreground ring-1 ring-inset ring-primary/40'
          } else {
            cellClass += ' text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
          }

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDayClick(date)}
              className={cellClass}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeFilter({ from, to, preset, onChange }: DateRangeFilterProps) {
  const hasValue = !!(from || to)
  const label = formatLabel(from, to, preset)

  const handlePreset = (p: DatePreset) => {
    const range = presetRange(p)
    onChange({ ...range, preset: p })
  }

  const handleCalendarSelect = (next: { from?: string; to?: string }) => {
    onChange({ from: next.from, to: next.to, preset: 'custom' })
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ from: undefined, to: undefined, preset: undefined })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`${buttonBase} flex-1 inline-flex items-center justify-between gap-1.5 min-w-0`}
          style={{ boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.03)' }}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className={`truncate ${hasValue ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </span>
          {hasValue && (
            <span
              role="button"
              aria-label="Clear date filter"
              onClick={handleClear}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent showArrow={false} align="start" className="p-2 w-[300px]">
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePreset(p.id)}
                className={`${buttonBase} text-left ${preset === p.id ? 'ring-1 ring-ring/50' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="h-px bg-black/[0.08] dark:bg-white/[0.08] my-0.5" />

          {/* Selection summary */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wide opacity-70">From</div>
              <div className="text-foreground">{formatDDMMYYYY(from) || '—'}</div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wide opacity-70">To</div>
              <div className="text-foreground">{formatDDMMYYYY(to) || '—'}</div>
            </div>
          </div>

          <MonthCalendar from={from} to={to} onSelect={handleCalendarSelect} />

          {hasValue && (
            <>
              <div className="h-px bg-black/[0.08] dark:bg-white/[0.08] my-0.5" />
              <button
                onClick={() => onChange({ from: undefined, to: undefined, preset: undefined })}
                className={`${buttonBase} text-muted-foreground hover:text-destructive`}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
