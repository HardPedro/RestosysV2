import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Key, Smartphone, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function WaiterLogin() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;

    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'waiter'), where('pin', '==', pin));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const waiterData = { id: doc.id, ...(doc.data() as any) };
        localStorage.setItem('waiter_session', JSON.stringify(waiterData));
        toast.success(`Bem-vindo, ${waiterData.name}!`);
        navigate('/waiter');
      } else {
        toast.error('PIN incorreto ou garçom não encontrado');
        setPin('');
      }
    } catch (error) {
      toast.error('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (digit: string) => {
    if (pin.length < 6) setPin(prev => prev + digit);
  };

  const removeDigit = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-100 p-6 font-sans">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-xl border border-stone-200">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
            <Smartphone size={40} />
          </div>
          <h1 className="text-3xl font-bold font-heading tracking-tight text-stone-900">Acesso Garçom</h1>
          <p className="text-stone-500 font-medium mt-2">Digite seu PIN para continuar</p>
        </div>

        <div className="mb-10 flex justify-center gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-all duration-300 ${
                pin.length > i ? 'border-orange-600 bg-orange-600 scale-110' : 'border-stone-200 bg-transparent'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
            <button
              key={digit}
              onClick={() => addDigit(digit)}
              className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-2xl font-bold font-heading text-stone-700 hover:bg-stone-100 hover:shadow-sm border border-stone-100 transition-all active:scale-95"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={removeDigit}
            className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-lg font-bold text-stone-500 hover:bg-stone-100 hover:shadow-sm border border-stone-100 transition-all active:scale-95"
          >
            Limpar
          </button>
          <button
            onClick={() => addDigit('0')}
            className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-2xl font-bold font-heading text-stone-700 hover:bg-stone-100 hover:shadow-sm border border-stone-100 transition-all active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleLogin}
            disabled={pin.length < 4 || loading}
            className="flex h-16 items-center justify-center rounded-2xl bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            <ArrowRight size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
