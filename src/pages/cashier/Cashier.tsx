import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Calculator, CheckCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { printReceipt } from '../../lib/print';

export default function Cashier() {
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [currentOrder, setCurrentOrder] = useState<any | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [autoPrint, setAutoPrint] = useState(true);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).sort((a: any, b: any) => a.number - b.number));
    });
    return () => unsubTables();
  }, []);

  const currentTable = tables.find(t => t.id === selectedTable?.id) || null;
  const currentOrderId = currentTable?.currentOrderId;

  useEffect(() => {
    if (currentOrderId) {
      const unsubOrder = onSnapshot(doc(db, 'orders', currentOrderId), (doc) => {
        if (doc.exists()) setCurrentOrder({ id: doc.id, ...doc.data() });
      });
      const q = query(collection(db, 'orderItems'), where('orderId', '==', currentOrderId));
      const unsubItems = onSnapshot(q, (snapshot) => {
        setOrderItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => {
        unsubOrder();
        unsubItems();
      };
    } else {
      setCurrentOrder(null);
      setOrderItems([]);
      setSelectedItems([]);
    }
  }, [currentOrderId]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const selectedTotal = orderItems
    .filter(item => selectedItems.includes(item.id))
    .reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handlePrint = (isPreBill = false, itemsToPrint = orderItems) => {
    if (!currentOrder || !currentTable) return;
    
    const itemsHtml = itemsToPrint.map(item => `
      <div class="flex mb-2">
        <span>${item.quantity}x ${item.productName}</span>
        <span>R$ ${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    const paymentMethodNames: Record<string, string> = {
      credit: 'Crédito',
      debit: 'Débito',
      pix: 'Pix',
      cash: 'Dinheiro'
    };

    const total = itemsToPrint.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    const content = `
      <div class="text-center border-b">
        <h2>RESTAURANTE EXPRESS</h2>
        <p>${isPreBill ? 'Conferência de Mesa' : 'Cupom Não Fiscal'}</p>
        <p>${new Date().toLocaleString('pt-BR')}</p>
      </div>
      <div class="border-b">
        <p class="bold text-lg">${currentTable.number === 0 ? 'BAR' : `MESA ${currentTable.number}`}</p>
        <p>Pedido #${currentOrder.id.slice(0, 8)}</p>
      </div>
      <div class="border-b">
        ${itemsHtml}
      </div>
      <div class="flex border-b text-lg bold">
        <span>TOTAL</span>
        <span>R$ ${total.toFixed(2)}</span>
      </div>
      <div class="text-center">
        ${!isPreBill ? `<p>Pagamento: ${paymentMethodNames[paymentMethod] || paymentMethod}</p>` : '<p>Aguardando Pagamento</p>'}
        <p>Obrigado pela preferência!</p>
      </div>
    `;

    const printReq = {
      pedidoId: currentOrder.id.slice(0, 8),
      itens: itemsToPrint.map(i => ({
        nome: i.productName,
        setor: i.type,
        quantidade: i.quantity,
        preco: i.price,
        observacao: i.notes
      })),
      imprimirCaixa: true,
      tipo: isPreBill ? 'preconta' : 'cupom',
      total: total,
      pagamento: !isPreBill ? (paymentMethodNames[paymentMethod] || paymentMethod) : undefined,
      mesa: currentTable.number === 0 ? 'BAR' : currentTable.number.toString()
    };

    // Send to printJobs so the PC can print it automatically via the local agent
    addDoc(collection(db, 'printJobs'), {
      ...printReq,
      status: 'pending',
      createdAt: new Date().toISOString()
    }).catch(err => console.error('Failed to create print job', err));

    toast.success(isPreBill ? 'Enviando para impressão...' : 'Enviando comprovante...');
  };

  const handleCloseOrder = async () => {
    if (!currentTable || !currentOrder) return;
    
    const itemsToPay = selectedItems.length > 0 
      ? orderItems.filter(item => selectedItems.includes(item.id))
      : orderItems;

    if (itemsToPay.length === 0) {
      toast.error('Selecione itens para pagar');
      return;
    }

    const totalToPay = itemsToPay.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const isPartial = itemsToPay.length < orderItems.length;

    try {
      if (autoPrint) {
        handlePrint(false, itemsToPay);
      }

      // 1. Create Transaction
      await addDoc(collection(db, 'transactions'), {
        type: 'receivable',
        amount: totalToPay,
        description: `Venda ${currentTable.number === 0 ? 'Bar' : `Mesa ${currentTable.number}`}${isPartial ? ' (Parcial)' : ''}`,
        status: 'paid',
        dueDate: new Date().toISOString(),
        paidDate: new Date().toISOString(),
        category: 'sales',
        orderId: currentOrder.id,
        paymentMethod,
        createdAt: new Date().toISOString()
      });

      // 2. Handle Items
      for (const item of itemsToPay) {
        await updateDoc(doc(db, 'orderItems', item.id), {
          status: 'paid',
          paidAt: new Date().toISOString()
        });
      }

      // 3. Update Order Total and Status
      const remainingItems = orderItems.filter(item => !selectedItems.includes(item.id) && item.status !== 'paid');
      
      if (remainingItems.length === 0) {
        // Full checkout
        await updateDoc(doc(db, 'orders', currentOrder.id), {
          status: 'closed',
          closedAt: new Date().toISOString()
        });

        await updateDoc(doc(db, 'tables', currentTable.id), {
          status: 'free',
          currentOrderId: null
        });
        toast.success('Mesa finalizada com sucesso!');
        setSelectedTable(null);
      } else {
        // Partial checkout
        const newTotal = remainingItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        await updateDoc(doc(db, 'orders', currentOrder.id), {
          total: newTotal
        });
        toast.success('Pagamento parcial registrado!');
        setSelectedItems([]);
      }

    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar pagamento');
    }
  };

  const handleReopenTable = async () => {
    if (!currentTable) return;
    try {
      await updateDoc(doc(db, 'tables', currentTable.id), {
        status: 'occupied'
      });
      toast.success('Mesa reaberta para novos pedidos');
    } catch (error) {
      toast.error('Erro ao reabrir mesa');
    }
  };

  const handleFreeTable = async () => {
    if (!currentTable || !currentOrder) return;
    if (confirm('Deseja realmente liberar a mesa sem pagamento? (Os itens serão mantidos no pedido como não pagos)')) {
      try {
        await updateDoc(doc(db, 'tables', currentTable.id), {
          status: 'free',
          currentOrderId: null
        });
        await updateDoc(doc(db, 'orders', currentOrder.id), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString()
        });
        toast.success('Mesa liberada');
        setSelectedTable(null);
      } catch (error) {
        toast.error('Erro ao liberar mesa');
      }
    }
  };

  return (
    <div className="flex h-screen flex-col md:flex-row bg-stone-100 font-sans">
      {/* Tables List */}
      <div className={`${selectedTable ? 'hidden md:block' : 'block'} w-full md:w-1/3 border-r border-stone-200 bg-white p-4 md:p-6 overflow-y-auto shadow-sm z-10`}>
        <h2 className="mb-6 text-2xl font-bold font-heading tracking-tight text-stone-900">Caixa</h2>
        <div className="space-y-3">
          {tables.filter(t => t.status !== 'free').map(table => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 transition-all duration-200 ${
                selectedTable?.id === table.id 
                  ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-500/10' 
                  : 'border-stone-200 hover:border-orange-300 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold font-heading text-lg ${
                  table.status === 'billing' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {table.number === 0 ? 'B' : table.number}
                </div>
                <span className="font-bold text-stone-900">{table.number === 0 ? 'Mesa do Bar' : `Mesa ${table.number}`}</span>
              </div>
              {table.status === 'billing' && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600 border border-red-200">Fechada</span>
              )}
            </button>
          ))}
          {tables.filter(t => t.status !== 'free').length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <Calculator size={64} className="mb-4 opacity-20" />
              <p className="text-center font-medium">Nenhuma mesa ocupada no momento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Order Details */}
      <div className={`${!selectedTable ? 'hidden md:flex' : 'flex'} flex-1 flex-col p-4 md:p-8 overflow-y-auto bg-stone-50/50`}>
        {currentTable && currentOrder ? (
          <div className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-6 md:p-10 shadow-sm border border-stone-200">
            <div className="mb-8 flex items-center justify-between">
              <button onClick={() => setSelectedTable(null)} className="text-stone-500 hover:text-stone-800 font-medium md:hidden flex items-center gap-2 transition-colors">
                ← Voltar
              </button>
              <div className="flex gap-3 ml-auto">
                {currentTable.status === 'billing' && (
                  <button 
                    onClick={handleReopenTable}
                    className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                  >
                    Reabrir Mesa
                  </button>
                )}
                <button 
                  onClick={handleFreeTable}
                  className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-200 border border-stone-200 transition-colors"
                >
                  Liberar Mesa
                </button>
              </div>
            </div>
            <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between border-b border-stone-100 pb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold font-heading tracking-tight text-stone-900 mb-2">{currentTable.number === 0 ? 'Mesa do Bar' : `Mesa ${currentTable.number}`}</h2>
                <p className="text-sm font-medium text-stone-500 bg-stone-100 inline-block px-3 py-1 rounded-lg">Pedido #{currentOrder.id.slice(0, 8)}</p>
              </div>
              <div className="sm:text-right bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <p className="text-xs md:text-sm font-bold text-stone-500 uppercase tracking-wider mb-1">Total {selectedItems.length > 0 ? 'Selecionado' : 'da Mesa'}</p>
                <p className="text-4xl md:text-5xl font-bold font-heading text-orange-600">R$ {(selectedItems.length > 0 ? selectedTotal : currentOrder.total).toFixed(2)}</p>
                {selectedItems.length > 0 && (
                  <p className="text-sm font-medium text-stone-400 mt-2">Total Mesa: R$ {currentOrder.total.toFixed(2)}</p>
                )}
              </div>
            </div>

            <div className="mb-10 space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-lg font-bold font-heading text-stone-900">Itens Consumidos</h3>
                <button 
                  onClick={() => setSelectedItems(selectedItems.length === orderItems.length ? [] : orderItems.map(i => i.id))}
                  className="text-sm font-bold text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                >
                  {selectedItems.length === orderItems.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50/50 p-3 shadow-inner">
                {orderItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleItemSelection(item.id)}
                    className={`mb-2 flex w-full items-center justify-between rounded-xl p-4 text-sm transition-all duration-200 ${
                      selectedItems.includes(item.id) 
                        ? 'bg-orange-100 text-orange-900 border border-orange-200 shadow-sm' 
                        : 'bg-white hover:bg-stone-100 border border-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${selectedItems.includes(item.id) ? 'border-orange-600 bg-orange-600' : 'border-stone-300 bg-white'}`}>
                        {selectedItems.includes(item.id) && <CheckCircle size={16} className="text-white" />}
                      </div>
                      <span className="font-bold text-base">{item.quantity}x {item.productName}</span>
                    </div>
                    <span className="font-bold text-base">R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-10">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                <h3 className="text-lg font-bold font-heading text-stone-900">Forma de Pagamento</h3>
                <label className="flex items-center gap-3 text-sm font-bold text-stone-600 cursor-pointer bg-stone-100 px-4 py-2 rounded-xl border border-stone-200 hover:bg-stone-200 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={autoPrint} 
                    onChange={(e) => setAutoPrint(e.target.checked)}
                    className="h-5 w-5 rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                  />
                  Imprimir recibo
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {['credit', 'debit', 'pix', 'cash'].map(method => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-2xl border-2 p-4 text-base font-bold capitalize transition-all duration-200 ${
                      paymentMethod === method 
                        ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' 
                        : 'border-stone-200 text-stone-600 hover:border-orange-300 hover:bg-stone-50'
                    }`}
                  >
                    {method === 'credit' ? 'Crédito' : method === 'debit' ? 'Débito' : method === 'pix' ? 'Pix' : 'Dinheiro'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-stone-100">
              <button
                onClick={() => handlePrint(true)}
                className="flex flex-1 items-center justify-center gap-3 rounded-2xl border-2 border-stone-200 bg-white py-4 font-bold text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-all active:scale-95"
              >
                <Printer size={22} /> Pré-conta
              </button>
              <button
                onClick={handleCloseOrder}
                className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-orange-600 py-4 font-bold text-white hover:bg-orange-700 shadow-lg shadow-orange-600/20 transition-all active:scale-95"
              >
                <CheckCircle size={22} /> {selectedItems.length > 0 && selectedItems.length < orderItems.length ? 'Pagar Selecionados' : 'Finalizar Pagamento'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-stone-400">
            <Calculator size={80} className="mb-6 opacity-20" />
            <p className="text-2xl font-bold font-heading text-center text-stone-500">Selecione uma mesa para fechar a conta</p>
          </div>
        )}
      </div>
    </div>
  );
}
