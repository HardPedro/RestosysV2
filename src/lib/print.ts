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
  let fontSize = '14px';
  let extraCss = '';
  
  if (printerType === '58mm') {
    width = '58mm';
    fontSize = '12px';
    extraCss = 'body { padding: 2px; }';
  } else if (printerType === 'a4') {
    width = '100%';
    fontSize = '16px';
    extraCss = 'body { max-width: 210mm; margin: 0 auto; padding: 20px; }';
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
            @page { 
              margin: 0; 
              size: ${width} auto;
            }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              color: #000; 
              margin: 0; 
              padding: 5px; 
              width: ${width};
              font-size: ${fontSize};
              line-height: 1.3;
              -webkit-print-color-adjust: exact;
            }
            ${extraCss}
            h1, h2, h3, p { margin: 0 0 5px 0; padding: 0; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .flex { display: flex; justify-content: space-between; align-items: flex-start; }
            .border-b { border-bottom: 1px dashed #000; margin-bottom: 8px; padding-bottom: 8px; }
            .border-t { border-top: 1px dashed #000; margin-top: 8px; padding-top: 8px; }
            .bold { font-weight: bold; }
            .text-lg { font-size: 1.2em; }
            .text-xl { font-size: 1.4em; }
            .mb-1 { margin-bottom: 4px; }
            .mb-2 { margin-bottom: 8px; }
            .w-full { width: 100%; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            td { vertical-align: top; padding: 2px 0; }
            .qty { width: 30px; font-weight: bold; }
            .price { text-align: right; width: 80px; }
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
