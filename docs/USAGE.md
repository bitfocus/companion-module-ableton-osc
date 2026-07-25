# Usage Guide

## Presets Inventory

The module automatically generates presets organized in a hierarchical folder structure by track name. After running "Scan Project", all presets are dynamically populated with track and clip names from your Ableton project.

> **Important**: Run "Scan Project" first to populate all presets with your project's tracks, clips, and devices!

### Category: 0. Start Here

* 🔍 **Scan Project**: **(Essential)** Scans the current Ableton project to update track/scene counts, names, colors, and devices. This populates all other preset categories.
* 📡 **Raw OSC**: Template button for sending custom OSC commands not yet implemented in the module.

### Category: Clips / Fire / [Track Name]

Organized by track, a grid of buttons to fire clips:

* **Fire [Clip Name]**: Fires the clip.
  * Displays the clip name as variable.
  * **Background color** matches the Ableton clip color.
  * **Blinks** when the clip is playing.
* Only clips that exist are shown (empty slots are skipped after scan).

### Category: Clips / Stop / [Track Name]

Organized by track, buttons to stop specific clips:

* ⏹️ **Stop [Clip Name]**: Stops the clip.
  * **Red Background**.
  * Displays clip name.

### Category: Clips / Fade / [Track Name]

Organized by track, buttons for clip fading:

* 📈 **Fade In [Clip Name]**: Fires the clip with a smooth volume fade-in (default 1.5s).
* 📉 **Fade Out [Clip Name]**: Fades out the clip's volume and stops it (default 3.5s).
  * Background color matches Ableton clip color.

### Category: Tracks / [Track Name]

All controls for a specific track in one place:

* ⏹️ **Stop All Clips**: Stops all playing clips on the track.
* **Mute**: Toggles track mute.
  * Displays track name.
  * **Red Background** when muted.
  * **Stereo VU-meter** (two native gauge elements, Left/Right) showing real-time audio level.
  * **Volume fader** (native gauge) showing the track's current volume.
* 📈 **Fade In**: Fades in the track volume (default 1.5s).
* 📉 **Fade Out**: Fades out the track volume (default 3.5s).
  * **Behavior**: Fades volume to 0, stops all playing clips on the track, then restores the volume to its initial level.

### Category: Devices / Toggle / [Track Name]

Organized by track, device on/off toggles:

* **[Device Name]**: Toggles a device (On/Off).
  * Displays device name and track name.
  * **Green Background** when the device is On.

### Category: Device Params / [Track Name] / [Device Name]

Hierarchical organization of device parameters (populated after scan):

* **[Parameter Name]**: Selects this parameter for control via the "Controls" category buttons.
  * **Orange Background** when selected.

### Category: Controls

Generic buttons to control the *currently selected* parameter:

* ➖ **Step Down (-)**: Decreases the value of the selected parameter.
* ➕ **Step Up (+)**: Increases the value of the selected parameter.
* **ON**: Sets the selected parameter to max (100%).
* **OFF**: Sets the selected parameter to min (0%).
* 🔄 **Toggle**: Toggles the selected parameter between 0 and 100.
* **Selected Parameter Value**: Displays the current value, with a native ring gauge showing it as a percentage (0-100).
* **Selected Parameter Name**: Displays the name of the selected parameter.

## Features & Feedbacks

### Actions

* **Fire Clip**: Triggers a clip (Track, Scene).
* **Stop Clip**: Stops the current clip on a track.
* **Stop Track**: Stops all clips on a track.
* **Mute Track**: Toggles, Mutes, or Unmutes a track.
* **Fade Out and Stop Clip**: Fades out volume and stops the clip.
* **Fade In and Fire Clip**: Fades in volume and fires the clip.
* **Fade Out and Stop Track**: Fades out track volume, stops clips, and restores volume.
* **Fade In Track Volume**: Fades in track volume.
* **Fade Track by State**: Advanced fading based on a variable state (See [Advanced Fading Guide](FADE_BY_STATE.md)).
* **Refresh Clip Info**: Forces an update of names and colors for a specific clip.
* **Scan Project**: Updates the entire module state from Ableton.
* **Device Actions**:
  * **Device Toggle**: Toggles a device on/off.
  * **Set Parameter Value**: Sets a specific value for a parameter.
  * **Step Parameter**: Increments/Decrements a parameter value.
  * **Select Device Parameter**: Selects a parameter for the "Select and Control" presets.
* **Selected Device Parameter Actions** (act on whatever "Select Device Parameter" last selected):
  * **Toggle**: Switches the parameter between 0% and 100%.
  * **Step (+/-)**: Increments/Decrements the value by a given step.
  * **Set Value**: Sets the value (0-100).
* **Raw OSC Command**: Send any custom OSC message to AbletonOSC. Useful for commands not yet implemented in the module.
  * **Address**: The OSC path (e.g., `/live/song/set/tempo`)
  * **Arguments**: Comma-separated values. Prefix with type: `i:123` (int), `f:1.5` (float), `s:text` (string). Without prefix, type is auto-detected.
  * **Response Capture**: When sending a "get" command, the response is automatically stored in a variable named `$(ableton:raw_<address>)`. Example: `/live/song/get/tempo` → `$(ableton:raw_live_song_get_tempo)`.
  * **Last Response**: The most recent raw response is also available in `$(ableton:last_raw_response)`.
* **Clip Control Actions** (v1.2.0):
  * **Clip - Set Loop Start to Now**: Sets the loop start point to the current playback position.
  * **Clip - Set Loop End to Now**: Sets the loop end point to the current playback position.
  * **Clip - Set Start Marker to Now**: Sets the start marker to the current playback position.
  * **Clip - Set End Marker to Now**: Sets the end marker to the current playback position.
  * **Clip - Set Loop Start (Value)** / **Set Loop End (Value)**: Sets the loop point to a specific position, in beats.
  * **Clip - Warping Toggle**: Toggles warping on/off for the clip (or forces it On/Off).
  * **Clip - Looping Toggle**: Toggles looping on/off for the clip (or forces it On/Off).
  * **Clip - Get Info**: Fetches loop points, markers, looping state, and warping state for a clip. Run it before relying on the matching variables and feedbacks: unlike track data, this information is not fetched by "Scan Project".

#### Note: "Create Variable for this parameter?"

When using actions like **Set Parameter Value** or **Step Parameter**, you will see a checkbox labeled **"Create Variable for this parameter?"**.

* **Checked**: The module will create a dynamic variable for this parameter (e.g., `$(ableton:device_param_1_1_1)`). This allows you to display the real-time value of this parameter on a button.
* **Unchecked**: The parameter is controlled blindly without feedback/variable update. This saves resources and is recommended if you don't need to see the value.

### Feedbacks

* **Clip Color**: Changes button background to match Ableton clip color.
* **Clip Playing (Blink)**: Blinks the button when the clip is playing.
* **Clip Warping** (v1.2.0): Orange background (#FFAD56) when warping is enabled on the clip.
* **Clip Looping** (v1.2.0): Orange background (#FFAD56) when looping is enabled on the clip.
* **Track Meter Level**: Changes color if audio level exceeds a threshold.
* **Track Mute**: Changes background color (Red) if track is muted.
* **Device (Plugin) Active**: Changes color (Green) when the selected device parameter is above 50%.
* **Selected Parameter Active**: Changes color (Orange) on the button whose parameter is the one currently selected for control.

> **Note**: The stereo VU-meter, volume, and selected-parameter displays are native Companion v5 **gauge** graphics elements bound directly to variables by expression — they don't need a feedback to update.

> **Note**: All bundled presets use Companion v5's **layered** button style (Background + Text only, no Image layer) rather than the legacy simple style.

## Variables

* `$(ableton:clip_name_TRACK_CLIP)`: Clip name (e.g., `$(ableton:clip_name_1_1)`).
* `$(ableton:track_name_TRACK)`: Track name.
* `$(ableton:track_meter_TRACK)`: Current track audio level, max of Left/Right (0.0 to 1.0).
* `$(ableton:track_meter_left_TRACK)` / `$(ableton:track_meter_right_TRACK)`: Per-channel audio level (0.0 to 1.0), used by the stereo VU-meter gauge.
* `$(ableton:track_volume_TRACK)`: Current track volume (0.0 to 1.0), used by the volume gauge.
* `$(ableton:track_mute_TRACK)`: Track mute state (1 or 0).
* `$(ableton:selected_parameter_value)`: Selected device parameter value, as displayed by Live (with its unit, e.g. `-6.0 dB`).
* `$(ableton:selected_parameter_value_percent)`: Selected device parameter value as a percentage (0-100), used by the ring gauge.
* `$(ableton:selected_parameter_name)`: Full name of the selected device parameter (`Track > Device > Parameter`).
* `$(ableton:selected_parameter_name_short)`: Parameter name only, without the track and device prefix — useful for small buttons.
* `$(ableton:selected_parameter_track)` / `_device` / `_num`: Indexes of the selected parameter.
* `$(ableton:device_param_TRACK_DEVICE_PARAM)`: Value of a device parameter, created on demand (see the "Create Variable for this parameter?" checkbox above).
* `$(ableton:clip_loop_start_TRACK_CLIP)` (v1.2.0): Loop start position in beats.
* `$(ableton:clip_loop_end_TRACK_CLIP)` (v1.2.0): Loop end position in beats.
* `$(ableton:clip_start_marker_TRACK_CLIP)` (v1.2.0): Start marker position in beats.
* `$(ableton:clip_end_marker_TRACK_CLIP)` (v1.2.0): End marker position in beats.
* `$(ableton:clip_warping_TRACK_CLIP)` (v1.2.0): Warping state (On/Off).
* `$(ableton:clip_looping_TRACK_CLIP)` (v1.2.0): Looping state (On/Off).
* `$(ableton:clip_position_TRACK_CLIP)`: Playback position in beats, refreshed by the "Set ... to Now" actions.
* `$(ableton:last_message)`: Address of the last OSC message received — handy when debugging.
* `$(ableton:last_raw_response)` / `$(ableton:last_raw_address)`: Value and address of the last unrecognized OSC response (see "Raw OSC Command").

## Troubleshooting

* **No visual feedback (Meters/Names)?**
  * Did you run **Scan Project**?
  * Check that the "Receive Port" in Companion matches the output port configured in AbletonOSC (usually 11001).
  * Check that no firewall is blocking UDP ports 11000 and 11001.
* **Module disconnects/reconnects?**
  * Check Companion logs. If it persists, check your network configuration.
