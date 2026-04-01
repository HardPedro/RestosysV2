import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, updateDoc, doc, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CheckCircle, Clock, Play, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { printReceipt } from '../../lib/print';

export default function KitchenDisplay() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'orderItems'),
      where('type', '==', 'food'),
      where('status', 'in', ['pending', 'preparing']),
      orderBy('createdAt', 'asc')
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    return () => unsub();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orderItems', id), { status: newStatus });
      toast.success(`Status atualizado para ${newStatus}`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handlePrint = (item: any) => {
    const content = `
      <div class="text-center border-b">
        <h2>COZINHA</h2>
        <p>${new Date(item.createdAt).toLocaleString('pt-BR')}</p>
      </div>
      <div class="border-b">
        <h1 class="text-xl">MESA ${item.tableNumber || '?'}</h1>
      </div>
      <div class="border-b">
        <p class="text-lg bold">${item.quantity}x ${item.productName}</p>
        ${item.notes ? `<p>OBS: ${item.notes}</p>` : ''}
      </div>
      <div class="text-center">
        <p>*** FIM ***</p>
      </div>
    `;

    const printReq = {
      pedidoId: item.orderId?.slice(0, 8) || 'N/A',
      itens: [{
        nome: item.productName,
        setor: 'cozinha',
        quantidade: item.quantity,
        preco: item.price || 0,
        observacao: item.notes
      }],
      imprimirCaixa: false,
      tipo: 'comanda',
      total: 0,
      mesa: item.tableNumber === 0 ? 'BAR' : (item.tableNumber?.toString() || '?')
    };

    // Create a printJob so the PC can print it automatically via the local agent
    addDoc(collection(db, 'printJobs'), {
      ...printReq,
      status: 'pending',
      createdAt: new Date().toISOString()
    }).catch(err => console.error('Failed to create kitchen print job', err));
    
    toast.success('Enviando para a impressora...');
  };

  const pendingItems = items.filter(i => i.status === 'pending');
  const preparingItems = items.filter(i => i.status === 'preparing');

  return (
    <div className="flex min-h-screen flex-col bg-stone-100 p-4 md:p-8 max-w-[1600px] mx-auto w-full">
      <h1 className="mb-6 text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Cozinha - Pedidos</h1>
      
      <div className="grid flex-1 gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Pendentes */}
        <div className="flex flex-col rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-stone-200">
          <div className="mb-6 flex items-center justify-between border-b border-stone-100 pb-4">
            <h2 className="flex items-center gap-3 text-xl md:text-2xl font-bold font-heading text-orange-600">
              <Clock size={28} /> Pendentes
            </h2>
            <span className="rounded-full bg-orange-100 px-4 py-1.5 font-bold text-orange-600 border border-orange-200">{pendingItems.length}</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {pendingItems.map(item => (
              <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded-lg bg-stone-200/50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">{item.tableNumber === 0 ? 'BAR' : `Mesa ${item.tableNumber || '?'}`}</span>
                    <p className="text-xl font-bold font-heading text-stone-900">{item.quantity}x {item.productName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <span className="text-xs font-medium text-stone-500 bg-white px-2 py-1 rounded-md border border-stone-200">{new Date(item.createdAt).toLocaleTimeString()}</span>
                    <button onClick={() => handlePrint(item)} className="rounded-xl p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors" title="Imprimir Comanda">
                      <Printer size={20} />
                    </button>
                  </div>
                </div>
                {item.notes && <p className="mb-4 text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">Obs: {item.notes}</p>}
                <button
                  onClick={() => updateStatus(item.id, 'preparing')}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all active:scale-95"
                >
                  <Play size={20} /> Iniciar Preparo
                </button>
              </div>
            ))}
            {pendingItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-stone-400">
                <CheckCircle size={48} className="mb-4 opacity-20" />
                <p className="font-medium">Nenhum pedido pendente</p>
              </div>
            )}
          </div>
        </div>

        {/* Preparando */}
        <div className="flex flex-col rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-stone-200">
          <div className="mb-6 flex items-center justify-between border-b border-stone-100 pb-4">
            <h2 className="flex items-center gap-3 text-xl md:text-2xl font-bold font-heading text-blue-600">
              <Play size={28} /> Em Preparo
            </h2>
            <span className="rounded-full bg-blue-100 px-4 py-1.5 font-bold text-blue-600 border border-blue-200">{preparingItems.length}</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {preparingItems.map(item => (
              <div key={item.id} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-blue-700 mb-2">{item.tableNumber === 0 ? 'BAR' : `Mesa ${item.tableNumber || '?'}`}</span>
                    <p className="text-xl font-bold font-heading text-stone-900">{item.quantity}x {item.productName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <span className="text-xs font-medium text-stone-500 bg-white px-2 py-1 rounded-md border border-stone-200">{new Date(item.createdAt).toLocaleTimeString()}</span>
                    <button onClick={() => handlePrint(item)} className="rounded-xl p-2 text-blue-400 hover:bg-blue-100 hover:text-blue-700 transition-colors" title="Imprimir Comanda">
                      <Printer size={20} />
                    </button>
                  </div>
                </div>
                {item.notes && <p className="mb-4 text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">Obs: {item.notes}</p>}
                <button
                  onClick={() => updateStatus(item.id, 'ready')}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 shadow-md shadow-green-600/20 transition-all active:scale-95"
                >
                  <CheckCircle size={20} /> Marcar como Pronto
                </button>
              </div>
            ))}
            {preparingItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-stone-400">
                <Clock size={48} className="mb-4 opacity-20" />
                <p className="font-medium">Nenhum pedido em preparo</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
