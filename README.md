# Companion Module for Ableton Live (OSC)

This module allows you to control Ableton Live via OSC using the [AbletonOSC](https://github.com/ideoforms/AbletonOSC) control script.

It offers advanced visual feedback, including clip names, colors, and real-time audio meters directly on your Stream Deck buttons.

## Prerequisites

- **Ableton Live** (Version 9, 10, 11, or 12)
- **Bitfocus Companion**
- The **AbletonOSC** script installed in Ableton Live.

## Installing AbletonOSC

For this module to work, you must install the remote script in Ableton Live:

1.  Download the latest version of [AbletonOSC](https://github.com/ideoforms/AbletonOSC) (Code > Download ZIP).
2.  Extract the `AbletonOSC-master` folder.
3.  Rename the extracted folder to `AbletonOSC`.
4.  Move this folder into the "MIDI Remote Scripts" directory of your Ableton Live installation:
    *   **Windows**: `C:\ProgramData\Ableton\Live x.x\Resources\MIDI Remote Scripts\`
    *   **macOS**: Right-click the Ableton Live application > "Show Package Contents" > `Contents/App-Resources/MIDI Remote Scripts/`
5.  Launch Ableton Live.
6.  Go to **Options** > **Preferences** > **Link Tempo MIDI**.
7.  In the "Control Surface" section, select **AbletonOSC** in one of the dropdown lists.
8.  Verify that the default ports are 11000 (Input) and 11001 (Output). If you change them, note them down for Companion configuration.

## Configuration in Companion

1.  Add an **Ableton Live (OSC)** instance in Companion.
2.  Configure the settings:
    *   **Target IP**: The IP address of the computer running Ableton (leave `127.0.0.1` if it's the same computer).
    *   **Target Port (Send)**: AbletonOSC listening port (Default: `11000`).
    *   **Receive Port (Listen)**: Companion listening port for feedback (Default: `11001`).
3.  Save. The status should change to "OK".

## Using Presets

The module automatically generates presets to help you get started quickly.

### Category: Clips
A grid of buttons (default 8 tracks x 8 scenes) that allows you to:
*   **Fire a clip** (Press).
*   **Stop a clip** (Release or other configured action).
*   **Display the clip name** in real-time.
*   **Display the clip color** as the button background.

### Category: Tracks
Buttons to control tracks:
*   **Stop Track**: Stops playing all clips on a specific track. Displays the track name.

### Category: Meters
Buttons displaying real-time track audio levels:
*   **Meter Track**: Displays the track name and a dynamic bargraph.
*   **Display Options** (via the Feedback tab):
    *   *Right Bar (Stereo)*: Two thin bars (L/R) on the right edge.
    *   *Left Bar (Stereo)*: Two thin bars (L/R) on the left edge.
    *   *Full Button (Stereo)*: Meter occupying the entire button.

## Available Actions

*   **Fire Clip**: Triggers a clip (Track, Scene).
*   **Stop Clip**: Stops the current clip on a track.
*   **Stop Track**: Stops all clips on a track.
*   **Refresh Clip Info**: Forces an update of names and colors.

## Variables

*   `$(ableton:clip_name_TRACK_CLIP)`: Clip name (e.g., `$(ableton:clip_name_1_1)`).
*   `$(ableton:track_name_TRACK)`: Track name.
*   `$(ableton:track_meter_TRACK)`: Current track audio level (0.0 to 1.0).

## Troubleshooting

*   **No visual feedback (Meters/Names)?**
    *   Check that the "Receive Port" in Companion matches the output port configured in AbletonOSC (usually 11001).
    *   Check that no firewall is blocking UDP ports 11000 and 11001.
*   **Module disconnects/reconnects?**
    *   Check Companion logs. If it persists, check your network configuration.
