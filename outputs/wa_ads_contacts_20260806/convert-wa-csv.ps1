$ErrorActionPreference = 'Stop'

$sourcePath = 'C:\Users\MASTER PC\Downloads\restrosuite\nagpur_restaurant_cafe_bakery_leads_full.xlsx'
$csvPath = Join-Path $PSScriptRoot 'nagpur_restaurant_cafe_bakery_leads_full_WA_ready.csv'
$extractPath = Join-Path $PSScriptRoot '_xlsx_extract'

function Normalize-Phone([object]$value) {
    if ($null -eq $value) { return $null }
    $digits = ([string]$value) -replace '[^0-9]', ''
    if ($digits.StartsWith('00')) { $digits = $digits.Substring(2) }
    if ($digits.Length -eq 11 -and $digits.StartsWith('0')) { $digits = $digits.Substring(1) }
    if ($digits.Length -eq 10) { $digits = '91' + $digits }
    if ($digits.Length -lt 11 -or $digits.Length -gt 15) { return $null }
    return $digits
}

function Get-ColumnName([string]$cellReference) {
    return ($cellReference -replace '[0-9]', '')
}

function Get-CellText($cell, [string[]]$sharedStrings, $namespaceManager) {
    $type = $cell.GetAttribute('t')
    if ($type -eq 'inlineStr') {
        $textNodes = $cell.SelectNodes('.//x:t', $namespaceManager)
        return (($textNodes | ForEach-Object { $_.InnerText }) -join '')
    }
    $valueNode = $cell.SelectSingleNode('./x:v', $namespaceManager)
    if ($null -eq $valueNode) { return '' }
    $value = $valueNode.InnerText
    if ($type -eq 's') { return $sharedStrings[[int]$value] }
    if ($type -eq 'b') { return $(if ($value -eq '1') { 'TRUE' } else { 'FALSE' }) }
    return $value
}

if (Test-Path -LiteralPath $extractPath) { Remove-Item -LiteralPath $extractPath -Recurse -Force }
New-Item -ItemType Directory -Path $extractPath -Force | Out-Null

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($sourcePath, $extractPath)

    $sharedStrings = @()
    $sharedStringsPath = Join-Path $extractPath 'xl\sharedStrings.xml'
    if (Test-Path -LiteralPath $sharedStringsPath) {
        [xml]$sharedXml = Get-Content -LiteralPath $sharedStringsPath -Raw
        $sharedNs = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
        $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        $sharedStrings = @($sharedXml.SelectNodes('//x:si', $sharedNs) | ForEach-Object {
            (($_.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
        })
    }

    [xml]$sheetXml = Get-Content -LiteralPath (Join-Path $extractPath 'xl\worksheets\sheet1.xml') -Raw
    $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
    $sheetNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $rows = @($sheetXml.SelectNodes('//x:sheetData/x:row', $sheetNs))
    if ($rows.Count -lt 2) { throw 'No contact rows were found in the workbook.' }

    $headers = @{}
    foreach ($cell in $rows[0].SelectNodes('./x:c', $sheetNs)) {
        $headers[(Get-ColumnName $cell.GetAttribute('r'))] = (Get-CellText $cell $sharedStrings $sheetNs).Trim()
    }
    $nameColumn = ($headers.GetEnumerator() | Where-Object { $_.Value.Trim().ToLowerInvariant() -in @('business name', 'name', 'fullname', 'customer', 'contactname', 'owner') } | Select-Object -First 1).Key
    $phoneColumn = ($headers.GetEnumerator() | Where-Object { $_.Value.Trim().ToLowerInvariant() -in @('phone (call/whatsapp)', 'phone', 'mobile', 'whatsapp', 'contact', 'number', 'phonenumber', 'mobileno') } | Select-Object -First 1).Key
    if ([string]::IsNullOrWhiteSpace($nameColumn) -or [string]::IsNullOrWhiteSpace($phoneColumn)) {
        throw 'Could not find the Business Name and Phone columns.'
    }

    $contacts = New-Object System.Collections.Generic.List[object]
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $skippedInvalid = 0
    $skippedDuplicate = 0

    foreach ($row in $rows | Select-Object -Skip 1) {
        $values = @{}
        foreach ($cell in $row.SelectNodes('./x:c', $sheetNs)) {
            $values[(Get-ColumnName $cell.GetAttribute('r'))] = Get-CellText $cell $sharedStrings $sheetNs
        }
        $name = ([string]$values[$nameColumn]).Trim()
        $phone = Normalize-Phone $values[$phoneColumn]
        if ([string]::IsNullOrWhiteSpace($name) -or $null -eq $phone) {
            $skippedInvalid++
            continue
        }
        if (-not $seen.Add($phone)) {
            $skippedDuplicate++
            continue
        }
        $contacts.Add([pscustomobject]@{ Name = $name; Phone = $phone })
    }

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    $csvLines = New-Object System.Collections.Generic.List[string]
    $csvLines.Add('Name,Phone')
    foreach ($contact in $contacts) {
        $escapedName = '"' + ([string]$contact.Name).Replace('"', '""') + '"'
        $csvLines.Add($escapedName + ',' + [string]$contact.Phone)
    }
    [System.IO.File]::WriteAllLines($csvPath, $csvLines, $utf8Bom)

    [pscustomobject]@{
        SourceRows = $rows.Count - 1
        ExportedContacts = $contacts.Count
        SkippedInvalid = $skippedInvalid
        SkippedDuplicate = $skippedDuplicate
        Csv = $csvPath
    } | ConvertTo-Json -Compress
}
finally {
    if (Test-Path -LiteralPath $extractPath) { Remove-Item -LiteralPath $extractPath -Recurse -Force }
}
