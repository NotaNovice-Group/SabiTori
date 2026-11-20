package cm.sabitori.app;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import android.content.pm.PackageInfo;
import android.content.res.AssetFileDescriptor;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Runs the bundled Kokoro-82M voice model with Microsoft's onnxruntime (CPU, several threads), on the device.
 * Only the model run is here: the page does the text work (phonemes, ids, style row; packages/speech/src/kokoro/)
 * and sends ids + one style row; this returns 24 kHz audio. onnxruntime-web in the WebView is far too slow for it.
 *
 *   load({ model: "kokoro/model_uint8.onnx", threads: 4 }) -> { threads }
 *   synthesize({ ids, style (256), speed }) -> { audio: base64 Int16 little-endian PCM, sampleRate: 24000 }
 *   unload()
 *
 * The model comes from the kokoro_pack install-time asset pack (Play installs it with the app; the debug APK carries
 * the same folder). Where it is stored uncompressed (debug APK) it is memory-mapped in place; where it is compressed
 * (the Play asset pack) it is copied once to the app's private files (again after an app update).
 */
@CapacitorPlugin(name = "SabiToriKokoro")
public class SabiToriKokoroPlugin extends Plugin {

    private static final Pattern SAFE_PATH = Pattern.compile("^[A-Za-z0-9._/-]+$");
    /** The model inside the kokoro_pack install-time asset pack (android/kokoro_pack), stored uncompressed. */
    static final String PACK_MODEL = "kokoro_pack/kokoro.onnx";
    /** One model run at a time, off the main thread and off Capacitor's plugin thread. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private OrtSession session;
    private String loadedModel;
    private String outputName = "waveform";
    private int threads = 1;

    @PluginMethod
    public void load(PluginCall call) {
        String model = call.getString("model");
        if (model == null || !SAFE_PATH.matcher(model).matches() || model.contains("..") || model.startsWith("/")) {
            call.reject("Kokoro model not found in the app", "no-model");
            return;
        }
        int cores = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors()));
        Integer asked = call.getInt("threads", 4);
        int wanted = Math.max(1, Math.min(asked == null ? 4 : asked, cores));
        worker.execute(() -> {
            try {
                if (session != null && model.equals(loadedModel)) {
                    JSObject r = new JSObject();
                    r.put("threads", threads);
                    call.resolve(r);
                    return;
                }
                OrtEnvironment env = OrtEnvironment.getEnvironment();
                OrtSession.SessionOptions options = new OrtSession.SessionOptions();
                options.setIntraOpNumThreads(wanted);
                options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
                // The Play asset pack (or the debug APK's copy of it) holds the model uncompressed: map it in place.
                MappedByteBuffer mapped = model.startsWith("kokoro/") ? mapAsset(PACK_MODEL) : null;
                OrtSession s = mapped != null ? env.createSession(mapped, options) : env.createSession(localCopy(model).getAbsolutePath(), options);
                for (String name : new String[] { "input_ids", "style", "speed" }) {
                    if (!s.getInputNames().contains(name)) {
                        s.close();
                        call.reject("Not a Kokoro model: no input " + name, "bad-model");
                        return;
                    }
                }
                closeSession();
                session = s;
                loadedModel = model;
                threads = wanted;
                outputName = s.getOutputNames().isEmpty() ? "waveform" : s.getOutputNames().iterator().next();
                JSObject r = new JSObject();
                r.put("threads", wanted);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Kokoro model could not load: " + e.getMessage(), "load-error");
            }
        });
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        JSArray idsArr = call.getArray("ids");
        JSArray styleArr = call.getArray("style");
        Double speedObj = call.getDouble("speed", 1.0);
        final float speed = speedObj == null ? 1f : speedObj.floatValue();
        long[] ids;
        float[] style;
        try {
            if (idsArr == null || styleArr == null || idsArr.length() < 3 || idsArr.length() > 512 || styleArr.length() != 256) throw new IllegalArgumentException();
            ids = new long[idsArr.length()];
            for (int i = 0; i < ids.length; i++) ids[i] = idsArr.getLong(i);
            style = new float[256];
            for (int i = 0; i < 256; i++) style[i] = (float) styleArr.getDouble(i);
        } catch (Exception e) {
            call.reject("Kokoro: ids must be 3 to 512 numbers and style 256 numbers", "bad-input");
            return;
        }
        final long[] idsIn = ids;
        final float[] styleIn = style;
        worker.execute(() -> {
            OrtSession s = session;
            if (s == null) {
                call.reject("Kokoro model not loaded", "not-loaded");
                return;
            }
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            try (
                OnnxTensor tIds = OnnxTensor.createTensor(env, LongBuffer.wrap(idsIn), new long[] { 1, idsIn.length });
                OnnxTensor tStyle = OnnxTensor.createTensor(env, FloatBuffer.wrap(styleIn), new long[] { 1, 256 });
                OnnxTensor tSpeed = OnnxTensor.createTensor(env, FloatBuffer.wrap(new float[] { speed }), new long[] { 1 })
            ) {
                Map<String, OnnxTensor> inputs = new HashMap<>();
                inputs.put("input_ids", tIds);
                inputs.put("style", tStyle);
                inputs.put("speed", tSpeed);
                try (OrtSession.Result result = s.run(inputs)) {
                    OnnxValue v = result.get(outputName).orElse(result.get(0));
                    FloatBuffer wave = ((OnnxTensor) v).getFloatBuffer();
                    int n = wave.remaining();
                    ByteBuffer pcm = ByteBuffer.allocate(n * 2).order(ByteOrder.LITTLE_ENDIAN);
                    for (int i = 0; i < n; i++) {
                        float x = wave.get();
                        if (Float.isNaN(x) || Float.isInfinite(x)) {
                            call.reject("Kokoro produced invalid audio (not a number)", "nan");
                            return;
                        }
                        pcm.putShort((short) Math.max(-32768, Math.min(32767, Math.round(x * 32768f))));
                    }
                    JSObject r = new JSObject();
                    r.put("audio", Base64.encodeToString(pcm.array(), Base64.NO_WRAP));
                    r.put("sampleRate", 24000);
                    call.resolve(r);
                }
            } catch (Throwable e) {
                call.reject("Kokoro synthesis failed: " + e.getMessage(), "synth-error");
            }
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        worker.execute(() -> {
            closeSession();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.execute(this::closeSession);
        worker.shutdown();
    }

    private void closeSession() {
        if (session != null) {
            try {
                session.close();
            } catch (Exception ignored) {
                // already gone
            }
        }
        session = null;
        loadedModel = null;
    }

    /** An uncompressed asset, memory-mapped where it is installed (no copy); null when absent or stored compressed. */
    private MappedByteBuffer mapAsset(String path) {
        try (AssetFileDescriptor fd = getContext().getAssets().openFd(path); FileInputStream in = new FileInputStream(fd.getFileDescriptor())) {
            return in.getChannel().map(FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getLength());
        } catch (Exception e) {
            return null;
        }
    }

    /** Fallback: the model as a file onnxruntime can open, copied once per app install or update. */
    private File localCopy(String model) throws Exception {
        File dir = new File(getContext().getFilesDir(), "kokoro");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("cannot create " + dir);
        String name = model.replace('/', '_');
        File file = new File(dir, name);
        File stamp = new File(dir, name + ".stamp");
        PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
        String want = info.lastUpdateTime + ":" + model;
        if (file.isFile() && stamp.isFile() && want.equals(readText(stamp))) return file;
        // Older copies (another model file) are removed: only one Kokoro model is kept.
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (!f.delete()) f.deleteOnExit();
        File tmp = new File(dir, name + ".part");
        try (InputStream in = openModelAsset(model); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 16];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
        }
        if (!tmp.renameTo(file)) throw new IllegalStateException("cannot write " + file);
        try (OutputStream out = new FileOutputStream(stamp)) {
            out.write(want.getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    /** The asset pack's copy first (a compressed pack still opens as a stream), then the web assets' copy. */
    private InputStream openModelAsset(String model) throws Exception {
        if (model.startsWith("kokoro/")) {
            try {
                return getContext().getAssets().open(PACK_MODEL);
            } catch (Exception ignored) {
                // not in a pack: older build or a web-only copy
            }
        }
        return getContext().getAssets().open("public/" + model);
    }

    private static String readText(File f) {
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) Math.min(f.length(), 4096)];
            int n = in.read(b);
            return n <= 0 ? "" : new String(b, 0, n, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
