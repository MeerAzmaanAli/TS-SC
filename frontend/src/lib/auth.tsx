import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabase'

export type Role = 'admin' | 'faculty' | 'student'

export interface Profile {
  user_id: string
  role: Role
  faculty_id: string | null
  section_id: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function fetchProfile(userId: string, isInitial: boolean) {
      if (isInitial) setLoading(true)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, role, faculty_id, section_id')
          .eq('user_id', userId)
          .single()
        if (isMounted) {
          setProfile(error ? null : (data as Profile))
        }
      } catch {
        if (isMounted) setProfile(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    // 1. Initial session check on startup
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      const s = data.session
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id, true)
      } else {
        setLoading(false)
      }
    })

    // 2. Auth state subscription (handles login, logout, token refresh, and window focus)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!isMounted) return
      setSession(s)

      if (!s?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      // If the same user re-focused tab or refreshed their auth token,
      // preserve existing profile and NEVER flip loading=true (prevents route unmounting).
      setProfile((prev) => {
        if (prev && prev.user_id === s.user.id) {
          return prev
        }
        fetchProfile(s.user.id, prev === null)
        return prev
      })
    })

    return () => {
      isMounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setLoading(false)
  }

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}

/** Route guard: requires login and one of the given roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}
