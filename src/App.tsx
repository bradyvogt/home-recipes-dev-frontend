import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './App.css'
import { TopNav } from './components/TopNav'
import { HomePage } from './pages/HomePage'
import { MyRecipesPage } from './pages/MyRecipesPage'
import { NewRecipePage } from './pages/NewRecipePage'
import { PreferencesPage } from './pages/PreferencesPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { SingleRecipePage } from './pages/SingleRecipePage'
import { BrowseRecipesPage } from './pages/BrowseRecipesPage'
import { GroceryListPage } from './pages/GroceryListPage'
import type { PageKey } from './lib/pageTypes'

const navItems = [
  { key: 'browse', label: 'Browse Recipes' },
  { key: 'my-recipes', label: 'My Recipes' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'household', label: 'My Household' },
  { key: 'grocery-list', label: 'Grocery List' },
  { key: 'home', label: 'Home / About' },
] as const

function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const routeName = location.pathname.replace(/^\/+|\/+$/g, '')
  const activePage = (routeName.startsWith('recipe/') ? 'recipe' : routeName || 'home') as PageKey
  const sharedHouseholdId = searchParams.get('code')?.trim() || ''
  const isSharedRecipesPage = activePage === 'my-recipes' && Boolean(sharedHouseholdId)

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setIsLoading(false)
    }

    void loadSession()
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_IN' && nextSession) {
        navigate('/my-recipes', { replace: true })
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [navigate])

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
    navigate(session ? '/my-recipes' : '/')
  }

  const handleRecipeAdded = (slug: string) => {
    navigate(`/recipe/${encodeURIComponent(slug)}`)
  }

  const navigateToPage = (page: PageKey) => {
    navigate(page === 'home' ? '/' : `/${page}`)
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

    navigateToPage('home')
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
        onNavigate={navigateToPage}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        onLogoClick={handleLogoClick}
      />

      <main className="content-shell">
        <Routes>
          <Route path="/" element={<HomePage session={session} onNavigate={navigateToPage} onGoogleSignIn={handleGoogleSignIn} />} />
          <Route path="/browse" element={<BrowseRecipesPage />} />
          <Route
            path="/my-recipes"
            element={session || isSharedRecipesPage
              ? <MyRecipesPage userName={userName} householdId={sharedHouseholdId || undefined} isPublic={isSharedRecipesPage} />
              : <HomePage session={session} onNavigate={navigateToPage} onGoogleSignIn={handleGoogleSignIn} />}
          />
          <Route path="/new-recipe" element={<NewRecipePage session={session} onGoogleSignIn={handleGoogleSignIn} onRecipeAdded={handleRecipeAdded} />} />
          <Route path="/preferences" element={session ? <PreferencesPage /> : <HomePage session={session} onNavigate={navigateToPage} onGoogleSignIn={handleGoogleSignIn} />} />
          <Route path="/household" element={session ? <HouseholdPage /> : <HomePage session={session} onNavigate={navigateToPage} onGoogleSignIn={handleGoogleSignIn} />} />
          <Route path="/grocery-list" element={session ? <GroceryListPage /> : <HomePage session={session} onNavigate={navigateToPage} onGoogleSignIn={handleGoogleSignIn} />} />
          <Route path="/recipe/:slug" element={<RecipeRoute session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function RecipeRoute({ session }: { session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null }) {
  const { slug } = useParams()
  return slug ? <SingleRecipePage slug={slug} session={session} /> : <Navigate to="/browse" replace />
}

export default App
