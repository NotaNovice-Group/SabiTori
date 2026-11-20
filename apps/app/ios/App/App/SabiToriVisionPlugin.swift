import Foundation
import Capacitor
import Vision
import UIKit

/// Reads the text of a photo with Apple's Vision framework, on the device (no network).
/// The web OCR (tesseract.js in a Web Worker) is unreliable in iOS WebKit; this is the iOS reader.
@objc(SabiToriVisionPlugin)
public class SabiToriVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SabiToriVisionPlugin"
    public let jsName = "SabiToriVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    /// { image: base64 JPEG/PNG (no data: prefix), languages?: ["fr-FR", "en-US"] } -> { text, confidence (0..100), lines }
    @objc func recognize(_ call: CAPPluginCall) {
        guard let b64 = call.getString("image"), let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data), let cg = image.cgImage else {
            call.reject("Could not decode the image", "bad-image")
            return
        }
        let languages = (call.getArray("languages") as? [String]) ?? ["fr-FR", "en-US"]
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest { req, err in
                if let err = err {
                    call.reject("Vision failed: \(err.localizedDescription)", "vision-error")
                    return
                }
                let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
                // Top to bottom, then left to right (Vision's origin is bottom-left).
                let sorted = obs.sorted { a, b in
                    let dy = a.boundingBox.midY - b.boundingBox.midY
                    if abs(dy) > 0.01 { return dy > 0 }
                    return a.boundingBox.minX < b.boundingBox.minX
                }
                var lines: [String] = []
                var total: Float = 0
                for o in sorted {
                    if let best = o.topCandidates(1).first {
                        lines.append(best.string)
                        total += best.confidence
                    }
                }
                let confidence = lines.isEmpty ? 0 : Double(total / Float(lines.count)) * 100
                call.resolve(["text": lines.joined(separator: "\n"), "confidence": confidence, "lines": lines.count])
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let supported = (try? request.supportedRecognitionLanguages()) ?? []
            let wanted = languages.filter { supported.isEmpty || supported.contains($0) }
            if !wanted.isEmpty { request.recognitionLanguages = wanted }
            let handler = VNImageRequestHandler(cgImage: cg, orientation: orientation, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("Vision failed: \(error.localizedDescription)", "vision-error")
            }
        }
    }
}

private extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
