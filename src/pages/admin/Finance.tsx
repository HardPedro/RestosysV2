import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function Finance() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: 'payable',
    amount: 0,
    description: '',
    status: 'pending',
    dueDate: new Date().toISOString().split('T')[0],
    category: 'supplies'
  });

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'transactions'), {
        ...formData,
        amount: parseFloat(formData.amount.toString()),
        createdAt: new Date().toISOString()
      });
      toast.success('Transação registrada!');
      setIsModalOpen(false);
      setFormData({ type: 'payable', amount: 0, description: '', status: 'pending', dueDate: new Date().toISOString().split('T')[0], category: 'supplies' });
    } catch (error) {
      toast.error('Erro ao salvar transação');
    }
  };

  const handlePay = async (id: string) => {
    try {
      await updateDoc(doc(db, 'transactions', id), {
        status: 'paid',
        paidDate: new Date().toISOString()
      });
      toast.success('Status atualizado!');
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const balance = transactions.reduce((acc, t) => {
    if (t.status === 'paid') {
      return t.type === 'receivable' ? acc + t.amount : acc - t.amount;
    }
    return acc;
  }, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Financeiro</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95"
        >
          <Plus size={20} />
          Nova Transação
        </button>
      </div>

      <div className="mb-8 rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
        <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wider mb-2">Saldo Atual (Pago)</h2>
        <p className={`text-4xl md:text-5xl font-bold font-heading ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          R$ {balance.toFixed(2)}
        </p>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-stone-600">
          <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500 font-bold border-b border-stone-200">
            <tr>
              <th className="px-6 py-4">Descrição</th>
              <th className="px-6 py-4">Tipo</th>
              <th className="px-6 py-4">Valor</th>
              <th className="px-6 py-4">Vencimento</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-stone-900">{t.description}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${t.type === 'receivable' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {t.type === 'receivable' ? 'Receita' : 'Despesa'}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-stone-900">R$ {t.amount.toFixed(2)}</td>
                <td className="px-6 py-4 font-medium">{new Date(t.dueDate).toLocaleDateString('pt-BR')}</td>
                <td className="px-6 py-4">
                  {t.status === 'paid' ? (
                    <span className="flex items-center gap-1.5 text-green-600 font-bold"><CheckCircle size={16} /> Pago</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-orange-600 font-bold"><Clock size={16} /> Pendente</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {t.status === 'pending' && (
                    <button onClick={() => handlePay(t.id)} className="text-blue-600 hover:text-blue-800 font-bold transition-colors">
                      Marcar Pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="grid gap-4 md:hidden">
        {transactions.map((t) => (
          <div key={t.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-stone-900 text-base">{t.description}</h3>
                <span className={`inline-block mt-1.5 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.type === 'receivable' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {t.type === 'receivable' ? 'Receita' : 'Despesa'}
                </span>
              </div>
              <p className="font-bold text-stone-900 text-lg">R$ {t.amount.toFixed(2)}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-stone-500 border-t border-stone-50 pt-3">
              <span className="font-medium">Venc: {new Date(t.dueDate).toLocaleDateString('pt-BR')}</span>
              <div className="flex items-center gap-3">
                {t.status === 'paid' ? (
                  <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle size={14} /> Pago</span>
                ) : (
                  <span className="flex items-center gap-1 text-orange-600 font-bold"><Clock size={14} /> Pendente</span>
                )}
                {t.status === 'pending' && (
                  <button onClick={() => handlePay(t.id)} className="rounded-xl bg-blue-50 px-3 py-1.5 text-blue-600 font-bold hover:bg-blue-100 transition-colors active:scale-95">
                    Pagar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-stone-200">
            <h2 className="mb-6 text-2xl font-bold font-heading text-stone-900">Nova Transação</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700">Descrição</label>
                <input required type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Tipo</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all">
                    <option value="payable">Despesa (Pagar)</option>
                    <option value="receivable">Receita (Receber)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Valor (R$)</label>
                  <input required type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Vencimento</label>
                  <input required type="date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-stone-700">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 outline-none transition-all">
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                  </select>
                </div>
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
