$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) { exit 0 }

$fullPath = "$subPath/$relativePath"
$fileItem = Get-MtpFolderItem $phoneItem $fullPath
if ($fileItem) {
    $tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
    $null = New-Item -ItemType Directory -Path $tempDir -Force

    $tempFolder = $shell.NameSpace($tempDir)
    $tempFolder.MoveHere($fileItem, 16 + 1024)

    for ($i = 0; $i -lt 50; $i++) {
        if ((Get-ChildItem -Path $tempDir).Count -gt 0) { break }
        Start-Sleep -Milliseconds 100
    }

    Remove-Item $tempDir -Recurse -Force
}
"SUCCESS"
