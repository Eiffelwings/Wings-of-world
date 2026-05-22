// swift-tools-version: 6.2
// Package manifest for the Wings🪽 macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Wings🪽",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "Wings🪽IPC", targets: ["Wings🪽IPC"]),
        .library(name: "Wings🪽Discovery", targets: ["Wings🪽Discovery"]),
        .executable(name: "Wings🪽", targets: ["Wings🪽"]),
        .executable(name: "mechanical-wings-mac", targets: ["Wings🪽MacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/Wings🪽Kit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "Wings🪽IPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Wings🪽Discovery",
            dependencies: [
                .product(name: "Wings🪽Kit", package: "Wings🪽Kit"),
            ],
            path: "Sources/Wings🪽Discovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Wings🪽",
            dependencies: [
                "Wings🪽IPC",
                "Wings🪽Discovery",
                .product(name: "Wings🪽Kit", package: "Wings🪽Kit"),
                .product(name: "Wings🪽ChatUI", package: "Wings🪽Kit"),
                .product(name: "Wings🪽Protocol", package: "Wings🪽Kit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Wings🪽.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Wings🪽MacCLI",
            dependencies: [
                "Wings🪽Discovery",
                .product(name: "Wings🪽Kit", package: "Wings🪽Kit"),
                .product(name: "Wings🪽Protocol", package: "Wings🪽Kit"),
            ],
            path: "Sources/Wings🪽MacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "Wings🪽IPCTests",
            dependencies: [
                "Wings🪽IPC",
                "Wings🪽",
                "Wings🪽Discovery",
                .product(name: "Wings🪽Protocol", package: "Wings🪽Kit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
