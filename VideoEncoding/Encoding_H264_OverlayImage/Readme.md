---
topic: sample
languages:
  - javascript,typescript
products:
  - azure-media-services
description: "This sample demonstrates how to set up a custom encoding job that can overlay an image on top of your video during encoding."
---

# Encode with a custom Transform and overlay an image onto the video

This sample shows how to overlay an image onto video using a custom encoding Transform settings. It shows how to perform the following tasks:

* Creates a custom encoding transform (with image overlay configured using a PNG file)
* Creates an input asset and upload a media file into it
* Submits a job and monitoring the job using polling method or Event Grid events
* Downloads the output asset

See the article [Create an overlay Transform](https://docs.microsoft.com/azure/media-services/latest/transform-create-overlay-how-to) for details.

## Limitations on overlays

Azure Media Services only supports a single image overlay at a time. Meaning you cannot pass in multiple image overlays to the "Overlays" property on the Transform's Filter or you will get an error message. 
It's best to pre-create the image overlay that fits your video aspect ratio in an external application or drawing library and pass that into the Job's input to use as the single overlay image. 

### .env

Use [sample.env](../../sample.env) as a template for the .env file to be created. The .env file must be placed at the root of the sample (same location than sample.env).
Connect to the Azure portal with your browser and go to your media services account / API access to get the .ENV data to store to the .env file.
