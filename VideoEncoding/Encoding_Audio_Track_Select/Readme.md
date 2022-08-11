---
topic: sample
languages:
  - javascript,typescript
products:
  - azure-media-services
description: "This sample demonstrates how to create an encoding Transform that encodes multi channel audio to 5.1 outputs and stereo."
---

# Encoding Audio with track selection

This sample demonstrates how to create an encoding Transform that uses Track selection to output the desired audio track in your encoding. 
The standard encoder is limited to outputting 1 Stereo track, followed by a 5.1 surround sound audio track in AAC format.

In this example we input an audio only source file with multiple channels of audio, and select the track for output.

### .env

Use [sample.env](../../sample.env) as a template for the .env file to be created. The .env file must be placed at the root of the sample (same location than sample.env).
Connect to the Azure portal with your browser and go to your media services account / API access to get the .ENV data to store to the .env file.
