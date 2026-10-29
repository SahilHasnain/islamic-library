#!/bin/bash
# Script to encode Android secrets to base64 for GitHub Actions

set -e

echo "🔐 Android Secrets Encoder for GitHub Actions"
echo "=============================================="
echo ""

# Function to encode a file
encode_file() {
    local file_path="$1"
    local secret_name="$2"
    
    if [ ! -f "$file_path" ]; then
        echo "❌ File not found: $file_path"
        return 1
    fi
    
    echo "✅ Encoding: $file_path"
    echo ""
    echo "Secret Name: $secret_name"
    echo "Secret Value (copy this to GitHub):"
    echo "-----------------------------------"
    base64 -w 0 "$file_path"
    echo ""
    echo "-----------------------------------"
    echo ""
}

# Check for required arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <keystore-path> [play-store-json-path]"
    echo ""
    echo "Examples:"
    echo "  $0 release.keystore"
    echo "  $0 release.keystore play-store-key.json"
    echo "  $0 path/to/release.keystore path/to/play-store-key.json"
    echo ""
    exit 1
fi

KEYSTORE_PATH="$1"
PLAYSTORE_JSON_PATH="${2:-}"

# Encode keystore
encode_file "$KEYSTORE_PATH" "ANDROID_KEYSTORE_BASE64"

# Encode Play Store JSON if provided
if [ -n "$PLAYSTORE_JSON_PATH" ]; then
    encode_file "$PLAYSTORE_JSON_PATH" "PLAY_STORE_JSON_BASE64"
fi

echo "📋 Next Steps:"
echo "1. Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions"
echo "2. Click 'New repository secret'"
echo "3. Add the secrets shown above"
echo "4. Also add these secrets:"
echo "   - ANDROID_KEYSTORE_PASSWORD"
echo "   - ANDROID_KEY_ALIAS"
echo "   - ANDROID_KEY_PASSWORD"
echo "   - SENTRY_AUTH_TOKEN (if using Sentry)"
echo ""
echo "✨ Done!"
