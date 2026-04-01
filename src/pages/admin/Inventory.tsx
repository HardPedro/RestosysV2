import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'food',
    unit: 'un',
    cost: 0,
    price: 0,
    stock: 0,
    minStock: 0,
    isComposite: false
  });

  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubMovements = onSnapshot(query(collection(db, 'stockMovements'), orderBy('date', 'desc')), (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsub();
      unsubMovements();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Check for duplicate name
      const duplicate = products.find(p => p.name.toLowerCase() === formData.name.toLowerCase() && p.id !== editingId);
      if (duplicate) {
        toast.error('Já existe um produto com este nome!');
        return;
      }

      let productId = editingId;
      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), formData);
        toast.success('Produto atualizado!');
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        productId = docRef.id;
        toast.success('Produto criado!');
      }

      // Handle Recipe if composite
      if (formData.isComposite && productId) {
        const recipesQuery = query(collection(db, 'recipes'), where('productId', '==', productId));
        const recipesSnap = await getDocs(recipesQuery);
        
        if (recipesSnap.empty) {
          await addDoc(collection(db, 'recipes'), {
            productId,
            ingredients: recipeIngredients,
            updatedAt: new Date().toISOString()
          });
        } else {
          await updateDoc(doc(db, 'recipes', recipesSnap.docs[0].id), {
            ingredients: recipeIngredients,
            updatedAt: new Date().toISOString()
          });
        }
      }

      setIsModalOpen(false);
      setEditingId(null);
      setRecipeIngredients([]);
      setFormData({ name: '', description: '', category: 'food', unit: 'un', cost: 0, price: 0, stock: 0, minStock: 0, isComposite: false });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar produto');
    }
  };

  const [recipeIngredients, setRecipeIngredients] = useState<any[]>([]);

  const handleEdit = async (product: any) => {
    setFormData(product);
    setEditingId(product.id);
    if (product.isComposite) {
      const q = query(collection(db, 'recipes'), where('productId', '==', product.id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setRecipeIngredients(snap.docs[0].data().ingredients || []);
      } else {
        setRecipeIngredients([]);
      }
    } else {
      setRecipeIngredients([]);
    }
    setIsModalOpen(true);
  };

  const addIngredientToRecipe = (ingredientId: string, quantity: number) => {
    const ingredient = products.find(p => p.id === ingredientId);
    if (!ingredient) return;
    setRecipeIngredients(prev => {
      const existing = prev.find(i => i.ingredientId === ingredientId);
      if (existing) {
        return prev.map(i => i.ingredientId === ingredientId ? { ...i, quantity } : i);
      }
      return [...prev, { ingredientId, name: ingredient.name, quantity, unit: ingredient.unit }];
    });
  };

  const removeIngredientFromRecipe = (ingredientId: string) => {
    setRecipeIngredients(prev => prev.filter(i => i.ingredientId !== ingredientId));
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir?')) {
      await deleteDoc(doc(db, 'products', id));
      toast.success('Produto excluído');
    }
  };

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentData, setAdjustmentData] = useState({
    productId: '',
    quantity: 0,
    type: 'in' as 'in' | 'out',
    reason: 'purchase'
  });

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const product = products.find(p => p.id === adjustmentData.productId);
      if (!product) return;

      const newStock = adjustmentData.type === 'in' 
        ? product.stock + adjustmentData.quantity 
        : product.stock - adjustmentData.quantity;

      await updateDoc(doc(db, 'products', product.id), { stock: newStock });
      
      await addDoc(collection(db, 'stockMovements'), {
        productId: product.id,
        productName: product.name,
        type: adjustmentData.type,
        quantity: adjustmentData.quantity,
        reason: adjustmentData.reason,
        date: new Date().toISOString()
      });

      toast.success('Estoque ajustado!');
      setIsAdjustmentModalOpen(false);
      setAdjustmentData({ productId: '', quantity: 0, type: 'in', reason: 'purchase' });
    } catch (error) {
      toast.error('Erro ao ajustar estoque');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Estoque</h1>
        <div className="flex flex-wrap gap-2 md:gap-4">
          <div className="flex rounded-xl bg-stone-200/50 p-1 border border-stone-200">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`rounded-lg px-3 md:px-4 py-1.5 text-xs md:text-sm font-bold transition-all ${activeTab === 'inventory' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Inventário
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`rounded-lg px-3 md:px-4 py-1.5 text-xs md:text-sm font-bold transition-all ${activeTab === 'movements' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Movimentação
            </button>
          </div>
          <button
            onClick={() => setIsAdjustmentModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border-2 border-orange-600 px-3 md:px-4 py-2 text-xs md:text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors active:scale-95"
          >
            Ajustar
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-3 md:px-4 py-2 text-xs md:text-sm font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95"
          >
            <Plus size={18} className="md:w-5 md:h-5" />
            Novo
          </button>
        </div>
      </div>

      {/* ... existing tables ... */}

      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h2 className="mb-6 text-2xl font-bold font-heading text-stone-900">Ajustar Estoque</h2>
            <form onSubmit={handleAdjustment} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Produto</label>
                <select 
                  required 
                  value={adjustmentData.productId} 
                  onChange={e => setAdjustmentData({...adjustmentData, productId: e.target.value})}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                >
                  <option value="">Selecione o produto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Atual: {p.stock} {p.unit})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Tipo</label>
                  <select 
                    value={adjustmentData.type} 
                    onChange={e => setAdjustmentData({...adjustmentData, type: e.target.value as 'in' | 'out'})}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  >
                    <option value="in">Entrada (+)</option>
                    <option value="out">Saída (-)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Quantidade</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    value={adjustmentData.quantity} 
                    onChange={e => setAdjustmentData({...adjustmentData, quantity: parseFloat(e.target.value)})}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Motivo</label>
                <select 
                  value={adjustmentData.reason} 
                  onChange={e => setAdjustmentData({...adjustmentData, reason: e.target.value})}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                >
                  <option value="purchase">Compra / Reposição</option>
                  <option value="adjustment">Ajuste Manual</option>
                  <option value="waste">Desperdício / Perda</option>
                  <option value="return">Devolução</option>
                </select>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setIsAdjustmentModalOpen(false)} className="rounded-xl px-5 py-2.5 font-bold text-stone-600 hover:bg-stone-100 transition-colors">Cancelar</button>
                <button type="submit" className="rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'inventory' ? (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-stone-600">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Preço</th>
                  <th className="px-6 py-4">Estoque</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-stone-900">{product.name}</td>
                    <td className="px-6 py-4 capitalize">{product.category}</td>
                    <td className="px-6 py-4 font-medium">R$ {product.price.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${product.stock <= product.minStock ? 'text-red-600' : 'text-stone-900'}`}>
                          {product.stock} {product.unit}
                        </span>
                        {product.stock <= product.minStock && (
                          <AlertTriangle size={16} className="text-red-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(product)} className="mr-3 text-blue-600 hover:text-blue-800">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="grid gap-4 md:hidden">
            {products.map((product) => (
              <div key={product.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-stone-900 text-base">{product.name}</h3>
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mt-1">{product.category}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(product)} className="rounded-xl p-2 text-blue-600 hover:bg-blue-50 transition-colors active:scale-95">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="rounded-xl p-2 text-red-600 hover:bg-red-50 transition-colors active:scale-95">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-stone-50 pt-3">
                  <span className="font-bold text-stone-900">R$ {product.price.toFixed(2)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold ${product.stock <= product.minStock ? 'text-red-600' : 'text-stone-900'}`}>
                      {product.stock} {product.unit}
                    </span>
                    {product.stock <= product.minStock && (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Desktop Table Movements */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-stone-600">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-bold border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Produto</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Qtd</th>
                  <th className="px-6 py-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{new Date(m.date).toLocaleString('pt-BR')}</td>
                    <td className="px-6 py-4 font-bold text-stone-900">{m.productName}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${m.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.type === 'in' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-stone-900">{m.quantity}</td>
                    <td className="px-6 py-4 capitalize font-medium">{m.reason === 'sale' ? 'Venda' : m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards Movements */}
          <div className="grid gap-4 md:hidden">
            {movements.map((m) => (
              <div key={m.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500">{new Date(m.date).toLocaleString('pt-BR')}</span>
                  <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {m.type === 'in' ? 'Entrada' : 'Saída'}
                  </span>
                </div>
                <h3 className="font-bold text-stone-900 text-base">{m.productName}</h3>
                <div className="mt-3 pt-3 border-t border-stone-50 flex items-center justify-between text-sm">
                  <span className="capitalize font-medium text-stone-500">{m.reason === 'sale' ? 'Venda' : m.reason}</span>
                  <span className="font-bold text-stone-900">{m.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200 my-8">
            <h2 className="mb-6 text-2xl font-bold font-heading text-stone-900">{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Nome</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Categoria</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all">
                    <option value="food">Comida</option>
                    <option value="drink">Bebida</option>
                    <option value="ingredient">Ingrediente</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Unidade</label>
                  <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all">
                    <option value="un">Unidade</option>
                    <option value="kg">Kg</option>
                    <option value="l">Litro</option>
                    <option value="g">Grama</option>
                    <option value="ml">Mililitro</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Custo (R$)</label>
                  <input type="number" step="0.01" value={formData.cost} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Preço (R$)</label>
                  <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Estoque</label>
                  <input type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseFloat(e.target.value)})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Estoque Mínimo</label>
                  <input type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseFloat(e.target.value)})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isComposite" checked={formData.isComposite} onChange={e => setFormData({...formData, isComposite: e.target.checked})} className="rounded text-orange-600 focus:ring-orange-500" />
                <label htmlFor="isComposite" className="text-sm font-bold text-stone-700">Produto Composto (Ficha Técnica)</label>
              </div>

              {formData.isComposite && (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-stone-900">Composição (Ficha Técnica)</h3>
                  <div className="mb-3 space-y-2">
                    {recipeIngredients.map(ing => (
                      <div key={ing.ingredientId} className="flex items-center justify-between text-sm bg-white p-2 rounded-lg border border-stone-100">
                        <span className="font-medium text-stone-900">{ing.name} <span className="text-stone-500">({ing.quantity}{ing.unit})</span></span>
                        <button type="button" onClick={() => removeIngredientFromRecipe(ing.ingredientId)} className="text-red-500 hover:text-red-700 font-medium transition-colors">Remover</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select 
                      className="flex-1 rounded-xl border border-stone-200 bg-white p-2.5 text-sm text-stone-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) addIngredientToRecipe(val, 1);
                      }}
                      value=""
                    >
                      <option value="">Adicionar Ingrediente...</option>
                      {products.filter(p => p.category === 'ingredient' || p.category === 'food' || p.category === 'drink').map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-5 py-2.5 font-bold text-stone-600 hover:bg-stone-100 transition-colors">Cancelar</button>
                <button type="submit" className="rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
