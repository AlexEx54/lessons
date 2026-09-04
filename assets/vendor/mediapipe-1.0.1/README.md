# MediaPipe Tasks Vision runtime

This directory contains the browser runtime from `@mediapipe/tasks-vision@1.0.1`
and Google's MediaPipe Selfie Segmenter landscape model. The files are vendored
so video background processing works without a third-party CDN at call time.

- Runtime package: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1
- Model source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite
- Model SHA-256: `490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e`
- License: Apache-2.0; see `LICENSE`

To refresh the runtime after updating the npm dependency, copy
`vision_bundle.mjs`, `wasm/vision_wasm_internal.js`, and
`wasm/vision_wasm_internal.wasm` from the installed package.
