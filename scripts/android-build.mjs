/**
 * Runs the Android Gradle wrapper with a useful JDK and Android SDK.
 *
 * macOS often has no Java on PATH and the SDK in a non-default location, so
 * `./gradlew` alone fails with confusing errors. This launcher finds both,
 * then forwards every argument to Gradle.
 *
 * Usage: node scripts/android-build.mjs assembleDebug
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(root, 'android')
const gradleArgs = process.argv.slice(2)

function fail(message) {
  console.error(`\nAndroid build error:\n${message}\n`)
  process.exit(1)
}

function readLocalProperties() {
  const file = join(androidDir, 'local.properties')
  const values = new Map()
  if (!existsSync(file)) return values
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/)
    if (match) values.set(match[1], match[2])
  }
  return values
}

function isJdkHome(path) {
  return Boolean(path) && existsSync(join(path, 'bin', 'java'))
}

function findJavaHome() {
  const candidates = []
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME)

  if (process.platform === 'darwin' && existsSync('/usr/libexec/java_home')) {
    for (const version of ['21', '17']) {
      const result = spawnSync('/usr/libexec/java_home', ['-v', version], { encoding: 'utf8' })
      if (result.status === 0) candidates.push(result.stdout.trim())
    }
  }

  candidates.push(
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  )

  // Portable JDK used by the setup notes in README.
  const portableRoot = join(homedir(), '.local', 'share', 'riplika-jdk21')
  if (existsSync(portableRoot)) {
    for (const entry of readdirSync(portableRoot)) {
      candidates.push(join(portableRoot, entry, 'Contents', 'Home'))
      candidates.push(join(portableRoot, entry))
    }
  }

  return candidates.find(isJdkHome)
}

function findAndroidSdk() {
  const fromProperties = readLocalProperties().get('sdk.dir')
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    fromProperties,
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools',
    join(homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean)

  return candidates.find((path) => existsSync(join(path, 'platforms')) || existsSync(join(path, 'cmdline-tools')))
}

if (!gradleArgs.length) {
  fail('Pass a Gradle task, for example: node scripts/android-build.mjs assembleDebug')
}

const javaHome = findJavaHome()
if (!javaHome) {
  fail(
    'No JDK found. Install JDK 21 and set JAVA_HOME, for example:\n' +
      '  export JAVA_HOME=$(/usr/libexec/java_home -v 21)',
  )
}

const androidSdk = findAndroidSdk()
if (!androidSdk) {
  fail(
    'No Android SDK found. Install the command-line tools and set sdk.dir in android/local.properties,\n' +
      'or set ANDROID_HOME.',
  )
}

const gradlew = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
if (!existsSync(gradlew)) {
  fail('android/gradlew is missing. Run "npx cap add android" to regenerate the Android project.')
}

console.log(`JDK:     ${javaHome}`)
console.log(`SDK:     ${androidSdk}`)
console.log(`Gradle:  ${gradleArgs.join(' ')}`)

const result = spawnSync(gradlew, gradleArgs, {
  cwd: androidDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
    PATH: `${join(javaHome, 'bin')}:${process.env.PATH ?? ''}`,
  },
})

if (result.error) {
  fail(result.error.message)
}
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const artifacts = [
  ['Debug APK', join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')],
  ['Release APK', join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')],
  ['Release AAB', join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')],
]

for (const [label, file] of artifacts) {
  if (existsSync(file)) console.log(`${label}: ${file}`)
}
