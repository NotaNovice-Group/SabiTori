import Foundation
import Capacitor
import KokoroORT

/// Runs the bundled Kokoro-82M voice model with Microsoft's onnxruntime (CPU, several threads), on the device,
/// through the C shim in ios/App/KokoroORT. Only the model run is here: the page does the text work (phonemes, ids,
/// style row; packages/speech/src/kokoro/) and sends ids + one style row; this returns 24 kHz audio.
/// onnxruntime-web in WKWebView is far too slow for this model.
///
///   load({ model: "kokoro/model_uint8.onnx", threads: 4 }) -> { threads }
///   synthesize({ ids: [Int], style: [Float] (256), speed }) -> { audio: base64 Int16 little-endian PCM, sampleRate: 24000 }
///   unload()
@objc(SabiToriKokoroPlugin)
public class SabiToriKokoroPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SabiToriKokoroPlugin"
    public let jsName = "SabiToriKokoro"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synthesize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise)
    ]

    /// One model run at a time, never on the main thread.
    private let queue = DispatchQueue(label: "cm.sabitori.kokoro", qos: .userInitiated)
    private var model: UnsafeMutableRawPointer?
    private var loadedModel: String?
    private var threads = 1

    deinit {
        if let m = model { kokoro_ort_unload(m) }
    }

    /// The model's file inside the app's web assets (App.app/public/...). Plain relative paths only.
    private func assetURL(_ path: String) -> URL? {
        let ok = path.range(of: "^[A-Za-z0-9._/-]+$", options: .regularExpression) != nil
        guard ok, !path.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true) else { return nil }
        let url = root.appendingPathComponent(path)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func message(_ buf: [CChar]) -> String {
        return buf.withUnsafeBufferPointer { String(cString: $0.baseAddress!) }
    }

    @objc func load(_ call: CAPPluginCall) {
        guard let path = call.getString("model"), let url = assetURL(path) else {
            call.reject("Kokoro model not found in the app", "no-model")
            return
        }
        let cores = max(1, min(4, ProcessInfo.processInfo.activeProcessorCount))
        let wanted = max(1, min(call.getInt("threads") ?? 4, cores))
        queue.async {
            if self.model != nil && self.loadedModel == path {
                call.resolve(["threads": self.threads])
                return
            }
            var err = [CChar](repeating: 0, count: 512)
            guard let m = kokoro_ort_load(url.path, Int32(wanted), &err, Int32(err.count)) else {
                call.reject("Kokoro model could not load: \(SabiToriKokoroPlugin.message(err))", "load-error")
                return
            }
            if let old = self.model { kokoro_ort_unload(old) }
            self.model = m
            self.loadedModel = path
            self.threads = wanted
            call.resolve(["threads": wanted])
        }
    }

    @objc func synthesize(_ call: CAPPluginCall) {
        let ids: [Int64] = (call.getArray("ids") ?? []).compactMap { ($0 as? NSNumber)?.int64Value }
        let style: [Float] = (call.getArray("style") ?? []).compactMap { ($0 as? NSNumber)?.floatValue }
        let speed = Float(call.getDouble("speed") ?? 1.0)
        guard ids.count >= 3, ids.count <= 512, style.count == 256 else {
            call.reject("Kokoro: ids must be 3 to 512 numbers and style 256 numbers", "bad-input")
            return
        }
        queue.async {
            guard let m = self.model else {
                call.reject("Kokoro model not loaded", "not-loaded")
                return
            }
            var err = [CChar](repeating: 0, count: 512)
            var out: UnsafeMutablePointer<Float>?
            var count: Int64 = 0
            let rc = ids.withUnsafeBufferPointer { idp in
                style.withUnsafeBufferPointer { sp in
                    kokoro_ort_run(m, idp.baseAddress, Int32(ids.count), sp.baseAddress, speed, &out, &count, &err, Int32(err.count))
                }
            }
            guard rc == 0, let samples = out else {
                call.reject("Kokoro synthesis failed: \(SabiToriKokoroPlugin.message(err))", "synth-error")
                return
            }
            defer { kokoro_ort_free(samples) }
            let n = Int(count)
            var pcm = [Int16](repeating: 0, count: n)
            for i in 0..<n {
                let v = samples[i]
                if !v.isFinite {
                    call.reject("Kokoro produced invalid audio (not a number)", "nan")
                    return
                }
                pcm[i] = Int16(max(-32768, min(32767, (v * 32768).rounded())))
            }
            let bytes = pcm.withUnsafeBufferPointer { Data(buffer: $0) }
            call.resolve(["audio": bytes.base64EncodedString(), "sampleRate": 24000])
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        queue.async {
            if let m = self.model { kokoro_ort_unload(m) }
            self.model = nil
            self.loadedModel = nil
            call.resolve()
        }
    }
}
