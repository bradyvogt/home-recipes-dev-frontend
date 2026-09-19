import { useState } from 'react'

type PageKey = 'home' | 'my-recipes' | 'new-recipe' | 'preferences' | 'household'

type TopNavProps = {
  session: Awaited<ReturnType<typeof import('../lib/supabase').supabase.auth.getSession>>['data']['session'] | null
  activePage: PageKey
  navItems: readonly { key: PageKey; label: string }[]
  initials: string
  onNavigate: (page: PageKey) => void
  onGoogleSignIn: () => Promise<void>
  onSignOut: () => Promise<void>
  onLogoClick: () => void
}

export function TopNav({
  session,
  activePage,
  navItems,
  initials,
  onNavigate,
  onGoogleSignIn,
  onSignOut,
  onLogoClick,
}: TopNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="top-nav">
      <button type="button" className="brand" onClick={onLogoClick} aria-label="Go to home or recipes">
        <span className="brand-mark">H</span>
        <span className="brand-text">Home Recipes</span>
      </button>

      <div className="nav-actions">
        <button type="button" className="new-recipe-button" onClick={() => onNavigate('new-recipe')}>
          New Recipe
        </button>

        {!session ? (
          <button type="button" className="sign-in-button" onClick={onGoogleSignIn}>
            Sign in with Google
          </button>
        ) : (
          <div className="profile-menu-wrap">
            <button
              type="button"
              className="profile-bubble"
              onClick={() => setMenuOpen((current: boolean) => !current)}
              aria-label="Open account menu"
            >
              {initials}
            </button>

            {menuOpen ? (
              <div className="profile-menu">
                {navItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={activePage === item.key ? 'menu-item active' : 'menu-item'}
                    onClick={() => {
                      onNavigate(item.key)
                      setMenuOpen(false)
                    }}
                  >
                    {item.label}
                  </button>
                ))}

                <button type="button" className="menu-item danger" onClick={onSignOut}>
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  )
}
