import { useState, useEffect } from 'react'

/**
 * Shared clock hook to synchronize UI updates across components (e.g. ongoing slot indicator)
 * without spinning up multiple uncoordinated timers.
 */
export function useSharedClock(intervalMs = 30000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      setNow(new Date())
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])

  return now
}

