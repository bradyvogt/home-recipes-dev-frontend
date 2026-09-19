import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type MyRecipesPageProps = {
  userName: string
  householdId?: string
  isPublic?: boolean
}

type RecipeRecord = {
  id: string
  slug?: string
  recipe_data: Record<string, unknown>
}

type Recipe = RecipeRecord & {
  slug: string
  name: string
  description: string
  servings: number
  prepTime: string
  cookTime: string
  totalTime: string
  ingredients: string[]
  instructions: string[]
  categories: string[]
}

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const asStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item !== null && 'text' in item ? asString(item.text) : ''))
    .filter(Boolean)
}

const parseDuration = (value: string) => {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!match) return ''

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  if (!hours && !minutes) return ''
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ')
}

const normalizeRecipe = (record: RecipeRecord): Recipe => {
  const data = record.recipe_data
  const rawServings = data.recipeYield

  const recipeName = asString(data.name) || 'Untitled recipe'
  const slug = asString(record.slug) || recipeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recipe'

  return {
    ...record,
    slug,
    name: recipeName,
    description: asString(data.description),
    servings: typeof rawServings === 'number' ? rawServings : Number.parseInt(asString(rawServings), 10) || 0,
    prepTime: asString(data.prepTime),
    cookTime: asString(data.cookTime),
    totalTime: asString(data.totalTime),
    ingredients: asStringArray(data.recipeIngredient),
    instructions: asStringArray(data.recipeInstructions),
    categories: asStringArray(data.recipeCategory),
  }
}

function RecipeRow({ recipe }: { recipe: Recipe }) {
  const [isOpen, setIsOpen] = useState(false)
  const time = parseDuration(recipe.totalTime) || [parseDuration(recipe.prepTime), parseDuration(recipe.cookTime)].filter(Boolean).join(' + ')

  return (
    <article className={isOpen ? 'recipe-row is-open' : 'recipe-row'}>
      <button
        type="button"
        className="recipe-row-header"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="recipe-row-title-group">
          <strong>{recipe.name}</strong>
          {recipe.description ? <span>{recipe.description}</span> : null}
        </span>
        <span className="recipe-row-meta">
          {recipe.servings ? <span>{recipe.servings} servings</span> : null}
          {time ? <span>{time}</span> : null}
          <span className="recipe-row-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="recipe-row-details">
          {recipe.categories.length ? <div className="recipe-tags">{recipe.categories.map((category) => <span key={category}>{category}</span>)}</div> : null}
          <div className="recipe-row-link-wrap">
            <a className="recipe-open-link" href={`${import.meta.env.BASE_URL}recipe/${encodeURIComponent(recipe.slug)}`}>Open recipe</a>
          </div>
          <div className="recipe-detail-columns">
            {recipe.ingredients.length ? (
              <section>
                <h3>Ingredients</h3>
                <ul>{recipe.ingredients.map((ingredient, index) => <li key={`${ingredient}-${index}`}>{ingredient}</li>)}</ul>
              </section>
            ) : null}
            {recipe.instructions.length ? (
              <section>
                <h3>Instructions</h3>
                <ol>{recipe.instructions.map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ol>
              </section>
            ) : null}
          </div>
          {!recipe.ingredients.length && !recipe.instructions.length ? <p className="recipe-empty-detail">No ingredients or instructions have been added yet.</p> : null}
        </div>
      ) : null}
    </article>
  )
}

export function MyRecipesPage({ userName, householdId: sharedHouseholdId, isPublic = false }: MyRecipesPageProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [currentHouseholdId, setCurrentHouseholdId] = useState(sharedHouseholdId ?? '')
  const [householdName, setHouseholdName] = useState('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadRecipes = async () => {
      setIsLoading(true)
      setError(null)

      let householdId = sharedHouseholdId

      if (!householdId) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const userId = sessionData.session?.user.id
        if (!userId) {
          if (isMounted) setIsLoading(false)
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('household_id')
          .eq('id', userId)
          .single()
        if (profileError) throw profileError
        householdId = profile.household_id
      }

      if (!householdId) throw new Error('No household is associated with this account.')

      const [{ data: householdNameData, error: householdError }, { data, error: recipesError }] = await Promise.all([
        supabase.rpc('get_shared_household_name', { input_household_id: householdId }),
        supabase
          .from('recipes')
          .select('id, slug, recipe_data')
          .eq('household_id', householdId)
          .order('recipe_name', { ascending: true }),
      ])

      if (recipesError) throw recipesError

      if (isMounted) {
        setCurrentHouseholdId(householdId)
        setHouseholdName(typeof householdNameData === 'string' ? householdNameData : '')
        setRecipes((data as RecipeRecord[]).map(normalizeRecipe))
      }

      if (householdError) {
        console.warn('Household name is unavailable; showing recipes with a fallback title.', householdError)
      }
    }

    void loadRecipes()
      .catch((loadError: unknown) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load recipes.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [sharedHouseholdId])

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return recipes
    return recipes.filter((recipe) => recipe.name.toLowerCase().includes(query))
  }, [recipes, search])

  const shareLink = useMemo(() => {
    if (currentHouseholdId && !isPublic) {
      const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
      return new URL(`recipes?household=${encodeURIComponent(currentHouseholdId)}`, baseUrl).toString()
    }
    return ''
  }, [currentHouseholdId, isPublic])

  const handleShare = async () => {
    if (!shareLink) return

    try {
      await navigator.clipboard.writeText(shareLink)
      setShareMessage('Share link copied.')
    } catch {
      setShareMessage(shareLink)
    }

    window.setTimeout(() => setShareMessage(''), 2500)
  }

  return (
    <section className="page-card my-recipes-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">My recipes</div>
          <h2>{householdName || (isPublic ? 'Shared recipes' : `${userName}'s kitchen`)}</h2>
        </div>
        {!isLoading ? (
          <div className="recipe-page-actions">
            <span className="recipe-count">{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}</span>
            {!isPublic ? <button type="button" className="secondary-button share-recipes-button" onClick={() => void handleShare()}>Share link</button> : null}
          </div>
        ) : null}
      </div>

      <label className="recipe-search" htmlFor="recipe-search">
        <span>Find a recipe</span>
        <input id="recipe-search" type="search" placeholder="Search by title..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      {isLoading ? <div className="recipe-state">Loading your household recipes...</div> : null}
      {error ? <div className="status error">{error}</div> : null}
      {shareMessage ? <div className="status success share-message">{shareMessage}</div> : null}
      {!isLoading && !error && !recipes.length ? <div className="recipe-state"><strong>Your kitchen is ready for its first recipe.</strong><span>Add one from New Recipe to see it here.</span></div> : null}
      {!isLoading && !error && recipes.length > 0 && !filteredRecipes.length ? <div className="recipe-state"><strong>No recipes found.</strong><span>Try a different title.</span></div> : null}
      <div className="recipe-list">{filteredRecipes.map((recipe) => <RecipeRow key={recipe.id} recipe={recipe} />)}</div>
    </section>
  )
}
