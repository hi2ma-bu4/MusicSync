$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) { exit 0 }

$targetRootItem = Get-MtpFolderItem $phoneItem $subPath
if (-not $targetRootItem) { exit 0 }

function Clean-EmptyMtpFolders($folderItem) {
    $folder = $folderItem.GetFolder
    if (-not $folder) { return }

    foreach ($item in $folder.Items()) {
        if ($item.GetFolder) {
            Clean-EmptyMtpFolders $item
        }
    }

    if ($folderItem.Path -ne $targetRootItem.Path) {
        if ($folder.Items().Count -eq 0) {
            $tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
            $null = New-Item -ItemType Directory -Path $tempDir -Force
            $shell.NameSpace($tempDir).MoveHere($folderItem, 16 + 1024)
            Start-Sleep -Milliseconds 150
            Remove-Item $tempDir -Recurse -Force
        }
    }
}

Clean-EmptyMtpFolders $targetRootItem
"SUCCESS"
