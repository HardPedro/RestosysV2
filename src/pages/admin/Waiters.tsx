import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, UserCheck, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function Waiters() {
  const [waiters, setWaiters] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pin: '',
    role: 'waiter'
  });

  useEffect(() => {
    // Fetch all users to manage them
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      setWaiters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', editingId), formData);
        toast.success('Usuário atualizado!');
      } else {
        await addDoc(collection(db, 'users'), {
          ...formData,
          uid: `waiter_${Date.now()}`,
          createdAt: new Date().toISOString()
        });
        toast.success('Usuário criado!');
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', email: '', pin: '', role: 'waiter' });
    } catch (error) {
      toast.error('Erro ao salvar usuário');
    }
  };

  const handleEdit = (waiter: any) => {
    setFormData({
      name: waiter.name || '',
      email: waiter.email || '',
      pin: waiter.pin || '',
      role: waiter.role || 'waiter'
    });
    setEditingId(waiter.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      await deleteDoc(doc(db, 'users', id));
      toast.success('Usuário excluído');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Gerenciar Usuários</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95"
        >
          <Plus size={20} />
          Novo Usuário
        </button>
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {waiters.map((waiter) => (
          <div key={waiter.id} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 border border-orange-100">
                <UserCheck size={24} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEdit(waiter)} className="rounded-xl p-2 text-blue-600 hover:bg-blue-50 transition-colors">
                  <Edit size={18} />
                </button>
                <button onClick={() => handleDelete(waiter.id)} className="rounded-xl p-2 text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-bold font-heading text-stone-900">{waiter.name}</h3>
            <p className="text-sm font-medium text-stone-500 truncate">{waiter.email}</p>
            <div className="mt-3 inline-block rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-stone-600 border border-stone-200">{waiter.role}</div>
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-sm font-bold text-stone-700 border border-stone-100">
              <Key size={16} className="text-stone-400" />
              PIN: <span className="font-mono text-orange-600 tracking-wider">{waiter.pin || 'N/A'}</span>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h2 className="mb-6 text-2xl font-bold font-heading text-stone-900">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Nome Completo</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">E-mail (Opcional)</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Cargo / Função</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all">
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="waiter">Garçom</option>
                  <option value="cashier">Caixa</option>
                  <option value="kitchen">Cozinha</option>
                  <option value="bar">Bar</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">PIN de Acesso (4-6 dígitos)</label>
                <input type="text" maxLength={6} value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-center text-2xl font-bold tracking-widest font-mono text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
              </div>
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
