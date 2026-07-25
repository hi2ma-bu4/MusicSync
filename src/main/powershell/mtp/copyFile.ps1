$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) { throw "Phone not found" }

$fullPath = if ($relativePath -eq "" -or $relativePath -eq ".") { $subPath } else { "$subPath/$relativePath" }
$destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
if (-not $destFolderItem) {
    $destFolderItem = Ensure-MtpDirectory $phoneItem $fullPath
}

$destFolder = $destFolderItem.GetFolder
$destFolder.CopyHere($localSrc, 16)

$fileName = [System.IO.Path]::GetFileName($localSrc)
$success = $false

# Poll with refreshing and re-querying the target folder
for ($i = 0; $i -lt 50; $i++) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
    if (-not $phoneItem) {
        $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
    }
    $destFolderItem = Get-MtpFolderItem $phoneItem $fullPath

    if ($destFolderItem) {
        $item = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $fileName } | Select-Object -First 1
        if ($item) {
            Start-Sleep -Milliseconds 500
            $success = $true
            break
        }
    }
    Start-Sleep -Milliseconds 200
}

if ($success) { "SUCCESS" } else { "FAILED" }
