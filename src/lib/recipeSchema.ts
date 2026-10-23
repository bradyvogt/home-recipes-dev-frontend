import { z } from 'zod'

export const RecipeCategorySchema = z.enum(['meal', 'side', 'dessert', 'drink'])
export type RecipeCategory = z.infer<typeof RecipeCategorySchema>

export const RecipeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  sourceType: z.string().optional(),
  sourceLink: z.string().optional(),
  recipeYield: z.number().int(),
  prepTime: z.string(),
  cookTime: z.string(),
  totalTime: z.string(),
  recipeIngredient: z.array(z.string()),
  recipeInstructions: z.array(z.string()),
  recipeCategory: RecipeCategorySchema.optional(),
})

export type Recipe = z.infer<typeof RecipeSchema>

const categoryAliases: Record<string, RecipeCategory> = {
  'main dish': 'meal',
  'main course': 'meal',
  entree: 'meal',
  'entree dish': 'meal',
  dinner: 'meal',
  lunch: 'meal',
  breakfast: 'meal',
  brunch: 'meal',
  meal: 'meal',
  'side dish': 'side',
  side: 'side',
  sides: 'side',
  appetizer: 'side',
  starter: 'side',
  dessert: 'dessert',
  cake: 'dessert',
  cookie: 'dessert',
  pie: 'dessert',
  tart: 'dessert',
  brownie: 'dessert',
  sweet: 'dessert',
  pastry: 'dessert',
  drink: 'drink',
  beverage: 'drink',
  smoothie: 'drink',
  cocktail: 'drink',
  tea: 'drink',
  coffee: 'drink',
  juice: 'drink',
  smoothies: 'drink',
}

export function normalizeRecipeCategory(value: unknown): RecipeCategory | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string' || !candidate.trim()) return undefined

  const normalized = candidate.trim().toLowerCase()
  if (categoryAliases[normalized]) return categoryAliases[normalized]
  if (/dessert|cake|cookie|pie|sweet/.test(normalized)) return 'dessert'
  if (/side|appetizer|starter/.test(normalized)) return 'side'
  if (/drink|beverage|smoothie|tea|coffee|juice/.test(normalized)) return 'drink'
  return 'meal'
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const firstDefined = (record: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

const asText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

const asTextArray = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return values.map((item) => {
    if (typeof item === 'string') return item
    const record = asRecord(item)
    return asText(record.text ?? record.name)
  }).filter(Boolean)
}

const toIsoDuration = (value: unknown): string => {
  if (typeof value === 'string' && /^P/i.test(value)) return value
  const numericValue = typeof value === 'number' ? value : Number.parseInt(asText(value), 10)
  if (!Number.isFinite(numericValue) || numericValue < 0) return ''
  const hours = Math.floor(numericValue / 60)
  const minutes = numericValue % 60
  return hours || minutes ? `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}` : 'PT0M'
}

export function normalizeStoredRecipe(value: unknown): Recipe {
  const record = asRecord(value)
  const rawYield = firstDefined(record, 'recipeYield', 'servings')
  const yieldCandidate = Array.isArray(rawYield) ? rawYield[0] : rawYield
  const parsedYield = typeof yieldCandidate === 'number'
    ? Math.floor(yieldCandidate)
    : Number.parseInt(asText(yieldCandidate), 10)

  return RecipeSchema.parse({
    name: asText(firstDefined(record, 'name', 'title')),
    description: asText(record.description),
    sourceType: asText(firstDefined(record, 'sourceType', 'source_type')),
    sourceLink: asText(firstDefined(record, 'sourceLink', 'source_link')),
    recipeYield: Number.isFinite(parsedYield) ? parsedYield : 0,
    prepTime: toIsoDuration(firstDefined(record, 'prepTime', 'prep_time')),
    cookTime: toIsoDuration(firstDefined(record, 'cookTime', 'cook_time')),
    totalTime: toIsoDuration(firstDefined(record, 'totalTime', 'total_time')),
    recipeIngredient: asTextArray(record.recipeIngredient),
    recipeInstructions: asTextArray(record.recipeInstructions),
    recipeCategory: normalizeRecipeCategory(record.recipeCategory),
  })
}

export function durationInMinutes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = asText(value).trim()
  if (!text) return 0

  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i)
  if (iso) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0)

  const hours = text.match(/(\d+)\s*h/i)
  const minutes = text.match(/(\d+)\s*m/i)
  if (hours || minutes) return Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0)
  return Number.parseInt(text, 10) || 0
}

export function durationFromMinutes(value: string | number): string {
  const minutes = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return ''
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours || remainder ? `PT${hours ? `${hours}H` : ''}${remainder ? `${remainder}M` : ''}` : 'PT0M'
}