# Companion Module for Ableton Live (OSC)

This module allows you to control Ableton Live via OSC using the [AbletonOSC](https://github.com/ideoforms/AbletonOSC) control script.

It offers advanced visual feedback, including clip names, colors, and real-time audio meters directly on your Stream Deck buttons. It supports triggering clips, stopping tracks, muting tracks, and more. It also allows to control devices and plugins parameters.

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

1. Add an **Ableton Live (OSC)** instance in Companion.
2. Configure the settings:
    - **Target IP**: The IP address of the computer running Ableton (leave `127.0.0.1` if it's the same computer).
    - **Target Port (Send)**: AbletonOSC listening port (Default: `11000`).
    - **Receive Port (Listen)**: Companion listening port (Default: `11001`).
3. Save. The status should change to "OK".

## ⚠️ IMPORTANT: First Step

**Before using any buttons, you MUST run the "Scan Project" action.**

1. Go to the **Presets** tab.
2. Open the **Utility** category.
3. Drag the **Scan Project** button to your surface.
4. Press the button.

This will fetch the number of tracks, scenes, clip names, device parameters and colors from your current Ableton project. Without this step, buttons may not work or display correct information.

## Presets Inventory

The module automatically generates presets to help you get started quickly.

### Category: Utility

- **Scan Project**: **(Essential)** Scans the current Ableton project to update track/scene counts, names, and colors.

### Category: Clips

A grid of buttons (default 8 tracks x 8 scenes) that allows you to:

- **Fire a clip** (Press).
- **Display the clip name** as the button name.
- **Display the clip color** as the button background.
- **Blink** when the clip is playing.

### Category: Tracks

Buttons to control tracks:

- **Track - Meter & Mute**: Toggles track mute.
  - Displays track name.
  - **Red Background** when muted.
  - **Visual Meter** (Right bar) showing real-time audio level.

### Category: Tracks Stop

- **Track - Stop**: Stops playing all clips on a specific track. Displays the track name.

### Category: Meters

Buttons displaying real-time track audio levels:

- **Meter Track**: Displays the track name and a dynamic bargraph.

### Category: Device - Toggle

- **Device Toggle**: Toggles a device (On/Off) on a specific track.
  - Displays device name.
  - **Green Background** when the device is On.

### Category: Device - Select and Control

A set of generic buttons to control the *currently selected* parameter (see Actions).

- **Step Up (+)** / **Step Down (-)**: Increases or decreases the value of the selected parameter.
- **Set ON** / **Set OFF**: Sets the selected parameter to max (100%) or min (0%).
- **Toggle**: Toggles the selected parameter between 0 and 1.

## Features & Feedbacks

### Actions

- **Fire Clip**: Triggers a clip (Track, Scene).
- **Stop Clip**: Stops the current clip on a track.
- **Stop Track**: Stops all clips on a track.
- **Mute Track**: Toggles, Mutes, or Unmutes a track.
- **Fade Out and Stop Clip**: Fades out volume and stops the clip.
- **Fade In and Fire Clip**: Fades in volume and fires the clip.
- **Fade Out and Stop Track**: Fades out track volume.
- **Fade In Track Volume**: Fades in track volume.
- **Fade Track by State**: Advanced fading based on a variable state.
- **Refresh Clip Info**: Forces an update of names and colors for a specific clip.
- **Scan Project**: Updates the entire module state from Ableton.
- **Device Actions**:
  - **Device Toggle**: Toggles a device on/off.
  - **Set Parameter Value**: Sets a specific value for a parameter.
  - **Step Parameter**: Increments/Decrements a parameter value.
  - **Select Device Parameter**: Selects a parameter for the "Select and Control" presets.

#### Note: "Create Variable for this parameter?"

When using actions like **Set Parameter Value** or **Step Parameter**, you will see a checkbox labeled **"Create Variable for this parameter?"**.

- **Checked**: The module will create a dynamic variable for this parameter (e.g., `$(ableton:device_param_1_1_1)`). This allows you to display the real-time value of this parameter on a button.
- **Unchecked**: The parameter is controlled blindly without feedback/variable update. This saves resources and is recommended if you don't need to see the value.

### Feedbacks

- **Clip Color**: Changes button background to match Ableton clip color.
- **Clip Playing (Blink)**: Blinks the button when the clip is playing.
- **Track Meter Level**: Changes color if audio level exceeds a threshold.
- **Track Mute**: Changes background color (Red) if track is muted.
- **Track Meter Visual**: Displays a real-time PNG bargraph on the button (Stereo Left, Stereo Right, or Full).

## Variables

- `$(ableton:clip_name_TRACK_CLIP)`: Clip name (e.g., `$(ableton:clip_name_1_1)`).
- `$(ableton:track_name_TRACK)`: Track name.
- `$(ableton:track_meter_TRACK)`: Current track audio level (0.0 to 1.0).
- `$(ableton:track_mute_TRACK)`: Track mute state (1 or 0).

## Troubleshooting

- **No visual feedback (Meters/Names)?**
  - Did you run **Scan Project**?
  - Check that the "Receive Port" in Companion matches the output port configured in AbletonOSC (usually 11001).
  - Check that no firewall is blocking UDP ports 11000 and 11001.
- **Module disconnects/reconnects?**
  - Check Companion logs. If it persists, check your network configuration.

## Support

Enjoying this module? Feel free to buy me a coffee! ☕

<a href="https://www.buymeacoffee.com/matlantin" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

