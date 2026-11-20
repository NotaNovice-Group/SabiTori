#ifndef KOKORO_ORT_H
#define KOKORO_ORT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/// Opens the Kokoro model at `path` with `threads` intra-op threads (CPU). Returns a handle, or NULL with a message in
/// `err` (at most `errlen` bytes, NUL-terminated). Checks that the model has the inputs input_ids, style and speed.
void *kokoro_ort_load(const char *path, int threads, char *err, int errlen);

/// Runs the model once: `ids` (n int64, pads included), `style` (256 floats), `speed`. On success returns 0 and sets
/// `*out` to a malloc'd buffer of `*outlen` float samples (24 kHz) that the caller frees with kokoro_ort_free.
/// On failure returns -1 with a message in `err`.
int kokoro_ort_run(void *model, const int64_t *ids, int n, const float *style, float speed, float **out, int64_t *outlen, char *err, int errlen);

void kokoro_ort_free(float *buffer);

/// Frees the model.
void kokoro_ort_unload(void *model);

#ifdef __cplusplus
}
#endif

#endif
