// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "Wings🪽Kit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "Wings🪽Protocol", targets: ["Wings🪽Protocol"]),
        .library(name: "Wings🪽Kit", targets: ["Wings🪽Kit"]),
        .library(name: "Wings🪽ChatUI", targets: ["Wings🪽ChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "Wings🪽Protocol",
            path: "Sources/Wings🪽Protocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Wings🪽Kit",
            dependencies: [
                "Wings🪽Protocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/Wings🪽Kit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "Wings🪽ChatUI",
            dependencies: [
                "Wings🪽Kit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/Wings🪽ChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "Wings🪽KitTests",
            dependencies: ["Wings🪽Kit", "Wings🪽ChatUI"],
            path: "Tests/Wings🪽KitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
