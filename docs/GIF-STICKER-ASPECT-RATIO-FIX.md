# GIF/video-to-sticker aspect-ratio fix

Animated and static sticker converters now keep the original frame proportions.
It scales the longest dimension to fit within 480 pixels and lets the other
canvas dimension follow the source ratio. It does **not** crop the frame and
does **not** add a square padding canvas, so no black/transparent bars are
inserted by the converter.

Video is normalized with FFmpeg `scale=480:480:force_original_aspect_ratio=decrease`
(no `crop` and no `pad`). Animated GIF/WebP encoding uses Sharp `fit: 'inside'`
for both normal and smaller-file fallback encodes. The ordinary `-sticker` image path
and legacy static conversion helpers no longer add a square transparent pad either. The older duplicate helper in
`plugins2/tgsticker.js` and Nekogif's playable MP4 normalization have been updated
as well, so they do not crop the image before it reaches the sticker converter.

This is a non-square, proportional WebP output when the source is landscape or
portrait. It intentionally prioritizes the requested full-frame aspect ratio;
some WhatsApp clients may present stickers differently depending on their
sticker-rendering rules.

## Verification

Run `node -c lib/sticker.js`, `node -c plugins/nekogif.js`,
`node -c plugins2/tgsticker.js`, and `npm test`. The regression test asserts the
shared sticker paths use inside-scaling and contain no crop/pad filter.
