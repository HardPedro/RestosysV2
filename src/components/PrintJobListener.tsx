import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export default function PrintJobListener() {
  const { userData } = useAuth();
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const processedJobs = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Only run this listener on the Cashier/Admin PC and if auto-print is enabled
    const isAutoPrintEnabled = localStorage.getItem('enableAutoPrint') === 'true';
    if (!userData || (userData.role !== 'admin' && userData.role !== 'cashier' && userData.role !== 'manager') || !isAutoPrintEnabled) return;

    // Health check for the agent
    const checkAgent = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const res = await fetch('http://localhost:17321/health', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          if (!isAgentOnline) {
            setIsAgentOnline(true);
            // When agent comes online, try to process all pending jobs
            await processPendingJobs();
          }
        } else {
          if (isAgentOnline) setIsAgentOnline(false);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (isAgentOnline) setIsAgentOnline(false);
      }
    };

    const processPendingJobs = async () => {
      const q = query(collection(db, 'printJobs'), where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      for (const document of snapshot.docs) {
        if (!processedJobs.current.has(document.id)) {
          await printJob(document.id, document.data());
        }
      }
    };

    const sendRawPrint = async (printerName: string, text: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('http://localhost:17321/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName, text }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(await res.text());
    };

    const formatSectorTicket = (sectorName: string, items: any[], job: any) => {
      let text = `--- ${sectorName} ---\r\n`;
      text += `Data: ${new Date().toLocaleString('pt-BR')}\r\n`;
      text += `Mesa: ${job.mesa}\r\n`;
      text += `Pedido: #${job.pedidoId}\r\n\r\n`;
      text += `Qtd  Item\r\n`;
      text += `------------------------------\r\n`;
      items.forEach(item => {
        text += `${item.quantidade}x   ${item.nome}\r\n`;
        if (item.observacao) text += `     OBS: ${item.observacao}\r\n`;
      });
      text += `\r\n--- FIM ---\r\n\r\n\r\n\r\n\r\n\r\n`;
      return text;
    };

    const formatReceiptTicket = (job: any) => {
      let text = `RESTAURANTE EXPRESS\r\n`;
      text += `${job.tipo === 'preconta' ? 'Conferencia de Mesa' : 'Cupom Nao Fiscal'}\r\n`;
      text += `${new Date().toLocaleString('pt-BR')}\r\n`;
      text += `Mesa: ${job.mesa}\r\n`;
      text += `Pedido: #${job.pedidoId}\r\n\r\n`;
      if (job.itens) {
        job.itens.forEach((item: any) => {
          text += `${item.quantidade}x ${item.nome.padEnd(15).substring(0,15)} R$ ${(item.preco * item.quantidade).toFixed(2)}\r\n`;
        });
      }
      text += `------------------------------\r\n`;
      text += `TOTAL: R$ ${job.total.toFixed(2)}\r\n\r\n`;
      if (job.pagamento) text += `Pagamento: ${job.pagamento}\r\n\r\n`;
      text += `Obrigado pela preferencia!\r\n\r\n\r\n\r\n\r\n\r\n`;
      return text;
    };

    const printJob = async (jobId: string, job: any) => {
      if (processedJobs.current.has(jobId)) return;
      
      // Mark as processed immediately to avoid double prints from concurrent calls
      processedJobs.current.add(jobId);

      try {
        const docRef = doc(db, 'settings', 'printAgent');
        const docSnap = await getDoc(docRef);
        const config = docSnap.exists() ? docSnap.data().config : null;

        if (!config) throw new Error("Configuração de impressora não encontrada no banco");

        let hasPrintedSomething = false;

        const kitchenItems = (job.itens || []).filter((i: any) => ['kitchen', 'cozinha', 'food'].includes(i.setor));
        if (kitchenItems.length > 0 && config.cozinha?.printer) {
          await sendRawPrint(config.cozinha.printer, formatSectorTicket('COZINHA', kitchenItems, job));
          hasPrintedSomething = true;
        }

        const barItems = (job.itens || []).filter((i: any) => ['bar', 'drink'].includes(i.setor));
        if (barItems.length > 0 && config.bar?.printer) {
          await sendRawPrint(config.bar.printer, formatSectorTicket('BAR', barItems, job));
          hasPrintedSomething = true;
        }

        if (job.imprimirCaixa && config.caixa?.printer) {
          await sendRawPrint(config.caixa.printer, formatReceiptTicket(job));
          hasPrintedSomething = true;
        }

        // Even if nothing was printed (e.g., no printer configured for the sector), mark as completed
        // so it doesn't stay in the queue forever.
        await updateDoc(doc(db, 'printJobs', jobId), { 
          status: 'completed', 
          printedAt: new Date().toISOString(),
          agentProcessed: true 
        });
        
        if (hasPrintedSomething) {
          toast.success(`Pedido da Mesa ${job.mesa} impresso com sucesso!`);
        }
      } catch (e: any) {
        processedJobs.current.delete(jobId); // Allow retry on network error
        console.error(`Error printing job ${jobId}`, e);
        await updateDoc(doc(db, 'printJobs', jobId), { status: 'failed', error: e.message });
      }
    };

    const interval = setInterval(checkAgent, 5000);
    checkAgent();

    const q = query(collection(db, 'printJobs'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snapshot) => {
      // On initial load, we don't want to process everything via snapshot 
      // because processPendingJobs handles the initial batch when agent comes online
      if (isInitialLoad.current) {
        snapshot.docs.forEach(doc => processedJobs.current.add(doc.id));
        isInitialLoad.current = false;
        return;
      }

      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' && isAgentOnline) {
          await printJob(change.doc.id, change.doc.data());
        }
      });
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [userData, isAgentOnline]);

  return null;
}
