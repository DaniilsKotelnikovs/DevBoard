$env:ELECTRON_RUN_AS_NODE = $null
Set-Location $PSScriptRoot
npx electron .
