$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) { exit 1 }

$fullPath = "$subPath/$relativePath"
$fileItem = Get-MtpFolderItem $phoneItem $fullPath
if (-not $fileItem) {
    [Console]::Error.WriteLine("[getTrackMetadata] File not found: " + $fullPath)
    exit 1
}

$localFolder = $shell.NameSpace($tempFilePath)
# 16: Respond with "Yes to All" to any dialogs, 1024: Disable dialog UI completely
$localFolder.CopyHere($fileItem, 16 + 1024)

$tempCreatedFile = [System.IO.Path]::Combine($tempFilePath, $fileItem.Name)
$success = $false
for ($i = 0; $i -lt 100; $i++) {
    if (Test-Path -LiteralPath $tempCreatedFile) {
        # Short delay to ensure Windows is done writing to disk
        Start-Sleep -Milliseconds 150
        $success = $true
        break
    }
    Start-Sleep -Milliseconds 100
}

if ($success) {
    "SUCCESS"
}
else {
    "FAILED"
}
