import { useState, useEffect } from 'react'

export interface DeveloperSettings {
  /**
   * When true, disables the constraint that substitution requests can only be sent
   * on the day of the lecture or 1 day prior. Faculty can request for any future date.
   */
  disableDayRestriction: boolean

  /**
   * When true, displays an interactive date picker calendar in the faculty substitution
   * modal so the faculty can select which specific calendar date to request coverage for.
   */
  allowCalendarDatePicker: boolean

  /**
   * When true, allows dispatching substitution requests for lectures that have already
   * passed or started (useful for testing solver resolution and email cascades).
   */
  allowPastLectures: boolean
}

const STORAGE_KEY = 'ts_sc_developer_settings'
const EVENT_NAME = 'ts_sc_dev_settings_changed'

export const DEFAULT_DEVELOPER_SETTINGS: DeveloperSettings = {
  disableDayRestriction: false,
  allowCalendarDatePicker: true,
  allowPastLectures: false,
}

/**
 * Returns current developer settings from localStorage with fallback to defaults.
 */
export function getDeveloperSettings(): DeveloperSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DEVELOPER_SETTINGS
    return { ...DEFAULT_DEVELOPER_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_DEVELOPER_SETTINGS
  }
}

/**
 * Persists updated developer settings to localStorage and dispatches a notification
 * to update all active views, tabs, and components instantly.
 */
export function saveDeveloperSettings(partial: Partial<DeveloperSettings>): DeveloperSettings {
  const current = getDeveloperSettings()
  const next: DeveloperSettings = { ...current, ...partial }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
  } catch (err) {
    console.warn('Failed to save developer settings:', err)
  }
  return next
}

/**
 * React hook that subscribes to developer settings changes across all windows and components.
 */
export function useDeveloperSettings(): {
  settings: DeveloperSettings
  updateSettings: (partial: Partial<DeveloperSettings>) => void
  resetDefaults: () => void
} {
  const [settings, setSettings] = useState<DeveloperSettings>(getDeveloperSettings)

  useEffect(() => {
    function onSettingsChange(e: Event) {
      if (e instanceof CustomEvent && e.detail) {
        setSettings(e.detail)
      } else {
        setSettings(getDeveloperSettings())
      }
    }

    window.addEventListener(EVENT_NAME, onSettingsChange)
    window.addEventListener('storage', onSettingsChange)
    return () => {
      window.removeEventListener(EVENT_NAME, onSettingsChange)
      window.removeEventListener('storage', onSettingsChange)
    }
  }, [])

  function updateSettings(partial: Partial<DeveloperSettings>) {
    const next = saveDeveloperSettings(partial)
    setSettings(next)
  }

  function resetDefaults() {
    const next = saveDeveloperSettings(DEFAULT_DEVELOPER_SETTINGS)
    setSettings(next)
  }

  return { settings, updateSettings, resetDefaults }
}
