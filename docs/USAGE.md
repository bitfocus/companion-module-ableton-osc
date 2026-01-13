# Usage Guide

## Presets Inventory

The module automatically generates presets organized in a hierarchical folder structure by track name. After running "Scan Project", all presets are dynamically populated with track and clip names from your Ableton project.

> **Important**: Run "Scan Project" first to populate all presets with your project's tracks, clips, and devices!

### Category: 0. Start Here

* 🔍 **Scan Project**: **(Essential)** Scans the current Ableton project to update track/scene counts, names, colors, and devices. This populates all other preset categories.

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
  * **Visual Meter** (Right bar) showing real-time audio level.
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
* **Selected Parameter Value**: Displays the current value.
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

#### Note: "Create Variable for this parameter?"

When using actions like **Set Parameter Value** or **Step Parameter**, you will see a checkbox labeled **"Create Variable for this parameter?"**.

* **Checked**: The module will create a dynamic variable for this parameter (e.g., `$(ableton:device_param_1_1_1)`). This allows you to display the real-time value of this parameter on a button.
* **Unchecked**: The parameter is controlled blindly without feedback/variable update. This saves resources and is recommended if you don't need to see the value.

### Feedbacks

* **Clip Color**: Changes button background to match Ableton clip color.
* **Clip Playing (Blink)**: Blinks the button when the clip is playing.
* **Track Meter Level**: Changes color if audio level exceeds a threshold.
* **Track Mute**: Changes background color (Red) if track is muted.
* **Track Meter Visual**: Displays a real-time PNG bargraph on the button (Stereo Left, Stereo Right, or Full).

## Variables

* `$(ableton:clip_name_TRACK_CLIP)`: Clip name (e.g., `$(ableton:clip_name_1_1)`).
* `$(ableton:track_name_TRACK)`: Track name.
* `$(ableton:track_meter_TRACK)`: Current track audio level (0.0 to 1.0).
* `$(ableton:track_mute_TRACK)`: Track mute state (1 or 0).

## Troubleshooting

* **No visual feedback (Meters/Names)?**
  * Did you run **Scan Project**?
  * Check that the "Receive Port" in Companion matches the output port configured in AbletonOSC (usually 11001).
  * Check that no firewall is blocking UDP ports 11000 and 11001.
* **Module disconnects/reconnects?**
  * Check Companion logs. If it persists, check your network configuration.
