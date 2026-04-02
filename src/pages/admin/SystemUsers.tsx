import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, Shield, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

export default function SystemUsers() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'manager'
  });

  useEffect(() => {
    // Fetch users who have an email (system users)
    const q = query(collection(db, 'users'), where('email', '!=', ''));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Only pedrohardsolu2025@gmail.com can access this page
  if (userData?.email !== 'pedrohardsolu2025@gmail.com') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Shield size={64} className="mx-auto text-stone-300 mb-4" />
          <h2 className="text-2xl font-bold text-stone-900">Acesso Negado</h2>
          <p className="text-stone-500 mt-2">Você não tem permissão para acessar este módulo.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        // Check for duplicates when editing
        const duplicateCheck = users.find(u => u.email === formData.email && u.id !== editingId);
        if (duplicateCheck) {
          toast.error('Este e-mail já possui acesso.');
          return;
        }
        await updateDoc(doc(db, 'users', editingId), formData);
        toast.success('Acesso atualizado!');
      } else {
        // Check for duplicates when adding
        const duplicateCheck = users.find(u => u.email === formData.email);
        if (duplicateCheck) {
          toast.error('Este e-mail já possui acesso.');
          return;
        }
        
        // Create a new document for the user. 
        // When they log in with Google, AuthContext will find this document by email.
        await addDoc(collection(db, 'users'), {
          ...formData,
          uid: `pending_${Date.now()}`, // Placeholder until they log in
          createdAt: new Date().toISOString()
        });
        toast.success('Acesso concedido!');
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', email: '', role: 'manager' });
    } catch (error) {
      toast.error('Erro ao salvar acesso');
    }
  };

  const handleEdit = (user: any) => {
    setFormData({
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'manager'
    });
    setEditingId(user.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, email: string) => {
    if (email === 'pedrohardsolu2025@gmail.com') {
      toast.error('Não é possível excluir o super administrador.');
      return;
    }
    if (confirm('Tem certeza que deseja revogar o acesso deste usuário?')) {
      await deleteDoc(doc(db, 'users', id));
      toast.success('Acesso revogado');
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    manager: 'Gerente',
    cashier: 'Caixa',
    kitchen: 'Cozinha',
    bar: 'Bar'
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Acessos do Sistema</h1>
          <p className="text-stone-500 mt-1">Gerencie quais e-mails podem fazer login no sistema.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 font-bold text-white hover:bg-stone-800 shadow-md transition-all active:scale-95"
        >
          <Plus size={20} />
          Liberar Acesso
        </button>
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <div key={user.id} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 border border-stone-200">
                <Shield size={24} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEdit(user)} className="rounded-xl p-2 text-blue-600 hover:bg-blue-50 transition-colors">
                  <Edit size={18} />
                </button>
                <button onClick={() => handleDelete(user.id, user.email)} className="rounded-xl p-2 text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-bold font-heading text-stone-900">{user.name || 'Usuário'}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-stone-500">
              <Mail size={16} />
              <span className="truncate">{user.email}</span>
            </div>
            <div className="mt-4 inline-block rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-stone-600 border border-stone-200">
              {roleLabels[user.role] || user.role}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h2 className="mb-6 text-2xl font-bold font-heading text-stone-900">{editingId ? 'Editar Acesso' : 'Liberar Novo Acesso'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Nome do Usuário</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-stone-500 focus:bg-white focus:ring-2 focus:ring-stone-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">E-mail (Conta Google)</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-stone-500 focus:bg-white focus:ring-2 focus:ring-stone-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Nível de Acesso</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-stone-500 focus:bg-white focus:ring-2 focus:ring-stone-500/20 outline-none transition-all">
                  <option value="admin">Administrador (Acesso Total)</option>
                  <option value="manager">Gerente</option>
                  <option value="cashier">Caixa</option>
                  <option value="kitchen">Cozinha (Apenas tela da cozinha)</option>
                  <option value="bar">Bar (Apenas tela do bar)</option>
                </select>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-5 py-2.5 font-bold text-stone-600 hover:bg-stone-100 transition-colors">Cancelar</button>
                <button type="submit" className="rounded-xl bg-stone-900 px-5 py-2.5 font-bold text-white hover:bg-stone-800 shadow-md transition-all active:scale-95">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
