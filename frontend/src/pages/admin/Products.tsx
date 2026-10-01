import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../../services/api'
import { Product } from '../../types'
import { formatCurrency } from '../../utils/format'
import { Plus, Search, ToggleLeft, ToggleRight, Clock, Upload, X, Edit3, DollarSign } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

const PRODUCT_TYPES: { value: string; label: string; emoji: string; hint: string }[] = [
  { value: 'burger',    label: 'Producto',    emoji: '🍔', hint: 'Producto principal del menú' },
  { value: 'promotion', label: 'Promoción',   emoji: '🎉', hint: 'Oferta o promoción especial' },
  { value: 'combo',     label: 'Combo',       emoji: '🍟', hint: 'Combo armado (incluye varios productos)' },
  { value: 'extra',     label: 'Extra',       emoji: '➕', hint: 'Extra (ej. extra carne)' },
  { value: 'drink',     label: 'Bebida',      emoji: '🥤', hint: 'Gaseosa, jugo, agua, cerveza' },
  { value: 'addition',  label: 'Adición',     emoji: '🧀', hint: 'Adición (tocineta, jalapeños)' },
  { value: 'side',      label: 'Acompañamiento', emoji: '🍟', hint: 'Salchipapa, papa, etc.' },
  { value: 'other',     label: 'Otro',        emoji: '📦', hint: 'Otro tipo' },
]

const TYPE_BADGE: Record<string, { emoji: string; label: string; color: string }> = Object.fromEntries(
  PRODUCT_TYPES.map(t => [t.value, { emoji: t.emoji, label: t.label, color: 'bg-dark-700 text-gray-300' }])
)

export default function Products() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category_id: '', product_type: 'burger', has_combo: false, price_sola: '', price_combo: '', preparation_time_min: '15', image_url: '' })
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Edición de producto existente (solo admin)
  const [editing, setEditing] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState<{name: string; description: string; preparation_time_min: string; variants: {id: number; name: string; price: string}[]}>({name:'', description:'', preparation_time_min:'15', variants:[]})
  const [savingEdit, setSavingEdit] = useState(false)

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products-admin'],
    queryFn: () => productsApi.list(false).then(r => r.data),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productsApi.categories().then(r => r.data),
  })

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const toggleActive = async (p: Product) => {
    await productsApi.update(p.id, { is_active: !p.is_active })
    qc.invalidateQueries({ queryKey: ['products-admin'] })
    toast.success(p.is_active ? 'Producto desactivado' : 'Producto activado')
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagen debe ser menor a 3 MB'); return }
    setUploading(true)
    try {
      const res = await productsApi.uploadImage(file)
      setForm(f => ({ ...f, image_url: res.data.url }))
      toast.success('Imagen subida')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setEditForm({
      name: p.name,
      description: p.description || '',
      preparation_time_min: String(p.preparation_time_min ?? 15),
      variants: p.variants.map(v => ({ id: v.id, name: v.name, price: String(v.price) })),
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      // 1) Actualizar datos básicos del producto
      await productsApi.update(editing.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        preparation_time_min: parseInt(editForm.preparation_time_min) || 15,
      })
      // 2) Actualizar precio de cada variante (en paralelo)
      await Promise.all(editForm.variants.map(v =>
        productsApi.updateVariant(v.id, { name: v.name, price: parseFloat(v.price) || 0 })
      ))
      qc.invalidateQueries({ queryKey: ['products-admin'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
      toast.success('Producto actualizado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al guardar cambios')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) { toast.error('Escribe el nombre de la categoría'); return }
    setCreatingCategory(true)
    try {
      const res = await productsApi.createCategory({ name })
      await qc.invalidateQueries({ queryKey: ['categories'] })
      setForm(f => ({ ...f, category_id: String(res.data.id) }))
      setNewCategoryName('')
      toast.success(`Categoría "${name}" creada`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al crear categoría')
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category_id) { toast.error('Selecciona una categoría'); return }
    try {
      const variants: { name: string; price: number; is_combo: boolean }[] = []
      if (form.price_sola) variants.push({ name: 'Sola', price: parseFloat(form.price_sola), is_combo: false })
      if (form.has_combo && form.price_combo) variants.push({ name: 'Combo', price: parseFloat(form.price_combo), is_combo: true })

      await productsApi.create({
        name: form.name,
        description: form.description,
        category_id: parseInt(form.category_id),
        product_type: form.product_type,
        image_url: form.image_url || undefined,
        has_combo: form.has_combo,
        preparation_time_min: parseInt(form.preparation_time_min) || 15,
        variants,
      })
      qc.invalidateQueries({ queryKey: ['products-admin'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setShowCreate(false)
      setForm({ name: '', description: '', category_id: '', product_type: 'burger', has_combo: false, price_sola: '', price_combo: '', preparation_time_min: '15', image_url: '' })
      setNewCategoryName('')
      toast.success('Producto creado')
    } catch { toast.error('Error al crear producto') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Productos</h1>
          <p className="text-gray-500 text-sm">Gestión del menú y variantes</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? <div className="text-gray-400">Cargando...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div key={product.id} className={`card border-2 transition-all ${product.is_active ? 'border-dark-600 hover:border-brand-700' : 'border-dark-700 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-white font-bold">{product.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-gray-500 text-xs">{product.category?.name}</p>
                    {product.product_type && TYPE_BADGE[product.product_type] && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[product.product_type].color}`}>
                        {TYPE_BADGE[product.product_type].emoji} {TYPE_BADGE[product.product_type].label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button
                      onClick={() => openEdit(product)}
                      className="text-gray-500 hover:text-brand-400 transition-colors p-1"
                      title="Editar precios y datos (solo Admin)"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                  <button onClick={() => toggleActive(product)} className="text-gray-500 hover:text-brand-400 transition-colors">
                    {product.is_active ? <ToggleRight size={20} className="text-brand-500" /> : <ToggleLeft size={20} />}
                  </button>
                </div>
              </div>
              {product.description && <p className="text-gray-400 text-xs mt-1">{product.description}</p>}
              <div className="mt-3 space-y-1">
                {product.variants.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span className={`text-gray-400 ${v.is_combo ? 'text-brand-300' : ''}`}>
                      {v.is_combo ? '🍟 ' : '🍔 '}{v.name}
                    </span>
                    <span className="text-brand-400 font-semibold">{formatCurrency(v.price)}</span>
                  </div>
                ))}
              </div>
              {product.option_groups.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dark-600">
                  <p className="text-gray-500 text-xs">Opciones: {product.option_groups.map(g => g.name).join(', ')}</p>
                </div>
              )}
              {product.preparation_time_min != null && (
                <div className="mt-2 flex items-center gap-1 text-gray-500 text-xs">
                  <Clock size={12} />
                  <span>{product.preparation_time_min} min preparación</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="Nuevo producto" onClose={() => setShowCreate(false)} size="lg">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRODUCT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, product_type: t.value })}
                    className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all border-2 ${
                      form.product_type === t.value
                        ? 'bg-brand-600 border-brand-400 text-white shadow-md'
                        : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-brand-700 hover:text-white'
                    }`}
                    title={t.hint}
                  >
                    <span className="block text-base">{t.emoji}</span>
                    <span className="block text-[10px] truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Imagen del producto</label>
              {form.image_url ? (
                <div className="flex items-center gap-3 bg-dark-700 border border-brand-700 rounded-xl p-2">
                  <img src={form.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-dark-500" />
                  <div className="flex-1">
                    <p className="text-white text-xs font-bold">Imagen cargada</p>
                    <p className="text-gray-500 text-[10px] truncate">{form.image_url}</p>
                  </div>
                  <button type="button" onClick={() => setForm({...form, image_url: ''})} className="text-gray-500 hover:text-red-400 p-1">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 border-2 border-dashed border-dark-500 hover:border-brand-500 rounded-xl py-4 cursor-pointer transition-colors">
                  {uploading ? (
                    <span className="text-gray-400 text-sm">Subiendo...</span>
                  ) : (
                    <>
                      <Upload size={16} className="text-brand-400" />
                      <span className="text-gray-300 text-sm font-medium">Subir imagen (JPG/PNG, máx 3 MB)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleImageUpload}
                  />
                </label>
              )}
            </div>
            <div><label className="label">Nombre</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
            <div><label className="label">Descripción</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div>
              <label className="label">Categoría</label>
              <select
                className="input"
                value={form.category_id === '__other__' ? '__other__' : form.category_id}
                onChange={e => setForm({...form, category_id: e.target.value})}
                required={form.category_id !== '__other__'}
              >
                <option value="">Seleccionar...</option>
                {categories.map((c: { id: number; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__other__">➕ OTRO (crear nueva)</option>
              </select>
              {form.category_id === '__other__' && (
                <div className="mt-2 flex gap-2 bg-brand-900/20 border border-brand-700 rounded-xl p-2">
                  <input
                    className="input flex-1"
                    placeholder="Nombre de la nueva categoría"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={creatingCategory || !newCategoryName.trim()}
                    className="btn-primary px-3 whitespace-nowrap disabled:opacity-50"
                  >
                    {creatingCategory ? 'Creando...' : 'Crear'}
                  </button>
                </div>
              )}
            </div>
            <div><label className="label">Precio (sola)</label><input type="number" className="input" value={form.price_sola} onChange={e => setForm({...form, price_sola: e.target.value})} /></div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="has_combo" checked={form.has_combo} onChange={e => setForm({...form, has_combo: e.target.checked})} className="w-4 h-4" />
              <label htmlFor="has_combo" className="text-gray-300 text-sm cursor-pointer">¿Tiene versión combo?</label>
            </div>
            {form.has_combo && (
              <div><label className="label">Precio combo</label><input type="number" className="input" value={form.price_combo} onChange={e => setForm({...form, price_combo: e.target.value})} /></div>
            )}
            <div>
              <label className="label">Tiempo de preparación (minutos)</label>
              <input
                type="number"
                min={1}
                max={120}
                className="input"
                value={form.preparation_time_min}
                onChange={e => setForm({...form, preparation_time_min: e.target.value})}
                placeholder="15"
              />
            </div>
            <button type="submit" className="btn-primary w-full">Crear producto</button>
          </form>
        </Modal>
      )}

      {/* ── Modal: EDITAR producto (solo Admin) ─────────────────────── */}
      {editing && isAdmin && (
        <Modal title={`Editar: ${editing.name}`} onClose={() => setEditing(null)} size="lg">
          <div className="space-y-3">
            <div className="bg-brand-900/20 border border-brand-700 rounded-lg px-3 py-2 text-xs text-brand-300 flex items-center gap-2">
              <Edit3 size={13} />
              Edición administrativa — los cambios afectan a todos los pedidos futuros
            </div>
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea className="input" rows={2} value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
            </div>
            <div>
              <label className="label">Tiempo de preparación (min)</label>
              <input type="number" min={1} max={120} className="input" value={editForm.preparation_time_min} onChange={e => setEditForm({...editForm, preparation_time_min: e.target.value})} />
            </div>

            <div className="border-t border-dark-600 pt-3">
              <label className="label flex items-center gap-1.5"><DollarSign size={14} className="text-brand-400" /> Precios por variante</label>
              <div className="space-y-2">
                {editForm.variants.length === 0 && (
                  <p className="text-gray-500 text-xs italic">Este producto no tiene variantes registradas</p>
                )}
                {editForm.variants.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-2 bg-dark-700 rounded-lg p-2">
                    <input
                      className="input text-sm flex-1"
                      placeholder="Nombre variante"
                      value={v.name}
                      onChange={e => setEditForm({...editForm, variants: editForm.variants.map((x, j) => j === i ? {...x, name: e.target.value} : x)})}
                    />
                    <span className="text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="100"
                      className="input text-sm w-32 text-right font-bold"
                      placeholder="0"
                      value={v.price}
                      onChange={e => setEditForm({...editForm, variants: editForm.variants.map((x, j) => j === i ? {...x, price: e.target.value} : x)})}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className="btn-primary flex-1">
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
