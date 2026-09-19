type HomePageProps = {
  session: Awaited<ReturnType<typeof import('../lib/supabase').supabase.auth.getSession>>['data']['session'] | null
  onNavigate: (page: 'home' | 'my-recipes') => void
  onGoogleSignIn: () => Promise<void>
}

export function HomePage({ session, onNavigate, onGoogleSignIn }: HomePageProps) {
  return (
    <section className="page-card hero-page">
      <div className="eyebrow">About</div>
      <h1>Hangry Husband</h1>
      <div className="hero-subtitle">Created by Brady Vogt, Husband Since 2024</div>
      <p>
        Sometimes husbands are required to cook and grocery shop, but unlike their better half, husbands can get angry. Especially when they forget a recipe they just made last week.
      </p>
      <p>
        So I made Hangry Husband. It keeps the recipes your household actually uses close at hand, so dinner and the shopping list
        don&apos;t have to depend on anyone&apos;s memory.
      </p>
      <div className="hero-actions">
        <button type="button" className="primary-button" onClick={() => onNavigate(session ? 'my-recipes' : 'home')}>
          {session ? 'Go to my recipes' : 'Learn more'}
        </button>
        {!session ? (
          <button type="button" className="secondary-button" onClick={onGoogleSignIn}>
            Continue with Google
          </button>
        ) : null}
      </div>
    </section>
  )
}
