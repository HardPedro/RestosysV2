import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Smartphone, Globe, Download, Printer, Database, Settings as SettingsIcon, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, getDoc, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { printReceipt } from '../../lib/print';

export default function Settings() {
  const { userData } = useAuth();
  const appUrl = window.location.origin;
  const waiterLoginUrl = `${appUrl}/waiter/login`;
  const customerMenuUrl = `${appUrl}/menu`;
  const [printerType, setPrinterType] = useState(() => localStorage.getItem('printerType') || '80mm');
  const [isGenerating, setIsGenerating] = useState(false);

  // Local Print Agent State
  const [agentStatus, setAgentStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [printers, setPrinters] = useState<string[]>([]);
  const [pendingJobs, setPendingJobs] = useState<any[]>([]);
  const agentUrl = 'http://localhost:17321'; // Using localhost instead of 127.0.0.1 for better browser compatibility with Mixed Content
  const [localConfig, setLocalConfig] = useState(() => {
    return {
      cozinha: { printer: '', tipo: 'termica', largura: 80 },
      bar: { printer: '', tipo: 'termica', largura: 58 },
      caixa: { printer: '', tipo: 'normal', largura: 80 }
    };
  });
  const [enableAutoPrint, setEnableAutoPrint] = useState(() => localStorage.getItem('enableAutoPrint') === 'true');

  useEffect(() => {
    // Load config from Firestore
    const loadConfig = async () => {
      try {
        const docRef = doc(db, 'settings', 'printAgent');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.config) {
            setLocalConfig(data.config);
          }
        }
      } catch (e) {
        console.error('Failed to load config from Firestore', e);
      }
    };
    loadConfig();

    checkAgentStatus();
    const interval = setInterval(checkAgentStatus, 5000);

    // Listen for pending and failed print jobs
    const q = query(collection(db, 'printJobs'), where('status', 'in', ['pending', 'failed']));
    const unsubJobs = onSnapshot(q, (snapshot) => {
      setPendingJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      clearInterval(interval);
      unsubJobs();
    };
  }, []);

  // Auto-save enableAutoPrint to localStorage (this remains local to the device)
  useEffect(() => {
    localStorage.setItem('enableAutoPrint', enableAutoPrint.toString());
  }, [enableAutoPrint]);

  const testAgentConnection = async () => {
    setAgentStatus('checking');
    try {
      const res = await fetch(`${agentUrl}/health`, { mode: 'cors' });
      if (res.ok) {
        setAgentStatus('online');
        fetchPrinters();
        toast.success('Conexão com o agente estabelecida!');
      } else {
        throw new Error('Agent returned non-ok status');
      }
    } catch (e) {
      setAgentStatus('offline');
      console.error('Agent test failed:', e);
      toast.error('Não foi possível conectar ao agente. Verifique se ele está rodando e se o navegador permite conteúdo inseguro.');
    }
  };

  const checkAgentStatus = async () => {
    try {
      const res = await fetch(`${agentUrl}/health`);
      if (res.ok) {
        if (agentStatus !== 'online') {
          setAgentStatus('online');
          fetchPrinters();
        }
      } else {
        setAgentStatus('offline');
      }
    } catch {
      setAgentStatus('offline');
    }
  };

  const fetchPrinters = async () => {
    try {
      const res = await fetch(`${agentUrl}/printers`);
      if (res.ok) {
        const data = await res.json();
        setPrinters(data);
      }
    } catch (e) {
      console.error('Failed to fetch printers', e);
    }
  };

  const saveLocalConfig = async () => {
    try {
      // 1. Save to Firestore (Database)
      await setDoc(doc(db, 'settings', 'printAgent'), {
        config: localConfig,
        updatedAt: new Date().toISOString()
      });

      toast.success('Configuração salva no Banco de Dados!');
    } catch (e) {
      console.error('Save error:', e);
      toast.error('Erro ao salvar. Verifique sua conexão.');
    }
  };

  const handlePrinterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setPrinterType(val);
    localStorage.setItem('printerType', val);
    toast.success('Configuração de impressora salva neste dispositivo!');
  };

  const handleAutoPrintToggle = (enabled: boolean) => {
    setEnableAutoPrint(enabled);
    toast.success(enabled ? 'Impressão automática ativada neste dispositivo!' : 'Impressão automática desativada.');
    // Force reload to restart PrintJobListener with new setting
    setTimeout(() => window.location.reload(), 1000);
  };

  const generateTestData = async () => {
    setIsGenerating(true);
    toast.info('Gerando dados de teste...');
    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      let products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      if (products.length === 0) {
        const p1 = await addDoc(collection(db, 'products'), { name: 'Hambúrguer Artesanal', price: 35.90, category: 'food', description: 'Pão, carne 180g, queijo' });
        const p2 = await addDoc(collection(db, 'products'), { name: 'Coca-Cola Lata', price: 6.00, category: 'drink', description: '350ml' });
        const p3 = await addDoc(collection(db, 'products'), { name: 'Batata Frita', price: 22.00, category: 'food', description: 'Porção 400g' });
        products = [
          { id: p1.id, name: 'Hambúrguer Artesanal', price: 35.90, category: 'food' },
          { id: p2.id, name: 'Coca-Cola Lata', price: 6.00, category: 'drink' },
          { id: p3.id, name: 'Batata Frita', price: 22.00, category: 'food' }
        ];
      }

      const tablesSnap = await getDocs(collection(db, 'tables'));
      let tables = tablesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const today = new Date();
      const paymentMethods = ['credit', 'debit', 'pix', 'cash'];
      
      for (let i = 0; i < 8; i++) {
        const table = tables[Math.floor(Math.random() * tables.length)];
        const orderDate = new Date(today);
        orderDate.setHours(today.getHours() - Math.floor(Math.random() * 8) - 1);
        
        let orderTotal = 0;
        const itemsToCreate = [];
        
        const numItems = Math.floor(Math.random() * 4) + 2;
        for (let j = 0; j < numItems; j++) {
          const product = products[Math.floor(Math.random() * products.length)];
          const quantity = Math.floor(Math.random() * 3) + 1;
          orderTotal += product.price * quantity;
          
          itemsToCreate.push({
            productName: product.name,
            price: product.price,
            quantity,
            type: product.category,
            status: 'ready',
            tableNumber: table?.number || 1,
            createdAt: orderDate.toISOString()
          });
        }

        const orderRef = await addDoc(collection(db, 'orders'), {
          tableId: table?.id || 'unknown',
          status: 'closed',
          total: orderTotal,
          createdAt: orderDate.toISOString(),
          closedAt: new Date(orderDate.getTime() + 60*60*1000).toISOString()
        });

        for (const item of itemsToCreate) {
          await addDoc(collection(db, 'orderItems'), {
            ...item,
            orderId: orderRef.id
          });
        }

        await addDoc(collection(db, 'transactions'), {
          type: 'receivable',
          amount: orderTotal,
          description: `Venda Mesa ${table?.number || 1}`,
          status: 'paid',
          dueDate: orderDate.toISOString(),
          paidDate: new Date(orderDate.getTime() + 60*60*1000).toISOString(),
          category: 'sales',
          orderId: orderRef.id,
          paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
          createdAt: new Date(orderDate.getTime() + 60*60*1000).toISOString()
        });
      }

      if (tables.length > 0) {
        const activeTable = tables[0];
        const activeOrderRef = await addDoc(collection(db, 'orders'), {
          tableId: activeTable.id,
          status: 'open',
          total: products[0].price * 2,
          createdAt: new Date().toISOString()
        });
        
        await addDoc(collection(db, 'orderItems'), {
          orderId: activeOrderRef.id,
          productName: products[0].name,
          price: products[0].price,
          quantity: 2,
          type: products[0].category,
          status: 'pending',
          tableNumber: activeTable.number,
          createdAt: new Date().toISOString()
        });

        await updateDoc(doc(db, 'tables', activeTable.id), {
          status: 'occupied',
          currentOrderId: activeOrderRef.id
        });
      }

      toast.success('Dados de teste gerados com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar dados de teste');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualPrint = (job: any) => {
    // Generate HTML content for manual print
    const content = `
      <div style="font-family: monospace; width: 80mm; padding: 5px;">
        <h2 style="text-align: center;">${job.tipo.toUpperCase()}</h2>
        <p>Mesa: ${job.mesa}</p>
        <p>Pedido: ${job.pedidoId}</p>
        <hr/>
        <table style="width: 100%;">
          ${job.itens.map((i: any) => `
            <tr>
              <td>${i.quantidade}x ${i.nome}</td>
              <td style="text-align: right;">R$ ${(i.preco * i.quantidade || 0).toFixed(2)}</td>
            </tr>
            ${i.observacao ? `<tr><td colspan="2" style="font-size: 0.8em;">Obs: ${i.observacao}</td></tr>` : ''}
          `).join('')}
        </table>
        ${job.total > 0 ? `
          <hr/>
          <p style="text-align: right; font-weight: bold;">Total: R$ ${job.total.toFixed(2)}</p>
        ` : ''}
        <p style="text-align: center; font-size: 0.8em; margin-top: 20px;">
          ${new Date().toLocaleString()}
        </p>
      </div>
    `;
    printReceipt(content);
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await deleteDoc(doc(db, 'printJobs', jobId));
      toast.success('Trabalho removido da fila.');
    } catch (e) {
      toast.error('Erro ao remover trabalho.');
    }
  };

  const downloadQR = (id: string, filename: string) => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${filename}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="mb-8 text-2xl md:text-3xl font-bold font-heading tracking-tight text-stone-900">Configurações</h1>

      <div className="grid gap-6 md:gap-8 grid-cols-1 lg:grid-cols-2">
        {/* Waiter QR Code */}
        <div className="rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 border border-orange-100">
              <Smartphone size={24} className="md:w-7 md:h-7" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-heading text-stone-900">Acesso Garçom</h2>
              <p className="text-sm text-stone-500">QR Code para os garçons conectarem seus celulares</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl bg-stone-50 p-6 md:p-8 border border-stone-100">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-200">
              <QRCodeSVG id="waiter-qr" value={waiterLoginUrl} size={180} level="H" includeMargin />
            </div>
            <p className="mt-5 text-center text-sm font-bold text-stone-700">
              Aponte a câmera para conectar
            </p>
            <code className="mt-3 w-full break-all rounded-lg bg-stone-200/50 px-3 py-2 text-center text-xs font-mono text-stone-700 border border-stone-200">
              {waiterLoginUrl}
            </code>
            <button
              onClick={() => downloadQR('waiter-qr', 'qr-acesso-garcom')}
              className="mt-5 flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95"
            >
              <Download size={18} /> Baixar QR Code
            </button>
          </div>
        </div>

        {/* Customer Menu QR Code */}
        <div className="rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
              <Globe size={24} className="md:w-7 md:h-7" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-heading text-stone-900">Cardápio Digital</h2>
              <p className="text-sm text-stone-500">QR Code único para visualização dos clientes</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl bg-stone-50 p-6 md:p-8 border border-stone-100">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-200">
              <QRCodeSVG id="menu-qr" value={customerMenuUrl} size={180} level="H" includeMargin />
            </div>
            <p className="mt-5 text-center text-sm font-bold text-stone-700">
              Disponibilize nas mesas
            </p>
            <code className="mt-3 w-full break-all rounded-lg bg-stone-200/50 px-3 py-2 text-center text-xs font-mono text-stone-700 border border-stone-200">
              {customerMenuUrl}
            </code>
            <button
              onClick={() => downloadQR('menu-qr', 'qr-cardapio-geral')}
              className="mt-5 flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all active:scale-95"
            >
              <Download size={18} /> Baixar QR Code
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <SettingsIcon size={24} className="md:w-7 md:h-7" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-heading text-stone-900">Agente de Impressão Local</h2>
              <p className="text-sm text-stone-500">Impressão silenciosa para Cozinha, Bar e Caixa</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer bg-stone-100 px-4 py-2 rounded-xl border border-stone-200 hover:bg-stone-200 transition-colors">
              <input 
                type="checkbox" 
                checked={enableAutoPrint}
                onChange={(e) => handleAutoPrintToggle(e.target.checked)}
                className="h-5 w-5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-bold text-stone-700">Ativar Impressão Automática</span>
            </label>
            <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-200">
              {agentStatus === 'checking' && <span className="text-sm font-bold text-stone-500">Verificando...</span>}
              {agentStatus === 'online' && <span className="flex items-center gap-1.5 text-sm font-bold text-green-600"><CheckCircle size={16} /> Online</span>}
              {agentStatus === 'offline' && <span className="flex items-center gap-1.5 text-sm font-bold text-red-600"><XCircle size={16} /> Offline</span>}
            </div>
          </div>
        </div>

        {agentStatus === 'offline' && (
          <div className="mb-6 rounded-2xl bg-orange-50 p-6 border border-orange-200">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600 shrink-0">
                <XCircle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-orange-900 mb-1">Agente Offline ou Bloqueado</h3>
                <p className="text-sm font-medium text-orange-800 mb-4 leading-relaxed">
                  O agente local não está rodando ou o navegador está bloqueando a conexão segura (Mixed Content). 
                  Como o sistema web roda em HTTPS e o agente em HTTP (localhost), você precisa autorizar a conexão.
                </p>
                
                <div className="bg-white/50 rounded-xl p-4 mb-4 border border-orange-200/50">
                  <p className="text-xs font-bold text-orange-900 uppercase tracking-wider mb-2">Como Corrigir:</p>
                  <ol className="list-decimal ml-4 space-y-1 text-sm text-orange-800">
                    <li>Baixe os dois arquivos abaixo (Agente e Iniciador) e coloque-os na mesma pasta.</li>
                    <li>Certifique-se de ter o <a href="https://nodejs.org/" target="_blank" rel="noreferrer" className="underline font-bold">Node.js instalado</a> no seu computador.</li>
                    <li>Dê um duplo clique no arquivo <strong>iniciar-impressora.bat</strong> (uma janela preta deve abrir).</li>
                    <li>Se o navegador bloquear a conexão, clique no botão "Abrir URL do Agente" abaixo e permita o acesso.</li>
                    <li>Recarregue esta página.</li>
                  </ol>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={testAgentConnection}
                    className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700 shadow-md shadow-orange-600/20 transition-all active:scale-95"
                  >
                    Tentar Novamente
                  </button>
                  <button 
                    onClick={() => window.open(`${agentUrl}/health`, '_blank')}
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-stone-600 border border-stone-200 hover:bg-stone-50 transition-all active:scale-95"
                  >
                    Abrir URL do Agente (Autorizar)
                  </button>
                  <a 
                    href="/print-agent.js" 
                    download
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-orange-600 border border-orange-200 hover:bg-orange-50 transition-all active:scale-95"
                  >
                    <Download size={18} /> Baixar Agente (.js)
                  </a>
                  <a 
                    href="/iniciar-impressora.bat" 
                    download
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-orange-600 border border-orange-200 hover:bg-orange-50 transition-all active:scale-95"
                  >
                    <Download size={18} /> Baixar Iniciador (.bat)
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {agentStatus === 'online' && (
          <div className="grid gap-6 md:grid-cols-3">
            {['cozinha', 'bar', 'caixa'].map((setor) => (
              <div key={setor} className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <h3 className="mb-4 font-bold font-heading text-lg capitalize text-stone-900">{setor}</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-700 uppercase tracking-wider">Impressora</label>
                    <select
                      value={localConfig[setor as keyof typeof localConfig].printer}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, [setor]: { ...prev[setor as keyof typeof localConfig], printer: e.target.value } }))}
                      className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    >
                      <option value="">Selecione...</option>
                      {printers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-700 uppercase tracking-wider">Tipo</label>
                    <select
                      value={localConfig[setor as keyof typeof localConfig].tipo}
                      onChange={(e) => setLocalConfig(prev => ({ ...prev, [setor]: { ...prev[setor as keyof typeof localConfig], tipo: e.target.value } }))}
                      className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    >
                      <option value="termica">Térmica</option>
                      <option value="normal">Normal (A4)</option>
                    </select>
                  </div>

                  {localConfig[setor as keyof typeof localConfig].tipo === 'termica' && (
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-stone-700 uppercase tracking-wider">Largura (mm)</label>
                      <select
                        value={localConfig[setor as keyof typeof localConfig].largura}
                        onChange={(e) => setLocalConfig(prev => ({ ...prev, [setor]: { ...prev[setor as keyof typeof localConfig], largura: Number(e.target.value) } }))}
                        className="w-full rounded-xl border border-stone-200 bg-white p-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      >
                        <option value={80}>80mm</option>
                        <option value={58}>58mm</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {agentStatus === 'online' && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={saveLocalConfig}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 font-bold text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
            >
              Salvar Configurações do Agente
            </button>
          </div>
        )}

        {/* Print Queue Section */}
        <div className="mt-10 border-t border-stone-200 pt-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold font-heading text-stone-900">Fila de Impressão</h3>
              <p className="text-sm text-stone-500">Pedidos aguardando o agente ficar online</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 font-bold text-sm">
              {pendingJobs.length}
            </div>
          </div>

          {pendingJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center">
              <Printer size={32} className="mx-auto mb-3 text-stone-300" />
              <p className="text-sm font-medium text-stone-400">Nenhum pedido na fila de espera.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 font-bold">
                      {job.mesa}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-stone-900">Pedido #{job.pedidoId?.slice(-6)}</p>
                      <p className="text-xs text-stone-500 capitalize">{job.tipo} • {job.itens?.length} itens</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === 'pending' ? (
                      <>
                        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-orange-500"></span>
                        <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Aguardando Agente</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={14} className="text-red-500" />
                        <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Erro na Impressão</span>
                      </>
                    )}
                    <div className="flex items-center gap-1 ml-4 border-l border-stone-200 pl-4">
                      <button
                        onClick={() => handleManualPrint(job)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Imprimir via Navegador"
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover da Fila"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 border border-stone-200">
            <Printer size={24} className="md:w-7 md:h-7" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-heading text-stone-900">Impressão do Navegador (Fallback)</h2>
            <p className="text-sm text-stone-500">Usado caso o Agente Local não esteja disponível</p>
          </div>
        </div>

        
        <div className="max-w-md">
          <label className="mb-2 block text-sm font-bold text-stone-700">Tamanho da Impressora</label>
          <select 
            value={printerType}
            onChange={handlePrinterChange}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-900 outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition-all"
          >
            <option value="80mm">Bobina Térmica 80mm (Padrão)</option>
            <option value="58mm">Bobina Térmica 58mm (Pequena)</option>
            <option value="a4">Folha A4 (Impressora Comum)</option>
          </select>
          <p className="mt-3 text-xs font-medium text-stone-500">
            Esta configuração afeta apenas as impressões feitas a partir deste navegador.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 md:p-8 shadow-sm">
        <h2 className="mb-5 text-xl md:text-2xl font-bold font-heading text-stone-900">Segurança e Regras</h2>
        <div className="space-y-3 text-sm font-medium text-stone-600 bg-stone-50 p-5 rounded-2xl border border-stone-100">
          <p className="flex items-start gap-2"><span className="text-orange-600 mt-0.5">•</span> Cada garçom deve utilizar seu próprio PIN de acesso.</p>
          <p className="flex items-start gap-2"><span className="text-orange-600 mt-0.5">•</span> O sistema previne que duas ordens sejam abertas para a mesma mesa simultaneamente.</p>
          <p className="flex items-start gap-2"><span className="text-orange-600 mt-0.5">•</span> Itens enviados para a cozinha/bar não podem ser excluídos sem autorização do gerente.</p>
        </div>
      </div>

      {userData?.email === 'hardsoldisk001@gmail.com' && (
        <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 md:p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 border border-red-200">
              <Database size={24} className="md:w-7 md:h-7" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-heading text-red-900">Área do Desenvolvedor</h2>
              <p className="text-sm font-medium text-red-700">Visível apenas para {userData.email}</p>
            </div>
          </div>
          
          <p className="mb-6 text-sm font-medium text-red-800 bg-red-100/50 p-4 rounded-xl border border-red-100">
            Utilize esta opção para popular o banco de dados com informações sintéticas (pedidos, vendas, itens pendentes) para testar o Dashboard e os fluxos do sistema.
          </p>
          
          <button
            onClick={generateTestData}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-bold text-white transition-all hover:bg-red-700 disabled:opacity-50 shadow-md shadow-red-600/20 active:scale-95"
          >
            <Database size={20} />
            {isGenerating ? 'Gerando dados...' : 'Gerar Dados Sintéticos'}
          </button>
        </div>
      )}
    </div>
  );
}
