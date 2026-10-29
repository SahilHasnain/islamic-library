# PowerShell script to encode Android secrets to base64 for GitHub Actions

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$KeystorePath,
    
    [Parameter(Mandatory=$false, Position=1)]
    [string]$PlayStoreJsonPath
)

$ErrorActionPreference = "Stop"

Write-Host "🔐 Android Secrets Encoder for GitHub Actions" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

function Encode-File {
    param(
        [string]$FilePath,
        [string]$SecretName
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "❌ File not found: $FilePath" -ForegroundColor Red
        return $false
    }
    
    Write-Host "✅ Encoding: $FilePath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Secret Name: $SecretName" -ForegroundColor Yellow
    Write-Host "Secret Value (copy this to GitHub):" -ForegroundColor Yellow
    Write-Host "-----------------------------------" -ForegroundColor Gray
    
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    $base64 = [System.Convert]::ToBase64String($bytes)
    Write-Host $base64
    
    Write-Host "-----------------------------------" -ForegroundColor Gray
    Write-Host ""
    
    return $true
}

# Encode keystore
$success = Encode-File -FilePath $KeystorePath -SecretName "ANDROID_KEYSTORE_BASE64"

# Encode Play Store JSON if provided
if ($PlayStoreJsonPath) {
    $success = Encode-File -FilePath $PlayStoreJsonPath -SecretName "PLAY_STORE_JSON_BASE64"
}

Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions"
Write-Host "2. Click 'New repository secret'"
Write-Host "3. Add the secrets shown above"
Write-Host "4. Also add these secrets:"
Write-Host "   - ANDROID_KEYSTORE_PASSWORD"
Write-Host "   - ANDROID_KEY_ALIAS"
Write-Host "   - ANDROID_KEY_PASSWORD"
Write-Host "   - SENTRY_AUTH_TOKEN (if using Sentry)"
Write-Host ""
Write-Host "✨ Done!" -ForegroundColor Green
