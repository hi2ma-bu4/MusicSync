$shell = New-Object -ComObject Shell.Application
$phone = $shell.NameSpace(17).Items() | Where-Object { $_.Name -eq $phoneName } | Select-Object -First 1
if (-not $phone) {
    $phone = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like "*$phoneName*" } | Select-Object -First 1
}
if ($phone) { "CONNECTED" } else { "NOT_CONNECTED" }
