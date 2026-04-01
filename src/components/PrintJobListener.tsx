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
            // When agent comes online, sync config and try to process all pending jobs
            await syncConfig();
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

    const syncConfig = async () => {
      try {
        const docRef = doc(db, 'settings', 'printAgent');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.config) {
            await fetch('http://localhost:17321/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data.config)
            });
            console.log('Config synced to local agent');
          }
        }
      } catch (e) {
        console.error('Failed to sync config to agent from Firestore', e);
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

    const printJob = async (jobId: string, job: any) => {
      if (processedJobs.current.has(jobId)) return;
      
      // Mark as processed immediately to avoid double prints from concurrent calls
      processedJobs.current.add(jobId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s for printing

      try {
        const res = await fetch('http://localhost:17321/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          await updateDoc(doc(db, 'printJobs', jobId), { 
            status: 'completed', 
            printedAt: new Date().toISOString(),
            agentProcessed: true 
          });
          toast.success(`Pedido da Mesa ${job.mesa} impresso com sucesso!`);
        } else {
          const errorText = await res.text();
          console.error(`Failed to print job ${jobId}: ${errorText}`);
          processedJobs.current.delete(jobId); // Allow retry if it failed at the agent level
          
          if (res.status >= 400 && res.status < 500) {
            await updateDoc(doc(db, 'printJobs', jobId), { status: 'failed', error: errorText });
          }
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        processedJobs.current.delete(jobId); // Allow retry on network error
        console.error(`Error printing job ${jobId}`, e);
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
