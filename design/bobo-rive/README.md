# Bobo animation handoff

The app now uses a first working, vector-only Rive rig. This is a starting point for character animation polish, with the approved Bobo illustration preserved.

## Files

- `artwork.svg`: named vector groups for the body, head, eyes, tail, shadow, and blue pick. Import into the Rive editor to build a more detailed rig.
- `scene.rml`: editable Rive Markup Language source, including the vector paths, timelines, state machine, and view model.
- `rive.yaml`: local Rive CLI project configuration.
- `../../apps/web/public/bobo.riv`: compiled runtime asset, currently about 7 KB.

## App contract

Keep these names when replacing the exported asset:

| Item | Name / value |
| --- | --- |
| Artboard | `Bobo`, 360 × 360, transparent background |
| State machine | `Bobo`, set as the artboard default |
| View model | `Bobo`, with a default instance |
| Number property | `mood`: `0` idle, `1` curious, `2` thinking |
| Trigger property | `celebrate`: one-shot celebration, then return to the current mood |

Use modern view-model data binding, not legacy state-machine inputs. Embed any assets in the exported file. The app uses Canvas Lite: keep to supported vector paths, fills, strokes, transforms, and timeline animation. Avoid scripts, text, audio, feathering, and renderer-specific effects unless the runtime is upgraded deliberately.

The first rig has quiet breathing/tail movement, blinks, a curious head tilt, a thinking pose, and a two-bounce celebration. Idle should remain low-energy and loop seamlessly. The import dialog drives curious/thinking; returning from the song editor triggers celebration. Playing mode stays focused on the sheet.

## Animator polish brief

Preserve Bobo’s round silhouette, large ears, soft belly, guitar, and warm cocoa/biscuit palette. Keep motion cuddly and curious rather than frantic. Use the approved SVG as the appearance reference.

Next authoring passes: a small welcome wave; eyebrow/eye tracking for curious previews; a gentle page-turn loading loop; a delighted song-add reaction; a cheeky blue-pick reveal; and settling into a quiet pose. These are art directions, not additional app inputs in the current contract. Add inputs only when their app interactions are implemented.

Suggested pivots: body at (180, 280), head at (180, 150), tail at (236, 273), eyelids centered on each eye. Separate forearms/hands/guitar into named groups for waving or pick interactions; the current first rig keeps those paths together.

## Rebuild locally

Install the [Rive CLI](https://rive.app/docs/cli/getting-started), then run from the repository root:

```sh
rive design/bobo-rive --verify
rive design/bobo-rive --once
cp design/bobo-rive/build/bobo.riv apps/web/public/bobo.riv
```

These non-scripted local builds need no sign-in. Producing an editor `.rev` or pushing the source to a Rive account requires sign-in; use the CLI’s `--rev` / `push` workflows when editor access is available.

Preview states without opening the editor:

```sh
rive design/bobo-rive --screenshot --advance=1s
rive design/bobo-rive --screenshot --data=mood=1 --advance=1s
rive design/bobo-rive --screenshot --data=mood=2 --advance=1s
rive design/bobo-rive --screenshot --data=celebrate=true --advance=400ms
```

## Runtime checks

The runtime is lazy-loaded only for visible, animated Bobo instances. WASM is served from the app’s own Vite asset URL. Both `.riv` and `.wasm` are included in offline precaching. Offscreen/background instances pause. Reduced-motion users see the static SVG; the SVG also remains the fallback during loading or a failed runtime load.

Bobo is a keyboard-accessible button by default: hover/focus selects the curious pose, and tap/Enter/Space cycles contextual speech and fires celebration. Speech clears after 4.5 seconds and is announced through an output element. These interactions also work with static artwork under reduced motion or load failure. Set `interactive={false}` for purely illustrative moments such as success notices. The sidebar thinks during active operations/sync; Discover reacts to fetching; library Bobo reacts to searches. “Bobo, pick a song” opens a random song from the current filtered library. Playing mode remains focused on the sheet.

Before shipping a replacement, check all three moods, celebration returning to the selected mood, transparent edges in both themes, mobile sizing, reduced motion, failed asset loading, and offline reload after the updated service worker is installed.
