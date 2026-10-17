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
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('profiles')
      .select('user_id, role, faculty_id, section_id')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        setProfile(error ? null : (data as Profile))
        setLoading(false)
      })
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
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
