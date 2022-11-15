---
page_type: sample
languages:
- javascript
- typescript
- nodejs
products:
- azure
- azure-media-services
name: Azure Media Services v3 Node.js TypeScript Samples
description: "This repository contains samples showing how to use Azure Media Services v3 API using Node.js and TypeScript"
urlFragment: media-services-v3-node-tutorials
---

# Azure Media Services v3 Node samples (@azure/arm-mediaservices version 13 or higher)

This repository contains samples showing how to use the [Azure Media Services](https://media.microsoft.com) V3 API using the [@azure/arm-mediaservices](https://www.npmjs.com/package/@azure/arm-mediaservices) package for node.js.

These tutorials work with the new [JavaScript next generation Azure SDK](https://github.com/Azure/azure-sdk-for-js/blob/main/documentation/next-generation-quickstart.md).
The new SDKs for JavaScript supports Azure Identity, HTTP pipeline, error-handling.,etc, and they also follow the new Azure SDK guidelines which create easy-to-use APIs that are idiomatic, compatible, and dependable.
See [TypeScript Design Guidelines](https://azure.github.io/azure-sdk/typescript_design.html) for more information.

> [!NOTE]
> To make sure you are using the latest package, check [@azure/arm-mediaservices](https://www.npmjs.com/package/@azure/arm-mediaservices).
> Version 12.1.0 of *@azure/arm-mediaservices* supports the [Media Services ARM API version 2021-11-01](https://github.com/Azure/azure-rest-api-specs/tree/main/specification/mediaservices/resource-manager/Microsoft.Media/stable/2021-11-01) and the 2022-08-01 API updates for streaming and live events.

## Overview

### Requirements

- Node 12+ 
- NPM 6+
- Azure CLI is required for some samples [Install the Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- Visual Studio Code

### Node.js Version note

The projects in this repository were created using Visual Studio Code with Node.js version 12.18 or higher

### Projects

|Project name|Description|
|---|---|
| **Account** ||
|[Create an account](/Account/CreateAccount/create-account.ts)|The sample shows how to create a Media Services account and set the primary storage account, in addition to advanced configuration settings including Key Delivery IP allowlist, storage auth, and bring your own encryption key.|
|[Create an account with user assigned managed identity code](/Account/CreateAccount/create-account_with_managed_identity.ts)|The sample shows how to create a Media Services account and set the primary storage account, in addition to advanced configuration settings including Key Delivery IP allowlist, user or system assigned Managed Identity, storage auth, and bring your own encryption key.|
| **Assets** ||
|[Hello World - list assets](/HelloWorld-ListAssets/list-assets.ts)|Basic example on how to connect and list assets |
|[Get the storage container from an asset](/Assets/get-container-from-assets.ts)|Demonstrates how to find the Azure storage account container used to store the contents of this asset. This can be used to then edit sources, modify, or copy contents using the Azure storage SDK library |
|[List assets using filters](/Assets/list-assets-filtered.ts)| Use filters in your list assets calls to find assets by date and order them.|
|[List the streaming locators on an asset using filters](/Assets/list-assets-filtered.ts)| Use filters to list the streaming locators attached to your assets.|
|[List tracks in an asset](/Assets/list-tracks-in-assets.ts)| Use the tracks collection to list all of the track names and track types (audio, video, or text) available on an asset|
|[Add a WebVTT/IMSC1/TTML subtitle or caption to an existing asset](/Assets/add-WebVTT-tracks.ts)| Use the tracks API on an Asset to add a new WebVTT or TTML/IMSC1 text profile caption or subtitle to an existing asset|
|[Add an additional audio track to an existing asset using the tracks API](/Assets/add-audio-language-tracks.ts)| Use the tracks API on an Asset to add an additional audio language or descriptive audio track to an existing asset. This sample demonstrates how to upload, encode using content aware encoding, and then late bind an additional audio track for a new language to the asset.|
| **Streaming** ||
|[Live streaming with standard passthrough](/Live/Standard_Passthrough_Live_Event/index.ts)| Standard passthrough live streaming example. **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Live streaming with standard passthrough with EventHubs](/Live/Standard_Passthrough_Live_Event_with_EventHub/index.ts)| Demonstrates how to use Event Hub to subscribe to events on the live event. Events include encoder connections, disconnections, heartbeat, latency, discontinuity and drift issues.  **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Live streaming with Basic passthrough](/Live/Basic_Passthrough_Live_Event/index.ts)| Shows how to set up the basic passthrough live event if you only need to broadcast a low cost UGC live event. **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Low Latency Live (LL-HLS) with 720P standard encoding](/Live/720P_Low_Latency_Encoding_Live_Event/index.ts)| Enable low latency live streaming with Apple's LL-HLS protocol and encode with the new 3-layer 720P HD adaptive bitrate encoding preset.|
|[Live streaming with 720P standard encoding](/Live/720P_Encoding_Live_Event/index.ts)| Use live encoding in the cloud with the 720P HD adaptive bitrate encoding preset. **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Live streaming with 1080P encoding](/Live/720P_Encoding_Live_Event/index.ts)| Use live encoding in the cloud with the 1080P HD adaptive bitrate encoding preset. **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Upload and stream HLS and DASH](/Streaming/StreamFilesSample/index.ts)| Basic example for uploading a local file or encoding from a source URL. Sample shows how to use storage SDK to download content, and shows how to stream to a player |
| **Content protection** ||
|[Upload and stream HLS and DASH with Playready and Widevine DRM](/Streaming/StreamFilesWithDRMSample/index.ts)| Demonstrates how to encode and stream using Widevine and PlayReady DRM |
|[Basic Playready DRM content protection and streaming](/ContentProtection/BasicPlayready/index.ts)| Demonstrates how to encode and stream using PlayReady DRM |
|[Basic Widevine DRM content protection and streaming](/ContentProtection/BasicWidevine/index.ts)| Demonstrates how to encode and stream using Widevine DRM |
| **Encoding** ||
|[Create Transform, use Job preset overrides (v2-to-v3 API migration)](/VideoEncoding/CreateTransform_Job_PresetOverride/index.ts)| If you need a workflow where you desire to submit custom preset jobs to a single queue, you can use this base sample which shows how to create a simple, (mostly) empty Transform, and then you can use the preset override property on the Job to submit custom presets to the same transform. This allows you to treat the v3 AMS API a lot more like the legacy v2 API Job queue if you desire.|
|[Copy Audio and Video to MP4 without re-encoding](./VideoEncoding/Encoding_BuiltIn_CopyCodec/) | Uses the built in preset that rapidly copies the source video and audio into a new MP4 file that is ready to be streamed as on-demand through AMS.  This is an extremely useful preset for pre-encoded content or externally encoded content to be quickly readied for streaming in AMS. |
|[Copy Audio and Video to MP4 without re-encoding and create a low bitrate proxy](./VideoEncoding/Encoding_BuiltIn_CopyCodecWithProxy/) | Same as above sample, but adds an additional fast encoded proxy resolution. Very useful when creating a CMS or preview of an Asset. |
|[Copy Audio and Video to MP4 without re-encoding and create a low bitrate proxy and VTT sprite thumbnail](./VideoEncoding/Encoding_Custom_CopyCodec_Sprite%2BProxy/) | Same as above samples, with the addition of a VTT sprite thumbnail for use in building a web page, CMS, or custom asset management application |
|[Basic encoding with H264](/VideoEncoding/Encoding_H264/index.ts)| Shows how to use the standard encoder to encode a source file into H264 format with AAC audio and PNG thumbnails |
|[Basic encoding with H264 with Event Hub/Event Grid](/VideoEncoding/Encoding_H264_with_EventHub/index.ts)| Shows how to use the standard encoder and receive and process Event Grid events from Media Services through an Event Hub. You must first setup an Event Grid subscription that pushes events into an Event Hub using the Azure Portal or CLI to use this sample. |
|[Sprite thumbnail (VTT) in JPG format](/VideoEncoding/Encoding_Sprite_Thumbnail/index.ts)| Shows how to generate a VTT Sprite Thumbnail in JPG format and how to set the columns and number of images. This also shows a speed encoding mode in H264 for a 720P layer. |
|[Content aware encoding with H264](/VideoEncoding/Encoding_H264_ContentAware/index.ts)| Example of using the standard encoder with Content Aware encoding to automatically generate the best quality adaptive bitrate streaming set based on an analysis of the source files contents|
|[Content aware encoding constrained with H264](/VideoEncoding/Encoding_H264_ContentAware_Constrained/index.ts)| Demonstrates how to control the output settings of the Content Aware encoding preset to make the outputs more deterministic to your encoding needs and costs. This will still auto generate the best quality adaptive bitrate streaming set based on an analysis of the source files contents, but constrain the output to your desired ranges.|
|[Use an overlay image](/VideoEncoding/Encoding_H264_OverlayImage/index.ts)| Shows how to upload an image file and overlay on top of video with output to MP4 container|
|[Rotate a video](/VideoEncoding/Encoding_H264_Rotate90degrees/index.ts)| Shows how to use the rotation filter to rotate a video by 90 degrees. |
|[Output to MPEG transport stream format](/VideoEncoding/Encoding_H264_To_TransportStream/index.ts)| Shows how to use the standard encoder to encode a source file and output to MPEG transport stream format using H264 format with AAC audio and PNG thumbnail|
|[Basic encoding with HEVC](/VideoEncoding/Encoding_HEVC/index.ts)| Shows how to use the standard encoder to encode a source file into HEVC format with AAC audio and PNG thumbnails |
|[Content aware encoding with HEVC](/VideoEncoding/Encoding_HEVC_ContentAware/index.ts)| Example of using the standard encoder with Content Aware encoding to automatically generate the best quality HEVC (H.265) adaptive bitrate streaming set based on an analysis of the source files contents|
|[Content aware encoding Constrained with HEVC](/VideoEncoding/Encoding_HEVC_ContentAware_Constrained/index.ts)| Demonstrates how to control the output settings of the Content Aware encoding preset to make the outputs more deterministic to your encoding needs and costs. This will still auto generate the best quality adaptive bitrate streaming set based on an analysis of the source files contents, but constrain the output to your desired ranges.|
|[Bulk encoding from a remote Azure storage account using SAS URLs](/VideoEncoding/Encoding_Bulk_Remote_Storage_Account_SAS/index.ts)| This samples shows how you can point to a remote Azure Storage account using a SAS URL and submit batches of encoding jobs to your account, monitor progress, and continue.  You can modify the file extension types to scan for (e.g - .mp4, .mov) and control the batch size submitted.  You can also modify the Transform used in the batch operation. This sample demonstrates the use of SAS URL's as ingest sources to a Job input. Make sure to configure the REMOTESTORAGEACCOUNTSAS environment variable in the .env file for this sample to work.|
| [Copy Live Archive to MP4 file format for export or use with Video Indexer](/VideoEncoding/Encoding_Live_Archive_To_MP4/) | This sample demonstrates how to use the archived output from a live event and extract only the top highest bitrate video track to be packaged into an MP4 file for export to social media platforms, or for use with Video Indexer.  The key concept in this sample is the use of an input definition on the Job InputAsset to specify a VideoTrackDescriptor. The SelectVideoTrackByAttribute allows you to select a single track from the live archive by using the bitrate attribute, and filtering by the "Top" video bitrate track in the live archive.|
| [Encode audio file with track selection](/VideoEncoding/Encoding_MultiChannel_Audio/) | This sample demonstrates how to create an encoding Transform that encodes an audio file selecting the input tracks to be used and the mapping of the channels. The standard encoder is limited to outputting 1 Stereo track, followed by a 5.1 surround sound audio track in AAC format.|
| [Encode a multi-channel audio source file](/VideoEncoding/Encoding_MultiChannel_Audio/) | This sample demonstrates how to create an encoding Transform that uses channel mappings and audio track selection from the input source to output two new AAC audio tracks. The standard encoder is limited to outputting 1 Stereo track, followed by a 5.1 surround sound audio track in AAC format.|
| [Stitch and edit two assets together](/VideoEncoding/Encoding_Stitch_Two_Assets/) | This sample demonstrates how to stitch and edit together two or more assets into a single MP4 file using the JobInputSequence as part of a job submission.|
| **Analytics** ||
| [Audio Analytics basic with per-job language override](/AudioAnalytics/index.ts)|This sample illustrates how to create a audio analyzer transform using the basic mode.  It also shows how you can override the preset language on a per-job basis to avoid creating a transform for every language.  It also shows how to upload a media file to an input asset, submit a job with the transform and download the results for verification.|
| **Player** ||
| [Shaka player with Timed Metadata for live event interactivity](/Player/examples/shaka)| This sample shows how to use the Google Shaka player with Low latency HLS streams to receive timed metadata events and display interactive information overlayed on the video element. This can be used to build interactive ads, quiz shows, polling, and other solutions that require events to be triggered in your web page or application during a live stream.|

## Prerequisites

1. Download and install [Visual Studio Code](https://code.visualstudio.com/Download)
1. Install [Node.js](https://nodejs.org/en/download/) version 12.18 or higher
1. Download and install [TypeScript](https://www.typescriptlang.org/download)
1. Install the [Azure CLI](https://aka.ms/azure-cli) and login to Azure using 'az login' before starting

### Install TypeScript via npm

You can use npm to install TypeScript globally, this means you can use the tsc command anywhere in your terminal.

To do this, run ```npm install -g typescript```. This will install the latest version.

## Run samples

1. Clone the repository

    ```git clone https://github.com/Azure-Samples/media-services-v3-node-tutorials.git ```

2. Open Visual Studio Code

    ``` code . ```

4. Rename the 'sample.env' file to '.env' and fill out the details from your Azure Media Services account portal API Access page. If you have not yet created an AMS account, first go into the Azure portal and search for Media Services and create a new account in the region of your choice. Copy the settings from the API Access blade that are required in the .env file. Review the details on how to authenticate using the[ Azure Identity library](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme?view=azure-node-latest) and the DefaultAzureCredentials.

5. Open **Terminal** in VS Code (Ctrl+Shift+`), make sure you are in the root folder with the package.json file and execute the following command to download all the required npm packages.

    ```
    npm install 
    ```

6. Next, in the Explorer view, open the "HelloWorld-ListAssets" folder, open the list-assets.ts file and press F5 to begin compiling the TypeScript and launch the Debugger. Each project in this sample collection contains a single typescript file that can be launched by opening it and pressing the F5 key to enter the debugger. You can now set breakpoints, and walk through the code to learn how to implement basic Media Services scenarios in Node.js

The output from the HelloWorld-ListAssets may be empty if this is a new Media Services account with no new assets.  Just make sure that the script executes cleanly through on the first run without any errors, and you can then upload some content into the portal to see the results again on the second run.  If you have no errors and are ready to move on, move next to the StreamFilesSample for tutorial on how to upload a local file, encode it with "content aware encoding" and stream it with the Azure Media Player.

## Common Issues and Troubleshooting

* Assets in Media Services have naming conventions that must be adhered to in order to avoid errors. For example the client.Assets.CreateOrUpdateAsync can fail with message "The resource type is invalid" if the name does not match the [naming conventions listed in this article](https://learn.microsoft.com/azure/media-services/latest/media-services-apis-overview#naming-conventions)

## Azure Logger client library for JavaScript

The `@azure/logger` package can be used to enable logging in the Azure SDKs for JavaScript.
For details on this package see [Azure Logger client library for JavaScript](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/core/logger/README.md)

Logging can be enabled for the Azure SDK in the following ways:

- Setting the AZURE_LOG_LEVEL environment variable in the launch.json file in this sample
- Calling setLogLevel imported from "@azure/logger"
- Calling enable() on specific loggers
- Using the `DEBUG` environment variable.

Note that AZURE_LOG_LEVEL, if set, takes precedence over DEBUG. Only use DEBUG without specifying AZURE_LOG_LEVEL or calling setLogLevel.
