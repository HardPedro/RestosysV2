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
$logFile = Join-Path $PWD "print_agent_logs.txt"

function Write-Log {
    param([string]$message, [string]$level="INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$level] $message"
    
    if ($level -eq "ERROR") { Write-Host $logMessage -ForegroundColor Red }
    elseif ($level -eq "SUCCESS") { Write-Host $logMessage -ForegroundColor Green }
    elseif ($level -eq "WARN") { Write-Host $logMessage -ForegroundColor Yellow }
    else { Write-Host $logMessage -ForegroundColor Cyan }
    
    try { Add-Content -Path $logFile -Value $logMessage -ErrorAction SilentlyContinue } catch {}
}

Write-Log "Iniciando Agente de Impressao..." "INFO"

$prefixes = @("http://localhost:$port/", "http://127.0.0.1:$port/")
$listener = New-Object System.Net.HttpListener
foreach ($prefix in $prefixes) { 
    try {
        $listener.Prefixes.Add($prefix) 
    } catch {}
}

try {
    $listener.Start()
    Write-Log "Servidor rodando na porta $port!" "SUCCESS"
    Write-Log "Logs estao sendo salvos em: $logFile" "INFO"
    Write-Log "Aguardando comandos de impressao..." "INFO"
} catch {
    Write-Log "Nao foi possivel iniciar o servidor. Erro: $_" "ERROR"
    Write-Log "Tente clicar com o botao direito e 'Executar como Administrador'." "WARN"
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
        Write-Log "Requisicao para listar impressoras recebida." "INFO"
        try {
            $printers = Get-WmiObject -Query "SELECT Name FROM Win32_Printer" | Select-Object -ExpandProperty Name
            $json = "[" + (($printers | ForEach-Object { "`"$_`"" }) -join ",") + "]"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.StatusCode = 200
            Write-Log "Lista de impressoras enviada com sucesso." "SUCCESS"
        } catch {
            Write-Log "Erro ao listar impressoras: $_" "ERROR"
            $response.StatusCode = 500
        }
    }
    elseif ($request.HttpMethod -eq "POST" -and $request.Url.AbsolutePath -eq "/print") {
        $reader = New-Object System.IO.StreamReader($request.InputStream)
        $body = $reader.ReadToEnd()
        
        try {
            $data = $body | ConvertFrom-Json
            $printerName = $data.printerName
            $text = $data.text

            if ($printerName -and $text) {
                $textLength = $text.Length
                Write-Log "Recebido pedido de impressao. Impressora: '$printerName' | Tamanho: $textLength caracteres." "INFO"
                
                $tempFile = [System.IO.Path]::GetTempFileName()
                [System.IO.File]::WriteAllText($tempFile, $text, [System.Text.Encoding]::UTF8)
                
                try {
                    Get-Content $tempFile | Out-Printer -Name $printerName
                    Write-Log "Comando enviado com sucesso para a impressora '$printerName'." "SUCCESS"
                    
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"status":"queued"}')
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.StatusCode = 200
                } catch {
                    Write-Log "Falha ao executar Out-Printer na impressora '$printerName'. Erro: $_" "ERROR"
                    $errorMsg = $_.Exception.Message
                    
                    # Escape quotes for JSON
                    $errorMsg = $errorMsg -replace '"', '\"'
                    
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes("{`"error`":`"$errorMsg`"}")
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.StatusCode = 500
                }
                
                Start-Sleep -Seconds 2
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            } else {
                Write-Log "Pedido de impressao invalido (faltando printerName ou text)." "WARN"
                $response.StatusCode = 400
            }
        } catch {
            Write-Log "Erro critico ao processar o payload de impressao: $_" "ERROR"
            $response.StatusCode = 400
        }
    }
    else {
        $response.StatusCode = 404
    }
    $response.OutputStream.Close()
}
