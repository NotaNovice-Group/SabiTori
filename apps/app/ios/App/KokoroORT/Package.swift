// swift-tools-version: 5.9
import PackageDescription

// The Kokoro voice's model runner for iOS: Microsoft's official onnxruntime iOS build (the "onnxruntime-c" pod
// archive from download.onnxruntime.ai, the same binary Microsoft's Swift package wraps), pinned by version and
// checksum, plus a small C shim (Sources/KokoroORT) over onnxruntime's C API that SabiToriKokoroPlugin.swift calls.
// Maintained by hand (unlike CapApp-SPM, `npx cap sync` does not touch it). See docs/ios.md.
let package = Package(
    name: "KokoroORT",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "KokoroORT", targets: ["KokoroORT"])
    ],
    targets: [
        .binaryTarget(
            name: "onnxruntime",
            url: "https://download.onnxruntime.ai/pod-archive-onnxruntime-c-1.28.0.zip",
            checksum: "b503cf5949ab718a1dff17d1643237ecc0fecf50ad86264572dcafddb140a327"
        ),
        .target(
            name: "KokoroORT",
            dependencies: ["onnxruntime"],
            path: "Sources/KokoroORT",
            linkerSettings: [
                // onnxruntime is a static C++ library built with the Core ML execution provider.
                .linkedLibrary("c++"),
                .linkedFramework("Foundation"),
                .linkedFramework("CoreML")
            ]
        )
    ]
)
