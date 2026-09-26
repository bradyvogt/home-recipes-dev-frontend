import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type RecipeCategory = 'meal' | 'side' | 'dessert' | 'drink'

type BackendRecipeData = {
  name: string
  description?: string
  sourceType?: string
  sourceLink?: string
  recipeYield: number
  prepTime: string
  cookTime: string
  totalTime: string
  recipeIngredient: string[]
  recipeInstructions: string[]
  recipeCategory?: RecipeCategory
}

type RecipeRecord = {
  id: string
  slug: string | null
  recipe_name: string | null
  recipe_category: string | null
  created_at: string | null
  recipe_data: BackendRecipeData | Record<string, unknown>
}

type BrowseRecipe = {
  id: string
  slug: string | null
  name: string
  description: string
  category: string
  categories: string[]
  ingredients: string[]
  servings: number
  totalMinutes: number
  createdAt: string
  searchTerms: string[]
}

type CategoryFilter = 'all' | RecipeCategory
type SortOrder = 'relevance' | 'newest' | 'name' | 'quickest'

const PAGE_SIZE = 24
const FETCH_SIZE = 250
const categoryOptions: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All recipes' },
  { value: 'meal', label: 'Meals' },
  { value: 'side', label: 'Sides' },
  { value: 'dessert', label: 'Desserts' },
  { value: 'drink', label: 'Drinks' },
]

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const asStringArray = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return values
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'text' in item) return asString(item.text)
      if (item && typeof item === 'object' && 'name' in item) return asString(item.name)
      return ''
    })
    .filter(Boolean)
}

const durationInMinutes = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = asString(value).trim()
  if (!text) return 0

  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i)
  if (iso) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0)

  const hours = text.match(/(\d+)\s*h/i)
  const minutes = text.match(/(\d+)\s*m/i)
  if (hours || minutes) return Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0)
  return Number.parseInt(text, 10) || 0
}

const normalizeRecipe = (record: RecipeRecord): BrowseRecipe => {
  const data = record.recipe_data ?? {}
  const legacyData = data as Record<string, unknown>
  const prepMinutes = durationInMinutes(data.prepTime ?? legacyData.prep_time)
  const cookMinutes = durationInMinutes(data.cookTime ?? legacyData.cook_time)
  const explicitTotal = durationInMinutes(data.totalTime ?? legacyData.total_time)
  const servingsValue = data.recipeYield ?? legacyData.servings
  const categories = asStringArray(data.recipeCategory)
  const cuisines = asStringArray(legacyData.recipeCuisine)
  const generatedCategory = record.recipe_category || categories[0] || 'meal'
  let categoryValues = [generatedCategory]
  if (categoryValues[0].startsWith('[')) {
    try {
      const parsedCategory: unknown = JSON.parse(categoryValues[0])
      categoryValues = asStringArray(parsedCategory)
    } catch {
      categoryValues = ['meal']
    }
  }
  const categoryText = [...categoryValues, ...categories, generatedCategory].join(' ').toLowerCase()
  const category: RecipeCategory = /\bdessert\b|baked good/.test(categoryText)
    ? 'dessert'
    : /\bside\b/.test(categoryText)
      ? 'side'
      : /\bdrink\b|\bbeverage\b/.test(categoryText)
        ? 'drink'
        : 'meal'

  return {
    id: record.id,
    slug: record.slug,
    name: record.recipe_name || asString(data.name) || 'Untitled recipe',
    description: asString(data.description),
    category,
    categories,
    ingredients: asStringArray(data.recipeIngredient),
    servings: typeof servingsValue === 'number' ? servingsValue : Number.parseInt(asString(servingsValue), 10) || 0,
    totalMinutes: explicitTotal || prepMinutes + cookMinutes,
    createdAt: record.created_at ?? '',
    searchTerms: [...categories, ...cuisines],
  }
}

const formatDuration = (minutes: number) => {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours ? `${hours}h` : '', remainder ? `${remainder}m` : ''].filter(Boolean).join(' ')
}

export function BrowseRecipesPage() {
  const [recipes, setRecipes] = useState<BrowseRecipe[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [quickOnly, setQuickOnly] = useState(false)
  const [familySizeOnly, setFamilySizeOnly] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance')
  const [pagination, setPagination] = useState({ filterKey: '', count: PAGE_SIZE })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadRecipes = async () => {
      setIsLoading(true)
      setError(null)
      const records: RecipeRecord[] = []

      for (let offset = 0; ; offset += FETCH_SIZE) {
        const { data, error: queryError } = await supabase
          .from('recipes')
          .select('id, slug, recipe_name, recipe_category, created_at, recipe_data')
          .eq('visibility', 'public')
          .order('recipe_name', { ascending: true })
          .range(offset, offset + FETCH_SIZE - 1)

        if (queryError) throw queryError
        records.push(...(data as RecipeRecord[]))
        if (!data || data.length < FETCH_SIZE) break
      }

      if (isMounted) setRecipes(records.map(normalizeRecipe))
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
  }, [])

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = recipes.filter((recipe) => {
      if (category !== 'all' && recipe.category !== category) return false
      if (quickOnly && (!recipe.totalMinutes || recipe.totalMinutes > 30)) return false
      if (familySizeOnly && recipe.servings < 6) return false
      if (!query) return true

      return [recipe.name, recipe.description, recipe.category, ...recipe.searchTerms, ...recipe.ingredients]
        .some((value) => value.toLowerCase().includes(query))
    })

    return matches.sort((left, right) => {
      if (sortOrder === 'name') return left.name.localeCompare(right.name)
      if (sortOrder === 'quickest') return (left.totalMinutes || Number.MAX_SAFE_INTEGER) - (right.totalMinutes || Number.MAX_SAFE_INTEGER)
      if (sortOrder === 'newest' || !query) return right.createdAt.localeCompare(left.createdAt)

      const rank = (recipe: BrowseRecipe) => {
        const name = recipe.name.toLowerCase()
        return name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : 3
      }
      return rank(left) - rank(right) || left.name.localeCompare(right.name)
    })
  }, [recipes, search, category, quickOnly, familySizeOnly, sortOrder])

  const filterKey = `${search}|${category}|${quickOnly}|${familySizeOnly}|${sortOrder}`
  const visibleCount = pagination.filterKey === filterKey ? pagination.count : PAGE_SIZE

  const visibleRecipes = filteredRecipes.slice(0, visibleCount)

  return (
    <section className="page-card browse-recipes-page">
      <header className="browse-heading">
        <div>
          <div className="eyebrow">The community kitchen</div>
          <h1>Browse recipes</h1>
        </div>
        <p>Find something good for the table.</p>
      </header>

      <label className="browse-search" htmlFor="browse-search-input">
        <span className="browse-search-icon" aria-hidden="true">⌕</span>
        <input
          id="browse-search-input"
          type="search"
          placeholder="Search recipes or ingredients"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <div className="browse-filter-bar">
        <div className="browse-categories" aria-label="Filter by recipe category">
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={category === option.value ? 'browse-category active' : 'browse-category'}
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="browse-quick-filters" aria-label="Quick filters">
          <button type="button" className={quickOnly ? 'browse-chip active' : 'browse-chip'} aria-pressed={quickOnly} onClick={() => setQuickOnly((value) => !value)}>
            Under 30 min
          </button>
          <button type="button" className={familySizeOnly ? 'browse-chip active' : 'browse-chip'} aria-pressed={familySizeOnly} onClick={() => setFamilySizeOnly((value) => !value)}>
            6+ servings
          </button>
        </div>
      </div>

      <div className="browse-results-toolbar">
        <p aria-live="polite">{isLoading ? 'Finding recipes...' : `${filteredRecipes.length} ${filteredRecipes.length === 1 ? 'recipe' : 'recipes'}`}</p>
        <label className="browse-sort">
          <span>Sort</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            <option value="relevance">Best match</option>
            <option value="newest">Newest</option>
            <option value="name">A to Z</option>
            <option value="quickest">Quickest</option>
          </select>
        </label>
      </div>

      {isLoading ? <div className="recipe-state">Loading public recipes...</div> : null}
      {error ? <div className="status error">{error}</div> : null}
      {!isLoading && !error && !recipes.length ? <div className="recipe-state"><strong>No public recipes yet.</strong><span>Recipes shared by their households will appear here.</span></div> : null}
      {!isLoading && !error && recipes.length > 0 && !filteredRecipes.length ? <div className="recipe-state"><strong>No recipes match those filters.</strong><span>Try a different search or clear a filter.</span></div> : null}

      <div className="browse-recipe-grid">
        {visibleRecipes.map((recipe) => (
          <article className="browse-recipe-card" key={recipe.id}>
            <div className={`browse-category-mark category-${recipe.category}`} aria-hidden="true" />
            <div className="browse-recipe-content">
              <div className="browse-recipe-labels">
                <span className={`browse-recipe-category category-${recipe.category}`}>{recipe.category}</span>
                {formatDuration(recipe.totalMinutes) ? <span>{formatDuration(recipe.totalMinutes)}</span> : null}
                {recipe.servings ? <span>{recipe.servings} servings</span> : null}
              </div>
              <h2>
                {recipe.slug ? <a href={`${import.meta.env.BASE_URL}recipe/${encodeURIComponent(recipe.slug)}`}>{recipe.name}</a> : recipe.name}
              </h2>
              {recipe.description ? <p>{recipe.description}</p> : null}
              {recipe.ingredients.length ? <div className="browse-ingredient-preview">{recipe.ingredients.slice(0, 3).join(' · ')}</div> : null}
            </div>
          </article>
        ))}
      </div>

      {!isLoading && visibleCount < filteredRecipes.length ? (
        <button type="button" className="secondary-button browse-load-more" onClick={() => setPagination({ filterKey, count: visibleCount + PAGE_SIZE })}>
          Show more recipes
        </button>
      ) : null}
    </section>
  )
}