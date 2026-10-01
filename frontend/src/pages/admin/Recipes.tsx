import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { recipesApi, productsApi, inventoryApi } from '../../services/api'
import { Recipe, Product, InventoryItem } from '../../types'
import { formatCurrency } from '../../utils/format'
import { Plus, BookOpen, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

export default function Recipes() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [variantId, setVariantId] = useState('')
  const [recipeItems, setRecipeItems] = useState([{ inventory_item_id: '', quantity: '' }])
  const [editItems, setEditItems] = useState<{ inventory_item_id: string; quantity: string }[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  const openEdit = (r: Recipe) => {
    setEditRecipe(r)
    setEditItems(r.items.map(it => ({
      inventory_item_id: String(it.inventory_item_id),
      quantity: String(it.quantity),
    })))
  }

  const saveEdit = async () => {
    if (!editRecipe) return
    const valid = editItems.filter(i => i.inventory_item_id && i.quantity && parseFloat(i.quantity) > 0)
    if (valid.length === 0) { toast.error('Agrega al menos un ingrediente'); return }
    setSavingEdit(true)
    try {
      await recipesApi.update(editRecipe.id, {
        items: valid.map(i => ({
          inventory_item_id: parseInt(i.inventory_item_id),
          quantity: parseFloat(i.quantity),
        })),
      })
      qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.invalidateQueries({ queryKey: ['profitability'] })
      setEditRecipe(null)
      toast.success('Receta actualizada')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al editar receta')
    } finally {
      setSavingEdit(false)
    }
  }

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: () => recipesApi.list().then(r => r.data),
  })
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-admin'],
    queryFn: () => productsApi.list(false).then(r => r.data),
  })
  const { data: invItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
  })

  const allVariants = products.flatMap(p => p.variants.map(v => ({ ...v, productName: p.name })))
  const existingVariantIds = new Set(recipes.map(r => r.variant_id))
  const availableVariants = allVariants.filter(v => !existingVariantIds.has(v.id))

  const addItem = () => setRecipeItems([...recipeItems, { inventory_item_id: '', quantity: '' }])
  const removeItem = (i: number) => setRecipeItems(recipeItems.filter((_, idx) => idx !== i))
  const updateItem = (i: number, f: string, v: string) => setRecipeItems(recipeItems.map((item, idx) => idx === i ? { ...item, [f]: v } : item))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = recipeItems.filter(i => i.inventory_item_id && i.quantity)
    if (valid.length === 0) { toast.error('Agrega al menos un ingrediente'); return }
    try {
      await recipesApi.create({
        variant_id: parseInt(variantId),
        items: valid.map(i => ({ inventory_item_id: parseInt(i.inventory_item_id), quantity: parseFloat(i.quantity) })),
      })
      qc.invalidateQueries({ queryKey: ['recipes'] })
      setShowCreate(false)
      setVariantId(''); setRecipeItems([{ inventory_item_id: '', quantity: '' }])
      toast.success('Receta creada')
    } catch { toast.error('Error') }
  }

  const getVariantInfo = (variantId: number) => allVariants.find(v => v.id === variantId)
  const getItemName = (itemId: number) => invItems.find(i => i.id === itemId)?.name || `#${itemId}`

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Recetas</h1>
          <p className="text-gray-500 text-sm">{recipes.length} recetas configuradas</p>
        </div>
        {availableVariants.length > 0 && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nueva receta
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map(recipe => {
          const variant = getVariantInfo(recipe.variant_id)
          return (
            <div key={recipe.id} className="card hover:border-brand-700 border-dark-600 border-2 transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-brand-400" />
                    <p className="text-white font-bold">{variant?.productName || '?'}</p>
                  </div>
                  <p className="text-gray-400 text-xs">{variant?.name} · {variant ? formatCurrency(variant.price) : ''}</p>
                </div>
                <div className="flex items-start gap-2">
                  {recipe.estimated_cost !== undefined && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Costo est.</p>
                      <p className="text-brand-400 font-bold text-sm">{formatCurrency(recipe.estimated_cost)}</p>
                      {variant && recipe.estimated_cost > 0 && (
                        <p className="text-green-400 text-xs">Margen: {((1 - recipe.estimated_cost / variant.price) * 100).toFixed(1)}%</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => openEdit(recipe)}
                    className="text-gray-500 hover:text-brand-400 p-1"
                    title="Editar receta (solo Admin)"
                  >
                    <Edit size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 border-t border-dark-600 pt-2">
                {recipe.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{getItemName(item.inventory_item_id)}</span>
                    <span className="text-gray-500">{Number(item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showCreate && (
        <Modal title="Nueva receta" onClose={() => setShowCreate(false)} size="lg">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Variante del producto</label>
              <select className="input" value={variantId} onChange={e => setVariantId(e.target.value)} required>
                <option value="">Seleccionar variante...</option>
                {availableVariants.map(v => <option key={v.id} value={v.id}>{v.productName} - {v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Ingredientes</label>
              <div className="space-y-2">
                {recipeItems.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <select className="input flex-1 text-sm" value={item.inventory_item_id} onChange={e => updateItem(i, 'inventory_item_id', e.target.value)} required>
                      <option value="">Seleccionar insumo...</option>
                      {invItems.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit?.abbreviation})</option>)}
                    </select>
                    <input type="number" step="0.01" className="input w-24 text-sm" placeholder="Cant." value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} required />
                    {recipeItems.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-gray-500 hover:text-red-400 px-1">✕</button>}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem} className="btn-secondary text-sm mt-2 flex items-center gap-1">
                <Plus size={14} /> Agregar ingrediente
              </button>
            </div>
            <button type="submit" className="btn-primary w-full">Crear receta</button>
          </form>
        </Modal>
      )}

      {/* Modal: Editar receta (admin) */}
      {editRecipe && (
        <Modal title={`Editar receta: ${getVariantInfo(editRecipe.variant_id)?.productName || ''}`} onClose={() => setEditRecipe(null)} size="lg">
          <div className="space-y-4">
            <div className="bg-brand-900/20 border border-brand-700 rounded-lg px-3 py-2 text-xs text-brand-300 flex items-center gap-2">
              <Edit size={13} /> Edita los ingredientes y cantidades. Esto recalcula el costo y margen.
            </div>
            <div>
              <label className="label">Ingredientes</label>
              <div className="space-y-2">
                {editItems.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      className="input flex-1 text-sm"
                      value={item.inventory_item_id}
                      onChange={e => setEditItems(editItems.map((x, j) => j === i ? {...x, inventory_item_id: e.target.value} : x))}
                    >
                      <option value="">Seleccionar...</option>
                      {invItems.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit?.abbreviation})</option>)}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      className="input w-24 text-sm"
                      placeholder="Cant."
                      value={item.quantity}
                      onChange={e => setEditItems(editItems.map((x, j) => j === i ? {...x, quantity: e.target.value} : x))}
                    />
                    {editItems.length > 1 && (
                      <button type="button" onClick={() => setEditItems(editItems.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 px-1">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setEditItems([...editItems, { inventory_item_id: '', quantity: '' }])} className="btn-secondary text-sm mt-2 flex items-center gap-1">
                <Plus size={14} /> Agregar ingrediente
              </button>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditRecipe(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className="btn-primary flex-1">
                {savingEdit ? 'Guardando...' : 'Guardar receta'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
