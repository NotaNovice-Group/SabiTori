import Foundation
import Capacitor
import OnnxRuntimeBindings

/// Runs the bundled Kokoro-82M voice model with Microsoft's onnxruntime (CPU, several threads), on the device.
/// Only the model run is here: the page does the text work (phonemes, ids, style row; packages/speech/src/kokoro/)
/// and sends ids + one style row; this returns 24 kHz audio. onnxruntime-web in WKWebView is far too slow for it.
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
    private var env: ORTEnv?
    private var session: ORTSession?
    private var loadedModel: String?
    private var outputName = "waveform"
    private var threads = 1

    /// The model's file inside the app's web assets (App.app/public/...). Plain relative paths only.
    private func assetURL(_ model: String) -> URL? {
        let ok = model.range(of: "^[A-Za-z0-9._/-]+$", options: .regularExpression) != nil
        guard ok, !model.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true) else { return nil }
        let url = root.appendingPathComponent(model)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    @objc func load(_ call: CAPPluginCall) {
        guard let model = call.getString("model"), let url = assetURL(model) else {
            call.reject("Kokoro model not found in the app", "no-model")
            return
        }
        let cores = max(1, min(4, ProcessInfo.processInfo.activeProcessorCount))
        let wanted = max(1, min(call.getInt("threads") ?? 4, cores))
        queue.async {
            if self.session != nil && self.loadedModel == model {
                call.resolve(["threads": self.threads])
                return
            }
            do {
                let env = try self.env ?? ORTEnv(loggingLevel: ORTLoggingLevel.warning)
                let options = try ORTSessionOptions()
                try options.setIntraOpNumThreads(Int32(wanted))
                try options.setGraphOptimizationLevel(ORTGraphOptimizationLevel.all)
                let session = try ORTSession(env: env, modelPath: url.path, sessionOptions: options)
                let inputs = try session.inputNames()
                for name in ["input_ids", "style", "speed"] where !inputs.contains(name) {
                    call.reject("Not a Kokoro model: no input \(name)", "bad-model")
                    return
                }
                self.outputName = (try? session.outputNames().first) ?? "waveform"
                self.env = env
                self.session = session
                self.loadedModel = model
                self.threads = wanted
                call.resolve(["threads": wanted])
            } catch {
                call.reject("Kokoro model could not load: \(error.localizedDescription)", "load-error")
            }
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
            guard let session = self.session else {
                call.reject("Kokoro model not loaded", "not-loaded")
                return
            }
            do {
                var idsCopy = ids
                var styleCopy = style
                var speedCopy = [speed]
                let idsData = NSMutableData(bytes: &idsCopy, length: idsCopy.count * MemoryLayout<Int64>.stride)
                let styleData = NSMutableData(bytes: &styleCopy, length: styleCopy.count * MemoryLayout<Float>.stride)
                let speedData = NSMutableData(bytes: &speedCopy, length: MemoryLayout<Float>.stride)
                let inputs: [String: ORTValue] = [
                    "input_ids": try ORTValue(tensorData: idsData, elementType: ORTTensorElementDataType.int64, shape: [1, NSNumber(value: ids.count)]),
                    "style": try ORTValue(tensorData: styleData, elementType: ORTTensorElementDataType.float, shape: [1, 256]),
                    "speed": try ORTValue(tensorData: speedData, elementType: ORTTensorElementDataType.float, shape: [1])
                ]
                let outputs = try session.run(withInputs: inputs, outputNames: Set([self.outputName]), runOptions: nil)
                guard let wave = outputs[self.outputName] else {
                    call.reject("Kokoro model returned no audio", "no-audio")
                    return
                }
                let data = try wave.tensorData() as Data
                let count = data.count / MemoryLayout<Float>.stride
                var pcm = [Int16](repeating: 0, count: count)
                var bad = false
                data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
                    let f = raw.bindMemory(to: Float.self)
                    for i in 0..<count {
                        let v = f[i]
                        if !v.isFinite { bad = true; break }
                        pcm[i] = Int16(max(-32768, min(32767, (v * 32768).rounded())))
                    }
                }
                if bad {
                    call.reject("Kokoro produced invalid audio (not a number)", "nan")
                    return
                }
                let bytes = pcm.withUnsafeBufferPointer { Data(buffer: $0) }
                call.resolve(["audio": bytes.base64EncodedString(), "sampleRate": 24000])
            } catch {
                call.reject("Kokoro synthesis failed: \(error.localizedDescription)", "synth-error")
            }
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        queue.async {
            self.session = nil
            self.loadedModel = nil
            call.resolve()
        }
    }
}
