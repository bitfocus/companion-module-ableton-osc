# Companion Module for Ableton Live (OSC)

This module allows you to control Ableton Live via OSC using the [AbletonOSC](https://github.com/ideoforms/AbletonOSC) control script.

It offers advanced visual feedback, including clip names, colors, and real-time audio meters directly on your Stream Deck buttons.

## Prerequisites

- **Ableton Live** (Version 11 or 12)
- **Bitfocus Companion**
- The **AbletonOSC** script installed in Ableton Live.

## Installing AbletonOSC

For this module to work, you must install the remote script in Ableton Live:

1. Download the latest version of [AbletonOSC](https://github.com/ideoforms/AbletonOSC) (Code > Download ZIP).
2. Extract the `AbletonOSC-master` folder.
3. Rename the extracted folder to `AbletonOSC`.
4. Install it following the instructions on Ableton's Installing third-party remote scripts doc, by copying the AbletonOSC folder to:

    Windows: \Users\[username]\Documents\Ableton\User Library\Remote Scripts  
    macOS: Macintosh HD/Users/[username]/Music/Ableton/User Library/Remote Scripts

5. Restart Ableton
6. In **Preferences** > **Link / Tempo / MIDI**, under the Control Surface dropdown, select the new "AbletonOSC" option. Live should display a message saying "AbletonOSC: Listening for OSC on port 11000"
7. Verify that the default ports are 11000 (Input) and 11001 (Output). If you change them, note them down for Companion configuration.

## Configuration in Companion

1.  Add an **Ableton Live (OSC)** instance in Companion.
2.  Configure the settings:
    *   **Target IP**: The IP address of the computer running Ableton (leave `127.0.0.1` if it's the same computer).
    *   **Target Port (Send)**: AbletonOSC listening port (Default: `11000`).
    *   **Receive Port (Listen)**: Companion listening port for feedback (Default: `11001`).
3.  Save. The status should change to "OK".

## ⚠️ IMPORTANT: First Step

**Before using any buttons, you MUST run the "Scan Project" action.**

1.  Go to the **Presets** tab.
2.  Open the **Utility** category.
3.  Drag the **Scan Project** button (Yellow background) to your surface.
4.  Press the button.

This will fetch the number of tracks, scenes, clip names, and colors from your current Ableton project. Without this step, buttons may not work or display correct information.

## Presets Inventory

The module automatically generates presets to help you get started quickly.

### Category: Utility
*   **Scan Project**: **(Essential)** Scans the current Ableton project to update track/scene counts, names, and colors.

### Category: Clip Fire
A grid of buttons (default 8 tracks x 8 scenes) that allows you to:
*   **Fire a clip** (Press).
*   **Display the clip name** as the button name.
*   **Display the clip color** as the button background.
*   **Blink** when the clip is playing.

### Category: Clip Stop
*   **Stop Clip**: Stops the specific clip on a track.
    *   Displays "STOP" + Clip Name.
    *   **Red Background**.

### Category: Clip - Fade
*   **Fade In Clip**: Fires a clip with a volume fade-in.
*   **Fade Out Clip**: Fades out volume and stops the clip.

### Category: Track - Meter & Mute
Buttons to control tracks:
*   **Mute Track**: Toggles track mute.
    *   Displays track name.
    *   **Red Background** when muted.
    *   **Visual Meter** (Right bar) showing real-time audio level.

### Category: Track - Stop
*   **Stop Track**: Stops playing all clips on a specific track. Displays the track name.

### Category: Track - Fade
*   **Fade In Track**: Fades in the track volume.
*   **Fade Out Track**: Fades out the track volume.

### Category: Track - Meter
Buttons displaying real-time track audio levels:
*   **Meter Track**: Displays the track name and a dynamic bargraph.

### Category: Device - Select and Control
Presets for controlling device parameters:
*   **Select Parameter**: Selects a parameter for control.
*   **Step Up/Down**: Increments or decrements the selected parameter value.
*   **Set ON/OFF**: Sets the selected parameter to min or max.
*   **Toggle**: Toggles the selected parameter.
*   **Value Display**: Shows the current value of the selected parameter.

### Category: Device - Toggle
*   **Device Toggle**: Toggles a specific device parameter (e.g., On/Off) directly.

## Features & Feedbacks

### Actions
*   **Clip - Fire**: Triggers a clip (Select by Name).
*   **Clip - Stop**: Stops a clip (Select by Name).
*   **Clip - Fade Out and Stop**: Fades out volume and stops the clip.
*   **Clip - Fire and Fade In**: Fades in volume and fires the clip.
*   **Clip - Refresh Info**: Forces an update of names and colors for a specific clip.
*   **Track - Stop**: Stops all clips on a track.
*   **Track - Mute**: Toggles, Mutes, or Unmutes a track.
*   **Track - Fade Out and Stop**: Fades out track volume.
*   **Track - Fade In**: Fades in track volume.
*   **Track - Fade by State**: Advanced fading based on a variable state.
*   **Device - Toggle**: Toggles a specific device parameter.
*   **Device - Set Parameter Value**: Sets a specific parameter to a value.
*   **Device - Step Parameter Value**: Steps a parameter value up or down.
*   **Device - Select Parameter**: Selects a parameter for the "Selected Parameter" actions.
*   **Selected Device Parameter - Toggle**: Toggles the currently selected parameter.
*   **Selected Device Parameter - Step**: Steps the currently selected parameter.
*   **Selected Device Parameter - Set Value**: Sets the currently selected parameter.
*   **Project - Scan**: Updates the entire module state from Ableton.

### Feedbacks
*   **Clip Color**: Changes button background to match Ableton clip color.
*   **Clip Playing (Blink)**: Blinks the button when the clip is playing.
*   **Track Meter Level**: Changes color if audio level exceeds a threshold.
*   **Track Mute**: Changes background color (Red) if track is muted.
*   **Track Meter Visual**: Displays a real-time PNG bargraph on the button (Stereo Left, Stereo Right, or Full).
*   **Device (Plugin) Active**: Changes color if a device parameter is active (> 0.5).
*   **Selected Parameter Active**: Highlights the button if its parameter is currently selected.

## Variables

The module exposes the following variables:
*   `$(ableton:last_message)`: Last received OSC message.
*   `$(ableton:track_name_X)`: Name of Track X.
*   `$(ableton:track_meter_X)`: Current level of Track X.
*   `$(ableton:track_mute_X)`: Mute state of Track X.
*   `$(ableton:clip_name_T_S)`: Name of Clip at Track T, Scene S.
*   `$(ableton:selected_parameter_name)`: Name of the currently selected parameter.
*   `$(ableton:selected_parameter_value)`: Value of the currently selected parameter.

## Troubleshooting

*   **No visual feedback (Meters/Names)?**
    *   Did you run **Scan Project**?
    *   Check that the "Receive Port" in Companion matches the output port configured in AbletonOSC (usually 11001).
    *   Check that no firewall is blocking UDP ports 11000 and 11001.
*   **Module disconnects/reconnects?**
    *   Check Companion logs. If it persists, check your network configuration.
