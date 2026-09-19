type HomePageProps = {
  session: Awaited<ReturnType<typeof import('../lib/supabase').supabase.auth.getSession>>['data']['session'] | null
  onNavigate: (page: 'home' | 'my-recipes') => void
  onGoogleSignIn: () => Promise<void>
}

export function HomePage({ session, onNavigate, onGoogleSignIn }: HomePageProps) {
  return (
    <section className="page-card hero-page">
      <div className="eyebrow">About</div>
      <h1>Hi, I&apos;m Brady Vogt.</h1>
      <p>
        I built this recipe app for my family because I wanted a simple way to keep track of the meals we love, the
        ones we keep forgetting, and the ones we need to make again without guessing.
      </p>
      <p>
        I&apos;m a husband, not a cook. I need clear, step-by-step directions. I need to be told exactly what to do, how long
        to do it, and how to keep the process from getting lost in the middle.
      </p>
      <p>
        This app is for people like me: husbands who want to help, families who want to save recipes they actually use,
        and anyone who needs a reliable place to keep the instructions they can follow without stress.
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
