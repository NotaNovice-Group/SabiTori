// A small C shim over onnxruntime's C API for the Kokoro voice (see include/KokoroORT.h).
#include "KokoroORT.h"

#include <onnxruntime/onnxruntime_c_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    OrtEnv *env;
    OrtSession *session;
    OrtMemoryInfo *memory;
    char output[128];
} KokoroModel;

static const OrtApi *ort(void) {
    static const OrtApi *api = NULL;
    if (!api) api = OrtGetApiBase()->GetApi(ORT_API_VERSION);
    return api;
}

/// Writes the status message into err and releases the status. Returns 1 when there was an error.
static int failed(OrtStatus *status, char *err, int errlen) {
    if (!status) return 0;
    if (err && errlen > 0) snprintf(err, (size_t)errlen, "%s", ort()->GetErrorMessage(status));
    ort()->ReleaseStatus(status);
    return 1;
}

static void say(char *err, int errlen, const char *msg) {
    if (err && errlen > 0) snprintf(err, (size_t)errlen, "%s", msg);
}

void kokoro_ort_unload(void *handle) {
    KokoroModel *m = (KokoroModel *)handle;
    if (!m) return;
    const OrtApi *api = ort();
    if (m->memory) api->ReleaseMemoryInfo(m->memory);
    if (m->session) api->ReleaseSession(m->session);
    if (m->env) api->ReleaseEnv(m->env);
    free(m);
}

void *kokoro_ort_load(const char *path, int threads, char *err, int errlen) {
    const OrtApi *api = ort();
    if (!api) {
        say(err, errlen, "onnxruntime API version not available");
        return NULL;
    }
    KokoroModel *m = (KokoroModel *)calloc(1, sizeof(KokoroModel));
    if (!m) {
        say(err, errlen, "out of memory");
        return NULL;
    }
    OrtSessionOptions *options = NULL;
    if (failed(api->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "kokoro", &m->env), err, errlen) ||
        failed(api->CreateSessionOptions(&options), err, errlen) ||
        failed(api->SetIntraOpNumThreads(options, threads < 1 ? 1 : threads), err, errlen) ||
        failed(api->SetSessionGraphOptimizationLevel(options, ORT_ENABLE_ALL), err, errlen) ||
        failed(api->CreateSession(m->env, path, options, &m->session), err, errlen) ||
        failed(api->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &m->memory), err, errlen)) {
        if (options) api->ReleaseSessionOptions(options);
        kokoro_ort_unload(m);
        return NULL;
    }
    api->ReleaseSessionOptions(options);

    OrtAllocator *allocator = NULL;
    if (failed(api->GetAllocatorWithDefaultOptions(&allocator), err, errlen)) {
        kokoro_ort_unload(m);
        return NULL;
    }
    // The model must take Kokoro's three inputs.
    size_t count = 0;
    if (failed(api->SessionGetInputCount(m->session, &count), err, errlen)) {
        kokoro_ort_unload(m);
        return NULL;
    }
    int found = 0;
    for (size_t i = 0; i < count; i++) {
        char *name = NULL;
        if (failed(api->SessionGetInputName(m->session, i, allocator, &name), err, errlen)) {
            kokoro_ort_unload(m);
            return NULL;
        }
        if (!strcmp(name, "input_ids") || !strcmp(name, "style") || !strcmp(name, "speed")) found++;
        (void)failed(api->AllocatorFree(allocator, name), NULL, 0);
    }
    if (found != 3) {
        say(err, errlen, "not a Kokoro model (inputs input_ids, style, speed missing)");
        kokoro_ort_unload(m);
        return NULL;
    }
    char *out = NULL;
    if (failed(api->SessionGetOutputName(m->session, 0, allocator, &out), err, errlen)) {
        kokoro_ort_unload(m);
        return NULL;
    }
    snprintf(m->output, sizeof(m->output), "%s", out);
    (void)failed(api->AllocatorFree(allocator, out), NULL, 0);
    return m;
}

int kokoro_ort_run(void *handle, const int64_t *ids, int n, const float *style, float speed, float **out, int64_t *outlen, char *err, int errlen) {
    KokoroModel *m = (KokoroModel *)handle;
    const OrtApi *api = ort();
    if (!m || !m->session) {
        say(err, errlen, "model not loaded");
        return -1;
    }
    *out = NULL;
    *outlen = 0;
    int64_t idsShape[2] = {1, n};
    int64_t styleShape[2] = {1, 256};
    int64_t speedShape[1] = {1};
    float speedValue = speed;
    OrtValue *inputs[3] = {NULL, NULL, NULL};
    OrtValue *output = NULL;
    OrtTensorTypeAndShapeInfo *info = NULL;
    float *data = NULL;
    float *copy = NULL;
    size_t count = 0;
    int rc = -1;
    const char *inNames[3] = {"input_ids", "style", "speed"};
    const char *outNames[1] = {m->output};

    if (failed(api->CreateTensorWithDataAsOrtValue(m->memory, (void *)ids, sizeof(int64_t) * (size_t)n, idsShape, 2, ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64, &inputs[0]), err, errlen)) goto done;
    if (failed(api->CreateTensorWithDataAsOrtValue(m->memory, (void *)style, sizeof(float) * 256, styleShape, 2, ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT, &inputs[1]), err, errlen)) goto done;
    if (failed(api->CreateTensorWithDataAsOrtValue(m->memory, &speedValue, sizeof(float), speedShape, 1, ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT, &inputs[2]), err, errlen)) goto done;
    if (failed(api->Run(m->session, NULL, inNames, (const OrtValue *const *)inputs, 3, outNames, 1, &output), err, errlen)) goto done;

    if (failed(api->GetTensorMutableData(output, (void **)&data), err, errlen)) goto done;
    if (failed(api->GetTensorTypeAndShape(output, &info), err, errlen)) goto done;
    if (failed(api->GetTensorShapeElementCount(info, &count), err, errlen)) goto done;
    copy = (float *)malloc(sizeof(float) * (count ? count : 1));
    if (!copy) {
        say(err, errlen, "out of memory");
        goto done;
    }
    memcpy(copy, data, sizeof(float) * count);
    *out = copy;
    *outlen = (int64_t)count;
    rc = 0;

done:
    if (info) api->ReleaseTensorTypeAndShapeInfo(info);
    if (output) api->ReleaseValue(output);
    for (int i = 0; i < 3; i++)
        if (inputs[i]) api->ReleaseValue(inputs[i]);
    return rc;
}

void kokoro_ort_free(float *buffer) { free(buffer); }
