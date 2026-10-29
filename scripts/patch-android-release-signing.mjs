import fs from "node:fs";

const gradlePath = "android/app/build.gradle";
const keystorePath = process.env.ANDROID_KEYSTORE_PATH;
const versionCode = process.env.ANDROID_VERSION_CODE;

if (!keystorePath || !versionCode || !/^\d+$/.test(versionCode)) {
  throw new Error("Production signing path and numeric version code are required.");
}

let gradle = fs.readFileSync(gradlePath, "utf8");

if (!gradle.includes('storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))')) {
  const signingConfigsPattern = /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})(\s*\})/;
  if (!signingConfigsPattern.test(gradle)) {
    throw new Error("Could not locate the generated Android signingConfigs block.");
  }
  gradle = gradle.replace(
    signingConfigsPattern,
    '$1\n        release {\n            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }',
  );
}

const releaseSigningPattern = /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+(?:System\.getenv\("ANDROID_KEYSTORE_PATH"\)\s*\?\s*signingConfigs\.release\s*:\s*signingConfigs\.debug|signingConfigs\.debug)/;
if (!releaseSigningPattern.test(gradle)) {
  if (!/buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(gradle)) {
    throw new Error("Could not configure the generated release build type to use the release keystore.");
  }
} else {
  gradle = gradle.replace(releaseSigningPattern, "$1signingConfig signingConfigs.release");
}

if (!gradle.includes(`versionCode ${versionCode}`)) {
  const versionCodePattern = /versionCode\s+\d+/;
  if (!versionCodePattern.test(gradle)) {
    throw new Error("Could not locate the generated Android versionCode.");
  }
  gradle = gradle.replace(versionCodePattern, `versionCode ${versionCode}`);
}

fs.writeFileSync(gradlePath, gradle);
console.log("Configured Android release signing and CI version code.");
