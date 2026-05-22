import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-mechanical-wings writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.mechanical-wings.mac"
let gatewayLaunchdLabel = "ai.mechanical-wings.gateway"
let onboardingVersionKey = "mechanical-wings.onboardingVersion"
let onboardingSeenKey = "mechanical-wings.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "mechanical-wings.pauseEnabled"
let iconAnimationsEnabledKey = "mechanical-wings.iconAnimationsEnabled"
let swabbleEnabledKey = "mechanical-wings.swabbleEnabled"
let swabbleTriggersKey = "mechanical-wings.swabbleTriggers"
let voiceWakeTriggerChimeKey = "mechanical-wings.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "mechanical-wings.voiceWakeSendChime"
let showDockIconKey = "mechanical-wings.showDockIcon"
let defaultVoiceWakeTriggers = ["mechanical-wings"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "mechanical-wings.voiceWakeMicID"
let voiceWakeMicNameKey = "mechanical-wings.voiceWakeMicName"
let voiceWakeLocaleKey = "mechanical-wings.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "mechanical-wings.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "mechanical-wings.voicePushToTalkEnabled"
let talkEnabledKey = "mechanical-wings.talkEnabled"
let iconOverrideKey = "mechanical-wings.iconOverride"
let connectionModeKey = "mechanical-wings.connectionMode"
let remoteTargetKey = "mechanical-wings.remoteTarget"
let remoteIdentityKey = "mechanical-wings.remoteIdentity"
let remoteProjectRootKey = "mechanical-wings.remoteProjectRoot"
let remoteCliPathKey = "mechanical-wings.remoteCliPath"
let canvasEnabledKey = "mechanical-wings.canvasEnabled"
let cameraEnabledKey = "mechanical-wings.cameraEnabled"
let systemRunPolicyKey = "mechanical-wings.systemRunPolicy"
let systemRunAllowlistKey = "mechanical-wings.systemRunAllowlist"
let systemRunEnabledKey = "mechanical-wings.systemRunEnabled"
let locationModeKey = "mechanical-wings.locationMode"
let locationPreciseKey = "mechanical-wings.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "mechanical-wings.peekabooBridgeEnabled"
let deepLinkKeyKey = "mechanical-wings.deepLinkKey"
let modelCatalogPathKey = "mechanical-wings.modelCatalogPath"
let modelCatalogReloadKey = "mechanical-wings.modelCatalogReload"
let cliInstallPromptedVersionKey = "mechanical-wings.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "mechanical-wings.heartbeatsEnabled"
let debugPaneEnabledKey = "mechanical-wings.debugPaneEnabled"
let debugFileLogEnabledKey = "mechanical-wings.debug.fileLogEnabled"
let appLogLevelKey = "mechanical-wings.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
