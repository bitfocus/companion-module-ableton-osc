# Advanced Fading: Fade Track by State

This module includes a powerful action called **Fade Track by State**, also called Audio follow Video. It allows you to automate audio fades (In and Out) based on the value of a Companion variable.

This is particularly useful for broadcast workflows where you want to automatically open a microphone when a camera goes ON AIR, and close it when it goes OFF AIR.

## The Concept

The action monitors a specific variable (the "State").

* When the variable becomes **True** (or `1`, `on`), the track fades to the **On Level**.
* When the variable becomes **False** (or `0`, `off`), the track fades to the **Off Level**.

## The 8 Parameters

### 1. State (True/False)
* **What it does**: The variable to monitor. Use Companion variable syntax like `$(module:variable)`.
* **Values**: `true`, `1`, `on` = ON state | `false`, `0`, `off` = OFF state

### 2. Track
* **What it does**: The Ableton Live track to control.

### 3. Hold Time (Delay before Fade In)
* **When it happens**: Immediately after the variable becomes **True**.
* **What it does**: Waits for X milliseconds before starting the fade in.
* **Usage**: Useful if you want to wait for the camera cut to fully complete before opening the audio.

### 4. Rise Time (Fade In Duration)
* **When it happens**: After the Hold Time is finished.
* **What it does**: The time it takes for the volume to go from **Off Level** to **On Level**.
* **Usage**: A smooth fade-in (e.g., 500ms or 1000ms) is less abrupt than a hard cut.

### 5. On Time (Delay before Fade Out)
* **When it happens**: Immediately after the variable becomes **False**.
* **What it does**: Keeps the audio at **On Level** for X milliseconds *after* the camera goes off air.
* **Usage**: This is critical for "trailing audio". It ensures that if the person is still finishing a sentence as the camera cuts away, they aren't cut off abruptly.

### 6. Fall Time (Fade Out Duration)
* **When it happens**: After the On Time is finished.
* **What it does**: The time it takes for the volume to fade from **On Level** to **Off Level**.
* **Usage**: A slow fade out (e.g., 3500ms) sounds natural.

### 7. On Level (0-100%)
* **What it does**: The target volume level when the state is **True/On**.
* **Default**: 85% (approximately 0 dB in Ableton)
* **Usage**: Set this to match your desired "open mic" level.

### 8. Off Level (0-100%)
* **What it does**: The target volume level when the state is **False/Off**.
* **Default**: 0% (muted)
* **Usage**: Usually 0% for a full mute, but can be set higher if you want a "ducked" level instead.

## Example Scenario: Camera Tally

Let's say you have a camera connected to your switcher, and you are using a Companion module (like `umd-listener` or a switcher module) to get the Tally status.

* **Variable**: `$(umd:tally_1)`
* **Value**: Returns `true` when Camera 1 is ON AIR, and `false` when it is OFF AIR.

### Step-by-Step Setup

1. **Create a Trigger** in Companion.
2. **Event**: Select "On variable change".
    * **Variable to watch**: `$(umd:tally_1)`
4. **Action**: Add the action **ableton: Track - Fade by State of a variable**.
5. **Configure the Action**:
    * **State**: Enter the variable name: `$(umd:tally_1)`.
    * **Track**: Select the audio track corresponding to Camera 1 (e.g., "Cam 1 Mic").
    * **On Level**: 85% (or your desired level)
    * **Off Level**: 0% (muted)
    * **Time Parameters**: Configure the 4 timing values.

## Visual Timeline

```text
Variable:   [FALSE]---> [TRUE] ---------------------------------> [FALSE] --------------->
Timeline:               | Hold |  Rise  |        (At On Level)    |  On Time  |   Fall   |
Volume:     [Off] ------|______|/ / / / |_________________________|___________|\ \ \ \ \ |-- [Off]
                        ↑               ↑                                     ↑          ↑
                        Off Level       On Level                              On Level   Off Level
```

## Example Configuration

![Audio Follow Video Timeline](../img/AfV.png)