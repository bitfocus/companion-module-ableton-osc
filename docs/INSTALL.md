# Installation & Setup

## Prerequisites

- **Ableton Live** (Version 11 or 12)
- **Bitfocus Companion 5+** (for Companion 4.x, use module version **1.2.2**)
- The **AbletonOSC** script installed in Ableton Live.

## Installing AbletonOSC

For this module to work, you must install the remote script in Ableton Live:

1. Download the latest version of [AbletonOSC](https://github.com/ideoforms/AbletonOSC) (Code > Download ZIP).
2. Extract the `AbletonOSC-master` folder.
3. Rename the extracted folder to `AbletonOSC`.
4. Install it following the instructions on Ableton's Installing third-party remote scripts doc, by copying the AbletonOSC folder to:

    **Windows**: `\Users\[username]\Documents\Ableton\User Library\Remote Scripts`  
    **macOS**: `Macintosh HD/Users/[username]/Music/Ableton/User Library/Remote Scripts`

5. Restart Ableton.
6. In **Preferences** > **Link / Tempo / MIDI**, under the Control Surface dropdown, select the new "AbletonOSC" option. Live should display a message saying "AbletonOSC: Listening for OSC on port 11000".
7. Verify that the default ports are 11000 (Input) and 11001 (Output).
   If you need to change them, you can do so by editing the file abletonosc/constants.py.

## Configuration in Companion

1. Add an **Ableton Live (OSC)** instance in Companion.
2. Configure the settings:
    * **Target IP**: The IP address of the computer running Ableton (leave `127.0.0.1` if it's the same computer).
    * **Target Port (Send)**: AbletonOSC listening port (Default: `11000`).
    * **Receive Port (Listen)**: Companion listening port (Default: `11001`).
    * **Max tracks scanned** / **Max scenes scanned**: how much of the set "Project - Scan" reads (Default: `128` tracks, `64` scenes).
      Raise them for larger sets: the scan takes longer and the clip dropdowns grow (tracks × scenes entries).
      When the set is larger than these limits, the Companion log says so after a scan.
3. Save. The status shows "Connecting – Waiting for Ableton Live" until AbletonOSC answers, then "OK".
   If Live doesn't answer within 5 seconds (Live closed, AbletonOSC not enabled, wrong IP or port), the status becomes
   "Disconnected – No reply from AbletonOSC at <IP>:<port>". It turns back to "OK" by itself as soon as Live answers.

## ⚠️ IMPORTANT: First Step

**Before using any buttons, you MUST run the "Scan Project" action.**

1. Go to the **Presets** tab.
2. Open the **0. Start Here** category.
3. Drag the 🔍 **Scan Project** button to your surface.
4. Press the button.

This will fetch the number of tracks, scenes, clip names, device parameters and colors from your current Ableton project. Without this step, buttons may not work or display correct information.

The other preset categories (Clips, Tracks, Devices, Device Params) are only populated **after** this scan: reopen the Presets tab once it has run to see your clips and tracks appear, named and colored as in Live.
