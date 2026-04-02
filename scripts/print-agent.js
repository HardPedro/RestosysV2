const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 17321;

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
  } else if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { printerName, text } = JSON.parse(body);
        if (!printerName || !text) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing printerName or text' }));
          return;
        }
        sendToPrinter(text, printerName);
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
  console.log(` O agente agora e apenas um canal de comunicacao.`);
  console.log(` O sistema web formata e envia os comandos diretos.`);
});

function sendToPrinter(text, printerName) {
  const tempFile = path.join(process.cwd(), `print_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, text, 'utf8');
  
  setTimeout(() => {
    try { fs.unlinkSync(tempFile); } catch(e) {}
  }, 10000);

  const psCommand = `Get-Content '${tempFile}' | Out-Printer -Name '${printerName}'`;
  exec(`powershell -Command "${psCommand}"`, (error) => {
    if (error) {
      console.error(`Erro ao imprimir na impressora ${printerName}:`, error);
    } else {
      console.log(`Impresso com sucesso na impressora ${printerName}`);
    }
  });
}
