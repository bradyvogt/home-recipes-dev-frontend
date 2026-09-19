import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'
import { TopNav } from './components/TopNav'
import { HomePage } from './pages/HomePage'
import { MyRecipesPage } from './pages/MyRecipesPage'
import { NewRecipePage } from './pages/NewRecipePage'
import { PreferencesPage } from './pages/PreferencesPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { SingleRecipePage } from './pages/SingleRecipePage'

type PageKey = 'home' | 'my-recipes' | 'new-recipe' | 'preferences' | 'household' | 'recipe'

const navItems = [
  { key: 'my-recipes', label: 'My Recipes' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'household', label: 'My Household' },
  { key: 'home', label: 'Home / About' },
] as const

function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null>(null)
  const [activePage, setActivePage] = useState<PageKey>('home')
  const [currentRecipeSlug, setCurrentRecipeSlug] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const readPathState = () => {
    const basePrefix = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
    const candidates = [window.location.pathname, new URLSearchParams(window.location.search).get('p') ?? '']

    for (const candidate of candidates) {
      if (!candidate) continue

      const pathOnly = candidate.split('?')[0]
      const normalized = decodeURIComponent(pathOnly).replace(basePrefix, '')
      const match = normalized.match(/^\/recipe\/([^/]+)$/)
      if (match) {
        setCurrentRecipeSlug(match[1])
        setActivePage('recipe')
        return
      }
    }

    setCurrentRecipeSlug(null)
  }

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setIsLoading(false)
    }

    void loadSession()
    readPathState()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        setActivePage('my-recipes')
      }
    })

    const handleLocationChange = () => readPathState()
    window.addEventListener('popstate', handleLocationChange)

    return () => {
      authListener.subscription.unsubscribe()
      window.removeEventListener('popstate', handleLocationChange)
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
    setCurrentRecipeSlug(null)
    setActivePage(session ? 'my-recipes' : 'home')
    window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
  }

  const handleNavigate = (page: PageKey) => {
    setActivePage(page)
    setCurrentRecipeSlug(null)
    if (page === 'home' || page === 'my-recipes' || page === 'new-recipe' || page === 'preferences' || page === 'household') {
      window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
    }
  }

  const handleGoogleSignIn = async () => {
    const redirectTo = new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
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

  const visiblePage = currentRecipeSlug ? 'recipe' : session ? activePage : 'home'
  const sharedHouseholdId = new URLSearchParams(window.location.search).get('household')?.trim() || ''
  const isSharedRecipesPage = window.location.pathname.endsWith('/recipes') && Boolean(sharedHouseholdId)
  const pageToRender = currentRecipeSlug ? 'recipe' : isSharedRecipesPage ? 'my-recipes' : visiblePage

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
        onNavigate={handleNavigate}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        onLogoClick={handleLogoClick}
      />

      <main className="content-shell">
        {pageToRender === 'home' ? (
          <HomePage session={session} onNavigate={setActivePage} onGoogleSignIn={handleGoogleSignIn} />
        ) : null}

        {pageToRender === 'my-recipes' ? <MyRecipesPage userName={userName} householdId={sharedHouseholdId || undefined} isPublic={isSharedRecipesPage} /> : null}
        {pageToRender === 'new-recipe' ? <NewRecipePage session={session} onGoogleSignIn={handleGoogleSignIn} /> : null}
        {pageToRender === 'preferences' ? <PreferencesPage /> : null}
        {pageToRender === 'household' ? <HouseholdPage /> : null}
        {pageToRender === 'recipe' && currentRecipeSlug ? <SingleRecipePage slug={currentRecipeSlug} session={session} /> : null}
      </main>
    </div>
  )
}

export default App
