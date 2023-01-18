---
topic: sample
languages:
  - javascript,typescript
products:
  - azure-media-services
description: "This sample demonstrates how to use the fade in and fade out from color feature in the standard encoder"
---

# Encode with a custom preset to fade-in or fade out from a color 

This sample shows how to fade a video in and out from a color using a custom encoding Transform settings. It shows how to perform the following tasks:

* Creates a custom encoding transform (with fade-in and fade-out configured using both a named color and a custom rgb color)
* Creates an input asset and upload a media file into it
* Submits a job and monitoring the job using polling method
* Downloads the output asset


## Settings for Fade in and Fade out

Fades can be configured on the filters section of a Transform.

The duration can be set using the ISO 8601 format to the duration in seconds desired.  Duration can also be set using frame counts.  

The fadeColor can be set to a known color string, or custom color using the format rgb(255,255,255), or #FFFFFF format color strings.   

Start is an optional parameter on the fadeIn and fadeOut and can be used to hold the fade color for a longer duration past the initial transition.  This value can be set with ISO 8601 format, frame counts or percentage values. 
For simple fades, you can just leave it off and the default value for a fadeIn will be the start of the video, and the default value for a fadeOut will be the end of the video minus the duration of the fadeOut. 

```javascript 
     filters: {
                fadeIn: {
                    duration: "PT2S", // ISO 8601 format, "PT2S" for 2 seconds,
                    fadeColor: "black", // named color, rgb(255,0,0), 0x000000 or #FFFFFF format. 
                  },
                fadeOut: {
                    duration: "PT2S", // ISO 8601 format, "PT2S" for 2 seconds,
                    fadeColor: "#FFFFFF", // supports rgb(255,0,0), 0x000000 or #FFFFFF format. 
                    }
                }
```

### .env

Use [sample.env](../../sample.env) as a template for the .env file to be created. The .env file must be placed at the root of the sample (same location than sample.env).
Connect to the Azure portal with your browser and go to your media services account / API access to get the .ENV data to store to the .env file.
