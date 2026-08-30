# Single device preview harness

Rebuilding a whole rack to look at one switch takes about ten minutes.
Building that switch on its own and photographing it takes five seconds,
and five seconds is the difference between modelling from a photograph and
guessing. Three bugs in the first device built this way were found only by
looking at the render and would never have been found by reading the code:
detail measured from the wrong plane and buried inside the panel, a port
pitch guessed at half its real value, and forty eight jacks drawn as flat
tiles because the shield covered the hole instead of ringing it.

## The loop

    # once
    python3 script/models/preview/serve.py 4310 &

    # per iteration
    python3 script/models/preview/one_device.py <module> <Class> \
        script/models/preview/glb/<name>.glb
    node script/models/preview/shot.mjs "glb/<name>.glb" /tmp/shot.png face 1 0

`shot.mjs` takes `face` or `angle`, a zoom multiplier, and a horizontal pan
in panel widths, so `... angle 3 0.35` frames the right hand third of a
panel from three quarters on.

## Getting something to model from

    script/models/preview/getphoto.sh crs354 '<url>' photos
    python3 script/models/preview/crop.py photos/crs354.jpg \
        photos/crs354_right.jpg 0.62 0.5 1.0 0.72

`PHOTO_SOURCES.md` next door lists verified photographs for every product
in the library, and explains how to calibrate one so features come off it
as millimetres instead of impressions.

`glb/` is scratch and is not committed.
