param(
  [string]$PayloadJson
)

$ErrorActionPreference = 'Stop'

function Emit-Allow {
  $obj = @{
    hookSpecificOutput = @{
      hookEventName = 'PreToolUse'
      permissionDecision = 'allow'
      permissionDecisionReason = 'No destructive pattern detected.'
    }
  }
  $obj | ConvertTo-Json -Compress
}

function Emit-Deny([string]$reason) {
  $obj = @{
    hookSpecificOutput = @{
      hookEventName = 'PreToolUse'
      permissionDecision = 'deny'
      permissionDecisionReason = $reason
    }
  }
  $obj | ConvertTo-Json -Compress
}

try {
  $stdin = $PayloadJson
  if ([string]::IsNullOrWhiteSpace($stdin)) {
    $stdin = [Console]::In.ReadToEnd()
  }
  if ([string]::IsNullOrWhiteSpace($stdin)) {
    $pipelineInput = ($input | Out-String)
    if (-not [string]::IsNullOrWhiteSpace($pipelineInput)) {
      $stdin = $pipelineInput
    }
  }
  if ([string]::IsNullOrWhiteSpace($stdin)) {
    Emit-Allow
    exit 0
  }

  $raw = $stdin.ToLowerInvariant()
  $payload = $null
  try {
    $payload = $stdin | ConvertFrom-Json -Depth 20
  }
  catch {
    $payload = $null
  }

  $scanParts = New-Object System.Collections.Generic.List[string]
  $scanParts.Add($raw) | Out-Null

  # Try to collect command text from common payload shapes.
  if ($null -ne $payload -and $null -ne $payload.arguments -and $null -ne $payload.arguments.command) {
    $scanParts.Add(([string]$payload.arguments.command).ToLowerInvariant()) | Out-Null
  }
  if ($null -ne $payload -and $null -ne $payload.toolInput -and $null -ne $payload.toolInput.command) {
    $scanParts.Add(([string]$payload.toolInput.command).ToLowerInvariant()) | Out-Null
  }
  if ($null -ne $payload -and $null -ne $payload.input -and $null -ne $payload.input.command) {
    $scanParts.Add(([string]$payload.input.command).ToLowerInvariant()) | Out-Null
  }

  $scanText = ($scanParts -join "`n")

  # Enable strict blocking whenever the session appears to be review-oriented.
  $isReviewContext = $false
  if ($scanText -match 'review_code|review_security|review_tests|review de codigo|security review|test review|revisao') {
    $isReviewContext = $true
  }

  # If context cannot be inferred, keep protection enabled by default for destructive commands.
  if (-not $isReviewContext) {
    $isReviewContext = $true
  }

  if (-not $isReviewContext) {
    Emit-Allow
    exit 0
  }

  $destructivePatterns = @(
    'git\s+reset\s+--hard',
    'git\s+checkout\s+--\s',
    'git\s+clean\s+-fd',
    'rm\s+-rf\s+/',
    'rm\s+-rf\s+\.',
    'remove-item\s+.+-recurse.+-force',
    'del\s+/f\s+/s\s+/q',
    'format-volume\b',
    'diskpart\b',
    'drop\s+database\b',
    'truncate\s+table\b',
    'delete\s+from\s+\w+\s*;?\s*$'
  )

  foreach ($pattern in $destructivePatterns) {
    if ($scanText -match $pattern) {
      Emit-Deny("Blocked potentially destructive command in review session: pattern '$pattern'.")
      exit 2
    }
  }

  Emit-Allow
  exit 0
}
catch {
  # Fail open to avoid blocking normal work if the hook payload format changes.
  Emit-Allow
  exit 0
}
