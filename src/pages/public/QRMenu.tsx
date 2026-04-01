import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Utensils, Wine, Info } from 'lucide-react';

export default function QRMenu() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-600 border-t-transparent"></div>
      </div>
    );
  }

  const categories = ['food', 'drink'];

  return (
    <div className="min-h-screen bg-stone-100 pb-12 font-sans">
      {/* Header */}
      <div className="bg-stone-950 px-6 py-16 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-orange-600/10"></div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold font-heading tracking-tight">Nosso Cardápio</h1>
          <p className="mt-3 text-stone-400 font-medium text-lg">Sinta-se em casa e aproveite!</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4 -mt-6 relative z-20">
        {categories.map(cat => (
          <div key={cat} className="mb-10">
            <div className="mb-6 flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                {cat === 'food' ? <Utensils size={24} /> : <Wine size={24} />}
              </div>
              <h2 className="text-2xl font-bold font-heading capitalize text-stone-900">
                {cat === 'food' ? 'Comidas' : 'Bebidas'}
              </h2>
            </div>
            
            <div className="grid gap-4">
              {products
                .filter(p => p.category === cat)
                .map(product => (
                  <div key={product.id} className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm border border-stone-200 transition-transform active:scale-[0.98]">
                    <div className="flex-1 pr-4">
                      <h3 className="text-lg font-bold font-heading text-stone-900">{product.name}</h3>
                      <p className="mt-1 text-sm text-stone-500 line-clamp-2">{product.description}</p>
                      <p className="mt-3 text-xl font-bold font-heading text-orange-600">
                        R$ {product.price.toFixed(2)}
                      </p>
                    </div>
                    {/* Placeholder for image if needed */}
                    <div className="ml-2 h-24 w-24 flex-shrink-0 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-300">
                      <Info size={28} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 px-6 text-center text-stone-400">
        <p className="text-xs font-bold uppercase tracking-widest">© 2026 RestoSys</p>
      </div>
    </div>
  );
}
