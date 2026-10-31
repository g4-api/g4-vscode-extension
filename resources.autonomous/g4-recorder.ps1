<#
.SYNOPSIS
    Plans, records, and reports the scenarios of one G4 autonomous run.

.DESCRIPTION
    The G4 VS Code extension copies this script into every autonomous run folder. The agent that explores the
    application calls it to record each scenario on its own: it adds scenarios to the plan, starts a G4 Hub
    recording right before it performs a scenario, stops it right after (the flow is saved into the scenario's
    folder), and reports the scenario's result.

    The script keeps the run ledger (scenarios.json in the run folder) up to date after every call, so the
    extension can show the progress and so a run that ends early can still be closed. Only one recording is
    open at a time, because the recorders capture the whole desktop.

    The Hub endpoint and the recorders come from recording-request.json in the run folder. The G4
    authentication comes from the G4_AUTONOMOUS_AUTHENTICATION environment variable and is never printed.

    Exit codes: 0 success, 1 the call is not valid in the run's current state (or the run folder is not usable),
    2 the G4 Hub failed the request.

.PARAMETER Action
    What to do:
    plan   - add -Scenario to the plan (does nothing when it is already planned).
    start  - start recording -Scenario (it is planned when it is not yet). Returns once the recorders record.
    stop   - stop the open recording and save its flow (-Scenario is optional and must match when given).
    result - record the -Status and optional -Note of -Scenario.
    status - print every scenario with its recording state and result.

.PARAMETER Scenario
    The scenario name, for example "Create purchase order". Names are compared without regard to case.
    Required by plan, start, and result; optional for stop; ignored by status. Default: empty.

.PARAMETER Status
    The scenario result for the result action: passed, failed, or skipped. Ignored by the other actions.
    Default: passed.

.PARAMETER Note
    An optional short note for the result action, for example why a scenario failed. Ignored by the other
    actions. Default: empty.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\g4-recorder.ps1 -Action start -Scenario "Create purchase order"

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\g4-recorder.ps1 -Action result -Scenario "Create purchase order" -Status passed

.INPUTS
    None.

.OUTPUTS
    System.String. One readable line per outcome; the exit code tells success from failure.

.NOTES
    Runs in Windows PowerShell 5.1 and pwsh. Writes only inside the folder that holds this script.
#>
#Requires -Version 5.1
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('plan', 'start', 'stop', 'result', 'status')]
    [string]$Action,

    [Parameter()]
    [string]$Scenario = '',

    [Parameter()]
    [ValidateSet('passed', 'failed', 'skipped')]
    [string]$Status = 'passed',

    [Parameter()]
    [string]$Note = ''
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

# The run folder is the folder of this script; every file the script reads or writes lives in it.
$script:RunFolder = $PSScriptRoot
$script:LedgerPath = Join-Path -Path $script:RunFolder -ChildPath 'scenarios.json'
$script:RequestPath = Join-Path -Path $script:RunFolder -ChildPath 'recording-request.json'

# Exit codes the agent can act on.
$script:ExitCodeInvalidState = 1
$script:ExitCodeHubFailure = 2

# Starting waits for every recorder to connect; stopping flushes and converts the flow. Both can take a while.
$script:HubTimeoutSeconds = 120

function Add-LedgerScenario {
    <#
    .SYNOPSIS
        Adds a planned scenario to the ledger.

    .PARAMETER Ledger
        The ledger.

    .PARAMETER Name
        The scenario name.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The new scenario.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    # Number the scenario after the existing ones and give it its own folder.
    $index = @($Ledger.scenarios).Count + 1
    $folder = 'scenarios/{0:D2}-{1}' -f $index, (ConvertTo-ScenarioSlug -Name $Name)

    $ledgerScenario = [pscustomobject]@{
        error = ''
        flowPath = ''
        folder = $folder
        index = $index
        name = $Name
        note = ''
        recording = 'planned'
        result = 'pending'
        ruleCount = 0
        sessionId = ''
        startedAt = ''
        stoppedAt = ''
    }

    $Ledger.scenarios = @(@($Ledger.scenarios) + $ledgerScenario)

    return $ledgerScenario
}

function ConvertTo-ScenarioSlug {
    <#
    .SYNOPSIS
        Converts a scenario name into a short folder-name part.

    .PARAMETER Name
        The scenario name.

    .OUTPUTS
        System.String. Lower-case letters, digits, and single hyphens, at most 40 characters.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    # Keep letters and digits, fold everything else into single hyphens, and bound the length.
    $slug = ($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')

    if ($slug.Length -gt 40) {
        $slug = $slug.Substring(0, 40).Trim('-')
    }

    if ($slug.Length -eq 0) {
        return 'scenario'
    }

    return $slug
}

function Find-LedgerScenario {
    <#
    .SYNOPSIS
        Finds a scenario of the ledger by name, without regard to case.

    .PARAMETER Ledger
        The ledger.

    .PARAMETER Name
        The scenario name.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The scenario, or nothing when it is not planned.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    foreach ($ledgerScenario in @($Ledger.scenarios)) {
        if ([string]::Equals($ledgerScenario.name, $Name, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $ledgerScenario
        }
    }

    return $null
}

function Get-HubFailureMessage {
    <#
    .SYNOPSIS
        Describes a failed Hub request with the Hub's own explanation.

    .PARAMETER Response
        The response returned by Invoke-HubRequest.

    .OUTPUTS
        System.String. The status code and the problem detail, title, or body text.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Response
    )

    # An unreachable Hub has no body to explain it.
    if ($Response.StatusCode -eq 0) {
        return "The G4 Hub could not be reached: $($Response.Text)"
    }

    # Prefer the problem-details detail, then its title, then the raw text.
    $reason = $Response.Text

    try {
        $problem = ConvertFrom-Json -InputObject $Response.Text
        $detailValue = Get-PropertyValue -InputObject $problem -Name 'detail'
        $titleValue = Get-PropertyValue -InputObject $problem -Name 'title'

        if ("$detailValue".Length -gt 0) {
            $reason = "$detailValue"
        }
        elseif ("$titleValue".Length -gt 0) {
            $reason = "$titleValue"
        }
    }
    catch {
        $reason = $Response.Text
    }

    return "The G4 Hub answered $($Response.StatusCode): $reason"
}

function Get-OpenScenario {
    <#
    .SYNOPSIS
        Gets the scenario that is recording, if any.

    .PARAMETER Ledger
        The ledger.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The recording scenario, or nothing.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger
    )

    foreach ($ledgerScenario in @($Ledger.scenarios)) {
        if ($ledgerScenario.recording -eq 'recording') {
            return $ledgerScenario
        }
    }

    return $null
}

function Get-PropertyValue {
    <#
    .SYNOPSIS
        Reads a property of a parsed JSON object, or nothing when it is absent.

    .DESCRIPTION
        Strict mode throws when a missing property is read, so every optional field of a Hub answer or a
        flow is read through this function.

    .PARAMETER InputObject
        The object; nothing yields nothing.

    .PARAMETER Name
        The property name.

    .OUTPUTS
        System.Object. The property value, or nothing.
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowNull()]
        [object]$InputObject,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($null -eq $InputObject) {
        return $null
    }

    $property = $InputObject.PSObject.Properties[$Name]

    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

function Get-RuleCount {
    <#
    .SYNOPSIS
        Counts the rules of a recorded flow.

    .PARAMETER FlowText
        The flow JSON.

    .OUTPUTS
        System.Int32. The number of rules across every stage and job; 0 when the flow cannot be read.
    #>
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FlowText
    )

    # The count is informational only, so a flow of an unexpected shape counts 0 instead of failing the stop.
    try {
        $flow = ConvertFrom-Json -InputObject $FlowText
        $ruleCount = 0

        foreach ($stage in @(Get-PropertyValue -InputObject $flow -Name 'stages')) {
            foreach ($job in @(Get-PropertyValue -InputObject $stage -Name 'jobs')) {
                $ruleCount += @(Get-PropertyValue -InputObject $job -Name 'rules' | Where-Object { $null -ne $_ }).Count
            }
        }

        return $ruleCount
    }
    catch {
        return 0
    }
}

function Get-ScenarioFolderPath {
    <#
    .SYNOPSIS
        Resolves a scenario folder and refuses one outside the run folder.

    .PARAMETER Folder
        The scenario folder from the ledger, relative to the run folder.

    .OUTPUTS
        System.String. The absolute folder path.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Folder
    )

    # The ledger can be edited by hand, so a folder that climbs out of the run folder is refused.
    $runFolderPath = [System.IO.Path]::GetFullPath($script:RunFolder).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $folderPath = [System.IO.Path]::GetFullPath((Join-Path -Path $script:RunFolder -ChildPath $Folder))

    if (-not $folderPath.StartsWith($runFolderPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The scenario folder '$Folder' is outside the run folder."
    }

    return $folderPath
}

function Invoke-HubRequest {
    <#
    .SYNOPSIS
        Sends one request to the G4 Hub recordings API.

    .DESCRIPTION
        Uses HttpClient so success and failure bodies are read the same way in Windows PowerShell and pwsh.
        Never throws for an HTTP failure; the caller decides from the status code. A status code of 0 means
        the Hub could not be reached or did not answer in time.

    .PARAMETER Method
        GET or POST.

    .PARAMETER Uri
        The absolute request URI.

    .PARAMETER Body
        The JSON body; empty for none.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. StatusCode, Bytes (the raw body), and Text.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST')]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter()]
        [string]$Body = ''
    )

    # Load the HTTP client; Windows PowerShell does not load it by default.
    Add-Type -AssemblyName System.Net.Http

    $client = New-Object -TypeName System.Net.Http.HttpClient
    $client.Timeout = [System.TimeSpan]::FromSeconds($script:HubTimeoutSeconds)
    $request = $null
    $response = $null

    try {
        # Build the request with a UTF-8 JSON body when one is given.
        $request = New-Object -TypeName System.Net.Http.HttpRequestMessage -ArgumentList @(
            (New-Object -TypeName System.Net.Http.HttpMethod -ArgumentList $Method),
            $Uri
        )

        if ($Body.Length -gt 0) {
            $request.Content = New-Object -TypeName System.Net.Http.StringContent -ArgumentList @(
                $Body,
                [System.Text.Encoding]::UTF8,
                'application/json'
            )
        }

        # Send and read the raw body, so a flow is saved byte for byte.
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()

        return [pscustomobject]@{
            Bytes = $bytes
            StatusCode = [int]$response.StatusCode
            Text = [System.Text.Encoding]::UTF8.GetString($bytes)
        }
    }
    catch {
        # An unreachable Hub or a timeout is reported as status 0 with the reason.
        return [pscustomobject]@{
            Bytes = [byte[]]@()
            StatusCode = 0
            Text = $_.Exception.Message
        }
    }
    finally {
        # Release the response, the request, and the connection on every path.
        if ($null -ne $response) {
            $response.Dispose()
        }

        if ($null -ne $request) {
            $request.Dispose()
        }

        $client.Dispose()
    }
}

function New-ActionResult {
    <#
    .SYNOPSIS
        Creates the outcome of an action: its exit code and the lines to print.

    .PARAMETER ExitCode
        The exit code of the action.

    .PARAMETER Message
        The lines to print, in order.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. ExitCode and Messages.
    #>
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Creates an in-memory result only.')]
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [int]$ExitCode,

        [Parameter(Mandatory = $true)]
        [string[]]$Message
    )

    return [pscustomobject]@{
        ExitCode = $ExitCode
        Messages = $Message
    }
}

function Read-Ledger {
    <#
    .SYNOPSIS
        Reads the run ledger, or returns an empty one.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The ledger with a scenarios array.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param()

    # A run starts without scenarios; the extension writes an empty ledger, but a missing one is fine too.
    if (-not (Test-Path -LiteralPath $script:LedgerPath)) {
        return [pscustomobject]@{
            scenarios = @()
            version = 1
        }
    }

    # Read the ledger and keep scenarios an array even when the file holds none or one.
    $ledgerText = [System.IO.File]::ReadAllText($script:LedgerPath, [System.Text.Encoding]::UTF8)
    $ledger = ConvertFrom-Json -InputObject $ledgerText
    $ledgerScenarios = @(Get-PropertyValue -InputObject $ledger -Name 'scenarios' | Where-Object { $null -ne $_ })

    return [pscustomobject]@{
        scenarios = $ledgerScenarios
        version = 1
    }
}

function Read-RecordingRequest {
    <#
    .SYNOPSIS
        Reads the Hub endpoint and the start request prepared by the extension.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. HubUrl and Request.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param()

    # Read the request the extension wrote; both the Hub endpoint and the request body are required.
    $requestText = [System.IO.File]::ReadAllText($script:RequestPath, [System.Text.Encoding]::UTF8)
    $requestFile = ConvertFrom-Json -InputObject $requestText
    $hubUrl = "$(Get-PropertyValue -InputObject $requestFile -Name 'hubUrl')".TrimEnd('/')
    $request = Get-PropertyValue -InputObject $requestFile -Name 'request'

    if ($hubUrl.Length -eq 0 -or $null -eq $request) {
        throw 'recording-request.json has no hubUrl or no request.'
    }

    # Attach the authentication from the environment; it is never written to the run folder. A malformed value
    # is reported without its text, since the parser's message would quote the secret.
    $authentication = [pscustomobject]@{
        token = ''
    }

    if (-not [string]::IsNullOrEmpty($env:G4_AUTONOMOUS_AUTHENTICATION)) {
        try {
            $authentication = ConvertFrom-Json -InputObject $env:G4_AUTONOMOUS_AUTHENTICATION
        }
        catch {
            throw 'The G4_AUTONOMOUS_AUTHENTICATION environment variable is not valid JSON.'
        }
    }

    $request | Add-Member -MemberType NoteProperty -Name 'authentication' -Value $authentication -Force

    return [pscustomobject]@{
        HubUrl = $hubUrl
        Request = $request
    }
}

function Save-Ledger {
    <#
    .SYNOPSIS
        Writes the ledger atomically, so the extension never reads half a file or finds none.

    .PARAMETER Ledger
        The ledger.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger
    )

    # Write a temporary file next to the ledger.
    $ledgerText = ConvertTo-Json -InputObject $Ledger -Depth 6
    $temporaryPath = Join-Path -Path $script:RunFolder -ChildPath 'scenarios.json.tmp'
    $encoding = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false

    try {
        [System.IO.File]::WriteAllText($temporaryPath, $ledgerText, $encoding)

        # Swap it in with one file-system operation; File.Replace keeps the ledger present throughout. No backup
        # is kept: PowerShell turns $null into an empty path for a string argument, so NullString passes a real null.
        if (Test-Path -LiteralPath $script:LedgerPath) {
            [System.IO.File]::Replace($temporaryPath, $script:LedgerPath, [NullString]::Value)
        }
        else {
            [System.IO.File]::Move($temporaryPath, $script:LedgerPath)
        }
    }
    finally {
        # A failed swap leaves no temporary file behind.
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

function Start-ScenarioRecording {
    <#
    .SYNOPSIS
        Starts the Hub recording of one scenario.

    .PARAMETER Ledger
        The ledger.

    .PARAMETER Name
        The scenario name; planned first when it is not yet.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The action result from New-ActionResult.
    #>
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Agent command-line tool; there is no -WhatIf contract.')]
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    # One recording at a time: the recorders capture the whole desktop.
    $openScenario = Get-OpenScenario -Ledger $Ledger

    if ($null -ne $openScenario) {
        return New-ActionResult -ExitCode $script:ExitCodeInvalidState -Message ("Scenario '$($openScenario.name)' is still recording. Stop it before starting another.")
    }

    # Plan the scenario on first use, so start alone is enough.
    $ledgerScenario = Find-LedgerScenario -Ledger $Ledger -Name $Name

    if ($null -eq $ledgerScenario) {
        $ledgerScenario = Add-LedgerScenario -Ledger $Ledger -Name $Name
    }

    # Ask the Hub to start; it answers once every recorder is connected.
    $recordingRequest = Read-RecordingRequest
    $body = ConvertTo-Json -InputObject $recordingRequest.Request -Depth 20 -Compress
    $uri = '{0}/api/v4/g4/recordings' -f $recordingRequest.HubUrl
    $response = Invoke-HubRequest -Method 'POST' -Uri $uri -Body $body
    $isStarted = $response.StatusCode -eq 201 -or $response.StatusCode -eq 200

    # Read the session from the answer; an answer without one is a Hub failure.
    $recordingStatus = $null

    if ($isStarted) {
        try {
            $recordingStatus = ConvertFrom-Json -InputObject $response.Text
        }
        catch {
            $recordingStatus = $null
        }
    }

    $sessionId = "$(Get-PropertyValue -InputObject $recordingStatus -Name 'id')"

    # A refused start leaves the scenario not recording, with the reason kept for the extension.
    if (-not $isStarted -or $sessionId.Length -eq 0) {
        $message = Get-HubFailureMessage -Response $response
        $ledgerScenario.recording = 'failed'
        $ledgerScenario.error = $message
        Save-Ledger -Ledger $Ledger

        return New-ActionResult -ExitCode $script:ExitCodeHubFailure -Message ("Recording did not start for '$Name'. $message")
    }

    # Keep the session so stop (or the extension, after an early end) can close it.
    $ledgerScenario.recording = 'recording'
    $ledgerScenario.sessionId = $sessionId
    $ledgerScenario.startedAt = (Get-Date).ToUniversalTime().ToString('o')
    $ledgerScenario.stoppedAt = ''
    $ledgerScenario.error = ''
    Save-Ledger -Ledger $Ledger

    # Report recorders that did not connect; the session still records with the others.
    $messages = New-Object -TypeName System.Collections.Generic.List[string]

    foreach ($recorder in @(Get-PropertyValue -InputObject $recordingStatus -Name 'recorders' | Where-Object { $null -ne $_ })) {
        $recorderError = "$(Get-PropertyValue -InputObject $recorder -Name 'error')"

        if ($recorderError.Length -gt 0) {
            $messages.Add("Warning: recorder $(Get-PropertyValue -InputObject $recorder -Name 'baseUrl') did not start: $recorderError")
        }
    }

    $messages.Add("Recording '$Name'. Perform the scenario now, then stop the recording.")

    return New-ActionResult -ExitCode 0 -Message $messages.ToArray()
}

function Stop-ScenarioRecording {
    <#
    .SYNOPSIS
        Stops the open recording and saves its flow into the scenario folder.

    .PARAMETER Ledger
        The ledger.

    .PARAMETER Name
        The scenario name; empty to stop whichever scenario is recording.

    .OUTPUTS
        System.Management.Automation.PSCustomObject. The action result from New-ActionResult.
    #>
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Agent command-line tool; there is no -WhatIf contract.')]
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger,

        [Parameter()]
        [string]$Name = ''
    )

    # Only the open recording can be stopped, and a given name must be that one.
    $openScenario = Get-OpenScenario -Ledger $Ledger

    if ($null -eq $openScenario) {
        return New-ActionResult -ExitCode $script:ExitCodeInvalidState -Message 'No scenario is recording.'
    }

    $isOtherScenario = $Name.Length -gt 0 -and -not [string]::Equals($openScenario.name, $Name, [System.StringComparison]::OrdinalIgnoreCase)

    if ($isOtherScenario) {
        return New-ActionResult -ExitCode $script:ExitCodeInvalidState -Message ("Scenario '$($openScenario.name)' is recording, not '$Name'. Stop '$($openScenario.name)' first.")
    }

    # Stop the session; the Hub flushes the recorders and converts the flow.
    $recordingRequest = Read-RecordingRequest
    $uri = '{0}/api/v4/g4/recordings/{1}/stop' -f $recordingRequest.HubUrl, $openScenario.sessionId
    $response = Invoke-HubRequest -Method 'POST' -Uri $uri

    # An unreachable Hub or a server error may still be recording, so the scenario stays open for a retry.
    $isRetryable = $response.StatusCode -eq 0 -or $response.StatusCode -ge 500

    if ($isRetryable) {
        $message = Get-HubFailureMessage -Response $response
        $openScenario.error = $message
        Save-Ledger -Ledger $Ledger

        return New-ActionResult -ExitCode $script:ExitCodeHubFailure -Message ("Recording of '$($openScenario.name)' could not be stopped yet; run stop again. $message")
    }

    $openScenario.stoppedAt = (Get-Date).ToUniversalTime().ToString('o')

    # An empty recording (204) saves nothing.
    if ($response.StatusCode -eq 204) {
        $openScenario.recording = 'empty'
        $openScenario.error = ''
        Save-Ledger -Ledger $Ledger

        return New-ActionResult -ExitCode 0 -Message ("Recording of '$($openScenario.name)' stopped, but it captured no actions; no flow was saved.")
    }

    # Any other refusal (the Hub lost the session) closes the scenario as failed; it cannot be stopped again.
    if ($response.StatusCode -ne 200) {
        $message = Get-HubFailureMessage -Response $response
        $openScenario.recording = 'failed'
        $openScenario.error = $message
        Save-Ledger -Ledger $Ledger

        return New-ActionResult -ExitCode $script:ExitCodeHubFailure -Message ("Recording of '$($openScenario.name)' could not be stopped. $message")
    }

    # Save the flow byte for byte into the scenario folder, which must stay inside the run folder.
    $folderPath = Get-ScenarioFolderPath -Folder $openScenario.folder
    $null = New-Item -ItemType Directory -Path $folderPath -Force
    [System.IO.File]::WriteAllBytes((Join-Path -Path $folderPath -ChildPath 'flow.json'), $response.Bytes)

    # Record where the flow is and how many actions it holds.
    $openScenario.recording = 'saved'
    $openScenario.flowPath = '{0}/flow.json' -f $openScenario.folder
    $openScenario.ruleCount = Get-RuleCount -FlowText $response.Text
    $openScenario.error = ''
    Save-Ledger -Ledger $Ledger

    return New-ActionResult -ExitCode 0 -Message ("Saved the flow of '$($openScenario.name)' ($($openScenario.ruleCount) actions) to $($openScenario.flowPath).")
}

function Write-LedgerStatus {
    <#
    .SYNOPSIS
        Writes one line per scenario: its number, name, recording state, and result.

    .PARAMETER Ledger
        The ledger.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Ledger
    )

    $ledgerScenarios = @($Ledger.scenarios)

    if ($ledgerScenarios.Count -eq 0) {
        Write-Output 'No scenarios are planned.'
        return
    }

    foreach ($ledgerScenario in $ledgerScenarios) {
        Write-Output ('{0}. {1} - recording: {2}, result: {3}' -f $ledgerScenario.index, $ledgerScenario.name, $ledgerScenario.recording, $ledgerScenario.result)
    }
}

# Every action but stop and status names a scenario.
$isScenarioRequired = $Action -in @('plan', 'start', 'result')

if ($isScenarioRequired -and $Scenario.Trim().Length -eq 0) {
    Write-Output "The $Action action needs -Scenario."
    exit $script:ExitCodeInvalidState
}

$scenarioName = $Scenario.Trim()

# Run the action; each one saves the ledger itself when it changes it. A run folder that cannot be read is
# reported in one line with exit code 1, so the agent never has to read a stack trace.
try {
    $ledger = Read-Ledger

    switch ($Action) {
        'plan' {
            $existingScenario = Find-LedgerScenario -Ledger $ledger -Name $scenarioName

            if ($null -ne $existingScenario) {
                Write-Output "Scenario '$($existingScenario.name)' is already planned as number $($existingScenario.index)."
                exit 0
            }

            # Add the scenario and persist the plan before confirming it.
            $plannedScenario = Add-LedgerScenario -Ledger $ledger -Name $scenarioName
            Save-Ledger -Ledger $ledger
            Write-Output "Planned scenario $($plannedScenario.index): '$scenarioName'."
            exit 0
        }
        'start' {
            $actionResult = Start-ScenarioRecording -Ledger $ledger -Name $scenarioName
            $actionResult.Messages | Write-Output
            exit $actionResult.ExitCode
        }
        'stop' {
            $actionResult = Stop-ScenarioRecording -Ledger $ledger -Name $scenarioName
            $actionResult.Messages | Write-Output
            exit $actionResult.ExitCode
        }
        'result' {
            $resultScenario = Find-LedgerScenario -Ledger $ledger -Name $scenarioName

            if ($null -eq $resultScenario) {
                Write-Output "Scenario '$scenarioName' is not planned."
                exit $script:ExitCodeInvalidState
            }

            # Record the verdict and persist it before confirming it.
            $resultScenario.result = $Status
            $resultScenario.note = $Note.Trim()
            Save-Ledger -Ledger $ledger
            Write-Output "Scenario '$($resultScenario.name)' marked $Status."
            exit 0
        }
        default {
            Write-LedgerStatus -Ledger $ledger
            exit 0
        }
    }
}
catch {
    Write-Output ('The run folder is not usable: {0}' -f $_.Exception.Message)
    exit $script:ExitCodeInvalidState
}
