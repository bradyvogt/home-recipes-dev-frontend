type MyRecipesPageProps = {
  userName: string
}

export function MyRecipesPage({ userName }: MyRecipesPageProps) {
  return (
    <section className="page-card">
      <div className="page-header">
        <div>
          <div className="eyebrow">My recipes</div>
          <h2>{userName}&apos;s kitchen</h2>
        </div>
      </div>
      <div className="placeholder-panel">
        <p>Recipe list page placeholder.</p>
        <span>We can build the full recipe grid here next.</span>
      </div>
    </section>
  )
}
