export interface PrintRequest {
  pedidoId: string;
  itens: {
    nome: string;
    setor: string;
    quantidade: number;
    observacao?: string;
    preco: number;
  }[];
  imprimirCaixa: boolean;
  tipo: string;
  total: number;
  pagamento?: string;
  mesa: string;
}

export const printOrderWithFallback = async (request: PrintRequest, htmlContent: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try {
    const res = await fetch(`http://localhost:17321/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) return;
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn('Print agent offline or timeout, falling back to browser print', e);
  }
  printReceipt(htmlContent);
};

export const printReceipt = (content: string) => {
  const printerType = localStorage.getItem('printerType') || '80mm';
  
  let width = '80mm';
  let extraCss = '';
  
  if (printerType === '58mm') {
    width = '58mm';
    extraCss = 'body { font-size: 12px; padding: 5px; }';
  } else if (printerType === 'a4') {
    width = '100%';
    extraCss = 'body { font-size: 14px; max-width: 210mm; margin: 0 auto; padding: 20px; }';
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Imprimir Comanda</title>
          <style>
            body { 
              font-family: monospace; 
              color: #000; 
              margin: 0; 
              padding: 10px; 
              width: ${width};
            }
            ${extraCss}
            h1, h2, h3, p { margin: 0 0 5px 0; padding: 0; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .flex { display: flex; justify-content: space-between; }
            .border-b { border-bottom: 1px dashed #000; margin-bottom: 8px; padding-bottom: 8px; }
            .border-t { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; }
            .bold { font-weight: bold; }
            .text-lg { font-size: 1.2em; }
            .text-xl { font-size: 1.5em; }
            .mb-2 { margin-bottom: 8px; }
            @page { margin: 0; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    doc.close();
    
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  }
};
