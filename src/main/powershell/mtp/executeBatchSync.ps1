$ops = $params.operations

$shell = New-Object -ComObject Shell.Application
$phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if (-not $phoneItem) {
    throw "Phone not found: $phoneName"
}

$consecutiveFailures = 0
$failedTrackIds = @()
$total = $ops.Count
$completed = 0

foreach ($op in $ops) {
    $completed++
    $type = $op.type
    $trackId = $op.trackId
    $success = $false
    $errorMsg = ""

    try {
        if ($type -eq "delete") {
            $remoteDest = $op.remoteDest
            Write-Output "PROGRESS_UPDATE:STATUS:削除中 ($completed/$total): $remoteDest"

            $relPathInsideSub = $remoteDest
            if ($relPathInsideSub -match "^$subPath/(.*)$") {
                $relPathInsideSub = $Matches[1]
            }
            $fullPath = "$subPath/$relPathInsideSub"
            $fileItem = Get-MtpFolderItem $phoneItem $fullPath
            if ($fileItem) {
                $tempDir = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName())
                $null = New-Item -ItemType Directory -Path $tempDir -Force

                $tempFolder = $shell.NameSpace($tempDir)
                $tempFolder.MoveHere($fileItem, 16 + 1024)

                for ($i = 0; $i -lt 50; $i++) {
                    if ((Get-ChildItem -Path $tempDir).Count -gt 0) { break }
                    Start-Sleep -Milliseconds 50
                }
                Remove-Item $tempDir -Recurse -Force
            }
            $success = $true
        }
        elseif ($type -eq "move") {
            $oldRemoteSrc = $op.oldRemoteSrc
            $remoteDest = $op.remoteDest
            Write-Output "PROGRESS_UPDATE:STATUS:配置整理中 ($completed/$total): $oldRemoteSrc"

            $oldRelPath = $oldRemoteSrc
            if ($oldRelPath -match "^$subPath/(.*)$") { $oldRelPath = $Matches[1] }
            $newRelPath = $remoteDest
            if ($newRelPath -match "^$subPath/(.*)$") { $newRelPath = $Matches[1] }

            $newRelDir = Split-Path $newRelPath
            $newRelDir = $newRelDir.Replace("\", "/")
            if ($newRelDir -eq ".") { $newRelDir = "" }
            $newFileName = Split-Path $newRelPath -Leaf
            $oldFileName = Split-Path $oldRelPath -Leaf

            $fullOldPath = "$subPath/$oldRelPath"
            $fileItem = Get-MtpFolderItem $phoneItem $fullOldPath
            if (-not $fileItem) {
                throw "Source file not found: $fullOldPath"
            }

            $fullNewDir = if ($newRelDir -eq "" -or $newRelDir -eq ".") { $subPath } else { "$subPath/$newRelDir" }
            $destFolderItem = Get-MtpFolderItem $phoneItem $fullNewDir
            if (-not $destFolderItem) {
                $destFolderItem = Ensure-MtpDirectory $phoneItem $fullNewDir
            }

            if ($destFolderItem.Path -ne $fileItem.Parent.Path) {
                $destFolderItem.GetFolder.MoveHere($fileItem, 16)
                Start-Sleep -Milliseconds 150
                $fileItem = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $oldFileName } | Select-Object -First 1
            }

            if ($fileItem -and $oldFileName -ne $newFileName) {
                $fileItem.Name = $newFileName
                Start-Sleep -Milliseconds 100
            }
            $success = $true
        }
        elseif ($type -eq "copy") {
            $localSrc = $op.localSrc
            $remoteDest = $op.remoteDest
            Write-Output "PROGRESS_UPDATE:STATUS:コピー中 ($completed/$total): $remoteDest"

            $relPath = $remoteDest
            if ($relPath -match "^$subPath/(.*)$") { $relPath = $Matches[1] }
            $relativeDestDir = Split-Path $relPath
            $relativeDestDir = $relativeDestDir.Replace("\", "/")
            $destDirInSub = if ($relativeDestDir -eq "." -or $relativeDestDir -eq "") { "" } else { $relativeDestDir }

            $fullPath = if ($destDirInSub -eq "" -or $destDirInSub -eq ".") { $subPath } else { "$subPath/$destDirInSub" }
            $destFolderItem = Get-MtpFolderItem $phoneItem $fullPath
            if (-not $destFolderItem) {
                $destFolderItem = Ensure-MtpDirectory $phoneItem $fullPath
            }

            $destFolder = $destFolderItem.GetFolder
            $destFolder.CopyHere($localSrc, 16)

            $fileName = [System.IO.Path]::GetFileName($localSrc)
            $pollSuccess = $false

            for ($i = 0; $i -lt 50; $i++) {
                $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
                if (-not $phoneItem) {
                    $phoneItem = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
                }
                $destFolderItem = Get-MtpFolderItem $phoneItem $fullPath

                if ($destFolderItem) {
                    $item = $destFolderItem.GetFolder.Items() | Where-Object { $_.Name -eq $fileName } | Select-Object -First 1
                    if ($item) {
                        Start-Sleep -Milliseconds 250
                        $pollSuccess = $true
                        break
                    }
                }
                Start-Sleep -Milliseconds 100
            }

            if ($pollSuccess) {
                $success = $true
            }
            else {
                throw "Copy failed or verification timed out for: $fileName"
            }
        }
    }
    catch {
        $errorMsg = $_.ToString()
        $success = $false
    }

    if ($success) {
        $consecutiveFailures = 0
        Write-Output "PROGRESS_UPDATE:SUCCESS_OP:${trackId}"
    }
    else {
        $consecutiveFailures++
        $failedTrackIds += $trackId
        Write-Output "PROGRESS_UPDATE:FAILED_OP:${trackId}:${errorMsg}"

        if ($consecutiveFailures -ge 3) {
            Write-Output "PROGRESS_UPDATE:CONSECUTIVE_FAILURES:$consecutiveFailures"
            # Wait for Node.js reply on stdin
            $reply = [Console]::In.ReadLine()
            if ($reply -eq "ABORT") {
                Write-Output "PROGRESS_UPDATE:STATUS:ユーザーにより中断されました。"
                break
            }
            else {
                $consecutiveFailures = 0
            }
        }
    }
}

Write-Output "JSON_RESULTS_START"
if ($failedTrackIds.Count -eq 0) {
    "[]"
}
elseif ($failedTrackIds.Count -eq 1) {
    "[" + ($failedTrackIds[0] | ConvertTo-Json -Compress) + "]"
}
else {
    $failedTrackIds | ConvertTo-Json -Compress
}
Write-Output "JSON_RESULTS_END"
