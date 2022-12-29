# Live Streaming with FFMPEG to Azure Media Services

Azure Media Services supports live streaming from many live encoding software solutions, including [FFmpeg](https://ffmpeg.org/).

This page shows multiple examples of how to use FFmpeg to stream live to Azure Media Services using different protocols and codec settings. These are just examples of what is available, and additional features can be added to these examples from the FFmpeg documentation.


## How to use FFmpeg to stream live to Azure Media Services

First install the FFmpeg executable from https://ffmpeg.org/

## List devices on your machine

To list all available devices on a Windows machine, run the following command:

```bash
ffmpeg -list_devices true -f dshow -i dummy
```

This will list all available devices including cameras and sound cards or microphones.  It will also list any virtual devices, like the OBS Studio Virtual Camera which is installed with OBS Studio. 

Example output:
```bash
[dshow @ 000002051604ce40] DirectShow video devices (some may be both video and audio devices)
[dshow @ 000002051604ce40]  "Integrated Camera"
[dshow @ 000002051604ce40]     Alternative name "@device_pnp_\\?\usb#vid_13d3&pid_56ba&mi_00#6&222db1a5&1&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global"
[dshow @ 000002051604ce40]  "OBS Virtual Camera"
[dshow @ 000002051604ce40]     Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\{A3FCE0F5-3493-419F-958A-ABA1250EC20B}"
[dshow @ 000002051604ce40]  "GoPro Webcam"
[dshow @ 000002051604ce40]     Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\{FDB60968-EC75-4CF9-BC63-7A2C7FFBF210}"
[dshow @ 000002051604ce40] DirectShow audio devices
[dshow @ 000002051604ce40]  "Headset Microphone (Logitech Stereo H650e)"
[dshow @ 000002051604ce40]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{332F73BE-E3C1-4BFF-AE27-19B3ABFE7C73}"
[dshow @ 000002051604ce40]  "Microphone (Yeti Stereo Microphone)"
[dshow @ 000002051604ce40]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{29FB72F8-9A74-4A20-95A8-88065501CEFC}"
[dshow @ 000002051604ce40]  "Microphone Array (Synaptics Audio)"
[dshow @ 000002051604ce40]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{AA4B41C9-108C-4AE3-AC5F-BEC685AE8140}"
```

## RTMP Streaming

Azure Media Services Channel supports RTMP push model. RTMP can be used with pass-through channels, or with live transcoding channels.

To use RTMP ingest, following is required:

- RTMP output supported encoder
- H.264 video and AAC audio codec output
- Key frame or GOP (Group of pictures) alignment across video qualities
- 1 to 2 second key frame interval (If using 30fps, we recommend a GOP size of 48 frames a fragment duration of 1.6 seconds for the best manifest compression)
- Unique stream names for each quality
- Network connectivity (Available bandwidth for aggregated video+audio bitrates)
- Strict CBR encoding recommended for optimum Adaptive bitrate performance.


**Note:** Make sure to **Restart** your channel in the portal (or API) each time you change FFmpeg command line settings and disconnect and reconnect your encoder to the channel. This is especially important if you change codec, resolutions, or add tracks. 


### Basic RTMP broadcasting
A basic live stream using the front camera and built in microphone on a laptop. 
Note that for RTMP streaming you have to add a unique "Stream Key" to the end of the RTMP ingest URL provided by Azure Media Services. This can be any custom value, or match the access token value provided to the API on creation of the live event.

```bash
fmpeg -f dshow -fflags nobuffer -rtbufsize 2000M -i video="Microsoft Camera Front":audio="Microphone Array (Realtek High Definition Audio(SST))" -f flv "rtmp://<<YOUR_CHANNEL>>.channel.media.azure.net:1935/live/<<LIVE EVENT ID>>/<<STREAM KEY>>"`
```

### Multiple Bitrate RTMP broadcast to a pass-through live event
In this example we will use three video qualities for output and ingest to Azure Media Services channel. For this configuration, you should use a basic or standard pass-through channel, as you do not need cloud transcoding when sending multiple bitrates to Azure. 

You can use multiple qualities, but keep in mind that, the initial quality will be limited by your machine’s encoding capabilities and your network connection to the channel ingest. If you exceeded your bandwidth or there is a poor network connection, you might need to adjust the quality count and also the encoding settings to use a lower resolution and bitrate. When using multiple qualities you should pay attention to the aggregated bitrate of all qualities.

```bash
ffmpeg.exe -threads 0 -re -stream_loop -1 -i "C:\Videos\ignite-multi-track-sample.mp4" -c:a aac -ab 128k -ac 2 -ar 48000 -c:v libx264 -s svga -b:v 500k -minrate 500k -maxrate 500k -bufsize 500k -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -f flv rtmp://f5c5123cea414ec5a8debfd2733ec86e.channel.media.azure.net:1935/live/c8b692f788fc4cbc92e7b358d8b1c260/Streams_500 -c:a aac -ab 128k -ac 2 -ar 48000 -c:v libx264 -s vga -b:v 300k -minrate 300k -maxrate 300k -bufsize 300k -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -f flv rtmp://f5c5123cea414ec5a8debfd2733ec86e.channel.media.azure.net:1935/live/c8b692f788fc4cbc92e7b358d8b1c260/Streams_300 -c:a aac -ab 128k -ac 2 -ar 48000 -c:v libx264 -s qvga -b:v 150k -minrate 150k -maxrate 150k -bufsize 150k  -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -f flv rtmp://f5c5123cea414ec5a8debfd2733ec86e.channel.media.azure.net:1935/live/c8b692f788fc4cbc92e7b358d8b1c260/Streams_150
```

## Smooth Streaming

The following examples show how to use Smooth Streaming ingest with various scenarios, including multiple audio streams for multi-language ingestion. 

### Stream From a Linux (Raspberry Pi) device

```bash
ffmpeg  -i /dev/video1 -pix_fmt yuv420p -f ismv -movflags isml+frag_keyframe  -video_track_timescale 10000000 -frag_duration 1600000 -framerate 30 -r 30  -c:v h264_omx -preset ultrafast -tune zerolatency -map 0:v:0  -b:v:0 2000k -minrate:v:0 2000k -maxrate:v:0 2000k -bufsize 2500k  -s:v:0 640x360  -map 0:v:0  -b:v:1 500k -minrate:v:1 500k -maxrate:v:1 500k -s:v:1 480x360 -g 48 -keyint_min 48 -sc_threshold 0  -c:a libfaac -ab 48k  -map 0:a? -threads 0 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```

### Stream Multiple Bitrates from a source file (looping)

```bash
ffmpeg -re -stream_loop -1 -i "C:\Video\tears_of_steel_1080p.mov" -movflags isml+frag_keyframe -frag_duration 1600000 -f ismv -threads 0 -c:a aac -ac 2 -b:a 64k -c:v libx264 -preset ultrafast -tune zerolatency -profile:v main -g 48 -keyint_min 48 -sc_threshold 0 -map 0:v -b:v:0 5000k -minrate:v:0 5000k -maxrate:v:0 5000k -s:v:0 1920x1080 -map 0:v -b:v:1 3000k -minrate:v:1 3000k -maxrate:v:1 3000k -s:v:1 1280x720 -map 0:v -b:v:2 1800k -minrate:v:2 1800k -maxrate:v:2 1800k -s:v:2 854x480 -map 0:v -b:v:3 1000k -minrate:v:3 1000k -maxrate:v:3 1000k -s:v:3 640x480 -map 0:v -b:v:4 600k -minrate:v:4 600k -maxrate:v:4 600k -s:v:4 480x360 -map 0:a:0
"http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(stream0^)"
```

Explanation of the parameters uses for the above command: 

```bash
-re     **READ INPUT AT NATIVE FRAMERATE
-stream_loop -1  **LOOP INFINITE
-i C:\Video\tears_of_steel_1080p.mov   **INPUT FILE IS THIS MOV FILE
-movflags isml+frag_keyframe  **OUTPUT IS SMOOTH STREAMING THIS SETS THE FLAGS
-frag_duration 1600000  ** SETS THE OUTPUT DURATION OF THE SMOOTH FRAGMENT TO 1.6 seconds
-f ismv  **OUTPUT ISMV SMOOTH
-threads 0  ** SETS THE THREAD COUNT TO USE FOR ALL STREAMS. YOU CAN USE A STREAM SPECIFIC COUNT AS WELL
-c:a aac  ** SET TO AAC CODEC
-ac 2   ** SET THE OUTPUT TO STEREO
-b:a 64k ** SET THE BITRATE FOR THE AUDIO
-c:v libx264  ** SET THE VIDEO CODEC
-preset fast ** USE THE FAST PRESET FOR X246
-profile:v main **USE THE MAIN PROFILE
-g 48 ** GOP SIZE IS 48 frames
-keyint_min 48 ** KEY INTERVAL IS SET TO 48 FRAMES
-map 0:v   ** MAP THE FIRST VIDEO TRACK OF THE FIRST INPUT FILE
-b:v:0 5000k   **SET THE OUTPUT TRACK 0 BITRATE
-minrate:v:0 5000k  ** SET OUTPUT TRACK 0 MIN RATE TO SIMULATE CBR
-maxrate:v:0 5000k  ** SET OUTPUT TRACK 0 MAX RATE TO SIMULATE CBR
-s:v:0 1920x1080  **SCALE THE OUTPUT OF TRACK 0 to 1920x1080. 
-map 0:v  ** MAP THE FIRST VIDEO TRACK OF THE FIRST INPUT FILE
-b:v:1 3000k ** SET THE OUTPUT TRACK 1 BITRATE TO 3Mbps
-minrate:v:1 3000k -maxrate:v:1 3000k  ** SET THE MIN AND MAX RATE TO SIMULATE CBR OUTPU
-s:v:1 1280x720  ** SCALE THE OUTPUT OF TRACK 1 to 1280x720
-map 0:v -b:v:2 1800k  ** REPEAT THE ABOVE STEPS FOR THE REST OF THE OUTPUT TRACKS
-minrate:v:2 1800k -maxrate:v:2 1800k -s:v:2 854x480 
-map 0:v -b:v:3 1000k -minrate:v:3 1000k -maxrate:v:3 1000k -s:v:3 640x480 
-map 0:v -b:v:4 600k -minrate:v:4 600k -maxrate:v:4 600k -s:v:4 480x360 
-map 0:a:0    ** FINALLY TAKE THE SOURCE AUDIO FROM THE FIRST SOURCE AUDIO TRACK
```

### Stream Audio Only from your Microphone

To stream audio only from a local microphone, you need to add the DirectShow filer with the "nobuffer" flag option along with setting the audio to the correctly named device on your system.

In addition, this sample shows how to use the "-metadata" property to set the audio language tag.  FFmpeg uses the 3-letter ISO language code format only. In this case, "eng" for English. 

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -i audio="Microphone Array (Synaptics Audio)" -metadata:s:a language=eng -c:a aac -b:a 192k -ar 48000 -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(audio)"
```

### Stream Multiple Audio sources

This example builds on the previous, showing how to add a second audio source from another sound device on your system and provide a "Spanish" language alternate track. This example also includes video from a GoPro Webcam. 

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -rtbufsize 15M -i audio="Microphone Array (Synaptics Audio)"  -f dshow -fflags nobuffer -i audio="Headset Microphone (Logitech Stereo H650e)" -itsoffset 1.00 -f dshow -fflags nobuffer -rtbufsize 2000M -i video="GoPro Webcam" -map 0:a:0 -map 1:a:0 -map 2:v:0 -metadata:s:a:0 language=eng -metadata:s:a:1 language=spa -c:a:0 aac -b:a:0 192k -ar:a:0 48000 -c:a:1 aac -b:a:1 192k -ar:a:1 48000 -c:v:2 libx264 -preset ultrafast -tune zerolatency -s:v:0 1280x720 -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -minrate:v:0 3000k -maxrate:v:0 3000k -b:v:0 3000k -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```

### Stream video and audio

Stream a headset microphone along with a GoPro Webcam's video.  Demonstrates resizing and setting the input buffer (-rtbufsize) high enough to avoid dropping any frames.

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -i audio="Headset Microphone (Logitech Stereo H650e)" -f dshow -fflags nobuffer -rtbufsize 2000M -i video="GoPro Webcam" -map 0:0 -map 1:0 -c:a:0 aac -b:a:0 192k -ar:a:0 48000 -c:v:1 libx264 -preset ultrafast -tune zerolatency -s:v:0 1280x720 -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -minrate:v:0 3000k -maxrate:v:0 4000k -b:v:0 3500k -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```

### Sync issues and offsetting the audio delay on a device

Some devices may not be in perfect sync with each other due to internal buffering and delays.  If this happens, you can adjust the audio delay to better sync to the video using the (-itsoffset) parameter. 
In this example, I offset the headset microphone by 1 second to better sync with the GoPro video device.

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -i audio="Headset Microphone (Logitech Stereo H650e)" -itsoffset 1.00 -f dshow -fflags nobuffer -rtbufsize 2000M -i video="GoPro Webcam" -map 0:0 -map 1:0 -c:a:0 aac -b:a:0 192k -ar:a:0 48000 -c:v:1 libx264 -preset ultrafast -tune zerolatency -s:v:0 1280x720 -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -minrate:v:0 3000k -maxrate:v:0 3000k -b:v:0 3000k -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```

### Using the OBS Studio virtual device

In this example, we use the OBS Studio Virtual device for the video input.  This allows you to use OBS Studio as a switcher and more easily control the compositing and transitions between sources.  However, if you are using OBS Studio, you really don't need FFmpeg any longer... but here it is in case you want to play with that or come up with a reason to use it with FFmpeg running externally.

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -i audio="Headset Microphone (Logitech Stereo H650e)" -itsoffset 1.00 -f dshow -fflags nobuffer -rtbufsize 2000M -i video="OBS Virtual Camera" -map 0:0 -map 1:0 -c:a:0 aac -b:a:0 192k -c:v:1 libx264 -preset ultrafast -tune zerolatency -s:v:0 1280x720 -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -minrate:v:0 3000k -maxrate:v:0 3000k -b:v:0 3000k -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```

### Screen Recording and Desktop Capture

This shows how to use the "gdigrab" device on Windows desktops to capture a section of the desktop and broadcast it along with the audio from a Microphone.  There are more settings available in the documentation for FFmpeg that allow cropping and selecting specific running application windows by name. If running on Linux, you would use the "x11grab" device instead.

```bash
ffmpeg -y -hide_banner -f dshow -fflags nobuffer -i audio="Headset Microphone (Logitech Stereo H650e)" -itsoffset 1.00 -f gdigrab -framerate 10 -offset_x 0 -offset_y 0 -video_size 1920x1080 -show_region 1 -i desktop -map 0:0 -map 1:0 -c:a:0 aac -b:a:0 192k -c:v:1 libx264 -preset ultrafast -tune zerolatency -s:v:0 1280x720 -r 30 -g 48 -keyint_min 48 -sc_threshold 0 -minrate:v:0 3000k -maxrate:v:0 3000k -b:v:0 3000k -f ismv -movflags isml+frag_keyframe -frag_duration 1600000 "http://<<YOUR_CHANNEL>>.channel.mediaservices.windows.net/<<LIVE EVENT ID>>/ingest.isml/Streams(video)"
```