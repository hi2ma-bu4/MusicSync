$shell = New-Object -ComObject Shell.Application
$drives = $shell.NameSpace(17)
if (-not $drives) {
    Write-Output "JSON_RESULTS_START"
    Write-Output "[]"
    Write-Output "JSON_RESULTS_END"
    exit 0
}

$phoneItem = $drives.Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phoneItem) {
    $phoneItem = $drives.Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}

if (-not $phoneItem) {
    Write-Output "JSON_RESULTS_START"
    Write-Output "[]"
    Write-Output "JSON_RESULTS_END"
    exit 0
}

$targetItem = Get-MtpFolderItem $phoneItem $subPath
if (-not $targetItem) {
    [Console]::Error.WriteLine("[findMusicFiles] Subpath '$subPath' not found on device.")
    Write-Output "JSON_RESULTS_START"
    Write-Output "[]"
    Write-Output "JSON_RESULTS_END"
    exit 0
}

$global:scannedCount = 0
function Scan-Folder($folderItem, $relPath) {
    $folder = $folderItem.GetFolder
    if (-not $folder) { return }
    foreach ($item in $folder.Items()) {
        $name = $item.Name
        $subRelPath = if ($relPath -eq "") { $name } else { "$relPath/$name" }

        if ($item.IsFolder) {
            Scan-Folder $item $subRelPath
        }
        else {
            $ext = ""
            if ($name -match '\.([a-zA-Z0-9]+)$') {
                $ext = "." + $Matches[1].ToLower()
            }
            if ($ext -in ".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".wma") {
                $global:scannedCount++
                if ($global:scannedCount % 5 -eq 0) {
                    Write-Output "PROGRESS_UPDATE:  r  t @ C    X L      ... (${global:scannedCount}  )"
                }
                # Retrieve size using ExtendedProperty (System.Size) first (precise & fast)
                $rawSize = $item.ExtendedProperty("System.Size")
                if ($null -eq $rawSize) { $rawSize = $item.ExtendedProperty("Size") }
                if ($null -eq $rawSize) { $rawSize = $item.Size }

                $size = 0
                if ($null -ne $rawSize -and $rawSize -ne "") {
                    try { $size = [int64]$rawSize } catch {}
                }

                # Fallback to GetDetailsOf only if size is 0 and we couldn't get it via ExtendedProperty
                if ($size -eq 0) {
                    $sizeStr = $folder.GetDetailsOf($item, 2)
                    if ($sizeStr -and $sizeStr -match '([\d\.,\s]+)\s*(KB|MB|GB|B|\x83o\x83C\x83g)?') {
                        $val = [double]($Matches[1].Replace(",", "").Replace(" ", ""))
                        $unit = $Matches[2]
                        if ($unit -eq "KB") { $size = [int64]($val * 1024) }
                        elseif ($unit -eq "MB") { $size = [int64]($val * 1024 * 1024) }
                        elseif ($unit -eq "GB") { $size = [int64]($val * 1024 * 1024 * 1024) }
                        else { $size = [int64]$val }
                    }
                }

                # Retrieve modification date using ExtendedProperty (System.DateModified) first (precise & fast)
                $mtimeMs = 0
                $rawDate = $item.ExtendedProperty("System.DateModified")
                if ($rawDate) {
                    try {
                        $date = Get-Date $rawDate
                        $mtimeMs = [System.DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
                    }
                    catch {
                        Write-Warning "Failed to parse System.DateModified '$rawDate' for $name : $_"
                    }
                }

                # Fallback to GetDetailsOf only if ExtendedProperty failed
                if ($mtimeMs -eq 0) {
                    $dateStr = $folder.GetDetailsOf($item, 3)
                    if ($dateStr) {
                        try {
                            $date = Get-Date $dateStr
                            $mtimeMs = [System.DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
                        }
                        catch {
                            Write-Warning "Failed to parse date string '$dateStr' for $name : $_"
                        }
                    }
                }

                # Second fallback to ModifyDate if mtimeMs is still 0 (discard if it is the 1899-12-30 placeholder date)
                if ($mtimeMs -eq 0 -and $item.ModifyDate) {
                    try {
                        $date = Get-Date $item.ModifyDate
                        $chkYear = $date.Year
                        if ($chkYear -gt 1900) {
                            $mtimeMs = [System.DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
                        }
                    }
                    catch {
                        Write-Warning "Failed to parse direct ModifyDate for $name : $_"
                    }
                }
                [PSCustomObject]@{
                    relativePath = $subRelPath
                    size         = $size
                    mtimeMs      = $mtimeMs
                }
            }
        }
    }
}

$results = Scan-Folder $targetItem ""
if ($null -eq $results) {
    Write-Output "JSON_RESULTS_START"
    Write-Output "[]"
    Write-Output "JSON_RESULTS_END"
}
else {
    Write-Output "JSON_RESULTS_START"
    $arr = @($results)
    if ($arr.Count -eq 1) {
        "[" + ($arr[0] | ConvertTo-Json -Compress) + "]"
    }
    else {
        $arr | ConvertTo-Json -Compress
    }
    Write-Output "JSON_RESULTS_END"
}
