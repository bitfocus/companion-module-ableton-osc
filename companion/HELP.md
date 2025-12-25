
# Ableton OSC Companion Module - Quick Help

Welcome! This Companion module lets you control Ableton Live via OSC, with advanced visual feedback (clip names, colors, meters, etc.).

![Main Example](https://raw.githubusercontent.com/bitfocus/companion-module-ableton-osc/refs/heads/main/img/main_example.png)

## Quick Setup

1. **Install the AbletonOSC script** in Ableton Live ([see documentation](https://github.com/ideoforms/AbletonOSC)).
2. **Restart Ableton Live** and check that "AbletonOSC" is active in MIDI preferences/Control Surface.
3. **Add this module in Companion**.
4. **Configure IP and ports**:
   - Target IP: Computer running Ableton (usually `127.0.0.1` if same machine)
   - Send Port: 11000
   - Receive Port: 11001
5. **Press the "Scan Project" button** (in Utility presets) to fetch your project structure (track names, scenes, clips, devices).

## Main Features

- **Fire/Stop clips**: Buttons for each clip, with name and color.
- **Mute/Unmute track**: Shows track name, meter, and mute state.
- **Stop track**: Stops all clips on a track.
- **Fade in/out**: Smooth audio fades for tracks or clips.
- **Device control**: On/Off, set parameters, visual feedback.
- **Dynamic variables**: Real-time display of values (level, mute, parameters).
- **Audio Follow Video (Advanced Fade)**: Automate fades based on a variable (e.g., camera tally). When a camera goes ON AIR, the track fades in; when OFF AIR, it fades out. See the [Advanced Fading Guide](https://github.com/bitfocus/companion-module-ableton-osc/wiki/Advanced-Fading) for details.

---

For more details, check the [full documentation and Wiki](https://github.com/bitfocus/companion-module-ableton-osc/wiki).

