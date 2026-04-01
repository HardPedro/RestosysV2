const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 17321;
const CONFIG_FILE = path.join(process.cwd(), 'config.json');

let config = {
  cozinha: { printer: '', tipo: 'termica', largura: 80 },
  bar: { printer: '', tipo: 'termica', largura: 58 },
  caixa: { printer: '', tipo: 'normal', largura: 80 }
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.error('Erro ao ler config.json');
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'online' }));
  } else if (req.method === 'GET' && req.url === '/printers') {
    exec('powershell -Command "Get-WmiObject -Query \\"SELECT Name FROM Win32_Printer\\" | Select-Object -ExpandProperty Name"', (error, stdout) => {
      if (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to list printers' }));
        return;
      }
      const printers = stdout.split('\n').map(p => p.trim()).filter(p => p);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(printers));
    });
  } else if (req.method === 'POST' && req.url === '/config') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        config = JSON.parse(body);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const reqData = JSON.parse(body);
        processPrintRequest(reqData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued' }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================`);
  console.log(` AGENTE DE IMPRESSAO LOCAL INICIADO NA PORTA ${PORT}`);
  console.log(`================================================`);
  console.log(` Mantenha esta janela aberta para imprimir.`);
  console.log(` O sistema web se conectara automaticamente.`);
  console.log(` Para dispositivos móveis, use o IP deste computador.`);
});

function processPrintRequest(req) {
  const kitchenItems = (req.itens || []).filter(i => i.setor === 'kitchen' || i.setor === 'cozinha');
  const barItems = (req.itens || []).filter(i => i.setor === 'bar');

  if (kitchenItems.length > 0 && config.cozinha && config.cozinha.printer) {
    printSector('COZINHA', kitchenItems, config.cozinha, req);
  }

  if (barItems.length > 0 && config.bar && config.bar.printer) {
    printSector('BAR', barItems, config.bar, req);
  }

  if (req.imprimirCaixa && config.caixa && config.caixa.printer) {
    printReceipt(req, config.caixa);
  }
}

function printSector(sectorName, items, pConfig, req) {
  let text = `--- ${sectorName} ---\r\n`;
  text += `Data: ${new Date().toLocaleString('pt-BR')}\r\n`;
  text += `Mesa: ${req.mesa}\r\n`;
  text += `Pedido: #${req.pedidoId}\r\n\r\n`;
  text += `Qtd  Item\r\n`;
  text += `------------------------------\r\n`;

  items.forEach(item => {
    text += `${item.quantidade}x   ${item.nome}\r\n`;
    if (item.observacao) {
      text += `     OBS: ${item.observacao}\r\n`;
    }
  });

  text += `\r\n--- FIM ---\r\n\r\n\r\n\r\n\r\n\r\n`; // Extra newlines for thermal cut

  sendToPrinter(text, pConfig.printer);
}

function printReceipt(req, pConfig) {
  let text = `RESTAURANTE EXPRESS\r\n`;
  text += `${req.tipo === 'preconta' ? 'Conferencia de Mesa' : 'Cupom Nao Fiscal'}\r\n`;
  text += `${new Date().toLocaleString('pt-BR')}\r\n`;
  text += `Mesa: ${req.mesa}\r\n`;
  text += `Pedido: #${req.pedidoId}\r\n\r\n`;

  if (req.itens) {
    req.itens.forEach(item => {
      text += `${item.quantidade}x ${item.nome.padEnd(15).substring(0,15)} R$ ${(item.preco * item.quantidade).toFixed(2)}\r\n`;
    });
  }

  text += `------------------------------\r\n`;
  text += `TOTAL: R$ ${req.total.toFixed(2)}\r\n\r\n`;

  if (req.pagamento) {
    text += `Pagamento: ${req.pagamento}\r\n\r\n`;
  }

  text += `Obrigado pela preferencia!\r\n\r\n\r\n\r\n\r\n\r\n`;

  sendToPrinter(text, pConfig.printer);
}

function sendToPrinter(text, printerName) {
  const tempFile = path.join(process.cwd(), `print_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, text, 'utf8');
  
  // Use PowerShell to print the text file to the specific printer
  const psCommand = `Get-Content '${tempFile}' | Out-Printer -Name '${printerName}'`;
  exec(`powershell -Command "${psCommand}"`, (error) => {
    if (error) {
      console.error(`Erro ao imprimir na impressora ${printerName}:`, error);
    } else {
      console.log(`Impresso com sucesso na impressora ${printerName}`);
    }
    // Cleanup temp file
    setTimeout(() => {
      try { fs.unlinkSync(tempFile); } catch(e) {}
    }, 5000);
  });
}
