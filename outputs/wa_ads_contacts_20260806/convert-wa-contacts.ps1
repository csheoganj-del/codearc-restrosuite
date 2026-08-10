$ErrorActionPreference = 'Stop'

$sourcePath = 'C:\Users\MASTER PC\Downloads\nagpur_restaurant_cafe_leads.xlsx'
$outputDir = Join-Path $PSScriptRoot '.'
$workingSourcePath = Join-Path $outputDir '_source_copy.xlsx'
$xlsxPath = Join-Path $outputDir 'nagpur_restaurant_cafe_leads_WA_ready.xlsx'
$csvPath = Join-Path $outputDir 'nagpur_restaurant_cafe_leads_WA_ready.csv'

function Normalize-Phone([object]$value) {
    if ($null -eq $value) { return $null }
    $digits = ([string]$value) -replace '[^0-9]', ''
    if ($digits.StartsWith('00')) { $digits = $digits.Substring(2) }
    if ($digits.Length -eq 11 -and $digits.StartsWith('0')) { $digits = $digits.Substring(1) }
    if ($digits.Length -eq 10) { $digits = '91' + $digits }
    if ($digits.Length -lt 11 -or $digits.Length -gt 15) { return $null }
    return $digits
}

$excel = $null
$sourceBook = $null
$outputBook = $null

try {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $workingSourcePath -Force
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    $sourceBook = $excel.Workbooks.Open($workingSourcePath, 0, $true)
    $sheet = $sourceBook.Worksheets.Item(1)
    $used = $sheet.UsedRange
    $rowCount = $used.Rows.Count
    $columnCount = $used.Columns.Count

    $nameColumn = 0
    $phoneColumn = 0
    for ($column = 1; $column -le $columnCount; $column++) {
        $header = ([string]$sheet.Cells.Item(1, $column).Text).Trim().ToLowerInvariant()
        if ($header -in @('business name', 'name', 'fullname', 'customer', 'contactname', 'owner')) { $nameColumn = $column }
        if ($header -in @('phone (call/whatsapp)', 'phone', 'mobile', 'whatsapp', 'contact', 'number', 'phonenumber', 'mobileno')) { $phoneColumn = $column }
    }
    if ($nameColumn -eq 0 -or $phoneColumn -eq 0) {
        throw "Could not find the Business Name and Phone columns in the source workbook."
    }

    $contacts = New-Object System.Collections.Generic.List[object]
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $skippedInvalid = 0
    $skippedDuplicate = 0

    for ($row = 2; $row -le $rowCount; $row++) {
        $name = ([string]$sheet.Cells.Item($row, $nameColumn).Text).Trim()
        $phone = Normalize-Phone $sheet.Cells.Item($row, $phoneColumn).Text
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

    $outputBook = $excel.Workbooks.Add()
    $outputSheet = $outputBook.Worksheets.Item(1)
    $outputSheet.Name = 'WA Ads Contacts'
    $outputSheet.Cells.Item(1, 1).Value2 = 'Name'
    $outputSheet.Cells.Item(1, 2).Value2 = 'Phone'

    $outputRow = 2
    foreach ($contact in $contacts) {
        $outputSheet.Cells.Item($outputRow, 1).Value2 = $contact.Name
        $outputSheet.Cells.Item($outputRow, 2).NumberFormat = '@'
        $outputSheet.Cells.Item($outputRow, 2).Value2 = [string]$contact.Phone
        $outputRow++
    }

    $lastRow = [Math]::Max(2, $contacts.Count + 1)
    $headerRange = $outputSheet.Range('A1:B1')
    $headerRange.Font.Bold = $true
    $headerRange.Font.Color = 16777215
    $headerRange.Interior.Color = 5384205
    $headerRange.HorizontalAlignment = -4108
    $outputSheet.Columns.Item('A').ColumnWidth = 42
    $outputSheet.Columns.Item('B').ColumnWidth = 20
    $outputSheet.Range("A1:B$lastRow").Borders.LineStyle = 1
    $outputSheet.Application.ActiveWindow.SplitRow = 1
    $outputSheet.Application.ActiveWindow.FreezePanes = $true

    if ($contacts.Count -gt 0) {
        $tableRange = $outputSheet.Range("A1:B$($contacts.Count + 1)")
        $table = $outputSheet.ListObjects.Add(1, $tableRange, $null, 1)
        $table.Name = 'WAAdsContacts'
        $table.TableStyle = 'TableStyleMedium2'
    }

    $outputBook.SaveAs($xlsxPath, 51)

    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    $csvLines = New-Object System.Collections.Generic.List[string]
    $csvLines.Add('Name,Phone')
    foreach ($contact in $contacts) {
        $escapedName = '"' + ([string]$contact.Name).Replace('"', '""') + '"'
        $csvLines.Add($escapedName + ',' + [string]$contact.Phone)
    }
    [System.IO.File]::WriteAllLines($csvPath, $csvLines, $utf8Bom)

    [pscustomobject]@{
        SourceRows = $rowCount - 1
        ExportedContacts = $contacts.Count
        SkippedInvalid = $skippedInvalid
        SkippedDuplicate = $skippedDuplicate
        Xlsx = $xlsxPath
        Csv = $csvPath
    } | ConvertTo-Json -Compress
}
finally {
    if ($outputBook) { $outputBook.Close($true) }
    if ($sourceBook) { $sourceBook.Close($false) }
    if ($excel) { $excel.Quit() }
    foreach ($comObject in @($outputSheet, $outputBook, $used, $sheet, $sourceBook, $excel)) {
        if ($null -ne $comObject) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($comObject) }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    if (Test-Path -LiteralPath $workingSourcePath) { Remove-Item -LiteralPath $workingSourcePath -Force }
}
