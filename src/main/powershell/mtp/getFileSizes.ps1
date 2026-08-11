$relativePaths = $params.relativePaths

$shell = New-Object -ComObject Shell.Application
$drives = $shell.NameSpace(17)
$phoneItem = $null
if ($drives) {
    $driveItems = $drives.Items()
    foreach ($item in $driveItems) {
        if ($item.Name -eq $phoneName) {
            $phoneItem = $item
            break
        }
    }
    if (-not $phoneItem) {
        foreach ($item in $driveItems) {
            if ($item.Name -like "*$phoneName*") {
                $phoneItem = $item
                break
            }
        }
    }
}

if (-not $phoneItem) {
    Write-Output "JSON_RESULTS_START"
    Write-Output "{}"
    Write-Output "JSON_RESULTS_END"
    exit 0
}

# Group paths by parent folder
$grouped = @{}
foreach ($rel in $relativePaths) {
    $normalized = $rel.Replace("\", "/")
    $segments = $normalized -split "/"
    if ($segments.Count -le 1) {
        $parent = ""
        $file = $normalized
    }
    else {
        $parent = ($segments[0..($segments.Count - 2)] -join "/")
        $file = $segments[-1]
    }
    if (-not $grouped.ContainsKey($parent)) {
        $grouped[$parent] = @()
    }
    $grouped[$parent] += $file
}

$results = @{}
foreach ($parent in $grouped.Keys) {
    $fullParentPath = if ($parent -eq "") { $subPath } else { "$subPath/$parent" }
    $folderItem = Get-MtpFolderItem $phoneItem $fullParentPath
    if ($folderItem) {
        $folder = $folderItem.GetFolder
        if ($folder) {
            $files = $grouped[$parent]
            foreach ($item in $folder.Items()) {
                if ($item.Name -in $files) {
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
                    $fullRelPath = if ($parent -eq "") { $item.Name } else { "$parent/" + $item.Name }
                    $results[$fullRelPath] = $size
                }
            }
        }
    }
}

Write-Output "JSON_RESULTS_START"
$results | ConvertTo-Json -Compress
Write-Output "JSON_RESULTS_END"
