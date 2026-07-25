$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) { throw "Phone not found" }

$fullOldPath = "$subPath/$relativePath"
$fileItem = Get-MtpFolderItem $phoneItem $fullOldPath
if (-not $fileItem) { throw "Source file not found: $fullOldPath" }

$fullNewDir = if ($tempFilePath -eq "" -or $tempFilePath -eq ".") { $subPath } else { "$subPath/$tempFilePath" }
$destFolderItem = Get-MtpFolderItem $phoneItem $fullNewDir
if (-not $destFolderItem) {
    $destFolderItem = Ensure-MtpDirectory $phoneItem $fullNewDir
}

if ($destFolderItem.Path -ne $fileItem.Parent.Path) {
    $destFolderItem.GetFolder.MoveHere($fileItem, 16)
    Start-Sleep -Milliseconds 250
    $fileItem = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $oldRelativePath } | Select-Object -First 1
}

if ($fileItem -and $oldRelativePath -ne $newRelativePath) {
    $fileItem.Name = $newRelativePath
    Start-Sleep -Milliseconds 150
}

"SUCCESS"
