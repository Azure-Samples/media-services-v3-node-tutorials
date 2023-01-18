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
* Submits a job and monitoring the job using polling method or Event Grid events
* Downloads the output asset

### .env

Use [sample.env](../../sample.env) as a template for the .env file to be created. The .env file must be placed at the root of the sample (same location than sample.env).
Connect to the Azure portal with your browser and go to your media services account / API access to get the .ENV data to store to the .env file.
