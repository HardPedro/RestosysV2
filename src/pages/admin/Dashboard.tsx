import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { DollarSign, Users, Utensils, ShoppingCart, TrendingUp, CreditCard, PieChart, Activity } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    activeTables: 0,
    ordersToday: 0,
    closedOrders: 0,
    pendingItems: 0,
    averageTicket: 0,
  });
  const [tables, setTables] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, number>>({
    credit: 0, debit: 0, pix: 0, cash: 0
  });

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    
    // Listen to orders
    const qOrders = query(collection(db, 'orders'), where('createdAt', '>=', todayISO));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      let sales = 0;
      let count = 0;
      let closedCount = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'closed') {
          sales += data.total || 0;
          closedCount++;
        }
        count++;
      });
      setStats(s => ({ 
        ...s, 
        totalSales: sales, 
        ordersToday: count,
        closedOrders: closedCount,
        averageTicket: closedCount > 0 ? sales / closedCount : 0
      }));
    });

    // Listen to tables
    const unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      let active = 0;
      const tbs: any[] = [];
      snapshot.forEach(doc => {
        tbs.push({ id: doc.id, ...doc.data() });
        if (doc.data().status !== 'free') active++;
      });
      setTables(tbs.sort((a,b) => a.number - b.number));
      setStats(s => ({ ...s, activeTables: active }));
    });

    // Listen to pending items & Top Products
    const qItems = query(collection(db, 'orderItems'), where('createdAt', '>=', todayISO));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      let pending = 0;
      const productCounts: Record<string, { name: string, quantity: number, revenue: number }> = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'pending' || data.status === 'preparing') {
          pending++;
        }
        
        if (data.productName) {
          if (!productCounts[data.productName]) {
            productCounts[data.productName] = { name: data.productName, quantity: 0, revenue: 0 };
          }
          productCounts[data.productName].quantity += data.quantity || 1;
          productCounts[data.productName].revenue += (data.price || 0) * (data.quantity || 1);
        }
      });

      const top = Object.values(productCounts)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      setTopProducts(top);
      setStats(s => ({ ...s, pendingItems: pending }));
    });

    // Listen to transactions for payment methods
    const qTrans = query(collection(db, 'transactions'), where('createdAt', '>=', todayISO));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const methods = { credit: 0, debit: 0, pix: 0, cash: 0 };
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.type === 'receivable' && data.status === 'paid' && data.paymentMethod) {
          methods[data.paymentMethod as keyof typeof methods] += data.amount || 0;
        }
      });
      setPaymentMethods(methods);
    });

    return () => {
      unsubOrders();
      unsubTables();
      unsubItems();
      unsubTrans();
    };
  }, []);

  const cards = [
    { title: 'Vendas Hoje', value: `R$ ${stats.totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
    { title: 'Ticket Médio', value: `R$ ${stats.averageTicket.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Pedidos Hoje', value: stats.ordersToday, icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-100' },
    { title: 'Itens Pendentes', value: stats.pendingItems, icon: Utensils, color: 'text-orange-600', bg: 'bg-orange-100' },
  ];

  const tableStatusCount = {
    free: tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    billing: tables.filter(t => t.status === 'billing').length,
  };

  const paymentMethodNames: Record<string, string> = {
    credit: 'Crédito', debit: 'Débito', pix: 'Pix', cash: 'Dinheiro'
  };
  const paymentMethodColors: Record<string, string> = {
    credit: 'bg-blue-500', debit: 'bg-indigo-500', pix: 'bg-teal-500', cash: 'bg-green-500'
  };

  const totalPayments = (Object.values(paymentMethods) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="mb-6 md:mb-8 text-3xl md:text-4xl font-bold font-heading tracking-tight text-stone-900">Dashboard</h1>
      
      <div className="mb-8 grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-5 md:p-6 shadow-sm border border-stone-200 transition-transform hover:-translate-y-1 hover:shadow-md">
            <div className={`flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-xl ${card.bg} ${card.color}`}>
              <card.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">{card.title}</p>
              <p className="text-2xl md:text-3xl font-bold font-heading text-stone-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Top Products */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm flex flex-col h-full">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Activity size={20} />
            </div>
            <h2 className="text-xl font-bold font-heading text-stone-900">Mais Vendidos Hoje</h2>
          </div>
          <div className="space-y-4 flex-1">
            {topProducts.length > 0 ? topProducts.map((product, i) => (
              <div key={i} className="flex items-center justify-between border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-sm font-bold text-stone-600">{i + 1}</span>
                  <div>
                    <p className="font-bold text-stone-900">{product.name}</p>
                    <p className="text-xs text-stone-500">{product.quantity} unidades vendidas</p>
                  </div>
                </div>
                <span className="font-bold text-stone-900 text-sm md:text-base">R$ {product.revenue.toFixed(2)}</span>
              </div>
            )) : (
              <p className="text-center text-sm text-stone-500 py-4">Nenhuma venda registrada hoje.</p>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm flex flex-col h-full">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">
              <CreditCard size={20} />
            </div>
            <h2 className="text-xl font-bold font-heading text-stone-900">Formas de Pagamento</h2>
          </div>
          <div className="space-y-6 flex-1">
            {totalPayments > 0 ? (Object.entries(paymentMethods) as [string, number][]).map(([method, amount]) => {
              if (amount === 0) return null;
              const percentage = ((amount / totalPayments) * 100).toFixed(1);
              return (
                <div key={method}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-bold text-stone-700">{paymentMethodNames[method]}</span>
                    <span className="font-bold text-stone-900">R$ {amount.toFixed(2)} <span className="text-stone-400 font-normal">({percentage}%)</span></span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div 
                      className={`h-full ${paymentMethodColors[method]} rounded-full`} 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            }) : (
              <p className="text-center text-sm text-stone-500 py-4">Nenhum pagamento recebido hoje.</p>
            )}
          </div>
        </div>

        {/* Table Status */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm flex flex-col h-full">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <PieChart size={20} />
            </div>
            <h2 className="text-xl font-bold font-heading text-stone-900">Status das Mesas</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4 flex-1 content-start">
            <div className="rounded-2xl bg-stone-50 p-4 text-center border border-stone-100">
              <p className="text-xs md:text-sm font-medium text-stone-500 mb-1">Total de Mesas</p>
              <p className="text-3xl md:text-4xl font-bold font-heading text-stone-900">{tables.length}</p>
            </div>
            <div className="rounded-2xl bg-green-50 p-4 text-center border border-green-100">
              <p className="text-xs md:text-sm font-medium text-green-600 mb-1">Livres</p>
              <p className="text-3xl md:text-4xl font-bold font-heading text-green-700">{tableStatusCount.free}</p>
            </div>
            <div className="rounded-2xl bg-orange-50 p-4 text-center border border-orange-100">
              <p className="text-xs md:text-sm font-medium text-orange-600 mb-1">Ocupadas</p>
              <p className="text-3xl md:text-4xl font-bold font-heading text-orange-700">{tableStatusCount.occupied}</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 text-center border border-red-100">
              <p className="text-xs md:text-sm font-medium text-red-600 mb-1">Fechando</p>
              <p className="text-3xl md:text-4xl font-bold font-heading text-red-700">{tableStatusCount.billing}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
