import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'
import { TopNav } from './components/TopNav'
import { HomePage } from './pages/HomePage'
import { MyRecipesPage } from './pages/MyRecipesPage'
import { NewRecipePage } from './pages/NewRecipePage'
import { PreferencesPage } from './pages/PreferencesPage'
import { HouseholdPage } from './pages/HouseholdPage'

type PageKey = 'home' | 'my-recipes' | 'new-recipe' | 'preferences' | 'household'

const navItems = [
  { key: 'my-recipes', label: 'My Recipes' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'household', label: 'My Household' },
  { key: 'home', label: 'Home / About' },
] as const

function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null>(null)
  const [activePage, setActivePage] = useState<PageKey>('home')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setIsLoading(false)
    }

    void loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        setActivePage('my-recipes')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const userName = useMemo(() => {
    const email = session?.user?.email ?? 'Guest'
    const first = email.split('@')[0] ?? 'Guest'
    return first.trim() || 'Guest'
  }, [session])

  const initials = useMemo(() => {
    if (!session?.user?.email) return 'G'

    const parts = session.user.email.split('@')[0].split(/[._-]/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
    }

    return (session.user.email[0] ?? 'G').toUpperCase()
  }, [session])

  const handleLogoClick = () => {
    setActivePage(session ? 'my-recipes' : 'home')
  }

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      console.error('Google sign-in failed:', error)
    }
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out failed:', error)
    }

    setActivePage('home')
  }

  if (isLoading) {
    return <div className="loading-state">Loading…</div>
  }

  return (
    <div className="app-shell">
      <TopNav
        session={session}
        activePage={activePage}
        navItems={navItems}
        initials={initials}
        onNavigate={setActivePage}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        onLogoClick={handleLogoClick}
      />

      <main className="content-shell">
        {activePage === 'home' ? (
          <HomePage session={session} onNavigate={setActivePage} onGoogleSignIn={handleGoogleSignIn} />
        ) : null}

        {activePage === 'my-recipes' ? <MyRecipesPage userName={userName} /> : null}
        {activePage === 'new-recipe' ? <NewRecipePage session={session} onGoogleSignIn={handleGoogleSignIn} /> : null}
        {activePage === 'preferences' ? <PreferencesPage /> : null}
        {activePage === 'household' ? <HouseholdPage /> : null}
      </main>
    </div>
  )
}

export default App
