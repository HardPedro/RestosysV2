import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, getDocs, runTransaction, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Minus, ShoppingBag, ArrowLeft, CheckCircle, Clock, Utensils, Wine, LogOut, Printer } from 'lucide-react';
import { printReceipt, printOrderWithFallback } from '../../lib/print';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function WaiterApp() {
  const { userData: authUser } = useAuth();
  const navigate = useNavigate();
  const [waiterSession, setWaiterSession] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [currentOrder, setCurrentOrder] = useState<any | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [cart, setCart] = useState<{product: any, quantity: number, notes: string}[]>([]);
  const [view, setView] = useState<'tables' | 'menu' | 'cart' | 'order'>('tables');

  useEffect(() => {
    const session = localStorage.getItem('waiter_session');
    if (session) {
      setWaiterSession(JSON.parse(session));
    } else if (!authUser) {
      navigate('/waiter/login');
    }
  }, [authUser, navigate]);

  const userData = waiterSession || authUser;

  const handleLogout = () => {
    localStorage.removeItem('waiter_session');
    navigate('/waiter/login');
  };

  useEffect(() => {
    // Listen to tables
    const unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).sort((a: any, b: any) => a.number - b.number));
    });

    // Listen to products
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubTables();
      unsubProducts();
    };
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
    }
  }, [currentOrderId]);

  // Create tables if none exist (just for demo/setup)
  const setupTables = async () => {
    for (let i = 0; i <= 10; i++) {
      await addDoc(collection(db, 'tables'), { number: i, status: 'free' });
    }
    toast.success('Mesas geradas!');
  };

  const handleTableClick = (table: any) => {
    setSelectedTable(table);
    setView('order');
  };

  const addToCart = (product: any) => {
    if (currentTable?.status === 'billing') {
      toast.error('Mesa em fechamento. Não é possível adicionar itens.');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1, notes: '' }];
    });
    toast.success(`${product.name} adicionado`);
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    if (currentTable?.status === 'billing') return;
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const sendOrder = async () => {
    if (cart.length === 0 || !currentTable || !userData) return;
    if (currentTable.status === 'billing') {
      toast.error('Mesa em fechamento. Não é possível lançar pedidos.');
      return;
    }

    let finalOrderId = currentOrderId;
    try {
      // Pre-fetch recipes for composite products outside the transaction
      const compositeItems = cart.filter(item => item.product.isComposite);
      const recipesMap = new Map();
      for (const item of compositeItems) {
        const recipesQuery = query(collection(db, 'recipes'), where('productId', '==', item.product.id));
        const recipesSnap = await getDocs(recipesQuery);
        if (!recipesSnap.empty) {
          recipesMap.set(item.product.id, recipesSnap.docs[0].data());
        }
      }

      await runTransaction(db, async (transaction) => {
        // --- READ PHASE ---
        const tableRef = doc(db, 'tables', currentTable.id);
        const tableSnap = await transaction.get(tableRef);
        if (!tableSnap.exists()) throw new Error("Mesa não encontrada");
        
        const tableData = tableSnap.data();
        
        if (tableData.status === 'billing') {
          throw new Error("Mesa em fechamento. Não é possível lançar pedidos.");
        }

        let orderId = tableData.currentOrderId;
        finalOrderId = orderId;

        let orderSnap = null;
        if (orderId) {
          const orderRef = doc(db, 'orders', orderId);
          orderSnap = await transaction.get(orderRef);
        }

        // Read all products and ingredients needed for stock deduction
        const productSnaps = new Map();
        for (const item of cart) {
          if (!item.product.isComposite) {
            const productRef = doc(db, 'products', item.product.id);
            if (!productSnaps.has(item.product.id)) {
              productSnaps.set(item.product.id, await transaction.get(productRef));
            }
          } else {
            const recipe = recipesMap.get(item.product.id);
            if (recipe) {
              for (const ingredient of recipe.ingredients) {
                const ingRef = doc(db, 'products', ingredient.ingredientId);
                if (!productSnaps.has(ingredient.ingredientId)) {
                  productSnaps.set(ingredient.ingredientId, await transaction.get(ingRef));
                }
              }
            }
          }
        }

        // --- WRITE PHASE ---
        let totalAddition = 0;

        if (!orderId) {
          // Create new order
          const newOrderRef = doc(collection(db, 'orders'));
          finalOrderId = newOrderRef.id;
          transaction.set(newOrderRef, {
            tableId: currentTable.id,
            tableNumber: currentTable.number,
            waiterId: userData.uid || userData.id,
            waiterName: userData.name,
            status: 'open',
            total: 0,
            createdAt: new Date().toISOString()
          });
          
          transaction.update(tableRef, {
            status: 'occupied',
            currentOrderId: finalOrderId
          });
        }

        for (const item of cart) {
          // Add Order Items
          const itemRef = doc(collection(db, 'orderItems'));
          transaction.set(itemRef, {
            orderId: finalOrderId,
            tableId: currentTable.id,
            tableNumber: currentTable.number,
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
            status: 'pending',
            type: item.product.category === 'drink' ? 'drink' : 'food',
            notes: item.notes,
            createdAt: new Date().toISOString()
          });
          totalAddition += item.product.price * item.quantity;

          // Stock Deduction
          if (!item.product.isComposite) {
            const pSnap = productSnaps.get(item.product.id);
            if (pSnap && pSnap.exists()) {
              const currentStock = pSnap.data().stock || 0;
              transaction.update(pSnap.ref, { stock: currentStock - item.quantity });
              
              const movementRef = doc(collection(db, 'stockMovements'));
              transaction.set(movementRef, {
                productId: item.product.id,
                productName: item.product.name,
                type: 'out',
                quantity: item.quantity,
                reason: 'sale',
                date: new Date().toISOString(),
                orderId: finalOrderId
              });
            }
          } else {
            const recipe = recipesMap.get(item.product.id);
            if (recipe) {
              for (const ingredient of recipe.ingredients) {
                const ingSnap = productSnaps.get(ingredient.ingredientId);
                if (ingSnap && ingSnap.exists()) {
                  const currentIngStock = ingSnap.data().stock || 0;
                  const deduction = ingredient.quantity * item.quantity;
                  transaction.update(ingSnap.ref, { stock: currentIngStock - deduction });

                  const movementRef = doc(collection(db, 'stockMovements'));
                  transaction.set(movementRef, {
                    productId: ingredient.ingredientId,
                    productName: ingredient.name,
                    type: 'out',
                    quantity: deduction,
                    reason: 'sale',
                    date: new Date().toISOString(),
                    orderId: finalOrderId,
                    parentProductId: item.product.id
                  });
                }
              }
            }
          }
        }

        // Update Order Total
        if (orderId && orderSnap && orderSnap.exists()) {
          const currentTotal = orderSnap.data().total || 0;
          transaction.update(orderSnap.ref, { total: currentTotal + totalAddition });
        } else if (!orderId) {
          // We just created it, we can update the total since we have the ref
          const newOrderRef = doc(db, 'orders', finalOrderId!);
          transaction.update(newOrderRef, { total: totalAddition });
        }
      });

      const printReq = {
        pedidoId: finalOrderId?.slice(0, 8) || 'NOVO',
        itens: cart.map(i => ({
          nome: i.product.name,
          setor: i.product.category,
          quantidade: i.quantity,
          preco: i.product.price,
          observacao: i.notes
        })),
        imprimirCaixa: false,
        tipo: 'comanda',
        total: 0,
        mesa: currentTable.number === 0 ? 'BAR' : currentTable.number.toString()
      };

      // Send to printJobs collection so the PC can pick it up and print locally
      await addDoc(collection(db, 'printJobs'), {
        ...printReq,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setCart([]);
      setView('order');
      toast.success('Pedido enviado para preparo!');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao enviar pedido');
    }
  };

  const handlePrint = () => {
    if (!currentOrder || !currentTable) return;
    
    const itemsHtml = orderItems.map(item => `
      <div class="flex mb-2">
        <span>${item.quantity}x ${item.productName}</span>
        <span>R$ ${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    const content = `
      <div class="text-center border-b">
        <h2>RESTAURANTE EXPRESS</h2>
        <p>Conferência de Mesa</p>
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
        <span>TOTAL PARCIAL</span>
        <span>R$ ${currentOrder.total.toFixed(2)}</span>
      </div>
      <div class="text-center">
        <p>Solicite o fechamento no caixa</p>
        <p>Obrigado pela preferência!</p>
      </div>
    `;

    const printReq = {
      pedidoId: currentOrder.id.slice(0, 8),
      itens: orderItems.map(i => ({
        nome: i.productName,
        setor: i.type,
        quantidade: i.quantity,
        preco: i.price,
        observacao: i.notes
      })),
      imprimirCaixa: true,
      tipo: 'preconta',
      total: currentOrder.total,
      mesa: currentTable.number === 0 ? 'BAR' : currentTable.number.toString()
    };

    printOrderWithFallback(printReq, content);
    toast.success('Imprimindo conferência...');
  };

  const requestCheckout = async () => {
    if (!currentTable || !currentTable.currentOrderId) return;
    try {
      await updateDoc(doc(db, 'tables', currentTable.id), {
        status: 'billing'
      });
      toast.success('Fechamento solicitado ao caixa');
      setView('tables');
      setSelectedTable(null);
    } catch (error) {
      toast.error('Erro ao solicitar fechamento');
    }
  };

  if (view === 'tables') {
    return (
      <div className="p-4 pb-24 md:p-8 max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading tracking-tight text-stone-900">Mesas</h1>
            <p className="text-sm font-medium text-stone-500 mt-1">Olá, {userData?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            {tables.length === 0 && (
              <button onClick={setupTables} className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Gerar Mesas</button>
            )}
            <button onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-red-50 hover:text-red-600 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {tables.map(table => (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`flex aspect-square flex-col items-center justify-center rounded-3xl border-2 p-4 transition-all duration-200 active:scale-95 ${
                table.status === 'free' ? 'border-stone-200 bg-white text-stone-600 hover:border-orange-400 hover:shadow-md' :
                table.status === 'occupied' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' :
                'border-red-500 bg-red-50 text-red-700 shadow-sm'
              }`}
            >
              <span className="text-4xl font-bold font-heading">{table.number === 0 ? 'BAR' : table.number}</span>
              <span className="mt-3 text-xs font-bold uppercase tracking-widest opacity-80">
                {table.status === 'free' ? 'Livre' : table.status === 'occupied' ? 'Ocupada' : 'Fechando'}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'order') {
    return (
      <div className="flex h-full flex-col bg-stone-50 pb-20 md:pb-0 font-sans">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white p-4 shadow-sm z-10 sticky top-0">
          <button onClick={() => { setView('tables'); setSelectedTable(null); }} className="flex items-center gap-2 text-stone-600 font-medium hover:text-stone-900 transition-colors bg-stone-100 px-3 py-2 rounded-xl">
            <ArrowLeft size={20} /> Voltar
          </button>
          <h2 className="text-xl font-bold font-heading text-stone-900">Mesa {currentTable?.number === 0 ? 'BAR' : currentTable?.number}</h2>
          <div className="w-[88px]"></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          {orderItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-stone-400">
              <div className="h-24 w-24 bg-stone-100 rounded-full flex items-center justify-center mb-6">
                <ShoppingBag size={40} className="text-stone-300" />
              </div>
              <p className="font-medium text-stone-500">Nenhum pedido nesta mesa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderItems.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.type === 'food' ? 'bg-orange-100 text-orange-600' : 'bg-purple-100 text-purple-600'}`}>
                      {item.type === 'food' ? <Utensils size={20} /> : <Wine size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-stone-900 text-base">{item.quantity}x {item.productName}</p>
                      {item.notes && <p className="text-xs text-stone-500 mt-0.5 bg-stone-100 inline-block px-2 py-0.5 rounded-md">Obs: {item.notes}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-stone-900">R$ {(item.price * item.quantity).toFixed(2)}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded-full ${
                      item.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      item.status === 'preparing' ? 'bg-blue-100 text-blue-700' :
                      item.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {item.status === 'pending' ? 'Pendente' :
                       item.status === 'preparing' ? 'Preparando' :
                       item.status === 'ready' ? 'Pronto' : 'Entregue'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-white p-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] z-10 sticky bottom-0 md:static">
          {currentOrder && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold text-stone-500 uppercase tracking-wider">Total Parcial</span>
              <span className="text-2xl font-bold font-heading text-stone-900">R$ {currentOrder.total.toFixed(2)}</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setView('menu')}
              disabled={currentTable?.status === 'billing'}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-orange-600 py-3 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
            >
              <Plus size={20} />
              <span className="text-xs">Adicionar</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={!currentOrder}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-stone-100 py-3 font-bold text-stone-600 hover:bg-stone-200 disabled:opacity-50 transition-all active:scale-95"
            >
              <Printer size={20} />
              <span className="text-xs">Imprimir</span>
            </button>
            <button
              onClick={requestCheckout}
              disabled={!currentOrder || currentTable?.status === 'billing'}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-stone-900 py-3 font-bold text-white hover:bg-stone-800 disabled:opacity-50 transition-all active:scale-95"
            >
              <CheckCircle size={20} />
              <span className="text-xs">Fechar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'menu') {
    const categories = ['food', 'drink'];
    return (
      <div className="flex h-full flex-col bg-stone-50 pb-20 md:pb-0 font-sans">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white p-4 shadow-sm z-10 sticky top-0">
          <button onClick={() => setView('order')} className="flex items-center gap-2 text-stone-600 font-medium hover:text-stone-900 transition-colors bg-stone-100 px-3 py-2 rounded-xl">
            <ArrowLeft size={20} /> Voltar
          </button>
          <h2 className="text-xl font-bold font-heading text-stone-900">Cardápio</h2>
          <button onClick={() => setView('cart')} className="relative flex items-center p-2 text-stone-900 hover:bg-stone-100 rounded-xl transition-colors">
            <ShoppingBag size={24} />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white shadow-sm border-2 border-white">
                {cart.reduce((a,b) => a + b.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          {categories.map(cat => (
            <div key={cat} className="mb-8 last:mb-0">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold font-heading text-stone-900">
                {cat === 'food' ? <Utensils className="text-orange-600" /> : <Wine className="text-purple-600" />}
                {cat === 'food' ? 'Comidas' : 'Bebidas'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.filter(p => p.category === cat).map(product => (
                  <div key={product.id} className="flex flex-col justify-between rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
                    <div className="mb-4">
                      <h4 className="font-bold text-stone-900 text-base">{product.name}</h4>
                      <p className="text-sm text-stone-500 mt-1 line-clamp-2">{product.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-stone-50">
                      <span className="font-bold text-stone-900">R$ {product.price.toFixed(2)}</span>
                      <button
                        onClick={() => addToCart(product)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors active:scale-95"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'cart') {
    const total = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
    return (
      <div className="flex h-full flex-col bg-stone-50 pb-20 md:pb-0 font-sans">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white p-4 shadow-sm z-10 sticky top-0">
          <button onClick={() => setView('menu')} className="flex items-center gap-2 text-stone-600 font-medium hover:text-stone-900 transition-colors bg-stone-100 px-3 py-2 rounded-xl">
            <ArrowLeft size={20} /> Voltar
          </button>
          <h2 className="text-xl font-bold font-heading text-stone-900">Novo Pedido</h2>
          <div className="w-[88px]"></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-stone-400">
              <div className="h-24 w-24 bg-stone-100 rounded-full flex items-center justify-center mb-6">
                <ShoppingBag size={40} className="text-stone-300" />
              </div>
              <p className="font-medium text-stone-500">Carrinho vazio</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.product.id} className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-stone-900 text-base">{item.product.name}</p>
                    <p className="font-bold text-stone-900">R$ {(item.product.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-1 w-fit">
                      <button onClick={() => updateCartQuantity(item.product.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"><Minus size={16} /></button>
                      <span className="w-6 text-center font-bold text-stone-900">{item.quantity}</span>
                      <button onClick={() => updateCartQuantity(item.product.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"><Plus size={16} /></button>
                    </div>
                    <input
                      type="text"
                      placeholder="Observações (opcional)..."
                      value={item.notes}
                      onChange={(e) => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, notes: e.target.value } : i))}
                      className="w-full sm:w-1/2 rounded-xl border border-stone-200 p-2.5 text-sm bg-stone-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-white p-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] z-10 sticky bottom-0 md:static">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-bold text-stone-500 uppercase tracking-wider">Total</span>
            <span className="text-2xl font-bold font-heading text-stone-900">R$ {total.toFixed(2)}</span>
          </div>
          <button
            onClick={sendOrder}
            disabled={cart.length === 0}
            className="w-full rounded-2xl bg-orange-600 py-3.5 font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
          >
            Enviar para Preparo
          </button>
        </div>
      </div>
    );
  }

  return null;
}
