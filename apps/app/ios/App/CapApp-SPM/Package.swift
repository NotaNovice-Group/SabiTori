// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0"),
        .package(name: "CapacitorCommunityTextToSpeech", path: "../../../../../node_modules/.pnpm/@capacitor-community+text-to-speech@8.0.2_@capacitor+core@8.6.0/node_modules/@capacitor-community/text-to-speech"),
        .package(name: "CapacitorCamera", path: "../../../../../node_modules/.pnpm/@capacitor+camera@8.2.6_@capacitor+core@8.6.0/node_modules/@capacitor/camera"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../node_modules/.pnpm/@capacitor+local-notifications@8.3.1_@capacitor+core@8.6.0/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../node_modules/.pnpm/@capacitor+splash-screen@8.0.2_@capacitor+core@8.6.0/node_modules/@capacitor/splash-screen"),
        .package(name: "CapgoCapacitorShareTarget", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-share-target@8.0.64_@capacitor+core@8.6.0/node_modules/@capgo/capacitor-share-target")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityTextToSpeech", package: "CapacitorCommunityTextToSpeech"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapgoCapacitorShareTarget", package: "CapgoCapacitorShareTarget")
            ]
        )
    ]
)
