<# :
@echo off
title Agente de Impressao Local
echo ================================================
echo  AGENTE DE IMPRESSAO LOCAL (NATIVO WINDOWS)
echo ================================================
echo.
echo Iniciando servidor de impressao...
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content '%~f0') -join [Environment]::NewLine)"
pause
exit /b
#>

$port = 17321
$prefixes = @("http://localhost:$port/", "http://127.0.0.1:$port/")
$listener = New-Object System.Net.HttpListener
foreach ($prefix in $prefixes) { 
    try {
        $listener.Prefixes.Add($prefix) 
    } catch {}
}

try {
    $listener.Start()
    Write-Host " Servidor rodando na porta $port!" -ForegroundColor Green
    Write-Host " Pode minimizar esta janela, mas nao a feche." -ForegroundColor Yellow
    Write-Host " Aguardando comandos de impressao..." -ForegroundColor Cyan
} catch {
    Write-Host " ERRO: Nao foi possivel iniciar o servidor." -ForegroundColor Red
    Write-Host " Tente clicar com o botao direito e 'Executar como Administrador'." -ForegroundColor Yellow
    exit
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
    }
    elseif ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/health") {
        $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"status":"online"}')
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.StatusCode = 200
    }
    elseif ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/printers") {
        $printers = Get-WmiObject -Query "SELECT Name FROM Win32_Printer" | Select-Object -ExpandProperty Name
        $json = "[" + (($printers | ForEach-Object { "`"$_`"" }) -join ",") + "]"
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.StatusCode = 200
    }
    elseif ($request.HttpMethod -eq "POST" -and $request.Url.AbsolutePath -eq "/print") {
        $reader = New-Object System.IO.StreamReader($request.InputStream)
        $body = $reader.ReadToEnd()
        
        try {
            $data = $body | ConvertFrom-Json
            $printerName = $data.printerName
            $text = $data.text

            if ($printerName -and $text) {
                $tempFile = [System.IO.Path]::GetTempFileName()
                [System.IO.File]::WriteAllText($tempFile, $text, [System.Text.Encoding]::UTF8)
                
                Write-Host "Recebido pedido para: $printerName"
                Get-Content $tempFile | Out-Printer -Name $printerName
                Write-Host " -> Impresso com sucesso!" -ForegroundColor Green
                
                Start-Sleep -Seconds 2
                Remove-Item $tempFile -ErrorAction SilentlyContinue

                $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"status":"queued"}')
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.StatusCode = 200
            } else {
                $response.StatusCode = 400
            }
        } catch {
            Write-Host " -> Erro ao processar impressao: $_" -ForegroundColor Red
            $response.StatusCode = 400
        }
    }
    else {
        $response.StatusCode = 404
    }
    $response.OutputStream.Close()
}
